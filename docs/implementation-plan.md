# Implementation plan — remaining work from 26 October 2026

This plan replaces the earlier delivery order. The latest [product priorities](product-priorities.md)
are authoritative. Work now focuses on the shared web app and portable Android
project output. Android Studio will NOT be installed on this authoring computer.
Native compilation/signing/testing happens later on a separate machine and does
not block implementation or acceptance of the web milestones.

## Product outcome

Authors visit the hosted factory, collaborate on a game, play and debug it in the
browser, then download a complete Android project on whichever computer will
build the release. That machine opens/prepares the project in Android Studio,
tests it, signs an AAB and uploads it through Google Play Console.

Hostinger serves the React/TypeScript app and PHP API; MariaDB stores shared
projects and revisions, with private asset storage. The same TypeScript engine
and player serve the preview, web export and bundled Android game. No hosted
Node service, Android SDK on Hostinger, or connection to this authoring PC is required.

## Existing baseline — keep and improve

Implemented: card/image authoring, visual decks/chapters/flags/rules/endings,
deterministic engine, embedded preview, local drafts/backups, PHP login and project
membership, server revisions/conflict checks, web and Android project ZIP exports,
release version fields and optional Windows build helpers.

Verified locally: 44 automated tests, production web build, browser authoring checks,
export contents and actual Capacitor Android sync. Earlier backend checks passed
against isolated local PHP/MariaDB. Stage D browser reload/resume and accessibility
checks remain pending. These are not production Hostinger or native Android
compilation results.

Stages A–D now implement playtesting, collaboration refinements, content production
controls and player persistence with reproducible QA. Remaining work includes
production team workflow verification, finished branding/export preparation and
Android/device/Play validation.

## Authoring foundation — Phases 1 and 2 (implemented 27 October 2026)

Phase 1: **New game** opens a setup wizard for title, theme, first resource and
starting value, and first chapter. It creates a valid one-scene starter with a
neutral placeholder image, one resource, one once-per-run card, one deck, one
chapter and a fallback ending — no Harbor or Ember content. First launch creates the
same blank project with defaults and shows a dismissible **Start here** checklist.
The checklist marker stays in browser storage, never in `game.json`.

Phase 2 uses existing schema fields only:

- resource manager (add/rename/reorder/remove, range and initial validation, icon,
  reference-aware deletion and usage links);
- flag scope selector (run vs persistent) and corrected persistence copy;
- card tags with slugification, a tag editor and a card-browser filter (organizational
  only);
- centralized theme presets, background image with luminance overlay, bundled WOFF2
  fonts in preview/export, contrast warnings, and resource icons in the player.

No schema version bump, migration, PHP/API change, shared-workspace change or native
change was made. Deferred: card layout variants, typography scale, title screens,
choice styling and schema 1.1.0 (Phase 3); extra choices, choice requirements and
reusable condition presets (Phase 4).

Validation for this increment: 57 automated tests, TypeScript, production build and
sample Android export. A headless Chrome flow against the deployed build covered
first launch, the wizard, checklist dismissal, theme/resource/background/font
controls, the contrast warning, tag chips plus tag filtering and flag scope.
Deployment is the static set `dist/index.html`, `dist/assets/`,
`dist/player-runtime/` and `dist/export-template.zip`; remote hashes match. Native
APK/AAB compilation remains unverified.

## Next stage A — Playtest workspace (highest priority)

Implementation status, 27 October: Stage A features are implemented: expanded/native
fullscreen with fallback, keyboard choices, isolated content snapshots, chapter/deck
starts, validated overrides, forced cards, eligibility inspection, ordered logs and
200-step rewind. Eight focused engine/session tests passed during implementation;
browser checks covered chapter launch, ending/rewind and preserved state across
fullscreen/editor switches. Fullscreen-denial fallback and comprehensive device/
accessibility testing remain unverified. The final follow-up fixes reopening test
controls and native fullscreen exit handling. Only frontend files need uploading;
no new archives, PHP changes or SQL migrations. The existing export template remains
unchanged; these authoring/debugging features are not added to exported games.

Deliver a dedicated Playtest view reachable from the editor, retaining the small
preview as a convenience. The default is an ordinary playable game with the same
rules and presentation as the exported player.

### A1. Full playable preview

- Play from the beginning through chapters, choices and endings; restart explicitly.
- Offer an expanded in-app player and actual browser full-screen mode. If browser
  fullscreen is unsupported or denied, the expanded view still works.
- Enter/exit fullscreen without resetting the run. Escape returns safely, restores
  focus, and does not discard unsaved edits. Hide authoring panels in presentation mode.
- Support touch/swipe, choice buttons and keyboard input; avoid handling shortcuts
  while typing in an editor. Provide readable portrait and responsive layouts.
- Show which project/revision or local draft snapshot is being tested. Edits do not
  silently change the running game; Apply latest edits explicitly starts a new run.

Acceptance: a full sample playthrough reaches its expected ending in embedded,
expanded and fullscreen views; changing presentation preserves current state.
Keyboard-only navigation and fullscreen fallback work. Invalid content shows
useful errors instead of an empty player.

### A2. Chapter/deck selection and scenario setup

Use “scene” as a user-facing chapter selection; do not introduce a second scene
entity into the content schema without an actual gameplay need.

- Start normally, start at any chapter, or test a selected deck within a chapter.
- Chapter start initializes a fresh run with default resources/flags, applies that
  chapter's entry effects once, then optional test overrides, then the normal
  ending/draw resolution. Explain that earlier chapters have not been simulated.
- Scenario setup exposes resource values, flags, run/chapter turn counters and a
  reproducible random seed. Values are validated; controls are labeled in player terms.
- Normal chapter tests use all configured decks and their conditions. “Isolate deck”
  narrows automatic draws to one selected chapter deck; card eligibility, repeat
  rules, follow-ups, transitions and endings still operate normally. Follow-ups can
  lead outside that deck, and a chapter transition clears the deck isolation.
- Ineligible/empty decks explain why nothing can be drawn. A separate, explicitly
  labeled “Force card” diagnostic may bypass eligibility; never silently bypass it.
- Starting another scenario resets the run only after an explicit Start test action.
  A separate action can apply validated resource/flag overrides to the current run;
  it uses a defined resolution step and records the intervention in the test log.
- Inspect current card/chapter, resources, flags, counters, repeat history and deck
  cursors. Explain eligible/excluded cards and show choice effects, transitions and
  ending decisions in a readable event log. Preserve rule/effect ordering.
- Allow stepping back through captured test states and resetting. Test-state rewind
  is separate from authoring undo and does not rewrite the authored game.

Acceptance: jump to the final chapter without playing preceding chapters, reproduce
an ending with explicit flags/resources, inspect a gated deck, isolate a deck and
verify transition behavior. Restore prior test state and replay the same choice.
No scenario override changes the saved project, starting defaults or exported game.

Implementation boundary: extract a typed play session/controller from PlayerView;
keep rendering and shared engine logic reusable. Add an editor-only scenario/debug
adapter, not a second gameplay engine. Scenario setup and trace metadata are kept
out of the production player's UI and exports. Tests target state transitions and
isolation rather than component implementation details.

## Stage B — Dependable collaboration across computers

Workspace interface follow-up: dedicated sign-in/session restoration, a searchable
Games dashboard, explicit local drafts, and separate Current project, Team and My
account sections replace the expandable all-in-one panel. Account creation and
password recovery remain administrator-managed. Existing API permissions, revision
conflicts and recovery flows remain in place. 67 tests and the production build pass;
local demo browser checks cover navigation, login/logout, session restoration and
game opening. Actual Hostinger authentication and multi-user acceptance are separate
deployment checks. This interface increment changes frontend files only.

Implementation update (27 October): explicit dirty/saved status, revision author/time,
searchable shared projects, latest-copy opening, playable revision previews, restore
as a new revision, conflict recovery choices and local recovery copies are implemented.
Stable draft IDs keep asynchronous saves attached to the correct working copy; edits
made during a save remain marked unsaved. Expired sessions keep drafts available for
reauthentication. All features reuse the existing authenticated API and revision checks;
no database migration or PHP change is required. Per user instruction, no tests or
packaging were run for this increment. Production Hostinger, two-user conflict,
permission and backup/restore acceptance checks remain pending; Stage B is not yet
verified end-to-end on the deployed service.

Harden the implemented PHP/MariaDB workflow rather than rebuilding it.

- Make local changes, server-saved revision, last author/save and permissions clear.
  An unsaved local draft is never presented as available on another machine.
- Provide understandable project dashboard, opening, duplication and membership flows.
- Preserve a user's work during session expiry and conflicts. Offer reload latest,
  save as a separate copy or deliberate reconciliation; never silently overwrite.
- Let collaborators inspect revision history, preview a selected revision and
  restore it as a new revision, keeping intervening history intact.
- Let an authorized collaborator on machine B open the latest saved game and export
  all of its assets without accessing machine A or its browser storage.
- Verify authorization for private assets, project revisions and export-related
  requests; keep role behavior explicit. Retain private server storage and backups.
- Verify production deployment on the actual Hostinger setup, including HTTPS,
  session behavior, upload limits, migration state and backup/restore.

Acceptance: two independent browser profiles edit one project, provoke a stale-save
conflict, recover both contributions, restore an older revision and download an
identical selected revision with its images. Repeat critical checks on Hostinger
when access is available. Unavailable hosting access remains a named external check.

Scope: shared projects with revision/conflict protection. Simultaneous live coediting,
real-time presence and automatic merges are optional later, not implied by collaboration.

## Stage C — Comfortable content production

Implementation update (27 October): implemented session undo/redo (40 steps), card
duplication, reference-aware deletion, list ordering and bulk deck membership;
searchable image reuse, usage navigation, replacement, non-destructive crop variants
and credits; theme/font presets; validation navigation and shared-size warnings.
Imports inspect ZIP sizes/paths before bounded decompression. Local save failures
offer retry; online revisions remain independent of authoring undo history.
The frontend build now includes `player-runtime/` with hashes, so web/Android
exports use the current player without regenerating the native template archive.
TypeScript and production builds are the only verification for this increment;
no tests, browser QA or ZIP packaging were run at the user's request. The acceptance
workflow below remains unverified. Upload frontend assets, player-runtime and
index.html only; no PHP changes or SQL migration. Next implementation stage was D;
see the Stage D update below.

- Add undo/redo for authoring actions, safe card deletion/duplication, bulk membership
  operations and predictable navigation between cards, decks, chapters and endings.
- Add a reusable image library: upload, preview, replace, reuse, reference-aware
  deletion, cropping and size optimization while preserving the original image.
- Improve validation with links to the offending field/entity, separating errors
  from warnings. Add checks for broken references and missing/oversized media.
- Improve large-project search, filters and ordering. Keep IDs stable on renames.
- Clarify narrative setting vs visual theme; support useful theme presets, readable
  colors, typography and per-game branding without requiring JSON edits.
- Strengthen import limits before expensive decompression and preserve draft recovery
  when browser storage is full or unavailable.

Acceptance: author and organize a roughly 40-card game using the UI, undo a deletion,
reuse/crop an image, replace it without broken references, recover from storage/save
failures and restore a complete backup in a different browser profile.

## Stage D — Complete player behavior and repeatable QA

Implementation update (27 October): exported players now save a complete resolved
state after every choice and resume it after reload. Run saves and persistent
progress (persistent flags plus discovered endings) use separate per-game
localStorage keys, so New game and Reset all progress are distinct actions.
Compatible content updates validate references before resuming; removed chapters,
cards or endings, damaged saves and save-compatibility changes start a safe new run
and explain why. Editor playtest state remains separate and never writes player
saves. Background/focus changes flush the current state, long text wraps and
scrolls, narrow layouts and reduced-motion preferences are handled, and player
status/choices/resources expose screen-reader labels.

Playtest can download and replay a run trace containing the game/revision identity,
engine version, content fingerprint, scenario, seed, ordered interventions, event
log and final state. Replay rejects a different game, engine, compatibility version,
content fingerprint, invalid intervention or divergent final state. A lean report
shows validation errors, observed card/chapter/ending coverage, unreached content,
fallback dead ends and choice history. Ember Station is a second, visually distinct
example alongside Harbor Council.

Verified locally: 44 automated tests, TypeScript checking, production web/player
builds and the existing Android sample export. The static Stage D bundle was
deployed to `factory.fedeama.it` on 27 October 2026: remote hashes matched the
build, the editor, assets and runtime manifest returned HTTP 200, and the API still
reported `setup_required: false`. Browser reload/resume, two-browser save
isolation, accessibility tooling and device/native lifecycle checks were not run.
Deployment uploads `dist/assets/`, `dist/player-runtime/`, the rebuilt
`dist/export-template.zip` and `dist/index.html`; no PHP change or SQL migration is
required.

- Add player save/resume, explicit New game and compatible content-update handling.
  Keep editor playtest state, exported-player saves and authoring drafts separate.
- Handle reload, focus/background changes and long content gracefully; polish
  transitions, feedback, reduced motion, touch input and screen-reader labeling.
- Add shareable test scenarios and run logs tied to a specific immutable revision,
  engine version, seed and interventions. Replays must reject incompatible snapshots.
- Add a lean playtest report: errors, observed card/chapter/ending coverage, dead ends
  and choice history. Seeded simulations can follow; they do not prove full reachability.
- Provide two visually distinct example games to expose assumptions in the renderer.

Acceptance: browser reload resumes the correct exported web game; preview experiments
cannot alter that save. A collaborator reproduces a reported run from the same
revision. Test long text and narrow screens. Native lifecycle/safe-area verification
remains part of the later device gate, not something browser checks can prove.

## Stage E — Android Studio release preparation in the web app

First increment (27 October): Export now offers an explicitly loaded immutable
shared revision or a labeled working draft, with app/version/content details.
Web/Android exports include release-manifest.json with exact source, engine and
content versions, template SHA-256 and hashes of every payload file. Native/device/
store checks are explicitly unverified. Asset/runtime path collisions are rejected.
The review also fixed shared WOFF2 rejection and aligned image uploads to the
backend's 16 MP limit. Deployed to factory.fedeama.it on 27 October with
server/validation.php; no SQL migration. Launcher icon generation,
export-history/version comparisons and store materials remain outstanding: Stage E
is only partially implemented.

Verification: all 67 Node tests passed (including the new `ashHeir.test.ts`
schema, semantic and four-ending playthrough checks); PHP syntax and isolated asset checks passed;
production build passed (editor chunk is slightly above Vite's 500 kB advisory).
No deployment ZIP or native build was produced. Uploaded hashes match the local
build and the site/API respond; shared release loading still needs an authenticated
end-to-end check on Hostinger. The attempted browser smoke check
could not reach the local preview: the environment denied localhost socket access.
No visual or interactive verification is claimed for this increment.

Provide an Export/Release screen that explains exactly what will be downloaded.

- Select a saved immutable revision for a team release. Allow explicit local-draft
  exports too, clearly labeled as not yet shared; never silently mix both sources.
- Expose permanent application ID, display name, version name/code, supported
  orientation and any intentionally supported player settings. Warn about changing
  app identity and non-increasing release codes relative to recorded exports.
- Upload/preview an app icon; generate required launcher/adaptive icon resources and
  replace template branding. Configure splash/background presentation as appropriate.
- Bundle all game media and fonts for offline play. No localhost URLs, authoring UI,
  private API dependencies, test overrides, credentials or machine-specific SDK paths.
- Pin the tested native template and dependency lockfile. Validate generated native
  metadata and package paths, not just the JSON source. Preserve export snapshots.
- Include a release manifest: game/revision identity, content and asset hashes,
  engine/template/toolchain versions, package/version metadata and validation results.
- Make Studio preparation simple on a different computer: clear extract/open/sync
  instructions and platform-appropriate helpers, documenting any Node/dependency
  download still required. Existing Windows helpers remain optional conveniences.
- Offer a separate store-materials folder: generated or user-selected screenshots,
  icon artwork, draft descriptions and a checklist of declarations still requiring
  the publisher's answers. Never invent privacy policies, content ratings or approvals.
- Distinguish “project export validated”, “native build verified” and “store submission
  ready”; record only checks actually performed. Check current Play requirements at
  release time rather than treating today's requirements as a permanent guarantee.

Acceptance in the web workflow: download a complete release archive from a second
browser/machine using only the shared project; verify its pinned manifest, assets,
branding and metadata, and confirm it has no dependency on the authoring computer.
A project archive is not itself a signed APK/AAB or a guarantee of Play acceptance.

## Stage F — External-machine Android verification and handover

This stage runs on an Android-equipped computer chosen by the user. Do not request
Android Studio installation on the current authoring PC. It may run earlier if
another machine becomes available, without blocking stages A–E in the meantime.

- Download a saved release from the hosted factory; prepare/open it in Studio.
- Build an APK; test on a phone including offline first launch, save/resume, process
  termination, safe areas, gestures, back navigation and multiple chapters/endings.
- Build a signed AAB with the owner's upload key stored separately from factory
  projects/hosting. Test through Play's internal track with explicit account authority.
- Fix any discovered native/template issues, regenerate the export and repeat the
  affected checks. Verify both sample games and an upgrade with a higher version code.
- Document routine authoring, shared saves, exports, signing-key ownership, updates
  and backups so colleagues can perform the handoff without source edits.

Acceptance: another computer produces and tests the Android release from the web
export, and the authorized publisher verifies an internal-track installation.
Until that happens, state clearly that the Android release gate is unverified;
web milestones may still be complete independently.

## Scope and cost control

Reuse the existing Hostinger/static React/PHP/MariaDB architecture and shared engine.
Prioritize A1 then A2, followed by B; defer new build services and unnecessary engine
rewrites. Implement structural refactoring alongside the features that need it:
play sessions now, storage/revision adapters during B, release packaging during E.

No paid cloud builder, mandatory AI service, live gameplay server, automatic Play
upload, multiplayer, graph-canvas editor or simultaneous coediting is required.
Those are separate opt-in features. Keep existing build helpers but stop expanding
local Android tooling as the main development track.

The earlier full-project cost/day totals are retired: they mixed already completed
work with a different delivery order. Estimate remaining increments after A's scope
and actual collaboration checks, distinguishing implementation effort from external
account/device verification. Do not substitute arbitrary precision for those checks.

After each stage: record what works, tests performed, deployable changes, any required
migration and remaining external checks. No production deployment is implied by a
local build, and no Android compatibility claim is implied by a browser preview.
