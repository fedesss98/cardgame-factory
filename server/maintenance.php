<?php
declare(strict_types=1);
// Game Factory shared-workspace maintenance tool. PRIVATE: it lives in the PHP
// API private directory, is unreachable over HTTP, and must never be copied to
// a webroot. Requires the PHP 8 CLI (on this hosting: /opt/alt/php84/usr/bin/php).
//
// Usage:
//   php maintenance.php status                 overview: tables, files, orphans, backups
//   php maintenance.php gc [--apply]           find (and delete with --apply) orphan asset
//                                              files and asset rows without revisions
//   php maintenance.php backup [--keep=N]      write database dump + assets tar into
//                                              storage/backups (default keep 7)
//
// Safety rules:
// - gc never deletes a file younger than 24 hours, so an in-flight save can
//   never be interrupted mid-write; only content-addressed names (UUID-SHA256)
//   are considered.
// - A backup is always a pair: the SQL dump plus the asset archive. Revisions
//   reference image bytes on disk, so restoring one without the other is invalid.
// - Archiving is a soft delete; archived projects keep their revisions and
//   files. GC only removes asset rows/files that NO revision references, so
//   archived projects remain restorable.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('This tool runs from the command line only.' . PHP_EOL);
}

$command = (string) ($_SERVER['argv'][1] ?? '');
$flags = array_slice((array) ($_SERVER['argv'] ?? []), 2);
$apply = in_array('--apply', $flags, true);
$keep = 7;
foreach ($flags as $flag) {
    if (str_starts_with((string) $flag, '--keep=')) {
        $keep = max(1, (int) substr((string) $flag, 7));
    }
}

$config = require __DIR__ . '/config.php';
if (!is_array($config) || empty($config['dsn'])) {
    fwrite(STDERR, 'config.php missing or incomplete.' . PHP_EOL);
    exit(1);
}
$storage = (string) ($config['storage_dir'] ?? (__DIR__ . '/storage'));
preg_match('/host=([^;]+)/i', (string) $config['dsn'], $dsnHost);
preg_match('/(?:dbname|database)=([^;]+)/i', (string) $config['dsn'], $dsnName);
$hostName = trim($dsnHost[1] ?? 'localhost');
$dbName = trim($dsnName[1] ?? '');

try {
    $db = new PDO(
        (string) $config['dsn'],
        (string) $config['db_user'],
        (string) $config['db_password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => false,
        ]
    );
    $db->exec("SET time_zone = '+00:00'");
} catch (Throwable $e) {
    fwrite(STDERR, 'Database connection failed. Check config.php and the private error log.' . PHP_EOL);
    exit(1);
}

//--- helpers ---------------------------------------------------------------//

/** @return array<string,true> storage_key => true, for every gf_assets row */
function referenced_keys(PDO $db): array
{
    $keys = [];
    foreach ($db->query('SELECT storage_key FROM gf_assets')->fetchAll() as $row) {
        $keys[(string) $row['storage_key']] = true;
    }
    return $keys;
}

/**
 * Asset files on disk that no row references. Only content-addressed names
 * (UUID-SHA256, with an optional ".bin" suffix) are considered, and only files
 * older than 24 hours.
 * @return array<string> absolute paths
 */
function orphan_files(string $storage, array $referenced): array
{
    $out = [];
    $dir = $storage . '/assets';
    if (!is_dir($dir)) {
        return $out;
    }
    $cutoff = time() - 86400;
    foreach (scandir($dir) ?: [] as $name) {
        $key = str_ends_with($name, '.bin') ? substr($name, 0, -4) : $name;
        if (!preg_match('/^[0-9a-f]{36}-[0-9a-f]{64}$/', $key)) {
            continue;
        }
        if (isset($referenced[$key])) {
            continue;
        }
        $path = $dir . '/' . $name;
        $mtime = @filemtime($path);
        if ($mtime === false || $mtime > $cutoff) {
            continue;
        }
        $out[] = $path;
    }
    return $out;
}

/**
 * Asset rows that no revision references. Committed rows always get their
 * gf_revision_assets entry in the same transaction, so leftovers can only come
 * from manual database work.
 * @return array<array<string,mixed>>
 */
function orphan_rows(PDO $db): array
{
    return $db->query(
        'SELECT a.id, a.project_id, a.storage_key FROM gf_assets a ' .
        'LEFT JOIN gf_revision_assets ra ON ra.project_id = a.project_id AND ra.asset_id = a.id ' .
        'WHERE ra.project_id IS NULL'
    )->fetchAll();
}

/**
 * Streams one table as DROP/CREATE + batched INSERT statements.
 * @param resource $fh file or gz stream
 * @param callable(string):void $write
 */
function dump_table(PDO $db, callable $write, string $table): void
{
    $create = $db->query('SHOW CREATE TABLE `' . $table . '`')->fetch();
    $ddl = (string) ($create['Create Table'] ?? '');
    $write("\n-- TABLE {$table}\nDROP TABLE IF EXISTS `{$table}`;\n{$ddl};\n");

    $stmt = $db->prepare("SELECT * FROM `{$table}`");
    $stmt->execute();
    $columns = '';
    $batch = [];
    $flush = function (array $batch) use ($db, $write, $table, &$columns): void {
        if (!$batch) {
            return;
        }
        $rows = [];
        foreach ($batch as $row) {
            $parts = [];
            foreach ($row as $value) {
                $parts[] = $value === null ? 'NULL' : $db->quote((string) $value);
            }
            $rows[] = '(' . implode(',', $parts) . ')';
        }
        $write("INSERT INTO `{$table}`{$columns} VALUES " . implode(',', $rows) . ";\n");
    };
    while (($row = $stmt->fetch(PDO::FETCH_ASSOC)) !== false) {
        if ($columns === '' && $row) {
            $columns = '(`' . implode('`,`', array_keys($row)) . '`)';
        }
        $batch[] = $row;
        if (count($batch) >= 50) {
            $flush($batch);
            $batch = [];
        }
    }
    $flush($batch);
}

/**
 * Tars the asset directory; optionally gzips and removes the intermediate tar.
 */
function tar_assets(string $storage, string $withoutExtension, bool $gzip): bool
{
    $assetsDir = $storage . '/assets';
    if (!is_dir($assetsDir)) {
        echo "No assets directory yet; skipping the asset archive." . PHP_EOL;
        return true;
    }
    $base = $withoutExtension . '.tar';
    if (is_file($base)) {
        unlink($base);
    }
    if (Phar::canCompress() === false) {
        echo 'phar compression unavailable; writing plain tar: ' . basename($base) . PHP_EOL;
        (new PharData($base))->buildFromDirectory($assetsDir);
        return true;
    }
    $tar = new PharData($base);
    $tar->buildFromDirectory($assetsDir);
    if ($gzip) {
        $tar->compress(Phar::GZ);
        if (is_file($base)) {
            unlink($base);
        }
    }
    return true;
}

/**
 * Newest-first sorted remaining backup files of one kind, after retention.
 * @return array<string>
 */
function list_backups(string $dir, string $pattern): array
{
    $all = glob($dir . '/' . $pattern) ?: [];
    usort($all, fn (string $a, string $b): int => (@filemtime($b) ?: 0) <=> (@filemtime($a) ?: 0));
    return $all;
}

/** Cross-check asset rows against files on disk and print the summary. */
function report_integrity(PDO $db, string $storage): void
{
    $rows = (int) $db->query('SELECT COUNT(*) FROM gf_assets')->fetchColumn();
    $files = [];
    if (is_dir($storage . '/assets')) {
        foreach (scandir($storage . '/assets') ?: [] as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $files[$name] = true;
        }
    }
    $missingFiles = 0;
    $referenced = referenced_keys($db);
    $unreferencedFiles = 0;
    foreach (array_keys($referenced) as $key) {
        if (empty($files[$key])) {
            $missingFiles++;
        }
    }
    foreach (array_keys($files) as $name) {
        $key = str_ends_with($name, '.bin') ? substr($name, 0, -4) : $name;
        if (empty($referenced[$key])) {
            $unreferencedFiles++;
        }
    }
    echo "Integrity: {$rows} asset rows, " . count($files) . " files"
        . ", {$missingFiles} rows missing their file"
        . ", {$unreferencedFiles} unreferenced (>24h files are gc candidates)." . PHP_EOL;
    if ($missingFiles > 0) {
        fwrite(STDERR, 'WARNING: referenced assets are missing from disk. Run gc only AFTER this is fixed.' . PHP_EOL);
    }
}

//--- commands --------------------------------------------------------------//

if ($command === 'status') {
    $db->query('SELECT 1')->fetchColumn();
    echo "Database: {$dbName} @ {$hostName}" . PHP_EOL;
    foreach ($db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
        $count = (int) $db->query('SELECT COUNT(*) FROM `' . $table . '`')->fetchColumn();
        echo str_pad((string) $table, 26), $count, PHP_EOL;
    }
    $fileCount = 0;
    $bytes = 0;
    if (is_dir($storage . '/assets')) {
        foreach (scandir($storage . '/assets') ?: [] as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $fileCount++;
            $bytes += (int) @filesize($storage . '/assets/' . $name);
        }
    }
    echo str_pad('storage/assets files', 26), $fileCount,
        ' (', number_format($bytes / 1048576, 2), ' MiB)', PHP_EOL;
    $referenced = referenced_keys($db);
    echo str_pad('orphan asset files >24h', 26), count(orphan_files($storage, $referenced)), PHP_EOL;
    echo str_pad('asset rows without revisions', 26), count(orphan_rows($db)), PHP_EOL;
    $backups = glob($storage . '/backups/*') ?: [];
    echo str_pad('stored backup files', 26), count($backups), PHP_EOL;
    if ($backups) {
        usort($backups, fn (string $a, string $b): int => (@filemtime($b) ?: 0) <=> (@filemtime($a) ?: 0));
        echo '  newest: ', basename((string) $backups[0]), PHP_EOL;
    }
    echo 'Done.' . PHP_EOL;
    exit(0);
}

if ($command === 'gc') {
    $referenced = referenced_keys($db);
    $files = orphan_files($storage, $referenced);
    $rows = orphan_rows($db);
    $needsGc = $files || $rows;
    echo 'gc ', $apply ? '(apply)' : '(dry run: pass --apply to delete)', PHP_EOL;
    foreach ($files as $path) {
        $note = $apply ? (unlink($path) ? 'deleted' : 'DELETE FAILED') : 'would delete';
        echo "orphan file {$note}: ", basename($path), PHP_EOL;
    }
    foreach ($rows as $row) {
        $path = $storage . '/assets/' . $row['storage_key'];
        $mtime = @filemtime($path);
        if ($mtime !== false && $mtime > time() - 86400) {
            echo 'orphan row kept (file newer than 24h): asset ', substr((string) $row['id'], 0, 8), PHP_EOL;
            continue;
        }
        if ($apply) {
            $db->beginTransaction();
            $delete = $db->prepare('DELETE FROM gf_assets WHERE project_id=? AND id=?');
            $delete->execute([$row['project_id'], $row['id']]);
            $db->commit();
            if (is_file($path)) {
                @unlink($path);
            }
            echo 'orphan row deleted: asset ', substr((string) $row['id'], 0, 8),
                ' (', (string) $row['storage_key'], ')', PHP_EOL;
        } else {
            echo 'orphan row would be deleted: asset ', substr((string) $row['id'], 0, 8),
                ' (', (string) $row['storage_key'], ')', PHP_EOL;
        }
    }
    if (!$needsGc) {
        echo 'Nothing to clean.' . PHP_EOL;
    }
    echo 'Done.' . PHP_EOL;
    exit(0);
}

if ($command === 'backup') {
    $dir = $storage . '/backups';
    if (!is_dir($dir) && !mkdir($dir, 0700, true)) {
        fwrite(STDERR, 'Cannot create the backups directory.' . PHP_EOL);
        exit(1);
    }
    $stamp = date('Ymd-His');
    $safeDb = preg_replace('/[^a-z0-9_-]/i', '_', $dbName) ?: 'game-factory';
    $canGzip = extension_loaded('zlib') && function_exists('gzopen');
    $sqlPath = $dir . '/gf-' . $stamp . '-' . $safeDb . ($canGzip ? '.sql.gz' : '.sql');

    $handle = $canGzip ? gzopen($sqlPath, 'wb9') : fopen($sqlPath, 'wb');
    if ($handle === false) {
        fwrite(STDERR, 'Cannot open the backup file for writing.' . PHP_EOL);
        exit(1);
    }
    $isGzip = $canGzip;
    $write = function (string $text) use ($handle, $isGzip): void {
        if ($isGzip) {
            gzwrite($handle, $text);
        } else {
            fwrite($handle, $text);
        }
    };
    echo 'Writing SQL dump: ', basename($sqlPath), PHP_EOL;
    $write("-- Game Factory backup\n");
    $write("-- Database: {$dbName} @ {$hostName}\n");
    $write("-- Created: " . gmdate('Y-m-d H:i:s') . " UTC\n");
    $write("-- Restore on an EMPTY database with a MariaDB client, then extract the\n");
    $write("-- matching -assets.tar.gz next to game-factory-private/storage/ so that\n");
    $write("-- storage/assets/ receives the files. Restores nothing automatically.\n");
    $write("SET NAMES utf8mb4; SET time_zone = '+00:00';\n");
    foreach ($db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
        dump_table($db, $write, (string) $table);
    }
    if ($isGzip) {
        gzclose($handle);
    } else {
        fclose($handle);
    }
    echo 'Writing asset archive: gf-', $stamp, '-assets.tar.gz', PHP_EOL;
    tar_assets($storage, $dir . '/gf-' . $stamp . '-assets', $canGzip);

    // Retention, counted per half (SQL dump and assets are separate files).
    $sqlBackups = list_backups($dir, '*.sql*');
    $assetBackups = list_backups($dir, '*-assets.tar*');
    $removed = 0;
    foreach (array_slice($sqlBackups, $keep) as $old) {
        $removed += is_file($old) && unlink($old) ? 1 : 0;
    }
    foreach (array_slice($assetBackups, $keep) as $old) {
        $removed += is_file($old) && unlink($old) ? 1 : 0;
    }
    echo "Retention: keep {$keep}, removed {$removed} old file(s)." . PHP_EOL;
    report_integrity($db, $storage);
    echo 'Done.' . PHP_EOL;
    exit(0);
}

fwrite(STDERR, "Unknown command '{$command}'. Use status, gc or backup." . PHP_EOL);
exit(1);
