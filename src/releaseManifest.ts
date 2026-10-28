import type JSZip from "jszip";
import { ENGINE_VERSION } from "./engine.ts";

export type ReleaseSource =
  | { kind: "local-draft" }
  | { kind: "shared-revision"; projectId: string; revision: number };

export async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function addReleaseManifest(
  zip: JSZip,
  game: any,
  kind: "web" | "android",
  source: ReleaseSource,
  template: Uint8Array,
) {
  // Only explicit provenance belongs in a public game. Never serialize the working
  // copy's remote metadata, membership, author email, API URLs or credentials.
  const origin: ReleaseSource =
    source.kind === "shared-revision"
      ? {
          kind: source.kind,
          projectId: source.projectId,
          revision: source.revision,
        }
      : { kind: "local-draft" };
  if (
    origin.kind === "shared-revision" &&
    (!origin.projectId ||
      !Number.isSafeInteger(origin.revision) ||
      origin.revision < 1)
  )
    throw Error("Invalid release revision.");
  const files: Record<string, { bytes: number; sha256: string }> = {};
  // Serial reads bound peak memory; the manifest excludes itself.
  for (const name of Object.keys(zip.files).sort()) {
    if (zip.files[name].dir || name === "release-manifest.json") continue;
    const bytes = await zip.files[name].async("uint8array");
    files[name] = { bytes: bytes.length, sha256: await sha256(bytes) };
  }
  zip.file(
    "release-manifest.json",
    JSON.stringify(
      {
        format: "game-factory-release",
        version: 1,
        createdAt: new Date().toISOString(),
        kind,
        source: origin,
        game: {
          id: game.id,
          title: game.title,
          schemaVersion: game.schemaVersion,
          contentVersion: game.contentVersion,
          saveCompatibilityVersion: game.saveCompatibilityVersion,
        },
        android:
          kind === "android"
            ? {
                applicationId: game.android.applicationId,
                displayName: game.android.displayName,
                versionName: game.android.versionName,
                versionCode: game.android.versionCode,
              }
            : undefined,
        engineVersion: ENGINE_VERSION,
        templateSha256: await sha256(template),
        files,
        checks: {
          contentValidation: "passed",
          fileHashes: "recorded",
          nativeBuild: "not-verified",
          deviceTest: "not-verified",
          storeSubmission: "not-verified",
        },
        warnings:
          kind === "android"
            ? [
                "Launcher branding is still the template icon; icon generation is pending.",
                "Build, test and sign on your Android-equipped computer. This archive is not a signed AAB.",
              ]
            : [],
      },
      null,
      2,
    ),
  );
}
