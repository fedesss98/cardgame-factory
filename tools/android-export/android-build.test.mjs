import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectSetup, runBuild, sdkProperties } from "./android-build.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "factory-android-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = (name, content = "fixture") => {
    const path = join(root, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
    return path;
  };
  file(
    "android-toolchain.json",
    JSON.stringify({
      nodeMajor: 22,
      javaMajor: 21,
      compileSdk: 36,
      buildTools: "35.0.0",
    }),
  );
  file("jdk/bin/java.exe");
  file("jdk/bin/javac.exe");
  file("npm-cli.js");
  file("sdk/platforms/android-36/android.jar");
  file("sdk/build-tools/35.0.0/aapt2.exe");
  file("android/gradle/wrapper/gradle-wrapper.jar");
  file("www/index.html");
  file(
    "www/game.json",
    JSON.stringify({
      android: {
        applicationId: "com.example.test",
        versionCode: 3,
        versionName: "1.2",
      },
    }),
  );
  const env = {
    JAVA_HOME: join(root, "jdk"),
    ANDROID_HOME: join(root, "sdk"),
    npm_execpath: join(root, "npm-cli.js"),
    ANDROID_STUDIO_HOME: join(root, "missing-studio"),
  };
  const inspect = () =>
    inspectSetup(root, env, "win32", () => ({
      status: 0,
      stderr: 'openjdk version "21.0.5"',
    }));
  return { root, file, env, inspect };
}

test("doctor detects complete setup and rejects incompatible or hung Java", (t) => {
  const f = fixture(t);
  assert.equal(f.inspect().ok, true);
  for (const result of [
    { status: 0, stderr: 'java version "11.0.1"' },
    { status: null, error: new Error("timeout") },
  ]) {
    const setup = inspectSetup(f.root, f.env, "win32", () => result);
    assert.equal(setup.ok, false);
    assert.equal(setup.checks.find((c) => c.name === "Java JDK").ok, false);
  }
});

test("missing SDK stops before installation, build or file mutations", (t) => {
  const f = fixture(t);
  f.env.ANDROID_HOME = join(f.root, "missing-sdk");
  let invoked = false;
  assert.throws(
    () =>
      runBuild(f.root, "debug", {
        inspect: f.inspect,
        log() {},
        spawn() {
          invoked = true;
        },
      }),
    /Setup is incomplete/,
  );
  assert.equal(invoked, false);
  assert.equal(existsSync(join(f.root, ".android-build.lock")), false);
  assert.equal(existsSync(join(f.root, "android/local.properties")), false);
});

test("SDK property replacement preserves other settings and escapes Windows drive", () => {
  const text = sdkProperties(
    "# local\r\nother=true\r\nsdk.dir=old\r\n",
    "C:\\Users\\Game Maker\\Android\\Sdk",
  );
  assert.match(text, /other=true/);
  assert.equal(text.match(/sdk\.dir=/g).length, 1);
  assert.ok(text.includes("sdk.dir=C\\:/Users/Game Maker/Android/Sdk"));
});

test("successful mocked build publishes APK and report only after Gradle", (t) => {
  const f = fixture(t),
    steps = [];
  runBuild(f.root, "debug", {
    inspect: f.inspect,
    log() {},
    spawn(exe, args, options) {
      steps.push({ exe, args, options });
      if (args.includes("assembleDebug"))
        f.file("android/app/build/outputs/apk/debug/app-debug.apk", "new APK");
      return { status: 0 };
    },
  });
  assert.equal(steps.length, 3);
  assert.ok(steps[0].args.includes("install"));
  assert.ok(steps[1].args.includes("sync"));
  assert.ok(steps[2].args.includes("clean"));
  assert.equal(steps[2].options.env.JAVA_HOME, f.env.JAVA_HOME);
  assert.equal(
    readFileSync(join(f.root, "output/game-debug.apk"), "utf8"),
    "new APK",
  );
  const report = JSON.parse(
    readFileSync(join(f.root, "output/build-report.json"), "utf8"),
  );
  assert.equal(report.versionCode, 3);
  assert.equal(report.playReady, false);
  assert.equal(report.deviceTested, false);
  assert.match(report.apkSha256, /^[0-9a-f]{64}$/);
  assert.equal(existsSync(join(f.root, ".android-build.lock")), false);
});

test("failed build releases lock and never publishes an older APK", (t) => {
  const f = fixture(t);
  f.file("android/app/build/outputs/apk/debug/app-debug.apk", "stale APK");
  f.file("package-lock.json", "{}");
  const steps = [];
  assert.throws(
    () =>
      runBuild(f.root, "debug", {
        inspect: f.inspect,
        log() {},
        spawn(exe, args) {
          steps.push(args);
          return { status: args.includes("assembleDebug") ? 1 : 0 };
        },
      }),
    /Build step failed/,
  );
  assert.ok(steps[0].includes("ci"));
  assert.equal(existsSync(join(f.root, "output")), false);
  assert.equal(existsSync(join(f.root, ".android-build.lock")), false);
});

test("prepare syncs without compiling, and a concurrent build is rejected", (t) => {
  const f = fixture(t),
    steps = [];
  runBuild(f.root, "prepare", {
    inspect: f.inspect,
    log() {},
    spawn(exe, args) {
      steps.push(args);
      return { status: 0 };
    },
  });
  assert.equal(steps.length, 2);
  assert.equal(existsSync(join(f.root, "output")), false);
  f.file(".android-build.lock");
  assert.throws(
    () => runBuild(f.root, "debug", { inspect: f.inspect, log() {} }),
    /Another build/,
  );
});
