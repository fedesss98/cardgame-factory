<?php
declare(strict_types=1);
require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/validation.php';

final class ApiError extends RuntimeException {
    public function __construct(public int $status, string $message) { parent::__construct($message); }
}
function fail(int $status, string $message): never { throw new ApiError($status, $message); }
function respond(array $data, int $status=200): never {
    http_response_code($status); echo json_encode($data, JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR); exit;
}
function query(string $sql, array $args=[]): PDOStatement {
    global $db; $q=$db->prepare($sql); $q->execute($args); return $q;
}
function uuid(): string {
    $h=bin2hex(random_bytes(16)); return substr($h,0,8).'-'.substr($h,8,4).'-4'.substr($h,13,3).'-a'.substr($h,17,3).'-'.substr($h,20);
}
function text(object $body, string $key, int $max=254): string {
    $v=$body->$key??null;
    if (!is_string($v) || trim($v)==='' || mb_strlen($v)>$max) fail(422,"Invalid $key.");
    return trim($v);
}
function credentials(object $body): array {
    $email=mb_strtolower(text($body,'email'));
    if (!filter_var($email,FILTER_VALIDATE_EMAIL)) fail(422,'Invalid email.');
    $password=$body->password??null;
    if (!is_string($password) || strlen($password)<12 || strlen($password)>72) fail(422,'Password must be 12–72 bytes.');
    return [$email,$password,text($body,'display_name',120)];
}
function identity(): array {
    $user=query('SELECT id,email,display_name,is_admin,password_hash FROM gf_users WHERE id=? AND disabled_at IS NULL',[$_SESSION['uid']??0])->fetch();
    if (!$user || !hash_equals((string)($_SESSION['auth_stamp']??''),hash('sha256',$user['password_hash']))) fail(401,'Please sign in.');
    unset($user['password_hash']);
    $user['id']=(int)$user['id']; $user['is_admin']=(bool)$user['is_admin']; return $user;
}
function project(string $id, array $user, bool $write=false, bool $owner=false, bool $lock=false): array {
    $p=query('SELECT * FROM gf_projects WHERE id=? AND archived_at IS NULL'.($lock?' FOR UPDATE':''),[$id])->fetch();
    if (!$p) fail(404,'Project not found.');
    $role=(int)$p['owner_user_id']===$user['id']?'owner':query('SELECT role FROM gf_project_members WHERE project_id=? AND user_id=?',[$id,$user['id']])->fetchColumn();
    if (!$role) fail(404,'Project not found.');
    if (($write && $role==='viewer') || ($owner && $role!=='owner')) fail(403,'You do not have permission for this action.');
    $p['role']=$role; return $p;
}
function throttle(string $key, int $limit): void {
    global $db;
    $bucket=hash('sha256',$key);
    $db->beginTransaction();
    query('INSERT IGNORE INTO gf_auth_limits(bucket,attempts,window_started) VALUES (?,0,UTC_TIMESTAMP())',[$bucket]);
    $row=query('SELECT attempts,window_started FROM gf_auth_limits WHERE bucket=? FOR UPDATE',[$bucket])->fetch();
    if (strtotime($row['window_started'].' UTC') < time()-900) {
        query('UPDATE gf_auth_limits SET attempts=0,window_started=UTC_TIMESTAMP() WHERE bucket=?',[$bucket]); $row['attempts']=0;
    }
    if ((int)$row['attempts'] >= $limit) { $db->rollBack(); fail(429,'Too many attempts. Please try again in 15 minutes.'); }
    query('UPDATE gf_auth_limits SET attempts=attempts+1 WHERE bucket=?',[$bucket]); $db->commit();
    query('DELETE FROM gf_auth_limits WHERE window_started < UTC_TIMESTAMP() - INTERVAL 1 DAY LIMIT 100');
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY'); header('Referrer-Policy: same-origin');
if (($_SERVER['HTTPS']??'')==='on') header('Strict-Transport-Security: max-age=31536000');
$db=null;
try {
    $config=require __DIR__.'/config.php';
    $local=($config['allow_http_local']??false) && in_array($_SERVER['REMOTE_ADDR']??'', ['127.0.0.1','::1'],true);
    if (!$local && ($_SERVER['HTTPS']??'')!=='on') fail(400,'HTTPS is required. Use HTTPS to your hosting server.');
    $storage=$config['storage_dir'];
    if (!is_dir($storage) && !mkdir($storage,0700,true)) throw new RuntimeException('Cannot create private storage');
    if (!is_dir($storage.'/sessions') && !mkdir($storage.'/sessions',0700,true)) throw new RuntimeException('Cannot create sessions');
    ini_set('session.use_strict_mode','1'); ini_set('session.use_only_cookies','1');
    session_save_path($storage.'/sessions'); session_name('gf_session');
    session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>!$local,'httponly'=>true,'samesite'=>'Strict']);
    session_start();
    if (isset($_SESSION['last_seen']) && $_SESSION['last_seen']<time()-28800) { $_SESSION=[]; session_regenerate_id(true); }
    $_SESSION['last_seen']=time(); $_SESSION['csrf']??=bin2hex(random_bytes(32));
    $db=new PDO($config['dsn'],$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
    $db->exec("SET time_zone = '+00:00'");
    if (!query("SELECT version FROM gf_schema_migrations WHERE version='002_collaboration'")->fetchColumn()) fail(503,'Import database/002_collaboration.sql first.');
    $method=$_SERVER['REQUEST_METHOD']; $action=$_GET['action']??'session';
    if (!in_array($method,['GET','POST'],true)) fail(405,'Method not allowed.');
    $body=new stdClass();
    if ($method==='POST') {
        if (($_SERVER['HTTP_ORIGIN']??'')!==rtrim($config['origin'],'/')) fail(403,'Origin not allowed.');
        if (!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) fail(403,'Session token expired. Refresh and try again.');
        if (!str_starts_with($_SERVER['CONTENT_TYPE']??'','application/json')) fail(415,'JSON required.');
        $raw=file_get_contents('php://input',false,null,0,16000001);
        if (strlen($raw)>16000000) fail(413,'Request exceeds 16 MB.');
        $body=json_decode($raw,false,128,JSON_THROW_ON_ERROR);
        if (!is_object($body)) fail(422,'JSON object required.');
    }
    if ($action==='session' && $method==='GET') {
        $user=null; if (isset($_SESSION['uid'])) { try {$user=identity();} catch(ApiError $e) {unset($_SESSION['uid']);} }
        respond(['user'=>$user,'csrf'=>$_SESSION['csrf'],'setup_required'=>!(bool)query('SELECT id FROM gf_users LIMIT 1')->fetchColumn()]);
    }
    if (in_array($action,['login','setup'],true) && $method==='POST') {
        // Use REMOTE_ADDR, not attacker-controlled forwarding headers. DNS-only deployment is recommended.
        throttle('ip:'.($_SERVER['REMOTE_ADDR']??''),40);
        if ($action==='setup') {
            $token=$body->token??''; $expected=$config['setup_token_hash']??'';
            if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D',$expected) || !hash_equals($expected,hash('sha256',$token))) fail(403,'Invalid setup token.');
            [$email,$password,$name]=credentials($body);
            $lock='gf-setup-'.substr(hash('sha256',$config['dsn']),0,32);
            if (!(int)query('SELECT GET_LOCK(?,5)',[$lock])->fetchColumn()) fail(409,'Setup is already running.');
            try {
                if (query('SELECT id FROM gf_users LIMIT 1')->fetchColumn()) fail(409,'Setup has already been completed.');
                query('INSERT INTO gf_users(email,display_name,password_hash,is_admin) VALUES (?,?,?,1)',[$email,$name,password_hash($password,PASSWORD_DEFAULT)]);
                $uid=(int)$db->lastInsertId();
            } finally {query('SELECT RELEASE_LOCK(?)',[$lock]);}
        } else {
            $email=mb_strtolower(text($body,'email'));
            throttle('email:'.$email,15);
            $row=query('SELECT * FROM gf_users WHERE email=?',[$email])->fetch();
            $password=$body->password??'';
            $dummy='$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
            if (!is_string($password) || strlen($password)>72 || !password_verify($password,$row['password_hash']??$dummy) || !$row || $row['disabled_at']!==null) fail(401,'Email or password is incorrect.');
            $uid=(int)$row['id'];
            if (password_needs_rehash($row['password_hash'],PASSWORD_DEFAULT)) query('UPDATE gf_users SET password_hash=? WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$uid]);
        }
        session_regenerate_id(true); $_SESSION['auth_stamp']=hash('sha256',query('SELECT password_hash FROM gf_users WHERE id=?',[$uid])->fetchColumn()); $_SESSION['uid']=$uid; $_SESSION['csrf']=bin2hex(random_bytes(32));
        respond(['user'=>identity(),'csrf'=>$_SESSION['csrf']]);
    }
    $user=identity();
    if ($action==='logout' && $method==='POST') { $_SESSION=[]; session_destroy(); setcookie('gf_session','',['expires'=>time()-3600,'path'=>'/','secure'=>!$local,'httponly'=>true,'samesite'=>'Strict']); respond(['ok'=>true]); }
    if ($action==='password' && $method==='POST') {
        throttle('password:'.$user['id'],10);
        $old=$body->old_password??''; $new=$body->password??'';
        if (!is_string($old) || !password_verify($old,query('SELECT password_hash FROM gf_users WHERE id=?',[$user['id']])->fetchColumn())) fail(403,'Current password is incorrect.');
        if (!is_string($new) || strlen($new)<12 || strlen($new)>72) fail(422,'Password must be 12–72 bytes.');
        query('UPDATE gf_users SET password_hash=? WHERE id=?',[password_hash($new,PASSWORD_DEFAULT),$user['id']]);
        $_SESSION['auth_stamp']=hash('sha256',query('SELECT password_hash FROM gf_users WHERE id=?',[$user['id']])->fetchColumn()); session_regenerate_id(true); respond(['ok'=>true]);
    }
    if ($action==='users') {
        if (!$user['is_admin']) fail(403,'Administrator access required.');
        if ($method==='GET') respond(['users'=>query('SELECT id,email,display_name,is_admin,disabled_at FROM gf_users ORDER BY display_name')->fetchAll()]);
        $disable=$body->disable??''; $enable=$body->enable??''; $reset=$body->reset_password??false;
        if (is_string($disable) && $disable!=='') {
            $row=query('SELECT id,is_admin FROM gf_users WHERE email=?',[$disable])->fetch();
            if (!$row) fail(404,'No such account.');
            if ((bool)$row['is_admin']) fail(403,'Administrator accounts cannot be disabled here.');
            query('UPDATE gf_users SET disabled_at=UTC_TIMESTAMP(6) WHERE id=? AND disabled_at IS NULL',[(int)$row['id']]);
            respond(['ok'=>true]);
        }
        if (is_string($enable) && $enable!=='') {
            $row=query('SELECT id FROM gf_users WHERE email=?',[$enable])->fetch();
            if (!$row) fail(404,'No such account.');
            query('UPDATE gf_users SET disabled_at=NULL WHERE id=?',[(int)$row['id']]);
            respond(['ok'=>true]);
        }
        if ($reset) {
            $email=mb_strtolower(text($body,'email'));
            throttle('password:'.md5($email),10);
            $row=query('SELECT id,is_admin FROM gf_users WHERE email=?',[$email])->fetch();
            if (!$row) fail(404,'No such account.');
            if ((bool)$row['is_admin']) fail(403,'Administrator passwords cannot be reset here.');
            $password=$body->password??null;
            if (!is_string($password) || strlen($password)<12 || strlen($password)>72) fail(422,'Password must be 12–72 bytes.');
            query('UPDATE gf_users SET password_hash=? WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),(int)$row['id']]);
            respond(['ok'=>true]);
        }
        [$email,$password,$name]=credentials($body);
        if (query('SELECT id FROM gf_users WHERE email=?',[$email])->fetchColumn()) fail(409,'An account with that email already exists.');
        query('INSERT INTO gf_users(email,display_name,password_hash) VALUES (?,?,?)',[$email,$name,password_hash($password,PASSWORD_DEFAULT)]);
        respond(['ok'=>true],201);
    }
    if ($action==='projects' && $method==='GET') {
        $rows=query("SELECT p.id,p.title,p.current_revision,p.updated_at,CASE WHEN p.owner_user_id=? THEN 'owner' ELSE m.role END AS role FROM gf_projects p LEFT JOIN gf_project_members m ON m.project_id=p.id AND m.user_id=? WHERE p.archived_at IS NULL AND (p.owner_user_id=? OR m.user_id=?) ORDER BY p.updated_at DESC",array_fill(0,4,$user['id']))->fetchAll();
        respond(['projects'=>$rows]);
    }
    $id=$method==='GET'?($_GET['id']??''):($body->id??'');
    if (!is_string($id)) fail(422,'Invalid project ID.');
    if ($action==='load' && $method==='GET') {
        $p=project($id,$user); $revision=$_GET['revision']??$p['current_revision'];
        if (!ctype_digit((string)$revision)) fail(422,'Invalid revision.');
        $row=query('SELECT game_document FROM gf_project_revisions WHERE project_id=? AND revision=?',[$id,$revision])->fetch();
        if (!$row) fail(404,'Revision not found.');
        $images=[];
        foreach (query('SELECT ra.logical_asset_id,a.storage_key,a.mime_type FROM gf_revision_assets ra JOIN gf_assets a ON a.id=ra.asset_id AND a.project_id=ra.project_id WHERE ra.project_id=? AND ra.revision=?',[$id,$revision])->fetchAll() as $a) {
            $bytes=file_get_contents($storage.'/assets/'.$a['storage_key']);
            if ($bytes===false) throw new RuntimeException('Missing stored asset');
            $images[$a['logical_asset_id']]='data:'.$a['mime_type'].';base64,'.base64_encode($bytes);
        }
        respond(['project'=>['game'=>json_decode($row['game_document']),'images'=>(object)$images,'remote'=>['id'=>$id,'revision'=>(int)$revision,'role'=>$p['role']]]]);
    }
    if ($action==='history' && $method==='GET') {
        project($id,$user);
        respond(['revisions'=>query('SELECT r.revision,r.created_at,u.display_name FROM gf_project_revisions r JOIN gf_users u ON u.id=r.saved_by WHERE r.project_id=? ORDER BY r.revision DESC LIMIT 50',[$id])->fetchAll()]);
    }
    if ($action==='members') {
        if ($method==='GET') {
            project($id,$user,false,true);
            respond(['members'=>query('SELECT m.user_id,m.role,u.email,u.display_name FROM gf_project_members m JOIN gf_users u ON u.id=m.user_id WHERE m.project_id=?',[$id])->fetchAll()]);
        }
        $db->beginTransaction(); $p=project($id,$user,false,true,true);
        $email=mb_strtolower(text($body,'email'));
        $member=query('SELECT id FROM gf_users WHERE email=? AND disabled_at IS NULL',[$email])->fetchColumn();
        if (!$member) fail(422,'Ask the administrator to create this colleague account first.');
        if ((int)$member===(int)$p['owner_user_id']) fail(422,'The project owner already has full access.');
        $role=$body->role??'';
        if ($role==='remove') query('DELETE FROM gf_project_members WHERE project_id=? AND user_id=?',[$id,$member]);
        elseif (in_array($role,['editor','viewer'],true)) query('INSERT INTO gf_project_members(project_id,user_id,role,added_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)',[$id,$member,$role,$user['id']]);
        else fail(422,'Invalid role.');
        $db->commit(); respond(['ok'=>true]);
    }
    // Soft-deletes a shared project: hidden from every list, content and files kept
    // for recovery (restorable only by SQL: UPDATE gf_projects SET archived_at=NULL WHERE id='...').
    if ($action==='archive' && $method==='POST') {
        $db->beginTransaction();
        $p=project($id,$user,false,true,true);
        $confirm=$body->confirm??'';
        if (!is_string($confirm) || mb_strtolower(trim($confirm))!==mb_strtolower(trim((string)$p['title'])))
            fail(422,'Type the exact project title to confirm.');
        query('UPDATE gf_projects SET archived_at=UTC_TIMESTAMP(6) WHERE id=?',[$id]);
        $db->commit();
        respond(['stopped'=>true,'ok'=>true]);
    }
    // Hands a project to another active account. The former owner keeps editor access.
    if ($action==='transfer' && $method==='POST') {
        $db->beginTransaction();
        $p=project($id,$user,false,true,true);
        $email=mb_strtolower(text($body,'email'));
        $target=(int)(query('SELECT id FROM gf_users WHERE email=? AND disabled_at IS NULL',[$email])->fetchColumn()?:0);
        if (!$target) fail(422,'No active colleague account with that email.');
        if ($target===(int)$p['owner_user_id']) fail(422,'That account already owns the project.');
        if (empty($p['current_revision'])) fail(409,'The project has no saved revision yet.');
        query('INSERT IGNORE INTO gf_project_members(project_id,user_id,role,added_by) VALUES (?,?,?,?)',[$id,(int)$p['owner_user_id'],'editor',(int)$p['owner_user_id']]);
        query('UPDATE gf_projects SET owner_user_id=? WHERE id=?',[$target,$id]);
        $db->commit();
        respond(['remote'=>['id'=>$id,'revision'=>(int)$p['current_revision'],'role'=>'editor']]);
    }
    if ($action==='save' && $method==='POST') {
        $game=$body->game??null; $images=$body->images??null;
        if (!is_object($game) || !is_object($images)) fail(422,'Game and images are required.');
        validate_game($game); $decoded=decode_images($game,$images);
        $expected=$body->expected_revision??null;
        if (!is_int($expected) || $expected<0) fail(422,'Expected revision is required.');
        $db->beginTransaction();
        if ($id==='') {
            if ($expected!==0) fail(409,'A new project must start at revision 0.');
            $id=uuid(); query('INSERT INTO gf_projects(id,owner_user_id,title) VALUES (?,?,?)',[$id,$user['id'],$game->title]);
            $p=['current_revision'=>0,'role'=>'owner'];
        } else $p=project($id,$user,true,false,true);
        if ((int)$p['current_revision']!==$expected) fail(409,'Someone saved a newer revision. Your changes are preserved locally. Reload the shared copy or save your work as a separate project.');
        $revision=$expected+1; $document=json_encode($game,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        query('INSERT INTO gf_project_revisions(project_id,revision,game_schema_version,game_document,document_sha256,saved_by) VALUES (?,?,?,?,?,?)',[$id,$revision,$game->schemaVersion,$document,hash('sha256',$document),$user['id']]);
        if (!is_dir($storage.'/assets') && !mkdir($storage.'/assets',0700,true)) throw new RuntimeException('Asset directory unavailable');
        foreach ($decoded as $logical=>$a) {
            $asset=query('SELECT id FROM gf_assets WHERE project_id=? AND sha256=? LIMIT 1',[$id,$a['hash']])->fetchColumn();
            if (!$asset) {
                $asset=uuid(); $key=$id.'-'.$a['hash'];
                // Atomic rename; content-addressed keys make retries safe. Rollbacks can
                // leave unreferenced files; never delete referenced files during a save.
                $tmp=tempnam($storage.'/assets','upload-');
                if ($tmp===false || file_put_contents($tmp,$a['bytes'])!==strlen($a['bytes'])) throw new RuntimeException('Asset write failed');
                if (is_file($storage.'/assets/'.$key)) unlink($tmp);
                elseif (!rename($tmp,$storage.'/assets/'.$key)) throw new RuntimeException('Asset commit failed');
                query('INSERT INTO gf_assets(id,project_id,storage_key,original_filename,mime_type,byte_size,sha256,uploaded_by) VALUES (?,?,?,?,?,?,?,?)',[$asset,$id,$key,$a['filename'],$a['mime'],strlen($a['bytes']),$a['hash'],$user['id']]);
            }
            query('INSERT INTO gf_revision_assets(project_id,revision,logical_asset_id,asset_id) VALUES (?,?,?,?)',[$id,$revision,$logical,$asset]);
        }
        query('UPDATE gf_projects SET title=?,current_revision=? WHERE id=?',[$game->title,$revision,$id]);
        $db->commit(); respond(['remote'=>['id'=>$id,'revision'=>$revision,'role'=>$p['role']]],201);
    }
    fail(404,'Unknown action.');
} catch (ApiError $e) {
    if ($db && $db->inTransaction()) $db->rollBack();
    respond(['error'=>$e->getMessage()],$e->status);
} catch (JsonException $e) {
    if ($db && $db->inTransaction()) $db->rollBack();
    respond(['error'=>'Invalid JSON.'],422);
} catch (Throwable $e) {
    if ($db && $db->inTransaction()) $db->rollBack();
    error_log('Game Factory API: '.$e->getMessage());
    respond(['error'=>'Server configuration or storage error. Check the private PHP error log.'],503);
}
