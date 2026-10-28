# Android export/build increment — 26 October 2026

Implemented the local build handoff; the native acceptance gate is still pending.

## Delivered

- Android project exports contain a dependency-free Node setup checker, Windows
  double-click launchers for setup checks, debug APK builds and Studio preparation.
- Requirements are recorded in android-toolchain.json. The factory build rejects
  unreviewed native template version changes. The helper uses Node 22+, JDK 21,
  SDK Platform 36, Build-Tools 35.0.0 and the bundled Gradle 8.14.3 wrapper.
- Dependencies install only after setup passes. Capacitor sync precedes compilation.
  Local SDK configuration preserves other properties. A per-export lock prevents
  overlapping builds. Failed builds never publish an old intermediate APK as new.
- Successful builds are designed to produce output/game-debug.apk and a report
  with package/version details, toolchain, timestamp and APK SHA-256. This success
  path has been unit-tested with mocked compiler commands only.
- Game settings includes version name/code. Exports include the signing guide;
  no signing passwords or keystores are requested, generated or uploaded.
- Generated release/harbor-android.zip and updated game-factory-collaboration.zip.
  No database migration or backend change is required for this increment.

## Evidence

- 23 automated tests pass, including missing tools, incompatible/hung Java,
  SDK-path preservation, mocked build success/failure, locking and prepare-only mode.
- Production player/editor build and TypeScript checking pass.
- Real export contents verified: launchers, toolchain metadata, wrapper, offline
  game/assets, application ID and Java package relocation; no caches or signing keys.
- Installed the sample's real pinned Capacitor packages (98 dependencies), then
  successfully ran Capacitor Android sync. Native assets contain the exported game.
- The checker ran against actual Windows tool locations outside the sandbox:
  Node/npm pass; JDK 21, SDK Platform 36 and Build-Tools 35.0.0 are missing. It exits
  with code 1 before installing dependencies or starting compilation.
- Browser check: version code 0 shows validation feedback; version 0.2.0/code 2
  saves and survives reload. No browser console errors. Screenshot:
  android-release-settings.png. The browser test used a separate localhost:5175
  origin, leaving existing localhost:5174 drafts unchanged.

## Still required to close the Android gate

The user confirmed Android Studio is not installed. Install it and the documented
SDK/JDK, review SDK licenses, then build the exported sample. Verify the debug APK
on a physical phone, including airplane-mode relaunch and chapter/ending flows.
Create an owner-controlled upload key and verify a signed AAB separately.
No APK/AAB compilation, signing, device installation or Play upload is claimed.

See [the included build guide](../tools/android-export/README.md). Existing product
limits still apply: placeholder launcher icon and production Hostinger collaboration
checks remain pending. Player save/resume and authoring undo/redo were added after
this Android-stage review.
