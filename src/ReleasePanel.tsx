import { useState } from "react";
import type { Project } from "./TeamWorkspace";
import { loadShared } from "./workspaceApi";
import { validateProject } from "./validate";
import type { ExportKind } from "./projectArchive";
import type { ReleaseSource } from "./releaseManifest";

export function ReleasePanel({
  project,
  busy,
  onExport,
}: {
  project: Project;
  busy: boolean;
  onExport: (
    kind: ExportKind,
    snapshot: Project,
    source: ReleaseSource,
  ) => Promise<void>;
}) {
  const [mode, setMode] = useState(project.remote ? "shared" : "draft");
  const [revision, setRevision] = useState(
    String(project.remote?.revision ?? 1),
  );
  const [loaded, setLoaded] = useState<Project>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = mode === "draft" ? project : loaded;
  const issues = selected
    ? validateProject(selected.game, selected.images)
    : [];
  async function load() {
    setLoaded(undefined);
    setError("");
    setLoading(true);
    try {
      const n = Number(revision);
      if (!project.remote || !Number.isSafeInteger(n) || n < 1)
        throw Error("Enter a positive whole revision number.");
      const result = await loadShared(project.remote.id, n);
      if (
        result.remote?.id !== project.remote.id ||
        result.remote.revision !== n
      )
        throw Error("The server returned a different revision. Please retry.");
      setLoaded(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="settings">
      <h2>Prepare a release</h2>
      <p>
        Choose exactly what to download. Saved revisions are fetched from the
        shared workspace; draft exports include your current unsaved edits.
      </p>
      <fieldset disabled={busy || loading}>
        <legend>Export source</legend>
        <label>
          Content
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setError("");
            }}
          >
            {project.remote && (
              <option value="shared">Saved shared revision</option>
            )}
            <option value="draft">
              Current working draft — may not be shared
            </option>
          </select>
        </label>
        {mode === "shared" && (
          <>
            <label>
              Revision number
              <input
                type="number"
                min="1"
                step="1"
                value={revision}
                onChange={(e) => {
                  setRevision(e.target.value);
                  setLoaded(undefined);
                }}
              />
            </label>
            <p>
              This working copy started at revision {project.remote?.revision}.
              Use Shared workspace → History to find other revisions. Loading
              here leaves your edits untouched.
            </p>
            <button type="button" onClick={load}>
              {loading ? "Loading…" : "Load revision for export"}
            </button>
          </>
        )}
      </fieldset>
      {error && (
        <p role="alert">
          {error} Sign in through Shared workspace if your session expired.
        </p>
      )}
      {selected && (
        <>
          <h3>{selected.game.title}</h3>
          <p>
            {mode === "shared"
              ? `Saved revision ${loaded!.remote!.revision}`
              : "Working draft — not a saved release"}
          </p>
          <dl>
            <dt>Application ID</dt>
            <dd>{selected.game.android.applicationId}</dd>
            <dt>Android version</dt>
            <dd>
              {selected.game.android.versionName} · code{" "}
              {selected.game.android.versionCode}
            </dd>
            <dt>Content</dt>
            <dd>
              {selected.game.cards.length} cards ·{" "}
              {selected.game.chapters.length} chapters ·{" "}
              {selected.game.assets.length} assets
            </dd>
          </dl>
          <p>
            To change app identity or version, use Game settings and save a new
            revision. Check the version code against your last published
            release.
          </p>
          {issues.length > 0 && (
            <div role="alert">
              {issues.map((issue, i) => (
                <p key={i}>{issue}</p>
              ))}
            </div>
          )}
        </>
      )}
      <p>
        Game exports include a release manifest with the source revision,
        content and file hashes. Android exports still use the template launcher
        icon. Native builds, device tests and store submission remain
        unverified.
      </p>
      {(
        [
          [
            "backup",
            "Project backup",
            "Restore the selected content in this studio.",
          ],
          [
            "web",
            "Playable website",
            "Extract and host the offline-capable game files.",
          ],
          [
            "android",
            "Android Studio project",
            "Download on your build computer, then prepare, test and sign there. This is not a signed AAB.",
          ],
        ] as const
      ).map(([kind, title, description]) => (
        <div className="export-row" key={kind}>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <button
            disabled={!selected || busy || loading || issues.length > 0}
            onClick={() => {
              if (!selected) return;
              void onExport(
                kind,
                structuredClone(selected),
                mode === "shared"
                  ? {
                      kind: "shared-revision",
                      projectId: loaded!.remote!.id,
                      revision: loaded!.remote!.revision,
                    }
                  : { kind: "local-draft" },
              );
            }}
          >
            Download ZIP ↓
          </button>
        </div>
      ))}
    </div>
  );
}
