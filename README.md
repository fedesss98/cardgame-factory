# Game Factory

The app opens with a dedicated sign-in screen and a Games dashboard for existing
sessions. Workspace navigation separates Games, Current project, Team administration
and My account. Return from the editor with **Workspace & account**; local drafts
remain available without login. Authentication requests live in `workspaceApi.ts`,
and the sign-in form in `SignInPanel.tsx`. This interface update passed 60 automated
tests and a production build, with local demo browser checks. See the latest
[upload instructions](docs/HOSTINGER-SETUP.md). No database migration is needed.

Latest increment: **Prepare export** selects an exact shared revision or explicit
working draft. Web/Android exports include a file-hash release manifest. This is the
first part of Stage E; launcher icons and further store preparation remain pending.
The review fixed shared WOFF2 support and aligned upload image limits. The update
is deployed to `factory.fedeama.it`; see
[Hostinger setup](docs/HOSTINGER-SETUP.md) for the backup and verification details.
No SQL migration or replacement template ZIP was needed.
67 Node tests, PHP asset checks and the production build passed. The studio also
ships a ready-made Italian story game: `games/ash-heir/game.json`
(**L'Erede di Cenere**, schema 1.0.0, no image assets needed). To play it, ZIP
that folder as a project backup and use **Import project**, or copy the player
runtime (`dist/player-runtime/` or `public/player-runtime/`) next to `game.json`
plus `assets/blank.png` and serve the folder over any static HTTP server.

Current direction (26 October 2026): prioritize collaborative web authoring and a
full playable preview with fullscreen and chapter/deck debugging controls. Download
Android projects on a separate build computer; Android Studio is not required on
this authoring PC. See the [remaining implementation plan](docs/implementation-plan.md).

Stage A is implemented: use **Expand playtest**, **Fullscreen** or **Test controls**
in the preview. Chapter/deck scenarios and overrides affect only the test session.
Use **Apply latest edits · restart** to refresh the frozen content, and **Step back**
to rewind a test. `npm run build:web` rebuilds the frontend without creating archives.
Stage C adds undo/redo, safe card management, bulk deck membership, an image library
with crop variants, theme presets and safer backup imports. Undo history lasts for
the current session (40 steps). Cropping retains the original; unused images can
be removed from the library when no longer needed. Images count toward shared
storage limits even when unused.

Stage D adds player save/resume for exported games: a resolved state is saved after
every choice and restored on reload, while persistent flags and discovered endings
live in separate progress storage. **New game** keeps persistent progress;
**Reset all progress** clears it. Incompatible or damaged saves start a new run with
an explanation. Playtest can download/import reproducible run traces tied to a
shared revision (or a clearly labelled local draft), and shows coverage, dead ends
and choice history. Two example stories are available in the sidebar: Harbor Council
and the dark, minimal Ember Station.

Authoring foundation (27 October): **New game** now opens a setup wizard for the
title, theme, first resource/starting value and first chapter. It creates a valid
blank one-scene starter with no example content, and first launch does the same with
defaults plus a dismissible **Start here** checklist. Game settings adds theme
presets, contrast warnings, a background-image picker and bundled WOFF2 fonts; a
resource manager supports icons, ranges, reordering and reference-safe deletion;
flags expose run/persistent scope; and cards can carry organizational tags with a
browser filter. These use existing schema fields: no migration, PHP/API or native
change. See [Visual authoring](docs/VISUAL-AUTHORING.md).

Collaboration and recovery: whenever a colleague saves a newer revision the UI
rechecks every 45 seconds and shows a stale-revision notice before you save
(plus **Compare working copy with latest revision**, an entity-level diff).
Owners can **archive** a shared project (soft delete: hidden from all lists,
revisions and files stay on the server, recoverable from the database) or
**hand over ownership**. Administrators can disable/re-enable colleague
accounts and set a new password for a colleague's lost one. Unsaved shared
edits now also survive reloads and browser crash-recoveries via autosave.

For this update, upload `dist/assets/`, `dist/player-runtime/` and the rebuilt
`dist/export-template.zip` into the existing app webroot, then replace
`dist/index.html` there. Keep the existing API and private files. No SQL migration
is required. The runtime folder is required for web/Android exports; its manifest
detects incomplete uploads. The Stage D bundle was deployed to `factory.fedeama.it`
on 27 October 2026. The authoring-foundation bundle (Phases 1 and 2) replaced the
static editor files on 27 October 2026; a pre-deploy backup is at
`~/backups/game-factory-static-20261027-133254.tar.gz` on the server. No PHP or SQL
change was part of that deployment.

Design baseline for a private visual authoring tool for Reigns-style card games.
The React/TypeScript editor and PHP/MariaDB shared-workspace backend are implemented.
The user confirmed the shared application is online and working on Hostinger.
APK/AAB compilation remains unverified. See [Hostinger setup](docs/HOSTINGER-SETUP.md).

## Run the prototype

Requires Node.js 22 or newer:

```text
npm install
npm run build
npm run dev
```

Open the localhost URL printed by Vite. First launch creates a blank starter project;
use **New game** for the setup wizard, or add Harbor Council / Ember Station from the
sidebar examples. Edit cards, images and stat effects; use Apply edits to restart the
preview with the latest changes. Drafts autosave to this browser's IndexedDB, including
working copies of shared projects (browser-local; they are removed from this
browser when you sign out). Export backups regularly. Local drafts stay in
IndexedDB; use Shared workspace to publish a copy and Save online to commit
changes to the PHP/MariaDB backend after deployment.

`npm run build` prepares the player, a native Capacitor Android template and the
static editor in `dist/`. Upload the contents of `dist/` to the intended Hostinger
directory when ready. No Node server is needed on Hostinger.

Export offers project backup ZIP, playable website ZIP and Android project ZIP.
The Android ZIP contains a native Gradle project, Windows setup checker, test APK
build launcher and signing guide. Extract it, run `Check Android Setup.cmd`, then
`Build APK.cmd` after installing the required tools. See the
[Android build guide](tools/android-export/README.md). Internet is needed for initial
toolchain/dependency downloads. Export does not produce a signed AAB and uses a
placeholder app icon. Actual native compilation and device tests remain pending:
Android Studio/JDK 21/SDK will be used on a separate build computer, not this authoring PC.
Game settings now exposes Android version name and version code.

After `npm run build`, `npm run export:sample` creates `release/harbor-android.zip`
using the same exporter as the browser and checks its packaged contents. This is
an Android project archive, not a compiled application.

Structure & rules now provides visual deck, chapter, flag and ending editors.
Card choices have ordered resource/flag effects and optional follow-ups. Conditions
use resource values, story flags or decision counts, with All/Any matching.
See [Visual authoring guide](docs/VISUAL-AUTHORING.md). Advanced JSON remains optional.

Current limits: no simultaneous live editing; no sound or app-icon editor. Player
save/resume is implemented for exported games; editor playtest state and authoring
drafts remain separate. Interactive acceptance, browser reload checks on a deployed
build, accessibility tooling and native lifecycle checks have not been performed for
this increment.

Checks: 57 automated tests exercise gameplay branches, determinism, endings, deck
exhaustion, three-chapter progression, effect/transition order, reference protection,
semantic validation, player save compatibility, trace replay, playtest reports, both
example projects, blank-project validity and export, resource deletion guards, tag
slugification and contrast warnings. `npm run build` includes TypeScript checking and
static builds.

## Shared-workspace deployment

Import `database/002_collaboration.sql` once after the existing initial migration.
Use `game-factory-collaboration.zip` and follow `docs/HOSTINGER-SETUP.md`: the public
website and PHP/config/storage directories must follow the protected layout in that guide.
The old `game-factory-hostinger.zip` is the earlier static-only prototype.

To rebuild the collaboration package after code changes:

```text
npm run build
node tools/package-hostinger.mjs
```

PHP dependencies are locked in `server/composer.lock`; Opis JSON Schema validates
the shared game contract on the server. Composer is needed only when developing
or rebuilding dependencies; the deployment ZIP includes vendor files.

Server maintenance: copy `server/maintenance.php` next to `app.php` in the
private directory and run it over SSH with the PHP 8 CLI, for example
`/opt/alt/php84/usr/bin/php maintenance.php status`, `… gc [--apply]`
(orphan asset files and unreferenced rows, files older than 24 hours only) and
`… backup [--keep=N]` (SQL dump + assets tar in `storage/backups`; restore both
halves together). Run `backup` on a schedule and keep a downloaded copy.

Backend integration checks: `tests/setup-backend.php` initializes a fresh isolated
database on localhost:33180, and `node tests/backend.mjs` tests the PHP service on
localhost:8789. These are local test fixtures, never production setup scripts.
They require an isolated MariaDB instance, PHP with pdo_mysql, and installed PHP
dependencies. The Vite dev proxy connects /api to that PHP service; it is not used
on Hostinger. Test fixtures and credentials are excluded from deployment packages.

- [Confirmed priorities and export-first delivery](docs/product-priorities.md)
- [Architecture and hosting](docs/architecture.md)
- [Staged implementation plan](docs/implementation-plan.md)
- [Game format and runtime rules](docs/game-format.md)
- [Game JSON Schema](schema/game.schema.json)
- [Shared database design](docs/database.md)
- [Initial SQL migration](database/001_initial.sql)
- [Example project: Harbor Council](examples/harbor/game.json)
- [Example project: Ember Station](examples/ember/game.json)

The browser editor and exported games run as static files on Hostinger. Optional
shared-workspace saves use PHP/MariaDB. Android compilation runs separately on
the owner's Windows computer.

The v1 schema is used by the editor and backend. JSON Schema checks structure;
application validators also check references, ranges and story-rule consistency.

To check the design artifacts, with Python and `jsonschema` installed:

```text
python tools/check_schema.py
```

This validates the schema, example, references and selected invalid fixtures;
it does not test a runtime or an Android build.
