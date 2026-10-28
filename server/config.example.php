<?php
// Copy to game-factory-private/config.php OUTSIDE public_html. Never publish this file.
return [
    'dsn' => 'mysql:host=localhost;port=3306;dbname=YOUR_DATABASE;charset=utf8mb4',
    'db_user' => 'YOUR_DATABASE_USER',
    'db_password' => 'YOUR_DATABASE_PASSWORD',
    'origin' => 'https://factory.fedeama.it',
    // SHA-256 of a secret random setup token, used only to create the first account.
    // Generate a token locally with tools/setup-token.php. Clear this after setup.
    'setup_token_hash' => 'REPLACE_WITH_GENERATED_HASH',
    'storage_dir' => __DIR__ . '/storage',
    'allow_http_local' => false,
];
