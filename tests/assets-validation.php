<?php
declare(strict_types=1);
// Read-only unit checks: no database, HTTP service or hosting credentials needed.
function fail(int $status, string $message): never { throw new RuntimeException($message, $status); }
require __DIR__ . '/../server/validation.php';
function expect(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function rejected(callable $fn): void {
    try { $fn(); } catch (RuntimeException $e) { expect($e->getCode() === 422, $e->getMessage()); return; }
    throw new RuntimeException('Expected invalid asset rejection');
}
$game = (object)['assets'=>[(object)['id'=>'font','kind'=>'font','path'=>'assets/test.woff2']]];
// Header fixture only; this does not test font rendering or Brotli decompression.
$bytes = 'wOF2' . pack('N', 0x00010000) . pack('NnnNN', 50, 1, 0, 100, 2) . str_repeat("\0", 26);
$decoded = decode_images($game, (object)['font'=>'data:font/woff2;base64,'.base64_encode($bytes)]);
expect($decoded['font']['mime'] === 'font/woff2' && $decoded['font']['bytes'] === $bytes, 'Font bytes were not preserved');
rejected(fn()=>decode_images($game,(object)['font'=>'data:font/woff2;base64,'.base64_encode('wOF2')]));
rejected(fn()=>decode_images($game,(object)['font'=>'data:font/woff2;base64,'.base64_encode(substr_replace($bytes, pack('N', 999), 8, 4))]));
$game->assets = [(object)['id'=>'art','kind'=>'image','path'=>'assets/harbor.png']];
$png = file_get_contents(__DIR__.'/../examples/harbor/assets/harbor.png');
$decoded = decode_images($game,(object)['art'=>'data:image/png;base64,'.base64_encode($png)]);
expect($decoded['art']['bytes'] === $png, 'Image decoding regressed');
rejected(fn()=>decode_images($game,(object)['art'=>'data:image/png;base64,'.base64_encode($bytes)]));
echo "Asset checks passed: WOFF2 headers, malformed fonts, image preservation and type mismatch.\n";
