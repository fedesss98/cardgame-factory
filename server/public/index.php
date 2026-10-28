<?php
declare(strict_types=1);
// Standard installation: public_html/api/index.php and sibling private directory.
// For a nested document root, adjust this ONE absolute/relative path to private app.php.
$private = getenv('GF_PRIVATE_DIR') ?: dirname(__DIR__, 2) . '/game-factory-private';
if (!is_file($private . '/app.php') || !is_file($private . '/config.php')) {
    http_response_code(503);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['error' => 'Shared workspace is not configured. Follow HOSTINGER-SETUP.md.']);
    exit;
}
require $private . '/app.php';
