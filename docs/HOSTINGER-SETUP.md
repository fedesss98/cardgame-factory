# Install the shared-workspace update

## Latest update — sign-in and workspace interface

Upload `dist/assets/` and `dist/player-runtime/` to the matching folders inside
`public_html`, then upload `dist/index.html` last. No new ZIP, PHP change or SQL
migration is required for this interface update. Keep existing API, configuration,
storage, `.htaccess` and `export-template.zip` files.

The app now opens at sign-in, or at the Games dashboard when the session is valid.
Use Games, Current project, Team (administrators only) and My account to navigate.
Local drafts remain accessible without signing in. Account creation and password
recovery still go through the administrator; there is no email reset service.

Verified locally: 60 automated tests, TypeScript and production build, plus browser
checks with a local demo API for sign-in, session restoration, sign-out, game search,
opening a shared game, account/team navigation and local drafts. Narrow-screen login
layout checked. Real Hostinger authentication must be checked after upload. The demo
API is only in `.build/` and must never be uploaded.

The font-support `server/validation.php` described below is deployed with this
update.

## Current update — Stage E release selection and asset fixes

Upload these files (no new ZIP and no SQL migration):

1. `server/validation.php` → `public_html/game-factory-private/validation.php`.
2. Contents of `dist/assets/` → `public_html/assets/`.
3. Contents of `dist/player-runtime/` → `public_html/player-runtime/`.
4. `dist/index.html` → `public_html/index.html` last.

Preserve config.php, storage, .htaccess, api/index.php and export-template.zip.
The PHP change enables WOFF2 fonts already supported by the editor. All assets
share the existing 10 MB budget; fonts have a 2 MB individual limit. Save work before
refreshing. Use Prepare export, load a saved revision or select the working draft,
then download. The release manifest records provenance without private user data.

Deployed to `factory.fedeama.it` on 27 October 2026. The previous static files and
`validation.php` are backed up at
`~/backups/game-factory-static-20261027-172038.tar.gz`. Remote SHA-256 values match
the local build for `index.html`, the editor bundle and CSS, every lazy chunk, the
player runtime, its manifest and `game-factory-private/validation.php`. The site,
new bundle, CSS, player runtime and manifest return HTTP 200; `api/index.php` still
returns `setup_required: false`. Sign-in, real Hostinger save/export and browser
acceptance checks remain pending.

## Stage D deployment (27 October 2026)

The Stage D bundle is deployed to `factory.fedeama.it`. Uploaded `dist/index.html`,
`dist/assets/`, `dist/player-runtime/` and the rebuilt `dist/export-template.zip`;
`api/`, `game-factory-private/` and `.htaccess` were left in place. The previous
static files are backed up outside the webroot at
`~/backups/game-factory-static-20261027-134040.tar.gz`.

Verified after upload: remote SHA-256 values match the local build for the editor
bundle, player runtime and manifest; the editor, assets and runtime return HTTP 200;
`api/index.php` still responds with `setup_required: false`. Browser reload/resume,
two-browser save isolation, screen-reader checks and native lifecycle tests remain
pending.

## Stage C frontend update (27 October 2026)

The existing hosted app is working. No SQL migration or PHP upload is needed.
Save pending work, then upload these local files into your app's `public_html`:

| Local source | Hostinger destination |
| --- | --- |
| `G:\PROGRAMMAZIONE\game_factory\dist\assets\` | `public_html/assets/` |
| `G:\PROGRAMMAZIONE\game_factory\dist\player-runtime\` (whole new folder) | `public_html/player-runtime/` |
| `G:\PROGRAMMAZIONE\game_factory\dist\index.html` | `public_html/index.html` |

Upload both folders before index.html, then refresh the browser. Preserve existing
`api/`, `game-factory-private/` and `export-template.zip`. Do not upload source code,
node_modules or SQL. No new ZIP has been generated. This increment was built but
not tested. `player-runtime/manifest.json` and its files must be uploaded together:
exports verify hashes before using the updated player.

## Stage B frontend update (27 October 2026)

For an already working collaboration installation, upload `dist/index.html` and
the files inside `dist/assets/` into the app's webroot, preserving the `assets/`
subfolder. No SQL migration or PHP upload is required. Keep existing `api/`, private
config/storage and `export-template.zip`. Save online or export pending work before
refreshing. This increment was built without tests or deployment ZIP packaging.

Shared workspace now identifies unsaved changes, opens latest copies without
discarding drafts, previews revisions, and restores history as a new revision.
On another computer, sign in, open the shared project and use Export. Only saved
revisions are available there. Local recovery copies remain browser-local.
Hostinger and multi-user acceptance checks are still pending.

## Visual story-editor update (2026-10-23)

The latest package also includes visual decks, chapters, flags, conditions and
endings. The database format has not changed. If collaboration is already installed
and working, upload the latest `public_html` contents, preserving any customized
`api/index.php` private-directory path. No SQL import or account setup is needed.
Keep your existing private `config.php` and `storage/`. Refresh the browser after
exporting or saving pending work. A first collaboration installation still follows
the steps below; import migration 002 only if it has not already been imported.

Read `VISUAL-AUTHORING.md` for the new editor workflow.

This update adds PHP authentication, shared projects, manual online saves, revision
history and owner-managed editor/viewer access. Your existing local projects remain
local until you explicitly publish one. Android compilation is unchanged.

## 1. Back up before updating

Export important browser projects as Project backup ZIPs. Back up the existing
website and database through hPanel. The SQL update preserves existing tables/data.

## 2. Import only the new migration

You have already imported `001_initial.sql`. In the same dedicated database,
import `database/002_collaboration.sql` ONCE via phpMyAdmin. Do not re-import 001.
The update adds the administrator field and a login-throttling table. You should
now have eight `gf_` tables. DDL auto-commits; if interrupted, inspect the result
before retrying. The migration marker must include `002_collaboration`.

## 3. Place the two folders correctly

Extract `game-factory-collaboration.zip` on your computer. It contains:

```text
public_html/                 updated website and api/index.php
game-factory-private/        PHP implementation, dependencies and schema
database/                    migration files, not website content
HOSTINGER-SETUP.md           this guide
```

For this account, where all uploads must be inside `public_html`, use:

```text
public_html/
  index.html
  assets/
  player-runtime/
  export-template.zip
  api/index.php
  .htaccess                site-wide security headers (X-Frame-Options, HSTS…)
  game-factory-private/
    .htaccess               deny all HTTP access
    app.php
    validation.php
    game.schema.json
    vendor/
    config.example.php
    config.php               you create this
    storage/                 PHP creates this
```

Upload the website contents into the subdomain's root. Put the private subtree
inside that root only with its `.htaccess` containing `Require all denied`.
Before adding secrets, verify a harmless file in that folder returns HTTP 403.
The hosted `api/index.php` must use:

```php
$private = dirname(__DIR__) . '/game-factory-private';
```

Preserve this customization when updating the API. The source entry point is
`server/public/index.php`; private PHP files and vendor come from `server/`, and
`game.schema.json` comes from `schema/`. Create `config.php` from
`server/config.example.php` and set its storage directory to `__DIR__ . '/storage'`.
PHP creates storage as needed. Do not put SQL files in the webroot. Never use
chmod 777; use the hosting account's normal ownership and permissions.

## 4. Configure the connection privately

In the private directory, copy `config.example.php` to `config.php`. Set:

- `dsn`: host and database name from hPanel (use its database-host setting).
- `db_user` / `db_password`: the database user's credentials.
- `origin`: your exact HTTPS editor origin, e.g. `https://factory.fedeama.it`.
  No path or trailing slash. This must match the address colleagues use.
- `setup_token_hash`: generated in the next step.
- Keep `allow_http_local` false on Hostinger.

Select PHP 8.4. Required extensions: pdo_mysql, mbstring and fileinfo, plus standard
JSON/session/image inspection functions. Vendor dependencies are already bundled;
you do not need Composer, Node.js or a terminal on Hostinger.

Keep Cloudflare DNS-only initially, with a valid Hostinger HTTPS certificate.
If enabling Cloudflare proxying later, use end-to-end HTTPS and review the remote-IP
throttle: this release trusts REMOTE_ADDR only, not arbitrary forwarding headers.
Use one canonical hostname; do not mix www/non-www origins for the editor.

## 5. Create the first account

On your computer, in the project folder, run:

You can also double-click `Generate Setup Token.cmd` on the development computer.

```text
php tools/setup-token.php
```

This prints a random setup token and its SHA-256 hash. Paste ONLY the hash into
private `config.php`. Keep the original token for the next step; never paste it
into chat or a URL. The helper itself is local and is not deployed.

Open the HTTPS editor, click **Shared workspace**, and fill in the first-account
form with your display name, email, password and setup token. Password length is
12–72 bytes. This creates the administrator and signs you in. Setup cannot create
another account once any account exists. Clear `setup_token_hash` in private
config.php after successful setup.

## 6. Publish and collaborate

1. Open a local game and click **Shared workspace → Publish this local project online**.
   Your local copy remains in the sidebar; a shared working copy is opened.
2. In the administrator's **Create a colleague account** section, create each
   colleague's account. Share initial credentials privately, outside the application.
   Colleagues can use **Change my password** after signing in. There is no email
   sending or automated password-reset flow in this release.
3. On the shared project, use **Project access** to grant their email Editor or Viewer.
   Creating an account alone does not grant access to any project.
4. Colleagues sign in, refresh the shared list, and choose **Open copy**.
5. After editing, click **Save online**. Browser autosave applies to local
   projects and to working copies of shared projects, so shared edits survive
   reloads and browser crash-recoveries. Unsaved shared edits live only in your
   browser; never on a colleague's machine. As before, export a backup before
   closing or signing out, because signing out removes shared working copies.
6. A save conflict leaves your working copy untouched. Open a fresh shared copy
   (the old working copy remains in the sidebar), compare changes with
   **Compare working copy with latest revision** (entity-level diff), or use
   **Save current work as a separate shared project**. No silent merging or
   overwriting. The editor rechecks for newer revisions every 45 seconds while
   the tab is visible.
7. Revision history previews old snapshots and can restore their content as a new
   revision. It retains intervening history and rejects a stale revision conflict.
8. Project owners can **hand over ownership** (the new owner manages access; the
   former owner keeps editor access) and **archive a shared project** with a
   typed title confirmation. Archiving hides it from every list; revisions,
   members and files stay on the server, recoverable only by SQL:
   `UPDATE gf_projects SET archived_at=NULL WHERE id='<project id>';`.
9. Administrators can disable or re-enable colleague accounts (administrator
   accounts excluded) and replace a colleague's lost password under
   **Colleague accounts (disable, enable, recover)**. There is still no email
   or automated password-reset flow.

Viewers can preview and export; the API rejects changes to the original project.
They can publish their own separate copy. Owners can remove access. Downloaded
exports and already-open copies cannot be recalled by removing membership.

## Limits and verification

## Server maintenance (SSH)

Copy `server/maintenance.php` from the game-factory-collaboration package into
`game-factory-private/` (next to `app.php`). Run it with the PHP 8 CLI:

```text
/opt/alt/php84/usr/bin/php maintenance.php status            # overview
/opt/alt/php84/usr/bin/php maintenance.php gc [--apply]      # orphan assets, >24h files only
/opt/alt/php84/usr/bin/php maintenance.php backup [--keep=7] # SQL dump + assets tar
```

`backup` writes a pair — a gzipped SQL dump plus a `*-assets.tar.gz` of
`storage/assets` — into `storage/backups/` (mode 0700) and prunes older pairs.
Restoring requires BOTH halves. Schedule it (for example run it after each
significant session) and download copies to your computer; `Back up before
updating` in hPanel backs up the database, but a backup without the asset
archive cannot restore a project's images. To free space, `gc` prints first and
deletes only with `--apply`, never touching files newer than 24 hours or any
file referenced by a stored revision.

## Limits and verification (continued)

- Shared project limit: 2,000 cards, 200 images, 5 MB per image and 10 MB total
  decoded image data. Only PNG/JPEG/WebP are supported for shared assets in this release.
- POST JSON is capped at 16 MB. Hosting request limits must allow that size.
- Sessions expire after eight hours of inactivity. Re-authenticate and retry as needed.
- SQL and private storage/assets must be backed up together. Old revisions retain
  their image bytes. Rolled-back uploads can leave unreferenced private files;
  automatic retention/garbage collection is not implemented yet.
- Login failures and setup attempts are throttled by account/IP. After repeated
  attempts wait 15 minutes. The same NAT/proxy IP shares an IP limit.
- The editor is public to load, but all shared project data requires authentication.
- Database/API tests ran locally on MariaDB 10.4.32 and PHP 8.2.12. Your Hostinger
  MariaDB 11.8.9/PHP 8.4 installation still needs its deployment smoke test.

After installation test: sign in, publish, reopen from a second browser profile,
save as an editor, reject a stale save, verify a viewer cannot save, remove access,
then export and play the downloaded game. Check the private PHP error log if the
UI reports a server configuration error; never publish that log or your config.
