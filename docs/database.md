# Shared database design

Status: PHP authentication/storage API and frontend connection implemented and
tested locally. Hostinger initial migration was imported by the user. Import the
new `002_collaboration.sql` migration and deploy/configure the collaboration package
to enable accounts and shared saves. See [installation guide](HOSTINGER-SETUP.md).

## One set of tables for all games

Do not create tables named after games. Each game is a row in gf_projects. Users,
memberships, revisions and assets reference its ID. The server's project UUID is
separate from the editable game.json ID and Android application ID. Importing a
backup as a new project assigns a fresh server UUID, even if its game ID is unchanged.

| Table | Responsibility |
| --- | --- |
| gf_users | Author accounts and password hashes |
| gf_projects | Game identity, owner and current revision |
| gf_project_members | Editor/viewer access for colleagues |
| gf_project_revisions | Immutable game.json snapshots and save authors |
| gf_assets | Metadata and private storage location for image/font files |
| gf_revision_assets | Exact files used by each saved revision |
| gf_schema_migrations | Tracks database upgrades |
| gf_auth_limits | Persistent login/setup/password-attempt throttling (migration 002) |

The owner can manage access/archive a project. Editors can save and upload assets;
viewers can read/playtest/export. All actions require an active account. Ownership
is stored only in gf_projects; do not add the owner as an ordinary member.
Revoking membership removes access to historical revisions and assets as well.
An existing downloaded export cannot be revoked.

## Why cards and decks initially live in JSON

The editor and runtime already share a versioned game.json contract containing
cards, choices, decks, chapters, flags and endings. Store that document as a JSON
column in each revision. This preserves one source of truth and makes export,
backup and restore straightforward. Account and permission data remains relational.

The hybrid model supports a small team with whole-project conflict detection.
It is not simultaneous character-by-character editing. It also avoids maintaining
card/deck tables and a duplicate JSON document that could disagree.

If independent per-card editing or database-level content search becomes essential,
introduce shared gf_cards, gf_decks, gf_deck_cards and gf_chapters tables, each
scoped by project_id. Derive export snapshots transactionally from those tables.
Even then, no separate table per individual game is needed.

## Save protocol to implement

1. Authenticate through server-side PHP sessions. Use secure HttpOnly SameSite
   cookies over HTTPS, session rotation on login, CSRF checks on writes, login
   throttling, prepared PDO statements, password_hash/password_verify and a
   deployment secret/config outside public_html. Never store plaintext passwords.
   Initial accounts are provisioned by the owner; no open signup in the first version.
2. Read project and revision together. Return current_revision as the edit token.
   Validate every asset/revision request against owner or membership access.
3. Upload files with authentication and size/type/decode checks to private storage.
   Generate storage keys server-side. Never trust a client filename as a disk path.
   A changed image creates a new asset; never overwrite bytes used by old revisions.
4. Save with expected_revision and the complete document. Server validates JSON
   Schema, semantic rules, size limits, and every logical asset mapping.
5. Begin a transaction and SELECT the project FOR UPDATE. Check ownership/membership
   inside the transaction. Membership changes must lock that same project row.
6. If expected_revision differs, return HTTP 409 without overwriting either version.
   UI offers reload or download local changes; no silent last-writer-wins behavior.
7. Insert revision N+1 and all mappings, then update current_revision and the project
   title from document.title. Commit together. Initial creation uses NULL head, then
   inserts revision 1 and sets the head in one transaction.
8. Return the committed revision. Only then show Saved online. On timeouts reload
   the head/check content hash before retrying; preserve the local working copy.

The server computes SHA-256 from its consistently serialized document, not from
MySQL's textual rendering of JSON. The document includes schemaVersion; enforce
that it agrees with game_schema_version. The database ensures valid JSON syntax,
but does not enforce the game schema or validate references inside the document.

Require revision >= 1 in API validation. Revisions are immutable by API convention;
SQL constraints alone do not prevent an authorized database client from editing them.
The head FK prevents pointing at a nonexistent or foreign project's revision.
Asset composite FKs prevent cross-project asset linkage.

## Export and backups

Export one specified revision and its mapped files, not the changing latest head.
Include no users, passwords, membership records or database configuration in games.
The exported Android/web game remains offline-capable and independent of MySQL.

Restore an old version by creating a NEW revision using the old snapshot/assets.
Never move the head backwards or reuse a revision number. Initially retain all
revisions; add deliberate retention and unused-upload cleanup later. Soft archive
projects and disable users instead of deleting them. Foreign keys intentionally
restrict physical deletion; purge requires a separate reviewed maintenance routine.
Back up the SQL database AND private asset files; test restoring them together.

## Hostinger setup when backend implementation is ready

The user confirmed `SELECT VERSION()` returns `11.8.9-MariaDB-log` on Hostinger.
Target MariaDB 11.8.9 and PHP 8.4 (PHP 8.2–8.5 options are available).
The initial migration uses compatible InnoDB, foreign-key, timestamp and JSON
features; no structural SQL change was identified as necessary in documentation review.
MariaDB's JSON type is a LONGTEXT alias with JSON validation, which fits our
whole-document snapshot storage. phpMyAdmin may display it as LONGTEXT.
Reference: https://mariadb.com/docs/server/reference/data-types/string-data-types/json
Foreign keys: https://mariadb.com/docs/server/ha-and-performance/optimization-and-tuning/optimization-and-indexes/foreign-keys

1. Create a dedicated MySQL database/user in hPanel.
2. Confirm the selected database is dedicated to Game Factory; the server version
   has already been identified as MariaDB 11.8.9.
3. Select the EMPTY dedicated database, then Import database/001_initial.sql once.
   The migration deliberately has no DROP or IF NOT EXISTS clauses. Do not rerun
   blindly: DDL implicitly commits and partial imports need inspection.
4. Deploy the future PHP API and configure credentials privately. Do not upload
   the SQL file or credentials into the publicly served editor folder.
5. Create the first account with a server-side provisioning command that hashes
   the password; no sample account/password is included in this migration.

Both migrations and the HTTP workflow were tested against an isolated local
MariaDB 10.4.32/PHP 8.2.12 instance. Hostinger's MariaDB 11.8.9/PHP 8.4 deployment
still requires its own smoke test. Existing server credentials were not accessed.

Implementation note: historical revisions currently open as independent working
copies and can be published as a separate project. A direct restore-as-new-head
button is deferred. Shared working copies remain in memory until Save online;
local drafts retain browser autosave. See the installation guide for limits.

## Required integration checks

- Owner/editor/viewer permissions, disabled accounts and removed memberships.
- Cross-project revision/asset requests are rejected.
- Two clients saving revision N: one succeeds, the other receives 409.
- Failed saves roll back document, mappings and head together.
- An old revision exports its original image after a replacement upload.
- Restore creates a new revision; other projects remain untouched.
- Browser backup import creates a project only after server validation.
- SQL plus private assets can be restored on a fresh database.
