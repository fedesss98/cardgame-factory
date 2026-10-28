# Build your Android game

This ZIP contains your game, images, offline web player and an Android project.
Extract **the whole ZIP** to a local folder before using any launcher. Android
compilation runs on your computer; Hostinger only hosts the editor.

## One-time Windows setup

1. Install [Node.js](https://nodejs.org/) (22 or newer, including npm).
2. Install [Android Studio](https://developer.android.com/studio) (2025.2.1 or
   newer) and complete its first-run setup. This project uses **JDK 21**; Studio's
   bundled `jbr` is detected automatically at the standard installation location.
   If it contains a different Java version, set `JAVA_HOME` to a JDK 21 installation.
3. In Studio's **SDK Manager**, install **Android SDK Platform 36**. On the
   **SDK Tools** tab enable **Show Package Details** and install **Android SDK
   Build-Tools 35.0.0** and **Android SDK Platform-Tools**. Review any license
   prompts yourself. You do not need an emulator to build an APK.
4. Double-click **Check Android Setup.cmd**. It lists missing tools without
   installing anything. For a custom installation, set `ANDROID_STUDIO_HOME`
   to the Studio folder and `ANDROID_HOME` to the SDK folder, then reopen the launcher.

These versions match the bundled template; `android-toolchain.json` records them.
The helper deliberately uses JDK 21, rather than assuming any newer JDK will work.

## Build a test APK

Double-click **Build APK.cmd**. It installs dependencies inside the extracted
folder, syncs your game into Android, sets this project's SDK path and builds it.
The first build downloads Gradle and Android dependencies and can take several
minutes. Keep the window open. No global Java or Android settings are changed.

On success, find **output/game-debug.apk** and **output/build-report.json**.
Only a successful build prints “APK created”. If a later build fails, an older
APK may still be in output; check the report's timestamp. A setup check is not
proof of successful compilation. The helper never accepts SDK licenses for you.

Transfer the APK to your Android phone and open it to install; the phone may ask
you to allow installation from that file source. This project supports Android
7.0/API 24 and newer. Play several choices, test chapter changes and endings,
then close it and relaunch in airplane mode. Also check small screens, long text,
back navigation and background/resume behavior. Player save/resume is not yet
implemented, so restarting currently starts a new run.

Debug APKs are for testing. They use the computer's Android debug signing key and
cannot be uploaded as a Google Play release. A differently signed installation
of the same package may prevent installation; preserve any data before uninstalling.

## Generate a signed Google Play bundle

1. In Game Factory, set your permanent **Android application ID**, **version name**
   and **version code** under Game settings before exporting. Increase the version
   code for each Play update. Re-export after changing game content.
2. Double-click **Prepare for Android Studio.cmd**. This installs dependencies and
   syncs the game without building an APK. Open the extracted **android** folder
   in Studio. Select **JDK 21** in its Gradle settings if necessary.
3. Use **Build > Generate Signed App Bundle or APK > Android App Bundle**.
   Create or select your upload keystore, choose the release variant, and build.
   Keep the keystore and passwords **outside this game/export folder**, backed up
   privately. Reuse your upload key for updates; do not send it to colleagues or Hostinger.
4. Studio shows the output location for the signed `.aab`. Test it through Play's
   internal testing track before production. Store listing, privacy/data declarations,
   app icon, current Play requirements and approval are separate release work.

Custom launcher icons and player save/resume are still pending. The template's
default Capacitor icon must be replaced in Studio before a public release.
The generated Android project has not yet been compiled or device-tested by the
factory team. Build and device checks remain an acceptance gate.

## Troubleshooting / other operating systems

- Keep exports in separate folders. Don't run two builds in the same folder.
- After an interrupted build, ensure it has stopped before removing `.android-build.lock`.
- Never copy `local.properties`, keystores, passwords, `node_modules` or build caches
  back into the factory or Hostinger. The helper updates only `sdk.dir` in local.properties.
- Terminal equivalents on Windows: `npm run doctor`, `npm run build:apk`,
  `npm run prepare:android`.
- The launchers/helper target Windows. On macOS/Linux, install the same JDK/SDK,
  run `npm install`, `npm run sync`, and `npm run open`; build/sign inside Studio.

References: [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup),
[Android Gradle Plugin 8.13 requirements](https://developer.android.com/build/releases/agp-8-13-0-release-notes),
[Android app signing](https://developer.android.com/studio/publish/app-signing).
