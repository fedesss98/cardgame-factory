import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { createProjectArchive } from "./projectArchive.ts";
import { validateProject } from "./validate.ts";
const game = JSON.parse(
  readFileSync(
    new URL("../examples/harbor/game.json", import.meta.url),
    "utf8",
  ),
);
const image = readFileSync(
  new URL("../examples/harbor/assets/harbor.png", import.meta.url),
);
const project = () => ({
  game: structuredClone(game),
  images: { "harbor-art": "data:image/png;base64," + image.toString("base64") },
});
async function template() {
  const zip = new JSZip();
  zip.file("www/index.html", '<script src="./assets/player.js"></script>');
  zip.file("www/assets/player.js", "// test player");
  zip.file(
    "android/app/build.gradle",
    'applicationId "com.factory.template"\nversionCode 1\nversionName "1.0"',
  );
  zip.file(
    "android/app/src/main/java/com/factory/template/MainActivity.java",
    "package com.factory.template;\npublic class MainActivity {}",
  );
  zip.file(
    "android/app/src/main/res/values/strings.xml",
    '<resources><string name="app_name">Factory Template</string></resources>',
  );
  return zip.generateAsync({ type: "uint8array" });
}
test("backup round trip preserves complete content and image bytes", async () => {
  const p = project(),
    zip = await createProjectArchive(p, "backup");
  const decoded = await JSZip.loadAsync(
    await zip.generateAsync({ type: "uint8array" }),
  );
  assert.deepEqual(
    JSON.parse(await decoded.file("game.json")!.async("string")),
    p.game,
  );
  assert.deepEqual(
    await decoded.file("assets/harbor.png")!.async("nodebuffer"),
    image,
  );
  assert.equal(decoded.file("index.html"), null);
});
test("web export contains only web runtime and content", async () => {
  const zip = await createProjectArchive(project(), "web", await template());
  assert.ok(zip.file("index.html"));
  assert.ok(zip.file("assets/player.js"));
  assert.ok(zip.file("game.json"));
  assert.ok(zip.file("assets/harbor.png"));
  assert.equal(
    Object.keys(zip.files).some((name) => name.startsWith("android/")),
    false,
  );
});
test("Android export escapes labels and versions, relocates Java, and keeps content offline", async () => {
  const p = project();
  p.game.android.applicationId = "com.example.reviewed";
  p.game.android.displayName = 'Queen\'s "Court" & Ships';
  p.game.android.versionName = "1.2-${name}'release";
  p.game.android.versionCode = 12;
  const zip = await createProjectArchive(p, "android", await template());
  const config = JSON.parse(
    await zip.file("capacitor.config.json")!.async("string"),
  );
  assert.equal(config.appName, p.game.android.displayName);
  assert.equal(config.appId, p.game.android.applicationId);
  const gradle = await zip.file("android/app/build.gradle")!.async("string");
  assert.ok(gradle.includes("versionCode 12"));
  assert.ok(gradle.includes("versionName '1.2-${name}\\'release'"));
  const xml = await zip
    .file("android/app/src/main/res/values/strings.xml")!
    .async("string");
  assert.ok(xml.includes("&amp;"));
  assert.ok(xml.includes("Queen\\'s"));
  assert.ok(
    zip.file(
      "android/app/src/main/java/com/example/reviewed/MainActivity.java",
    ),
  );
  assert.equal(
    zip.file(
      "android/app/src/main/java/com/factory/template/MainActivity.java",
    ),
    null,
  );
  assert.ok(zip.file("www/game.json"));
  assert.ok(zip.file("www/assets/harbor.png"));
});
test("export uses an immutable snapshot even when editing continues", async () => {
  const p = project();
  const pending = createProjectArchive(p, "backup");
  p.game.title = "Changed while exporting";
  const zip = await pending;
  assert.equal(
    JSON.parse(await zip.file("game.json")!.async("string")).title,
    game.title,
  );
});
test("missing assets block preview, save, JSON apply and export validation", async () => {
  const p = project();
  p.images = {} as typeof p.images;
  assert.match(validateProject(p.game, p.images)[0], /Missing asset data/);
  await assert.rejects(createProjectArchive(p, "backup"), /Missing asset data/);
});

test("release manifest records exact revision and hashes without private metadata", async () => {
  const p = project();
  const source = {
    kind: "shared-revision" as const,
    projectId: "team-project",
    revision: 7,
    email: "private@example.test",
  };
  const pending = createProjectArchive(
    p,
    "android",
    await template(),
    undefined,
    source,
  );
  source.revision = 99;
  p.game.title = "Later edit";
  const zip = await pending;
  const manifest = JSON.parse(
    await zip.file("release-manifest.json")!.async("string"),
  );
  assert.deepEqual(manifest.source, {
    kind: "shared-revision",
    projectId: "team-project",
    revision: 7,
  });
  assert.equal(manifest.game.title, game.title);
  assert.equal(manifest.checks.nativeBuild, "not-verified");
  assert.equal(
    JSON.stringify(manifest).includes("private@example.test"),
    false,
  );
  for (const [path, record] of Object.entries(manifest.files) as [
    string,
    any,
  ][]) {
    const bytes = await zip.file(path)!.async("uint8array");
    assert.equal(
      record.sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
    assert.equal(record.bytes, bytes.length);
  }
  assert.equal(manifest.files["release-manifest.json"], undefined);
});

test("game assets cannot overwrite player runtime files", async () => {
  const p = project();
  p.game.assets[0].path = "assets/runtime.png";
  await assert.rejects(
    createProjectArchive(p, "web", await template(), {
      "index.html": new TextEncoder().encode("test"),
      "assets/runtime.png": new Uint8Array([1]),
    }),
    /collides with the player runtime/,
  );
});
