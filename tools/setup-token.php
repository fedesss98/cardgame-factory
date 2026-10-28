<?php
// Run locally: php tools/setup-token.php. Do not upload this helper.
$token = bin2hex(random_bytes(32));
echo "Setup token (enter in the website's first-account form):\n$token\n\n";
echo "setup_token_hash (paste in private config.php):\n" . hash('sha256', $token) . "\n";
