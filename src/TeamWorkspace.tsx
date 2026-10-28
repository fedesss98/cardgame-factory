import { useEffect, useRef, useState } from "react";
import { validateProject } from "./validate";
import { Playtest } from "./Playtest";
import { assetBytes, dataUrl } from "./imageAssets";
import { diffProjects, type GameDiff } from "./projectDiff";
import { api, loadShared, RequestError, type User } from "./workspaceApi";
import { SignInPanel } from "./SignInPanel";

export type Remote = {
  id: string;
  revision: number;
  role: "owner" | "editor" | "viewer";
  dirty?: boolean;
  savedBy?: string;
  savedAt?: string;
  latestRevision?: number;
};
export type Project = {
  draftId?: string;
  game: any;
  images: Record<string, string>;
  remote?: Remote;
  starter?: boolean;
};

export function TeamWorkspace({
  open,
  setOpen,
  localProjects,
  onOpenLocal,
  onNewGame,
  project,
  onLoad,
  onSaved,
  onLogout,
  onDetach,
  onRole,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  localProjects: Project[];
  onOpenLocal: (draftId: string) => void;
  onNewGame: () => void;
  project: Project;
  onLoad: (p: Project) => void;
  onSaved: (r: Remote, snapshot: Project, asNew: boolean) => void;
  onLogout: () => void;
  /** Convert the current working copy into a local draft (used after archiving). */
  onDetach?: () => void;
  /** Update the cached access role of the current working copy (used after a hand-over). */
  onRole?: (remote: {
    id: string;
    revision: number;
    role: "owner" | "editor" | "viewer";
  }) => void;
}) {
  const lastUserId = useRef<number | null>(null);
  const userRef = useRef<User | null>(null);
  const running = useRef(false);
  const activeDraft = useRef(project.draftId);
  activeDraft.current = project.draftId;
  const [conflict, setConflict] = useState<string | null>(null);
  const [revisionPreview, setRevisionPreview] = useState<Project | null>(null);
  const [compare, setCompare] = useState<{
    title: string;
    revision: number;
    result: GameDiff;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState("projects");
  const [connection, setConnection] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [user, setUser] = useState<User | null>(null),
    [setup, setSetup] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<any[]>([]),
    [members, setMembers] = useState<any[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [accounts, setAccounts] = useState<any[]>([]);
  const [memberEmail, setMemberEmail] = useState(""),
    [role, setRole] = useState("editor"),
    [transferEmail, setTransferEmail] = useState("");
  const [newEmail, setNewEmail] = useState(""),
    [newName, setNewName] = useState(""),
    [newPassword, setNewPassword] = useState("");
  const [oldPassword, setOldPassword] = useState(""),
    [nextPassword, setNextPassword] = useState("");
  const [resetEmail, setResetEmail] = useState(""),
    [resetPassword, setResetPassword] = useState("");
  userRef.current = user;
  const knownLatest = Math.max(
    project.remote?.latestRevision || 0,
    Number(
      projects.find((p) => p.id === project.remote?.id)?.current_revision || 0,
    ),
  );
  async function refresh() {
    let data;
    try {
      data = await api("session");
    } catch (e) {
      setConnection("unavailable");
      throw e;
    }
    setConnection("ready");
    if (
      data.user &&
      lastUserId.current !== null &&
      lastUserId.current !== data.user.id
    )
      onLogout();
    setUser(data.user);
    if (data.user) lastUserId.current = data.user.id;
    setSetup(data.setup_required);
    if (data.user) setProjects((await api("projects")).projects);
    else {
      setProjects([]);
      setAccounts([]);
      setMembers([]);
      setHistory([]);
    }
  }
  useEffect(() => {
    if (open) void run(refresh);
  }, [open]);
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, page, user?.id]);
  async function signIn(credentials: {
    email: string;
    password: string;
    display_name: string;
    token: string;
  }) {
    let success = false;
    await run(async () => {
      const data = await api(setup ? "setup" : "login", credentials);
      if (lastUserId.current !== null && lastUserId.current !== data.user.id)
        onLogout();
      lastUserId.current = data.user.id;
      setUser(data.user);
      setSetup(false);
      setConnection("ready");
      setPage("projects");
      setProjects((await api("projects")).projects);
      success = true;
      setMessage("Signed in. Choose a game to start working.");
    });
    return success;
  }
  useEffect(() => {
    setMembers([]);
    setHistory([]);
    setConflict(null);
    setRevisionPreview(null);
    setCompare(null);
    setTransferEmail("");
    setMessage("");
  }, [project.draftId]);
  // Heartbeat: quietly refresh the shared-project list so the stale-revision
  // notice appears even if the colleague never ends up saving (45 s cadence,
  // paused while the tab is hidden). Errors stay silent; saves re-check anyway.
  const remoteId = project.remote?.id;
  useEffect(() => {
    if (!user || !remoteId) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!userRef.current) return;
      void api("projects")
        .then((data: any) => setProjects(data.projects))
        .catch(() => {});
    }, 45000);
    return () => window.clearInterval(interval);
  }, [user, remoteId]);
  async function compareWithLatest() {
    if (!project.remote) throw Error("No shared copy in this tab.");
    const before = structuredClone(project);
    const data = await api("load", undefined, { id: before.remote!.id });
    const result = diffProjects(
      before.game,
      before.images,
      data.project.game,
      data.project.images,
    );
    setCompare({
      title: `Working copy vs saved revision ${data.project.remote.revision}`,
      revision: Number(data.project.remote.revision),
      result,
    });
  }
  async function archiveProject() {
    if (!project.remote) return;
    const title = String(project.game?.title ?? "");
    const answer = window.prompt(
      `Archiving hides this shared project for everyone and keeps the stored revisions and files on the server so they can still be recovered from the database.\n\nType the project title to confirm: ${title}`,
    );
    if (answer === null) return;
    if (answer.trim() !== title.trim())
      throw Error("The title does not match. Nothing was archived.");
    await api("archive", { id: project.remote.id, confirm: title });
    onDetach?.();
    setMessage(
      `Shared project “${title}” archived. Your working copy is now a local draft; stored revisions stay on the server.`,
    );
  }
  async function transferProject() {
    if (!project.remote) return;
    const email = transferEmail.trim();
    if (!email) throw Error("Enter the colleague email for the hand-over.");
    if (
      !window.confirm(
        `Hand ownership of this project to ${email}?\n\nYou keep editor access. Only administrators can undo a hand-over, and only by editing the database.`,
      )
    )
      return;
    const result = await api("transfer", { id: project.remote.id, email });
    onRole?.(result.remote);
    setTransferEmail("");
    setMessage(`Ownership transferred to ${email}. Your access is now editor.`);
  }
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setOpen(true);
      if (e instanceof RequestError && e.status === 401) {
        setUser(null);
        setProjects([]);
        setHistory([]);
        setMembers([]);
        setRevisionPreview(null);
        setAccounts([]);
        setCompare(null);
        setOldPassword("");
        setNextPassword("");
        setNewPassword("");
        setResetPassword("");
        setMessage(
          "Your session expired. Sign in again with the same account; your working copies remain in this tab. You can also keep a local recovery copy below.",
        );
      }
    } finally {
      setBusy(false);
      running.current = false;
    }
  }
  async function save(asNew = false) {
    const original = structuredClone(project);
    const snapshot = structuredClone(project);
    const errors = validateProject(snapshot.game, snapshot.images);
    if (errors.length) throw new Error(errors[0]);
    if (snapshot.game.cards.length > 2000 || snapshot.game.assets.length > 200)
      throw Error("Shared projects support up to 2,000 cards and 200 assets.");
    if (
      Object.values(snapshot.images).reduce(
        (size, value) => size + assetBytes(value),
        0,
      ) > 10_000_000
    )
      throw Error(
        "Shared images exceed 10 MB. Optimize variants or remove unused images in the Images tab; your draft is unchanged.",
      );
    for (const asset of snapshot.game.assets) {
      const value = snapshot.images[asset.id];
      if (value && !value.startsWith("data:")) {
        const response = await fetch(value);
        if (!response.ok)
          throw Error(`Unable to read asset ${asset.id}. No save was made.`);
        const blob = await response.blob();
        snapshot.images[asset.id] = await dataUrl(blob);
      }
    }
    let result;
    try {
      result = await api("save", {
        id: asNew ? "" : snapshot.remote?.id || "",
        expected_revision: asNew ? 0 : snapshot.remote?.revision || 0,
        game: snapshot.game,
        images: snapshot.images,
      });
    } catch (e) {
      if (
        !asNew &&
        e instanceof RequestError &&
        e.status === 409 &&
        activeDraft.current === original.draftId
      )
        setConflict(snapshot.remote!.id);
      throw e;
    }
    const remote = {
      ...result.remote,
      dirty: false,
      savedBy: user?.display_name,
      savedAt: new Date().toISOString(),
      latestRevision: result.remote.revision,
    };
    onSaved(remote, original, asNew);
    setConflict(null);
    setMessage(
      `Snapshot saved online as revision ${result.remote.revision}. Edits made while saving need another save.`,
    );
    try {
      setProjects((await api("projects")).projects);
    } catch {
      setMessage(
        `Saved revision ${result.remote.revision}. The project list could not refresh; do not retry the save just to refresh the list.`,
      );
    }
  }
  async function restorePreview() {
    if (!revisionPreview?.remote) return;
    const source = structuredClone(revisionPreview);
    const latest = await loadShared(source.remote!.id);
    if (latest.remote!.role === "viewer")
      throw Error("Editor or owner access is required to restore.");
    if (
      !window.confirm(
        `Restore revision ${source.remote!.revision} of “${source.game.title}” as a NEW revision after ${latest.remote!.revision}? The existing history and your working copies will be kept.`,
      )
    )
      return;
    const errors = validateProject(source.game, source.images);
    if (errors.length) throw Error(errors[0]);
    const result = await api("save", {
      id: source.remote!.id,
      expected_revision: latest.remote!.revision,
      game: source.game,
      images: source.images,
    });
    onLoad({
      ...source,
      remote: {
        ...result.remote,
        dirty: false,
        savedBy: user?.display_name,
        savedAt: new Date().toISOString(),
        latestRevision: result.remote.revision,
      },
    });
    setRevisionPreview(null);
    setMessage(
      `Restored as revision ${result.remote.revision}. Earlier revisions and drafts were preserved.`,
    );
  }
  return (
    <section
      className={
        "team-section " + (open ? "workspace-home" : "workspace-compact")
      }
    >
      {!open && (
        <div className="team-bar">
          <div>
            <b>
              {project.remote
                ? "Shared project · revision " + project.remote.revision
                : "Local project"}
            </b>
            <span>
              {project.remote
                ? `${project.remote.dirty === false ? "This copy matches saved revision " + project.remote.revision : "Unsaved changes — kept in this browser only"}. Access: ${project.remote.role}. Refresh shared projects to check for newer work.`
                : "Publish a copy to work with colleagues."}
            </span>
            {project.remote?.savedAt && (
              <small>
                Last saved: {project.remote.savedBy || "Colleague"} ·{" "}
                {project.remote.savedAt}
                {!project.remote.savedAt.endsWith("Z") && " UTC"}
              </small>
            )}
            {project.remote && knownLatest > project.remote.revision && (
              <small>
                A newer shared revision ({knownLatest}) was observed. Open
                latest to compare.
              </small>
            )}
            {project.remote && (
              <small>
                Newest-revision checks refresh automatically every 45 seconds
                while this tab is visible.
              </small>
            )}
          </div>
          <button onClick={() => setOpen(!open)}>
            {open ? "Close shared workspace" : "Shared workspace"}
          </button>
          {project.remote && user && project.remote.role !== "viewer" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => run(() => save())}
            >
              Save online
            </button>
          )}
        </div>
      )}
      {message && !open && <p role="status">{message}</p>}
      {open && (
        <div className="team-panel">
          <div className="workspace-heading">
            <div>
              <div className="brand">
                <i>F</i> GAME FACTORY
              </div>
              <h1 ref={headingRef} tabIndex={-1}>
                {user ? "Your workspace" : "Your next story starts here."}
              </h1>
            </div>
            <button disabled={busy} onClick={() => setOpen(false)}>
              {user ? "Back to editor →" : "Local drafts →"}
            </button>
          </div>
          <p role="status" className="team-message">
            {busy ? "Working…" : message}
          </p>
          {project.remote && (page === "project" || !user) && (
            <div className="recovery-actions">
              <button
                disabled={busy}
                onClick={() => {
                  const copy = structuredClone(project);
                  delete copy.remote;
                  delete copy.draftId;
                  onLoad(copy);
                  setMessage(
                    "Local recovery copy created. It will save in this browser if local storage is available; export a ZIP backup for another machine.",
                  );
                }}
              >
                Keep a local recovery copy
              </button>
              <p className="hint">
                Shared edits are kept in this browser until saved online. A local
                recovery copy stays on this browser and is not shared.
              </p>
            </div>
          )}
          {conflict && user && (
            <div className="sync-conflict" role="alert">
              <h3>A colleague saved a newer revision</h3>
              <p>
                Your work is still open. Open latest alongside it, then copy
                your changes deliberately, or publish your work separately.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    onLoad(await loadShared(conflict));
                  })
                }
              >
                Open latest alongside my work
              </button>
              <button disabled={busy} onClick={() => run(() => save(true))}>
                Publish my work separately
              </button>
            </div>
          )}
          {!user ? (
            connection === "checking" ? (
              <div className="workspace-empty" role="status">
                <h2>Opening your workspace…</h2>
                <p>Checking your sign-in session.</p>
              </div>
            ) : connection === "unavailable" ? (
              <div className="workspace-empty">
                <h2>We couldn’t connect to your workspace</h2>
                <p>
                  Your local drafts are still available. Check your connection
                  and try again.
                </p>
                <button disabled={busy} onClick={() => run(refresh)}>
                  Try again
                </button>
                <button disabled={busy} onClick={() => setOpen(false)}>
                  Open local drafts
                </button>
              </div>
            ) : (
              <SignInPanel
                setup={setup}
                busy={busy}
                onSubmit={signIn}
                onLocal={() => setOpen(false)}
              />
            )
          ) : (
            <>
              <div className="team-bar">
                <p>
                  Signed in as <b>{user.display_name}</b>
                </p>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Sign out? Shared copies will be removed from this tab. Save online or export a backup first.",
                      )
                    )
                      return;
                    void run(async () => {
                      await api("logout", {});
                      setUser(null);
                      setProjects([]);
                      setMembers([]);
                      setHistory([]);
                      setAccounts([]);
                      setCompare(null);
                      setRevisionPreview(null);
                      setNewPassword("");
                      setResetPassword("");
                      setOldPassword("");
                      setNextPassword("");
                      setPage("projects");
                      onLogout();
                      await refresh();
                    });
                  }}
                >
                  Sign out
                </button>
              </div>
              <nav className="workspace-nav" aria-label="Workspace sections">
                {[
                  ["projects", "Games"],
                  ["project", "Current project"],
                  ...(user.is_admin ? [["team", "Team"]] : []),
                  ["account", "My account"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-current={page === id ? "page" : undefined}
                    className={page === id ? "selected" : ""}
                    onClick={() => setPage(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="workspace-content">
                <div hidden={page !== "projects"}>
                  <div className="workspace-section-heading">
                    <div>
                      <span className="eyebrow">CREATE TOGETHER</span>
                      <h2>
                        Shared games{" "}
                        <span className="count-badge">{projects.length}</span>
                      </h2>
                      <p>
                        Open a game to write, playtest, or prepare a release.
                      </p>
                    </div>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={onNewGame}
                    >
                      ＋ New game
                    </button>
                  </div>
                  <label>
                    Find a shared project
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search games by title…"
                    />
                  </label>
                  <button disabled={busy} onClick={() => run(refresh)}>
                    Refresh list
                  </button>
                  {projects.length === 0 && (
                    <div className="workspace-empty">
                      <h3>Your team’s next game starts here</h3>
                      <p>
                        Create a game, then publish it from Current project. An
                        existing game’s owner can also grant you access.
                      </p>
                    </div>
                  )}
                  {projects.length > 0 &&
                    !projects.some((p) =>
                      p.title.toLowerCase().includes(search.toLowerCase()),
                    ) && <p role="status">No games match “{search}”.</p>}
                  <div className="workspace-game-grid">
                    {projects
                      .filter((p) =>
                        p.title.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((p) => (
                        <article className="workspace-game" key={p.id}>
                          <span>
                            <b>{p.title}</b>
                            <small>
                              {p.role} · revision {p.current_revision}
                              {p.updated_at && ` · ${p.updated_at} UTC`}
                            </small>
                          </span>
                          <button
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                onLoad(await loadShared(p.id));
                                setOpen(false);
                                setMessage(
                                  "Opened a shared copy. Your other working copies were preserved.",
                                );
                              })
                            }
                          >
                            Open game →
                          </button>
                        </article>
                      ))}
                  </div>
                  <section className="workspace-local-drafts">
                    <h3>Drafts on this computer</h3>
                    <p>
                      These games have not been shared. Publish one when it’s
                      ready for your team.
                    </p>
                    <div className="workspace-game-grid">
                      {localProjects
                        .filter((p) => !p.remote)
                        .map((p) => (
                          <article
                            className="workspace-game local-game"
                            key={p.draftId}
                          >
                            <div>
                              <b>{p.game.title}</b>
                              <small>
                                {p.game.cards.length} cards · Local draft
                              </small>
                            </div>
                            <button
                              disabled={busy}
                              onClick={() => onOpenLocal(p.draftId!)}
                            >
                              Continue editing →
                            </button>
                          </article>
                        ))}
                      {!localProjects.some((p) => !p.remote) && (
                        <p>No local drafts on this computer.</p>
                      )}
                    </div>
                  </section>
                </div>
                <div hidden={page !== "project"}>
                  <div className="workspace-section-heading">
                    <div>
                      <span className="eyebrow">CURRENT WORKING COPY</span>
                      <h2>{project.game.title}</h2>
                      <p>
                        {project.remote
                          ? `Shared revision ${project.remote.revision} · ${project.remote.role}`
                          : "Local draft · visible on this computer only"}
                      </p>
                    </div>
                    <button disabled={busy} onClick={() => setOpen(false)}>
                      Continue editing →
                    </button>
                  </div>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => run(() => save(true))}
                  >
                    {project.remote
                      ? "Publish as a separate shared game"
                      : "Publish this draft to the workspace"}
                  </button>
                  <p className="hint">
                    Publishing creates a separate shared game. Add colleagues
                    using Project access below.
                  </p>
                  {project.remote ? (
                    <>
                      <p>
                        Access: <b>{project.remote.role}</b>. Working from
                        revision {project.remote.revision}.
                      </p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            onLoad(await loadShared(project.remote!.id));
                          })
                        }
                      >
                        Open latest alongside this copy
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => run(compareWithLatest)}
                      >
                        Compare working copy with latest revision
                      </button>
                      {project.remote.role !== "viewer" && (
                        <button
                          disabled={busy}
                          onClick={() => run(() => save())}
                        >
                          Save online
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(async () =>
                            setHistory(
                              (
                                await api("history", undefined, {
                                  id: project.remote!.id,
                                })
                              ).revisions,
                            ),
                          )
                        }
                      >
                        Revision history
                      </button>
                      {history.map((r) => (
                        <div className="shared-row" key={r.revision}>
                          <span>
                            Revision {r.revision}
                            <small>
                              {r.display_name} · {r.created_at} UTC
                            </small>
                          </span>
                          <button
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                const draft = project.draftId;
                                const loaded = await loadShared(
                                  project.remote!.id,
                                  Number(r.revision),
                                );
                                if (activeDraft.current === draft)
                                  setRevisionPreview(loaded);
                              })
                            }
                          >
                            Preview revision
                          </button>
                        </div>
                      ))}
                      {history.length >= 50 && (
                        <p className="hint">
                          Showing the latest 50 revisions. Enter an older
                          revision number to open it.
                        </p>
                      )}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const revision = Number(
                            new FormData(e.currentTarget).get("revision"),
                          );
                          if (!Number.isSafeInteger(revision) || revision < 1)
                            return;
                          void run(async () => {
                            const draft = project.draftId;
                            const loaded = await loadShared(
                              project.remote!.id,
                              revision,
                            );
                            if (activeDraft.current === draft)
                              setRevisionPreview(loaded);
                          });
                        }}
                      >
                        <label>
                          Revision number
                          <input
                            name="revision"
                            type="number"
                            min="1"
                            step="1"
                            required
                          />
                        </label>
                        <button disabled={busy}>
                          Preview numbered revision
                        </button>
                      </form>
                      {project.remote.role === "owner" && (
                        <>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(async () => {
                                await api("members", {
                                  id: project.remote!.id,
                                  email: memberEmail,
                                  role,
                                });
                                setMembers(
                                  (
                                    await api("members", undefined, {
                                      id: project.remote!.id,
                                    })
                                  ).members,
                                );
                                setMessage("Project access updated.");
                              });
                            }}
                          >
                            <h3>Project access</h3>
                            <label>
                              Colleague email
                              <input
                                type="email"
                                required
                                value={memberEmail}
                                onChange={(e) => setMemberEmail(e.target.value)}
                              />
                            </label>
                            <label>
                              Access
                              <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                              >
                                <option value="editor">
                                  Editor — can save
                                </option>
                                <option value="viewer">
                                  Viewer — preview and export
                                </option>
                                <option value="remove">Remove access</option>
                              </select>
                            </label>
                            <button disabled={busy}>Update access</button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                run(async () =>
                                  setMembers(
                                    (
                                      await api("members", undefined, {
                                        id: project.remote!.id,
                                      })
                                    ).members,
                                  ),
                                )
                              }
                            >
                              Show members
                            </button>
                            {members.map((m) => (
                              <p key={m.user_id}>
                                {m.email} · {m.role}
                              </p>
                            ))}
                          </form>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(transferProject);
                            }}
                          >
                            <h3>Hand over ownership</h3>
                            <p className="hint">
                              The new owner manages access; you keep editor
                              access. This cannot be undone from here.
                            </p>
                            <label>
                              New owner email
                              <input
                                type="email"
                                required
                                value={transferEmail}
                                onChange={(e) =>
                                  setTransferEmail(e.target.value)
                                }
                              />
                            </label>
                            <button disabled={busy}>Transfer ownership</button>
                          </form>
                          <div className="recovery-actions">
                            <button
                              disabled={busy}
                              onClick={() => run(archiveProject)}
                            >
                              Archive this shared project
                            </button>
                            <p className="hint">
                              Archiving hides the project from every list and
                              keeps stored revisions and files on the server.
                              Recovery is possible from the database only.
                            </p>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <p>Publish this project to start sharing it.</p>
                  )}
                </div>
              </div>
              {page === "project" && revisionPreview && (
                <section className="revision-preview">
                  <h3>
                    Saved revision {revisionPreview.remote!.revision} ·{" "}
                    {revisionPreview.game.title}
                  </h3>
                  <p>
                    This is an immutable server snapshot. Preview experiments do
                    not change it.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => onLoad(structuredClone(revisionPreview))}
                  >
                    Open this revision for editing / export
                  </button>
                  {revisionPreview.remote!.role !== "viewer" && (
                    <button disabled={busy} onClick={() => run(restorePreview)}>
                      Restore as a new revision
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => setRevisionPreview(null)}
                  >
                    Close revision preview
                  </button>
                  <Playtest
                    key={`${revisionPreview.remote!.id}:${revisionPreview.remote!.revision}`}
                    game={revisionPreview.game}
                    assets={revisionPreview.images}
                    label={`Saved revision ${revisionPreview.remote!.revision}`}
                    revision={revisionPreview.remote!.revision}
                    errors={validateProject(
                      revisionPreview.game,
                      revisionPreview.images,
                    )}
                  />
                </section>
              )}
              {page === "project" && compare && (
                <section className="revision-preview">
                  <h3>{compare.title}</h3>
                  <p>
                    {compare.result.added} added · {compare.result.removed}{" "}
                    removed · {compare.result.changed} changed. Your working
                    copy is on the left, the saved revision is on the right.
                  </p>
                  <button disabled={busy} onClick={() => setCompare(null)}>
                    Close comparison
                  </button>
                  {compare.result.entries.length === 0 && (
                    <p className="hint">
                      The working copy and the saved revision are identical.
                    </p>
                  )}
                  {compare.result.entries.map((entry, index) => (
                    <div
                      className="shared-row"
                      key={`${entry.group}:${entry.id}:${index}`}
                    >
                      <span>
                        <b>
                          {entry.group} · {entry.id} (
                          {entry.change.toLocaleUpperCase()})
                        </b>
                        {entry.fields?.map((field) => (
                          <small key={field.field}>
                            {field.field}: {field.before || "(empty)"} →{" "}
                            {field.after || "(empty)"}
                          </small>
                        ))}
                        {!entry.fields &&
                          (entry.change === "added" ? (
                            <small>
                              Only in the saved revision; copy it across
                              manually
                            </small>
                          ) : entry.change === "removed" ? (
                            <small>Only in your working copy</small>
                          ) : (
                            <small>
                              Different image bytes (re-add the image to update
                              it)
                            </small>
                          ))}
                      </span>
                    </div>
                  ))}
                </section>
              )}
              {user.is_admin && page === "team" && (
                <details open>
                  <summary>Create a colleague account</summary>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api("users", {
                          email: newEmail,
                          display_name: newName,
                          password: newPassword,
                        });
                        setNewPassword("");
                        setMessage(
                          "Account created. Add their email to the project’s access list.",
                        );
                      });
                    }}
                  >
                    <p>
                      Share initial credentials privately. Colleagues can change
                      their password below.
                    </p>
                    <label>
                      Name
                      <input
                        required
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    </label>
                    <label>
                      Email
                      <input
                        type="email"
                        required
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                      />
                    </label>
                    <label>
                      Initial password
                      <input
                        type="password"
                        required
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </label>
                    <button disabled={busy}>Create account</button>
                  </form>
                </details>
              )}
              {user.is_admin && page === "team" && (
                <details open>
                  <summary>
                    Colleague accounts (disable, enable, recover)
                  </summary>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => setAccounts((await api("users")).users))
                    }
                  >
                    List all accounts
                  </button>
                  {accounts.map((account) => (
                    <div className="shared-row" key={account.id}>
                      <span>
                        <b>{account.display_name}</b>
                        <small>
                          {account.email}
                          {account.is_admin ? " · administrator" : ""}
                          {account.disabled_at
                            ? ` · disabled since ${account.disabled_at}`
                            : ""}
                        </small>
                      </span>
                      {!account.is_admin && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api(
                                "users",
                                account.disabled_at
                                  ? { enable: account.email }
                                  : { disable: account.email },
                              );
                              setAccounts((await api("users")).users);
                              setMessage(
                                account.disabled_at
                                  ? `${account.display_name} can sign in again.`
                                  : `${account.display_name} cannot sign in until re-enabled.`,
                              );
                            })
                          }
                        >
                          {account.disabled_at ? "Re-enable" : "Disable"}
                        </button>
                      )}
                    </div>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api("users", {
                          reset_password: true,
                          email: resetEmail,
                          password: resetPassword,
                        });
                        setResetEmail("");
                        setResetPassword("");
                        setMessage(
                          "Password replaced. Share the new one privately; use “Change my password” for your own account.",
                        );
                      });
                    }}
                  >
                    <h3>Set a new password for a colleague</h3>
                    <p className="hint">
                      For lost passwords. Does not work on administrator
                      accounts — those need database access.
                    </p>
                    <label>
                      Colleague email
                      <input
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                      />
                    </label>
                    <label>
                      New password
                      <input
                        type="password"
                        required
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                      />
                    </label>
                    <button disabled={busy}>Replace password</button>
                  </form>
                </details>
              )}
              {page === "account" && (
                <section className="workspace-account">
                  <h2>My account</h2>
                  <p>
                    <b>{user.display_name}</b>
                    <br />
                    {user.email}
                    <br />
                    {user.is_admin ? "Workspace administrator" : "Team member"}
                  </p>
                  <details open>
                    <summary>Change my password</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          await api("password", {
                            old_password: oldPassword,
                            password: nextPassword,
                          });
                          setOldPassword("");
                          setNextPassword("");
                          setMessage("Password changed.");
                        });
                      }}
                    >
                      <label>
                        Current password
                        <input
                          type="password"
                          required
                          autoComplete="current-password"
                          value={oldPassword}
                          onChange={(e) => setOldPassword(e.target.value)}
                        />
                      </label>
                      <label>
                        New password
                        <input
                          type="password"
                          required
                          minLength={12}
                          maxLength={72}
                          autoComplete="new-password"
                          value={nextPassword}
                          onChange={(e) => setNextPassword(e.target.value)}
                        />
                      </label>
                      <button disabled={busy}>Change password</button>
                    </form>
                  </details>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
