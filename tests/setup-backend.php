<?php
// Isolated local test database; never connects to Hostinger or existing XAMPP data.
$root=dirname(__DIR__);
$private=$root.'/.build/test-private';
@mkdir($private,0700,true);
$db=new PDO('mysql:host=127.0.0.1;port=33180;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$name='gf_test_'.bin2hex(random_bytes(5));
$db->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$db->exec("USE `$name`");
$db->exec(file_get_contents($root.'/database/001_initial.sql'));
$db->exec(file_get_contents($root.'/database/002_collaboration.sql'));
$token=bin2hex(random_bytes(32));
$config=['dsn'=>"mysql:host=127.0.0.1;port=33180;dbname=$name;charset=utf8mb4",'db_user'=>'root','db_password'=>'','origin'=>'http://127.0.0.1:5174','setup_token_hash'=>hash('sha256',$token),'storage_dir'=>$private.'/storage-'.$name,'allow_http_local'=>true];
file_put_contents($private.'/config.php',"<?php\nreturn ".var_export($config,true).";\n");
file_put_contents($root.'/.build/test-fixture.json',json_encode(['token'=>$token,'database'=>$name]));
foreach (['app.php','validation.php'] as $file) copy($root.'/server/'.$file,$private.'/'.$file);
copy($root.'/schema/game.schema.json',$private.'/game.schema.json');
// Use the installed package locally; deployment ships the actual vendor files.
@mkdir($private.'/vendor',0700,true);
file_put_contents($private.'/vendor/autoload.php',"<?php require ".var_export($root.'/server/vendor/autoload.php',true).";");
echo "Isolated test database created; both migrations imported successfully.\n";
