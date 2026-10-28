import JSZip from "jszip";
import { validateProject } from "./validate.ts";
import { addReleaseManifest, type ReleaseSource } from "./releaseManifest.ts";

export type ExportKind = "backup" | "web" | "android";
type ArchiveProject = { game: any; images: Record<string, string> };

// Gradle double-quoted strings interpolate dollar expressions. Single quotes don't.
function groovyString(value: string) {
  return (
    "'" +
    value
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "\\'")
      .replaceAll("\r", "\\r")
      .replaceAll("\n", "\\n") +
    "'"
  );
}
function androidString(value: string) {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("'", "\\'")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `"${escaped}"`;
}

export async function createProjectArchive(
  project: ArchiveProject,
  kind: ExportKind,
  template?: Uint8Array,
  runtime?: Record<string, Uint8Array>,
  source: ReleaseSource = { kind: "local-draft" },
): Promise<JSZip> {
  // Snapshot first: edits during async asset reads cannot leak into this export.
  const { game: g, images } = structuredClone(project);
  const provenance = structuredClone(source);
  const errors = validateProject(g, images);
  if (errors.length) throw new Error(errors[0]);
  let zip = new JSZip();
  if (kind !== "backup") {
    if (!template)
      throw new Error("Export template missing. Run npm run build first.");
    zip = await JSZip.loadAsync(template);
    // The editor's current player build replaces the native template's older web assets.
    if (runtime) {
      if (!runtime["index.html"]) throw Error("Player runtime is incomplete.");
      zip.remove("www");
      for (const [path, data] of Object.entries(runtime)) {
        if (
          !(path === "index.html" || /^assets\/[A-Za-z0-9_.-]+$/.test(path)) ||
          path.includes("..")
        )
          throw Error("Invalid player runtime path.");
        zip.file("www/" + path, data);
      }
    }
    if (kind === "web") {
      const web = new JSZip();
      for (const [name, file] of Object.entries(zip.files))
        if (name.startsWith("www/") && !file.dir)
          web.file(name.slice(4), await file.async("uint8array"));
      zip = web;
    } else {
      zip.file(
        "capacitor.config.json",
        JSON.stringify(
          {
            appId: g.android.applicationId,
            appName: g.android.displayName,
            webDir: "www",
          },
          null,
          2,
        ),
      );
      for (const [name, file] of Object.entries(zip.files)) {
        if (file.dir || !/\.(java|xml|gradle)$/.test(name)) continue;
        let content = (await file.async("string")).replaceAll(
          "com.factory.template",
          g.android.applicationId,
        );
        if (name.endsWith(".xml"))
          content = content.replaceAll(
            "Factory Template",
            androidString(g.android.displayName),
          );
        if (name.endsWith(".gradle"))
          content = content
            .replace(
              /versionCode 1\b/,
              () => `versionCode ${g.android.versionCode}`,
            )
            .replace(
              /versionName "1.0"/,
              () => `versionName ${groovyString(g.android.versionName)}`,
            );
        const target = name.endsWith(".java")
          ? name.replace(
              "/com/factory/template/",
              "/" + g.android.applicationId.replaceAll(".", "/") + "/",
            )
          : name;
        if (target !== name) zip.remove(name);
        zip.file(target, content);
      }
    }
  }
  const base = kind === "android" ? "www/" : "";
  zip.file(base + "game.json", JSON.stringify(g, null, 2));
  for (const asset of g.assets) {
    const response = await fetch(images[asset.id]);
    if (!response.ok) throw new Error(`Cannot read asset: ${asset.id}`);
    if (zip.file(base + asset.path))
      throw Error(
        `Asset path collides with the player runtime: ${asset.path}. Rename the asset path before exporting.`,
      );
    zip.file(base + asset.path, await response.arrayBuffer());
  }
  if (kind !== "backup")
    await addReleaseManifest(zip, g, kind, provenance, template!);
  return zip;
}
