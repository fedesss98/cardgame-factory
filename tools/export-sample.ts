import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import assert from "node:assert/strict";
import { createProjectArchive } from "../src/projectArchive.ts";

// Run after npm run build. Uses the same exporter as the browser interface.
const game = JSON.parse(await readFile("examples/harbor/game.json", "utf8"));
const art = await readFile("examples/harbor/assets/harbor.png");
const zip = await createProjectArchive(
  {
    game,
    images: { "harbor-art": "data:image/png;base64," + art.toString("base64") },
  },
  "android",
  await readFile("public/export-template.zip"),
);
for (const file of [
  "README.md",
  "Check Android Setup.cmd",
  "Build APK.cmd",
  "Prepare for Android Studio.cmd",
  "tools/android-build.mjs",
  "android-toolchain.json",
  "www/game.json",
  "android/gradle/wrapper/gradle-wrapper.jar",
])
  assert.ok(zip.file(file), `Missing exported file: ${file}`);
assert.equal(
  Object.keys(zip.files).some((name) =>
    /(^|\/)(node_modules|build|\.gradle|\.idea|output)\/|local\.properties$|\.(jks|keystore)$/i.test(
      name,
    ),
  ),
  false,
);
assert.equal(
  JSON.parse(await zip.file("www/game.json")!.async("string")).android
    .applicationId,
  game.android.applicationId,
);
const gradle = await zip.file("android/app/build.gradle")!.async("string");
assert.ok(gradle.includes(`applicationId "${game.android.applicationId}"`));
assert.ok(gradle.includes(`versionCode ${game.android.versionCode}`));
const nativeSource =
  "android/app/src/main/java/" +
  game.android.applicationId.replaceAll(".", "/") +
  "/MainActivity.java";
assert.ok(zip.file(nativeSource));
await mkdir("release", { recursive: true });
await writeFile(
  "release/harbor-android.zip",
  await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
);
// Keep an extracted copy for the setup check. Never compile in the template folder.
const destination = resolve(".build/android-sample");
for (const [name, file] of Object.entries(zip.files)) {
  if (file.dir) continue;
  const target = resolve(destination, name);
  if (
    !target.startsWith(destination + "/") &&
    !target.startsWith(destination + "\\")
  )
    throw new Error("Unexpected ZIP path");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await file.async("nodebuffer"));
}
console.log(
  "Verified export contents; created release/harbor-android.zip and .build/android-sample. Native compilation has NOT been performed.",
);
