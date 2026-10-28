import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// This file travels with each export. It needs only Node, even before npm install.
export function inspectSetup(
  root,
  env = process.env,
  platform = process.platform,
  probe = spawnSync,
) {
  const requirements = JSON.parse(
    readFileSync(join(root, "android-toolchain.json"), "utf8"),
  );
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });
  check(
    "Windows",
    platform === "win32",
    "The double-click builder supports Windows. See README.md for other systems.",
  );
  check(
    "Node.js",
    Number(process.versions.node.split(".")[0]) >= requirements.nodeMajor,
    `Installed ${process.versions.node}; requires ${requirements.nodeMajor}+.`,
  );
  const npmCli = [
    env.npm_execpath,
    join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
  ].find((p) => p && p.endsWith("npm-cli.js") && existsSync(p));
  check(
    "npm",
    !!npmCli,
    npmCli || "Install the standard Node.js distribution, including npm.",
  );
  const studio =
    env.ANDROID_STUDIO_HOME ||
    join(env.ProgramFiles || "C:/Program Files", "Android/Android Studio");
  const candidates = [
    ...new Set([env.JAVA_HOME, join(studio, "jbr")].filter(Boolean)),
  ];
  let javaHome;
  for (const candidate of candidates) {
    const java = join(candidate, "bin/java.exe");
    if (!existsSync(java) || !existsSync(join(candidate, "bin/javac.exe")))
      continue;
    const result = probe(java, ["-version"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    const major = Number(
      `${result.stderr || ""}\n${result.stdout || ""}`.match(
        /version "(\d+)/,
      )?.[1],
    );
    if (result.status === 0 && major === requirements.javaMajor) {
      javaHome = candidate;
      break;
    }
  }
  check(
    "Java JDK",
    !!javaHome,
    javaHome ||
      `Requires JDK ${requirements.javaMajor}. Install Android Studio, or set JAVA_HOME to a JDK ${requirements.javaMajor} folder. For a custom Studio location set ANDROID_STUDIO_HOME.`,
  );
  // Explicit environment settings take precedence, so a typo is visible instead of silently ignored.
  const sdk =
    env.ANDROID_HOME ||
    env.ANDROID_SDK_ROOT ||
    join(env.LOCALAPPDATA || "", "Android/Sdk");
  check(
    "Android SDK",
    existsSync(
      join(
        sdk,
        "platforms",
        `android-${requirements.compileSdk}`,
        "android.jar",
      ),
    ),
    `SDK Platform ${requirements.compileSdk} at ${sdk}. Install it in Android Studio > SDK Manager. Set ANDROID_HOME for a custom location.`,
  );
  check(
    "SDK Build-Tools",
    existsSync(join(sdk, "build-tools", requirements.buildTools, "aapt2.exe")),
    `Requires Build-Tools ${requirements.buildTools}; SDK Manager > SDK Tools > Show Package Details.`,
  );
  check(
    "Gradle wrapper",
    existsSync(join(root, "android/gradle/wrapper/gradle-wrapper.jar")),
    "Use the entire extracted Android project ZIP.",
  );
  check(
    "Game files",
    existsSync(join(root, "www/index.html")) &&
      existsSync(join(root, "www/game.json")),
    "Use an Android export from Game Factory, not its internal template ZIP.",
  );
  return {
    ok: checks.every((c) => c.ok),
    checks,
    javaHome,
    sdk,
    npmCli,
    requirements,
  };
}

export function sdkProperties(existing, sdk) {
  const value = sdk.replaceAll("\\", "/").replaceAll(":", "\\:");
  const lines = existing
    .split(/\r?\n/)
    .filter((line) => !/^\s*sdk\.dir\s*[=:]/.test(line));
  return lines.join("\n").trimEnd() + `\nsdk.dir=${value}\n`;
}

export function runBuild(root, mode = "check", options = {}) {
  if (!["check", "debug", "prepare"].includes(mode))
    throw new Error("Use check, debug or prepare.");
  const setup = (options.inspect || inspectSetup)(root);
  const log = options.log || console.log;
  for (const c of setup.checks)
    log(`${c.ok ? "OK" : "MISSING"} - ${c.name}: ${c.detail}`);
  if (!setup.ok)
    throw new Error(
      "Setup is incomplete. Follow README.md, then run Check Android Setup.cmd again. No dependencies were installed and no build was started.",
    );
  if (mode === "check") {
    log(
      "Local prerequisites found. The first build still needs internet and accepted SDK licenses; only a successful build verifies the full toolchain.",
    );
    return;
  }
  const lock = join(root, ".android-build.lock");
  let fd;
  try {
    fd = openSync(lock, "wx");
  } catch {
    throw new Error(
      "Another build may be running in this folder. If a previous build was interrupted, close it before deleting .android-build.lock.",
    );
  }
  try {
    const env = {
      ...process.env,
      JAVA_HOME: setup.javaHome,
      ANDROID_HOME: setup.sdk,
      ANDROID_SDK_ROOT: setup.sdk,
    };
    const run = (exe, args, cwd = root) => {
      const result = (options.spawn || spawnSync)(exe, args, {
        cwd,
        env,
        stdio: "inherit",
        windowsHide: true,
      });
      if (result.error || result.status !== 0)
        throw new Error(
          `Build step failed (${result.error?.message || result.status}). See the output above. For SDK license errors, open Android Studio's SDK Manager and review the licenses there.`,
        );
    };
    log(
      "Installing pinned Capacitor dependencies (first run needs internet)...",
    );
    run(process.execPath, [
      setup.npmCli,
      existsSync(join(root, "package-lock.json")) ? "ci" : "install",
      "--no-audit",
      "--no-fund",
    ]);
    run(process.execPath, [
      join(root, "node_modules/@capacitor/cli/bin/capacitor"),
      "sync",
      "android",
    ]);
    const properties = join(root, "android/local.properties");
    writeFileSync(
      properties,
      sdkProperties(
        existsSync(properties) ? readFileSync(properties, "utf8") : "",
        setup.sdk,
      ),
    );
    if (mode === "prepare") {
      log(
        `Ready to open in Android Studio: ${join(root, "android")}\nSelect JDK ${setup.requirements.javaMajor} in Studio's Gradle settings. Follow README.md to generate a signed AAB.`,
      );
      return;
    }
    run(
      join(setup.javaHome, "bin/java.exe"),
      [
        `-Dorg.gradle.java.home=${setup.javaHome}`,
        "-classpath",
        join(root, "android/gradle/wrapper/gradle-wrapper.jar"),
        "org.gradle.wrapper.GradleWrapperMain",
        "--no-daemon",
        "clean",
        "assembleDebug",
      ],
      join(root, "android"),
    );
    const apk = join(root, "android/app/build/outputs/apk/debug/app-debug.apk");
    if (!existsSync(apk))
      throw new Error(
        "Gradle returned successfully but no APK was found. No new release output was produced.",
      );
    const game = JSON.parse(readFileSync(join(root, "www/game.json"), "utf8"));
    const output = join(root, "output");
    mkdirSync(output, { recursive: true });
    copyFileSync(apk, join(output, "game-debug.apk"));
    writeFileSync(
      join(output, "build-report.json"),
      JSON.stringify(
        {
          builtAt: new Date().toISOString(),
          kind: "debug-apk",
          applicationId: game.android.applicationId,
          versionName: game.android.versionName,
          versionCode: game.android.versionCode,
          apkSha256: createHash("sha256")
            .update(readFileSync(apk))
            .digest("hex"),
          toolchain: setup.requirements,
          deviceTested: false,
          playReady: false,
        },
        null,
        2,
      ),
    );
    log(
      `APK created: ${join(output, "game-debug.apk")}\nThis is a debug-signed test APK, not a Google Play release. Device testing is still required.`,
    );
  } finally {
    closeSync(fd);
    unlinkSync(lock);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    runBuild(
      resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      process.argv[2] || "check",
    );
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  }
}
