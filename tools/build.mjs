import { build } from "vite";
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  cp,
  access,
  rm,
} from "node:fs/promises";
import { resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { buildPlayer } from "./build-player.mjs";
const root = process.cwd(),
  template = resolve(".build/template");
await mkdir(template, { recursive: true });
await buildPlayer();
// Replace only generated web assets so repeated builds don't ship obsolete bundles.
const webAssets = resolve(template, "www");
if (webAssets !== resolve(root, ".build", "template", "www"))
  throw new Error("Unexpected generated web asset directory");
await rm(webAssets, { recursive: true, force: true });
await mkdir(webAssets, { recursive: true });
await cp(".build/player", resolve(template, "www"), { recursive: true });
await writeFile(
  resolve(template, "www/index.html"),
  await readFile(".build/player/player.html"),
);
const version = JSON.parse(
  await readFile("node_modules/@capacitor/core/package.json", "utf8"),
).version;
await writeFile(
  resolve(template, "package.json"),
  JSON.stringify(
    {
      name: "exported-card-game",
      private: true,
      version: "1.0.0",
      scripts: {
        sync: "cap sync android",
        open: "cap open android",
        doctor: "node tools/android-build.mjs check",
        "build:apk": "node tools/android-build.mjs debug",
        "prepare:android": "node tools/android-build.mjs prepare",
      },
      dependencies: {
        "@capacitor/core": version,
        "@capacitor/android": version,
      },
      devDependencies: { "@capacitor/cli": version },
    },
    null,
    2,
  ),
);
await writeFile(
  resolve(template, "capacitor.config.json"),
  JSON.stringify(
    {
      appId: "com.factory.template",
      appName: "Factory Template",
      webDir: "www",
    },
    null,
    2,
  ),
);
try {
  await access(resolve(template, "android"));
} catch {
  execFileSync(
    process.execPath,
    [resolve("node_modules/@capacitor/cli/bin/capacitor"), "add", "android"],
    { cwd: template, stdio: "inherit" },
  );
}
// Fail when upgrading the native template without reviewing the helper requirements.
const nativeVariables = await readFile(
  resolve(template, "android/variables.gradle"),
  "utf8",
);
const nativeBuild = await readFile(
  resolve(template, "android/build.gradle"),
  "utf8",
);
const wrapper = await readFile(
  resolve(template, "android/gradle/wrapper/gradle-wrapper.properties"),
  "utf8",
);
const capacitorBuild = await readFile(
  "node_modules/@capacitor/android/capacitor/build.gradle",
  "utf8",
);
if (
  !/compileSdkVersion\s*=\s*36\b/.test(nativeVariables) ||
  !nativeBuild.includes("com.android.tools.build:gradle:8.13.0") ||
  !wrapper.includes("gradle-8.14.3-") ||
  !capacitorBuild.includes("JavaVersion.VERSION_21")
)
  throw new Error(
    "Android template changed. Review and update the exported build helper requirements first.",
  );
await writeFile(
  resolve(template, "android-toolchain.json"),
  JSON.stringify(
    {
      nodeMajor: 22,
      javaMajor: 21,
      compileSdk: 36,
      buildTools: "35.0.0",
      gradle: "8.14.3",
      androidGradlePlugin: "8.13.0",
      capacitor: version,
    },
    null,
    2,
  ),
);
await mkdir(resolve(template, "tools"), { recursive: true });
await cp(
  "tools/android-export/android-build.mjs",
  resolve(template, "tools/android-build.mjs"),
);
await cp("tools/android-export/README.md", resolve(template, "README.md"));
await writeFile(
  resolve(template, "README.txt"),
  "Start with README.md for setup, test APK builds and signed Android App Bundles.\r\n",
);
for (const [name, mode] of [
  ["Check Android Setup", "check"],
  ["Build APK", "debug"],
  ["Prepare for Android Studio", "prepare"],
]) {
  await writeFile(
    resolve(template, name + ".cmd"),
    [
      "@echo off",
      "setlocal",
      'cd /d "%~dp0"',
      "where node >nul 2>nul",
      "if errorlevel 1 (",
      "  echo Node.js is missing. Install Node.js 22 or newer from https://nodejs.org/ and reopen this window.",
      "  pause",
      "  exit /b 1",
      ")",
      `node "tools\\android-build.mjs" ${mode}`,
      'set "build_result=%errorlevel%"',
      "echo.",
      "pause",
      "exit /b %build_result%",
      "",
    ].join("\r\n"),
  );
}
const zip = new JSZip();
async function pack(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      [
        "node_modules",
        ".gradle",
        ".idea",
        "build",
        "output",
        "local.properties",
        ".android-build.lock",
      ].includes(entry.name) ||
      /\.(jks|keystore)$/i.test(entry.name)
    )
      continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await pack(path);
    else
      zip.file(
        relative(template, path).replaceAll("\\", "/"),
        await readFile(path),
      );
  }
}
await pack(template);
await mkdir("public", { recursive: true });
await writeFile(
  "public/export-template.zip",
  await zip.generateAsync({ type: "nodebuffer" }),
);
await build({ base: "./", build: { outDir: "dist", emptyOutDir: true } });
console.log("Hostinger-ready editor: dist/. Android export template bundled.");
