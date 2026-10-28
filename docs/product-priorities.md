# Confirmed product priorities — updated 26 October 2026

This decision supersedes earlier delivery-order assumptions. See the
[remaining implementation plan](implementation-plan.md) for stages and acceptance checks.

## Essential workflow

1. Visit the shared web app and collaboratively author a complete game.
2. Play it fully in the browser, including fullscreen, chapter/deck selection and
   behind-the-scenes scenario controls for debugging.
3. Save the shared project and choose the exact revision to export.
4. On another computer, download a complete Android project, prepare/open it in
   Android Studio, test, sign and submit through Google Play Console.

The current authoring computer will not have Android Studio installed. Its absence
is not a blocker for further web development. Native verification remains necessary
before claiming a tested Android release, and happens on a separate machine.

## Shared authoring is core

Use the existing React/TypeScript frontend and authenticated PHP/MariaDB backend on
Hostinger. Shared projects, private assets, memberships, revisions, recovery and
conflict protection are baseline requirements, not optional future storage.
Browser-local drafts remain useful but are not automatically visible to colleagues
or another computer. Explicitly distinguish draft content from saved shared revisions.
Simultaneous Google-Docs-style editing is not part of the current scope.

## Preview is a first-class feature

The next implementation priority is a complete playtest workspace. It uses the same
engine and renderer as exports, with an ordinary player mode and a separate scenario
inspector. Fullscreen changes presentation without resetting the run. Chapter starts,
deck isolation, resource/flag overrides and forced-card tests must have explicit
semantics and must never modify authored content or leak into a release export.

## Most prepared practical export

Deliver a complete Android project ZIP with offline game/media, a prebuilt shared
player, configured app identity/version/branding, pinned native dependencies, a
release manifest and clear Studio/signing instructions. Minimize manual source
editing and replace placeholder icons before declaring release preparation complete.
Keep backup ZIP, web-game ZIP and Android project ZIP distinct.

Signing keys stay with the publisher. The web app does not need to compile Android,
produce signed bundles or operate Google Play accounts. A compiled/signed AAB,
device tests and Play submission remain separate from generating a project archive.
Existing Windows helpers are optional tools for the eventual build computer.

## Hosting evidence and boundaries

The user has Hostinger Premium, a domain managed through Cloudflare, PHP availability
including 8.4, and MariaDB 11.8.9 (confirmed by SELECT VERSION). Continue using the
static frontend/PHP/database architecture; no Node-hosting upgrade is required by
this design. Account settings and local tests do not establish successful production
deployment: actual HTTPS, collaboration, private storage and recovery checks remain.

## Delivery order from the current baseline

A. Full playable preview, fullscreen, chapter/deck scenario controls and inspection.
B. Reliable shared authoring and verified cross-computer workflow on Hostinger.
C. Comfortable content authoring, undo/redo, media library and theme improvements.
D. Player persistence, presentation/accessibility and reproducible playtest reports.
E. Complete Android Studio release preparation and portable export packages.
F. Native build, device and signed-release verification on another computer.

F can begin earlier when that machine is available. It is a release-validation gate,
not a prerequisite for implementing the web milestones. Hosted build infrastructure,
AI assistance and automated publishing are separate optional additions.
