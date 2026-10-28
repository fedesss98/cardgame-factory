import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { get, set } from "idb-keyval";
import sample from "../examples/harbor/game.json";
import art from "../examples/harbor/assets/harbor.png";
import ember from "../examples/ember/game.json";
import emberArt from "../examples/ember/assets/ember.png";
import blankArt from "./assets/blank.png";
import { Playtest } from "./Playtest";
import { validateProject } from "./validate";
import { JsonEditor } from "./JsonEditor";
import type { ExportKind } from "./projectArchive";
import { sha256, type ReleaseSource } from "./releaseManifest";
import { ReleasePanel } from "./ReleasePanel";
import { StoryEditor } from "./StoryEditor";
import { ConditionEditor, EffectsEditor } from "./RuleEditors";
import { setOptional } from "./authoring";
import { useProjectHistory, sameImages } from "./useProjectHistory";
import { CardTools } from "./CardTools";
import { AssetLibrary } from "./AssetLibrary";
import {
  assetBytes,
  dataUrl,
  fontAsset,
  imageAsset,
  readFont,
  readImage,
} from "./imageAssets";
import "./style.css";
import { TeamWorkspace, type Project } from "./TeamWorkspace";
import { createBlankProject, type NewGameOptions } from "./newProject";
import { NewGameDialog } from "./NewGameDialog";
import { GettingStarted } from "./GettingStarted";
import { ResourceSettings } from "./ResourceSettings";
import { CardTags } from "./CardTags";
import { allTags } from "./tags";
import { themePresets, themeWarnings } from "./theme";
async function loadArtwork(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Artwork unavailable");
    return await dataUrl(await response.blob());
  } catch {
    return url;
  }
}
function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function App() {
  const {
    projects,
    saveProjects,
    editProject,
    undo,
    redo,
    histories,
    error: editError,
  } = useProjectHistory();
  const [index, selectProject] = useState(0),
    [workspaceOpen, setWorkspaceOpen] = useState(true),
    [cardPosition, setCardPosition] = useState(0),
    [selectedCardId, setSelectedCardId] = useState(""),
    [tab, setTab] = useState("Cards"),
    [status, setStatus] = useState("Opening studio…"),
    [ready, setReady] = useState(false),
    [preview, setPreview] = useState(0),
    [busy, setBusy] = useState(false),
    [storageStatus, setStorageStatus] = useState("Opening local storage…"),
    [storageAvailable, setStorageAvailable] = useState(true),
    [cardSearch, setCardSearch] = useState(""),
    [deckFilter, setDeckFilter] = useState(""),
    [assetId, setAssetId] = useState(""),
    [storyTarget, setStoryTarget] = useState<{
      section: "decks" | "chapters" | "flags" | "endings";
      id: string;
      serial: number;
    }>(),
    [starterImage, setStarterImage] = useState(art),
    [emberImage, setEmberImage] = useState(emberArt),
    [blankImage, setBlankImage] = useState(blankArt),
    [showNewGame, setShowNewGame] = useState(false),
    [tagFilter, setTagFilter] = useState("");
  const saveQueue = useRef(Promise.resolve());
  const saveVersion = useRef(0);
  const selectCard = (position: number) => {
    setCardPosition(position);
    setSelectedCardId("");
  };
  useEffect(() => {
    setDeckFilter("");
    setTagFilter("");
    setAssetId("");
    setStoryTarget(undefined);
    setSelectedCardId("");
  }, [projects[index]?.draftId]);
  useEffect(() => {
    (async () => {
      let saved: Project[] | undefined;
      try {
        saved = await get<Project[]>("factory-projects");
      } catch {
        setStorageAvailable(false);
        setStorageStatus(
          "Local storage unavailable — export backups to keep your work",
        );
      }
      const [image, secondImage, blank] = await Promise.all([
        loadArtwork(art),
        loadArtwork(emberArt),
        loadArtwork(blankArt),
      ]);
      setStarterImage(image);
      setEmberImage(secondImage);
      setBlankImage(blank);
      const starter = createBlankProject({ artwork: blank });
      saveProjects(
        saved?.length
          ? saved.map((project) => ({
              ...project,
              draftId: crypto.randomUUID(),
            }))
          : [
              {
                draftId: crypto.randomUUID(),
                game: starter.game,
                images: starter.images,
                starter: true,
              },
            ],
      );
      setReady(true);
      setStatus("");
    })();
  }, []);
  useEffect(() => {
    if (!ready || !storageAvailable) return;
    const version = ++saveVersion.current;
    setStorageStatus("Saving local drafts…");
    const t = setTimeout(() => {
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(() =>
          set(
            "factory-projects",
            // Persist every draft, shared ones included: a reload or browser
            // crash otherwise destroys unsaved shared edits. Contents stay in
            // this browser only; removing membership or signing out keeps those
            // copies from reaching anyone else.
            projects,
          ),
        )
        .then(() => {
          if (version === saveVersion.current)
            setStorageStatus(
              "Local drafts saved · Shared copies need Save online",
            );
        })
        .catch(() => {
          if (version === saveVersion.current)
            setStorageStatus("Local save failed — export a backup now");
        });
    }, 500);
    return () => clearTimeout(t);
  }, [projects, ready, storageAvailable]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (
        projects.some((p) => p.remote && p.remote.dirty !== false) ||
        !storageAvailable ||
        storageStatus === "Saving local drafts…" ||
        storageStatus.startsWith("Local save failed")
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [projects, storageStatus, storageAvailable]);
  const p = projects[index];
  if (!p) return <div className="loading">{status}</div>;
  const g = p.game,
    selectedIndex = g.cards.findIndex(
      (card: any) => card.id === selectedCardId,
    ),
    cardIndex =
      selectedIndex >= 0
        ? selectedIndex
        : Math.min(cardPosition, g.cards.length - 1),
    c = g.cards[Math.min(cardIndex, g.cards.length - 1)];
  const errors = validateProject(g, p.images);
  const tags = allTags(g.cards);
  const history = histories[p.draftId!] || { past: [], future: [] };
  const visibleCard = (card: any) =>
    `${card.id} ${card.character} ${card.text}`
      .toLowerCase()
      .includes(cardSearch.toLowerCase()) &&
    (!tagFilter ||
      (Array.isArray(card.tags) && card.tags.includes(tagFilter))) &&
    (!deckFilter ||
      (deckFilter === "unused"
        ? !g.decks.some((d: any) =>
            d.cards.some((entry: any) => entry.cardId === card.id),
          )
        : g.decks
            .find((d: any) => d.id === deckFilter)
            ?.cards.some((entry: any) => entry.cardId === card.id)));
  function navigate(group: string, id?: string) {
    if (group === "cards") {
      setTab("Cards");
      setCardSearch("");
      setDeckFilter("");
      if (id) setSelectedCardId(id);
    } else if (group === "assets") {
      setAssetId(id || "");
      setTab("Images");
    } else if (["decks", "chapters", "flags", "endings"].includes(group)) {
      setStoryTarget({
        section: group as "decks" | "chapters" | "flags" | "endings",
        id: id || "",
        serial: Date.now(),
      });
      setTab("Structure & rules");
    } else setTab("Game settings");
  }
  function openIssue(message: string) {
    const path = message.match(
      /^\/(cards|assets|decks|chapters|flags|endings)\/(\d+)/,
    );
    if (path) navigate(path[1], g[path[1]]?.[Number(path[2])]?.id);
    else if (/Missing asset data:/.test(message))
      navigate("assets", message.match(/Missing asset data: ([^.]+)/)?.[1]);
    else if (/Deck|Chapter|Ending|Duplicate IDs/.test(message))
      navigate(
        /Chapter|chapters/.test(message)
          ? "chapters"
          : /Ending|endings/.test(message)
            ? "endings"
            : "decks",
      );
    else if (/assets|Asset/.test(message)) navigate("assets");
    else navigate("settings");
  }
  function update(fn: (g: any, p: Project) => void) {
    if (p.remote?.role === "viewer") {
      setStatus("This shared project is read-only.");
      return;
    }
    const active = document.activeElement;
    editProject(
      p.draftId!,
      fn,
      active?.matches(
        'textarea,input:not([type="file"]):not([type="checkbox"]):not([type="search"])',
      )
        ? active
        : null,
    );
  }
  function addCard() {
    setCardSearch("");
    const id = "card-" + crypto.randomUUID();
    update((g) => {
      const card = structuredClone(c);
      card.id = id;
      card.character = "New character";
      card.text = "What decision will the player face?";
      card.left.effects = [];
      card.right.effects = [];
      delete card.when;
      delete card.tags;
      delete card.left.followUpCardId;
      delete card.right.followUpCardId;
      g.cards.push(card);
      g.decks[0].cards.push({ cardId: id, weight: 1 });
    });
    selectCard(g.cards.length);
  }
  async function exportFile(
    kind: ExportKind,
    selected: Project,
    source: ReleaseSource,
  ) {
    const snapshot = structuredClone(selected);
    setBusy(true);
    try {
      const exportErrors = validateProject(snapshot.game, snapshot.images);
      if (exportErrors.length) throw Error(exportErrors[0]);
      const { createProjectArchive } = await import("./projectArchive");
      let template: Uint8Array | undefined;
      let runtime: Record<string, Uint8Array> | undefined;
      if (kind !== "backup") {
        const response = await fetch("./export-template.zip");
        if (!response.ok)
          throw new Error("Export template missing. Run npm run build first.");
        template = new Uint8Array(await response.arrayBuffer());
        const manifestResponse = await fetch("./player-runtime/manifest.json", {
          cache: "no-store",
        });
        if (!manifestResponse.ok)
          throw Error(
            "Upload the player-runtime folder alongside the website to enable game exports.",
          );
        const manifest = await manifestResponse.json();
        if (!Array.isArray(manifest.files) || manifest.files.length > 100)
          throw Error("Invalid player runtime manifest.");
        runtime = Object.fromEntries(
          await Promise.all(
            manifest.files.map(async (path: unknown) => {
              if (
                typeof path !== "string" ||
                !(
                  path === "index.html" ||
                  /^assets\/[A-Za-z0-9_.-]+$/.test(path)
                ) ||
                path.includes("..")
              )
                throw Error("Invalid runtime file path.");
              const file = await fetch("./player-runtime/" + path, {
                cache: "no-store",
              });
              if (!file.ok)
                throw Error(
                  `Missing runtime file: ${path}. Upload the full player-runtime folder.`,
                );
              const data = new Uint8Array(await file.arrayBuffer());
              const hash = await sha256(data);
              if (manifest.hashes?.[path] !== hash)
                throw Error(
                  "The website player changed during export or is incompletely uploaded. Finish uploading player-runtime and try again.",
                );
              return [path, data];
            }),
          ),
        );
      }
      const zip = await createProjectArchive(
        snapshot,
        kind,
        template,
        runtime,
        source,
      );
      download(
        await zip.generateAsync({ type: "blob" }),
        `${snapshot.game.id}-${source.kind === "shared-revision" ? "r" + source.revision : "draft"}-${kind}.zip`,
      );
      setStatus(`${kind} export downloaded`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File) {
    setBusy(true);
    try {
      const { importProject } = await import("./importProject");
      const imported = await importProject(file);
      saveProjects((ps) => {
        selectProject(ps.length);
        return [...ps, imported];
      });
      selectCard(0);
      setCardSearch("");
      setDeckFilter("");
      setPreview((v) => v + 1);
      setStatus("Backup restored as a separate local project.");
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }
  function addExample(source: any, image: string) {
    const game = structuredClone(source);
    const baseId = game.id;
    let suffix = 1;
    while (projects.some((project) => project.game.id === game.id))
      game.id = `${baseId}-${suffix++}`;
    const assetId = game.assets.find(
      (asset: any) => asset.kind === "image",
    )?.id;
    if (!assetId) {
      setStatus("This example has no image asset.");
      return;
    }
    saveProjects((ps) => [
      ...ps,
      {
        draftId: crypto.randomUUID(),
        game,
        images: { [assetId]: image },
      },
    ]);
    selectProject(projects.length);
    selectCard(0);
    setCardSearch("");
    setPreview((v) => v + 1);
    setStatus(`${source.title} example added as a local project.`);
  }
  function newGame(options: NewGameOptions) {
    const project = createBlankProject({ artwork: blankImage, ...options });
    saveProjects((ps) => [
      ...ps,
      {
        draftId: crypto.randomUUID(),
        game: project.game,
        images: project.images,
        starter: true,
      },
    ]);
    selectProject(projects.length);
    selectCard(0);
    setCardSearch("");
    setDeckFilter("");
    setTagFilter("");
    setTab("Cards");
    setPreview((v) => v + 1);
    setShowNewGame(false);
    setStatus("New game created. Use the Start here checklist.");
  }
  return (
    <div
      className={"studio" + (workspaceOpen ? " workspace-mode" : "")}
      onKeyDown={(e) => {
        if (
          !(e.ctrlKey || e.metaKey) ||
          !["z", "y"].includes(e.key.toLowerCase()) ||
          (e.target as HTMLElement).closest(
            'input,textarea,select,[contenteditable="true"],.playtest-workspace',
          ) ||
          p.remote?.role === "viewer"
        )
          return;
        e.preventDefault();
        if (e.shiftKey || e.key.toLowerCase() === "y") redo(p.draftId!);
        else undo(p.draftId!);
      }}
    >
      <aside className="sidebar">
        <div className="brand">
          <i>F</i> GAME FACTORY
        </div>
        <button
          className="workspace-back"
          onClick={() => setWorkspaceOpen(true)}
        >
          ← Workspace & account
        </button>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <h2>Stories start here.</h2>
        <p className="muted">A small studio for big decisions.</p>
        <button className="new" onClick={() => setShowNewGame(true)}>
          ＋ New game
        </button>
        <div className="workspace-label">EXAMPLE STORIES</div>
        <div className="example-projects">
          <button
            className="example-project"
            onClick={() => addExample(sample, starterImage)}
          >
            Harbor Council
            <small>Parchment, ordered decks, two chapters</small>
          </button>
          <button
            className="example-project"
            onClick={() => addExample(ember, emberImage)}
          >
            Ember Station
            <small>Dark minimal theme, long text, persistent flag</small>
          </button>
        </div>
        <div className="workspace-label">
          PROJECTS <span>{projects.length}</span>
        </div>
        {projects.map((p, i) => (
          <button
            className={"project " + (i === index ? "active" : "")}
            key={i}
            onClick={() => {
              selectProject(i);
              selectCard(0);
              setCardSearch("");
              setPreview((v) => v + 1);
            }}
          >
            <span>▧</span>
            <div>
              {p.game.title}
              <small>
                {p.remote ? "Shared r" + p.remote.revision + " · " : ""}
                {p.game.cards.length} cards · {p.game.chapters.length} chapters
              </small>
            </div>
          </button>
        ))}
        <label className="import">
          ↥ Import project
          <input
            type="file"
            accept=".zip"
            onChange={(e) => {
              if (e.target.files?.[0]) void importFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
        <div className="local-note">
          <b>LOCAL WORKSPACE</b>
          <p>
            Local drafts stay in this browser. Use Shared workspace to publish
            and save online. Back up important work.
          </p>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">STUDIO / {g.id}</div>
            <h1>{g.title}</h1>
          </div>
          <button
            disabled={busy}
            className="primary"
            onClick={() => setTab("Export")}
          >
            {busy ? "Preparing…" : "Prepare export ↗"}
          </button>
        </header>
        <div className="toolbar">
          <nav>
            {[
              "Cards",
              "Images",
              "Game settings",
              "Structure & rules",
              "Advanced JSON",
              "Export",
            ].map((t) => (
              <button
                className={t === tab ? "selected" : ""}
                key={t}
                aria-current={t === tab ? "page" : undefined}
                onClick={() => {
                  setTab(t);
                }}
              >
                {t}
              </button>
            ))}
          </nav>
          <div className="author-actions" aria-label="Authoring history">
            <button
              disabled={!history.past.length || p.remote?.role === "viewer"}
              onClick={() => undo(p.draftId!)}
            >
              Undo
            </button>
            <button
              disabled={!history.future.length || p.remote?.role === "viewer"}
              onClick={() => redo(p.draftId!)}
            >
              Redo
            </button>
            <small>Last 40 edits · this session</small>
          </div>
          <span className="save-status" role="status">
            ● {storageStatus}
            {status && <strong>{status}</strong>}
            {editError && <strong role="alert">{editError}</strong>}
            {(storageStatus.startsWith("Local save failed") ||
              !storageAvailable) && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (!storageAvailable) {
                      const recovered =
                        await get<Project[]>("factory-projects");
                      if (Array.isArray(recovered) && recovered.length)
                        saveProjects((current) => [
                          ...current,
                          ...recovered.map((copy) => ({
                            ...copy,
                            draftId: crypto.randomUUID(),
                          })),
                        ]);
                      setStorageAvailable(true);
                    }
                    saveProjects((current) => [...current]);
                  } catch {
                    setStatus(
                      "Local storage is still unavailable. Export a project backup to preserve your work.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Retry local storage
              </button>
            )}
          </span>
        </div>
        <TeamWorkspace
          open={workspaceOpen}
          setOpen={setWorkspaceOpen}
          localProjects={projects}
          onNewGame={() => {
            setWorkspaceOpen(false);
            setShowNewGame(true);
          }}
          onOpenLocal={(draftId) => {
            const next = projects.findIndex((p) => p.draftId === draftId);
            if (next >= 0) {
              selectProject(next);
              selectCard(0);
              setCardSearch("");
              setPreview((v) => v + 1);
              setWorkspaceOpen(false);
            }
          }}
          project={p}
          onLoad={(loaded) => {
            const copy = { ...loaded, draftId: crypto.randomUUID() };
            saveProjects((ps) => {
              selectProject(ps.length);
              return [...ps, copy];
            });
            selectCard(0);
            setCardSearch("");
            setPreview((v) => v + 1);
          }}
          onSaved={(remote, snapshot, asNew) => {
            if (!snapshot.remote || asNew) {
              const copy = {
                ...snapshot,
                draftId: crypto.randomUUID(),
                remote,
              };
              saveProjects((ps) => {
                selectProject(ps.length);
                return [...ps, copy];
              });
            } else
              saveProjects((ps) =>
                ps.map((item) =>
                  item.draftId === snapshot.draftId
                    ? {
                        ...item,
                        remote: {
                          ...remote,
                          dirty:
                            JSON.stringify(item.game) !==
                              JSON.stringify(snapshot.game) ||
                            !sameImages(item.images, snapshot.images),
                        },
                      }
                    : item,
                ),
              );
          }}
          onLogout={() => {
            saveProjects((ps) => {
              const local = ps.filter((p) => !p.remote);
              if (local.length) return local;
              const project = createBlankProject({ artwork: blankImage });
              return [
                {
                  draftId: crypto.randomUUID(),
                  game: project.game,
                  images: project.images,
                  starter: true,
                },
              ];
            });
            selectProject(0);
            selectCard(0);
            setCardSearch("");
            setPreview((v) => v + 1);
          }}
          onDetach={() => {
            saveProjects((ps) =>
              ps.map((item, i) =>
                i === index ? { ...item, remote: undefined } : item,
              ),
            );
          }}
          onRole={(remote) => {
            saveProjects((ps) =>
              ps.map((item, i) =>
                i === index && item.remote
                  ? {
                      ...item,
                      remote: {
                        ...item.remote,
                        ...remote,
                        dirty: item.remote.dirty,
                      },
                    }
                  : item,
              ),
            );
          }}
        />
        {p.starter && (
          <GettingStarted
            onNavigate={(group) => navigate(group)}
            onDismiss={() =>
              saveProjects((ps) =>
                ps.map((item, i) =>
                  i === index ? { ...item, starter: undefined } : item,
                ),
              )
            }
          />
        )}
        <div className="content">
          <section className="editor">
            <fieldset
              className="editor-fields"
              disabled={
                p.remote?.role === "viewer" &&
                (tab === "Game settings" || tab === "Advanced JSON")
              }
            >
              {tab === "Cards" ? (
                <>
                  <div className="section-head">
                    <div>
                      <h2>
                        The card collection <span>{g.cards.length}</span>
                      </h2>
                      <p>Every choice moves your story forward.</p>
                    </div>
                    <button
                      disabled={p.remote?.role === "viewer"}
                      onClick={addCard}
                    >
                      ＋ Add card
                    </button>
                  </div>
                  <CardTools
                    key={p.draftId}
                    game={g}
                    cardId={c.id}
                    update={update}
                    onSelect={setSelectedCardId}
                    readOnly={p.remote?.role === "viewer"}
                  />
                  <div className="card-workbench">
                    <div className="card-browser">
                      <label className="card-search">
                        Find a card
                        <input
                          type="search"
                          value={cardSearch}
                          placeholder="Character or text…"
                          onChange={(e) => setCardSearch(e.target.value)}
                        />
                      </label>
                      <label>
                        Filter by deck
                        <select
                          value={deckFilter}
                          onChange={(e) => setDeckFilter(e.target.value)}
                        >
                          <option value="">All cards</option>
                          <option value="unused">Not in any deck</option>
                          {g.decks.map((d: any) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {(tags.length > 0 || tagFilter) && (
                        <label>
                          Filter by tag
                          <select
                            value={tagFilter}
                            onChange={(e) => setTagFilter(e.target.value)}
                          >
                            <option value="">All tags</option>
                            {tags.map((tag) => (
                              <option key={tag} value={tag}>
                                {tag}
                              </option>
                            ))}
                            {tagFilter && !tags.includes(tagFilter) && (
                              <option value={tagFilter}>{tagFilter}</option>
                            )}
                          </select>
                        </label>
                      )}
                      <div className="card-list">
                        {g.cards.map((card: any, i: number) => (
                          <button
                            hidden={!visibleCard(card)}
                            key={card.id}
                            className={i === cardIndex ? "active" : ""}
                            onClick={() => selectCard(i)}
                          >
                            <img src={p.images[card.imageAssetId]} alt="" />
                            <div>
                              <b>{card.character}</b>
                              <small>{card.text}</small>
                            </div>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                          </button>
                        ))}
                      </div>
                      {!g.cards.some(visibleCard) && (
                        <p className="hint">
                          No matching cards. Clear the search and deck filter to
                          see all cards.
                        </p>
                      )}
                    </div>
                    <fieldset
                      className="card-form"
                      disabled={p.remote?.role === "viewer"}
                    >
                      <div className="eyebrow">EDIT CARD · {c.id}</div>
                      <p className="hint">
                        Decks:{" "}
                        {g.decks
                          .filter((d: any) =>
                            d.cards.some((entry: any) => entry.cardId === c.id),
                          )
                          .map((d: any) => d.name)
                          .join(", ") ||
                          "None — add this card to a deck or a follow-up."}
                      </p>
                      <label>
                        Character
                        <input
                          value={c.character}
                          onChange={(e) =>
                            update(
                              (g) =>
                                (g.cards[cardIndex].character = e.target.value),
                            )
                          }
                        />
                      </label>
                      <label>
                        What happens?
                        <textarea
                          rows={3}
                          value={c.text}
                          onChange={(e) =>
                            update(
                              (g) => (g.cards[cardIndex].text = e.target.value),
                            )
                          }
                        />
                      </label>
                      <label className="image-upload">
                        <img
                          src={p.images[c.imageAssetId]}
                          alt="Card artwork"
                        />
                        <span>
                          <b>Card artwork</b>
                          <small>Upload PNG, JPEG or WebP · max 5 MB</small>
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (!f) return;
                            const targetCard = c.id;
                            try {
                              const data = await readImage(f),
                                asset = imageAsset(f, f.name);
                              update((game, project) => {
                                const card = game.cards.find(
                                  (card: any) => card.id === targetCard,
                                );
                                if (!card)
                                  throw Error(
                                    "The target card was deleted while uploading.",
                                  );
                                if (game.assets.length >= 200)
                                  throw Error(
                                    "Remove an unused image before adding more (200 asset limit).",
                                  );
                                game.assets.push(asset);
                                card.imageAssetId = asset.id;
                                project.images[asset.id] = data;
                              });
                              setStatus(
                                "Image added to this card and the reusable library.",
                              );
                            } catch (error) {
                              setStatus((error as Error).message);
                            }
                          }}
                        />
                      </label>
                      <label>
                        Library image
                        <select
                          value={c.imageAssetId}
                          onChange={(e) =>
                            update((game) => {
                              game.cards.find(
                                (card: any) => card.id === c.id,
                              ).imageAssetId = e.target.value;
                            })
                          }
                        >
                          {g.assets
                            .filter((a: any) => a.kind === "image")
                            .map((a: any) => (
                              <option key={a.id} value={a.id}>
                                {a.path.split("/").pop()}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        onClick={() => navigate("assets", c.imageAssetId)}
                      >
                        Crop / manage this image
                      </button>
                      <label>
                        Image description
                        <input
                          maxLength={500}
                          value={c.imageAlt}
                          onChange={(e) =>
                            update((g) => {
                              g.cards[cardIndex].imageAlt = e.target.value;
                            })
                          }
                        />
                      </label>
                      <CardTags
                        tags={Array.isArray(c.tags) ? c.tags : []}
                        onChange={(tags) =>
                          update((g) =>
                            setOptional(
                              g.cards[cardIndex],
                              "tags",
                              tags.length ? tags : undefined,
                            ),
                          )
                        }
                      />
                      <div className="choice-editor">
                        {(["left", "right"] as const).map((side) => (
                          <div key={side}>
                            <div className="eyebrow">
                              {side === "left"
                                ? "← LEFT CHOICE"
                                : "RIGHT CHOICE →"}
                            </div>
                            <input
                              aria-label={side + " choice"}
                              value={c[side].label}
                              onChange={(e) =>
                                update(
                                  (g) =>
                                    (g.cards[cardIndex][side].label =
                                      e.target.value),
                                )
                              }
                            />
                            <EffectsEditor
                              game={g}
                              title={`${side} choice effects`}
                              value={c[side].effects}
                              onChange={(value) =>
                                update((g) => {
                                  g.cards[cardIndex][side].effects = value;
                                })
                              }
                            />
                            <label>
                              Follow-up card
                              <select
                                value={c[side].followUpCardId ?? ""}
                                onChange={(e) =>
                                  update((g) =>
                                    setOptional(
                                      g.cards[cardIndex][side],
                                      "followUpCardId",
                                      e.target.value,
                                    ),
                                  )
                                }
                              >
                                <option value="">
                                  Draw from the chapter's decks
                                </option>
                                {g.cards.map((card: any) => (
                                  <option key={card.id} value={card.id}>
                                    {card.character} · {card.text.slice(0, 35)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        ))}
                      </div>
                      <label>
                        Repeat policy
                        <select
                          value={c.repeat}
                          onChange={(e) =>
                            update(
                              (g) =>
                                (g.cards[cardIndex].repeat = e.target.value),
                            )
                          }
                        >
                          <option value="unlimited">Repeatable</option>
                          <option value="oncePerRun">Once per run</option>
                          <option value="oncePerChapter">
                            Once per chapter visit
                          </option>
                        </select>
                      </label>
                      <ConditionEditor
                        game={g}
                        title="Show this card when"
                        value={c.when}
                        onChange={(value) =>
                          update((g) =>
                            setOptional(g.cards[cardIndex], "when", value),
                          )
                        }
                      />
                      <p className="hint">
                        Follow-ups respect conditions and repeat limits. A
                        chapter transition takes precedence over a follow-up.
                        New cards enter the first deck; change membership in
                        Structure &amp; rules.
                      </p>
                    </fieldset>
                  </div>
                </>
              ) : tab === "Images" ? (
                <AssetLibrary
                  key={`${p.draftId}-${assetId}`}
                  initialId={assetId}
                  project={p}
                  update={update}
                  navigate={navigate}
                />
              ) : tab === "Game settings" ? (
                <div className="settings">
                  <h2>Give your story an identity.</h2>
                  <p className="hint">
                    Your story setting comes from its writing and images. A
                    visual theme changes presentation only.
                  </p>
                  <div className="theme-presets">
                    {themePresets.map(({ label, theme }) => (
                      <button
                        key={theme.preset}
                        className={
                          g.theme.preset === theme.preset ? "selected" : ""
                        }
                        style={{
                          background: theme.background,
                          color: theme.surface,
                        }}
                        onClick={() =>
                          update((game) => {
                            game.theme = structuredClone(theme);
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label>
                    Reading font
                    <select
                      value={g.theme.font}
                      onChange={(e) =>
                        update((game) => {
                          game.theme.font = e.target.value;
                          if (e.target.value !== "bundled")
                            delete game.theme.fontAssetId;
                          else if (!game.theme.fontAssetId) {
                            const first = game.assets.find(
                              (asset: any) => asset.kind === "font",
                            );
                            if (first) game.theme.fontAssetId = first.id;
                          }
                        })
                      }
                    >
                      <option value="system-serif">Classic serif</option>
                      <option value="system-sans">Clean sans serif</option>
                      {(g.theme.font === "bundled" ||
                        g.assets.some(
                          (asset: any) => asset.kind === "font",
                        )) && (
                        <option value="bundled">Bundled WOFF2 font</option>
                      )}
                    </select>
                  </label>
                  {g.theme.font === "bundled" && (
                    <label>
                      Bundled font file
                      <select
                        value={g.theme.fontAssetId ?? ""}
                        onChange={(e) =>
                          update((game) => {
                            setOptional(
                              game.theme,
                              "fontAssetId",
                              e.target.value,
                            );
                            if (!game.theme.fontAssetId)
                              game.theme.font = "system-serif";
                          })
                        }
                      >
                        <option value="">Choose a font</option>
                        {g.assets
                          .filter((asset: any) => asset.kind === "font")
                          .map((asset: any) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.path.split("/").pop()}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <label className="font-upload">
                    <span>
                      <b>Upload a font</b>
                      <small>WOFF2 only · max 2 MB</small>
                    </span>
                    <input
                      type="file"
                      accept=".woff2,font/woff2"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          const data = await readFont(file);
                          const asset = fontAsset(file);
                          update((game, project) => {
                            if (game.assets.length >= 200)
                              throw Error(
                                "Remove an unused asset before adding a font (200 asset limit).",
                              );
                            game.assets.push(asset);
                            game.theme.font = "bundled";
                            game.theme.fontAssetId = asset.id;
                            project.images[asset.id] = data;
                          });
                          setStatus("Bundled font added to this project.");
                        } catch (error) {
                          setStatus((error as Error).message);
                        }
                      }}
                    />
                  </label>
                  <label>
                    Background image
                    <select
                      value={g.theme.backgroundAssetId ?? ""}
                      onChange={(e) =>
                        update((game) =>
                          setOptional(
                            game.theme,
                            "backgroundAssetId",
                            e.target.value,
                          ),
                        )
                      }
                    >
                      <option value="">Use the background colour</option>
                      {g.assets
                        .filter((asset: any) => asset.kind === "image")
                        .map((asset: any) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.path.split("/").pop()}
                          </option>
                        ))}
                    </select>
                  </label>
                  {g.theme.backgroundAssetId &&
                    p.images[g.theme.backgroundAssetId] && (
                      <img
                        className="background-preview"
                        src={p.images[g.theme.backgroundAssetId]}
                        alt="Background preview"
                      />
                    )}
                  {themeWarnings(g.theme).length > 0 && (
                    <div className="theme-warnings" role="status">
                      {themeWarnings(g.theme).map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  )}
                  <label>
                    Game title
                    <input
                      value={g.title}
                      onChange={(e) =>
                        update((g) => {
                          g.title = e.target.value;
                          g.android.displayName = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    Android application ID
                    <input
                      value={g.android.applicationId}
                      onChange={(e) =>
                        update(
                          (g) => (g.android.applicationId = e.target.value),
                        )
                      }
                    />
                  </label>
                  <div className="colors">
                    <label>
                      Version name
                      <input
                        value={g.android.versionName}
                        placeholder="1.0"
                        onChange={(e) =>
                          update(
                            (g) => (g.android.versionName = e.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      Version code
                      <input
                        type="number"
                        min={1}
                        max={2100000000}
                        step={1}
                        value={g.android.versionCode}
                        onChange={(e) =>
                          update(
                            (g) =>
                              (g.android.versionCode = Number(e.target.value)),
                          )
                        }
                      />
                    </label>
                  </div>
                  <p className="hint">
                    The version name is shown to players. Increase the version
                    code for each Google Play update and keep the application ID
                    unchanged.
                  </p>
                  <div className="colors">
                    {["background", "surface", "text", "accent"].map((k) => (
                      <label key={k}>
                        {k}
                        <input
                          type="color"
                          value={g.theme[k]}
                          onChange={(e) =>
                            update((g) => (g.theme[k] = e.target.value))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <ResourceSettings
                    game={g}
                    update={update}
                    assets={p.images}
                    readOnly={p.remote?.role === "viewer"}
                  />
                </div>
              ) : tab === "Structure & rules" ? (
                <StoryEditor
                  key={index}
                  focusTarget={storyTarget}
                  game={g}
                  update={update}
                  readOnly={p.remote?.role === "viewer"}
                />
              ) : tab === "Advanced JSON" ? (
                <JsonEditor
                  key={index}
                  game={g}
                  images={p.images}
                  onApply={(next) => {
                    update((_, project) => {
                      project.game = next;
                    });
                    selectCard(0);
                    setCardSearch("");
                  }}
                />
              ) : (
                <ReleasePanel
                  key={p.draftId ?? String(index)}
                  project={p}
                  busy={busy}
                  onExport={exportFile}
                />
              )}
              {errors.length > 0 && (
                <div role="alert" className="errors">
                  {errors.map((e, i) => (
                    <p key={i}>
                      <button type="button" onClick={() => openIssue(e)}>
                        Open issue
                      </button>{" "}
                      {e}
                    </p>
                  ))}
                </div>
              )}
              <div className="author-warnings" role="status">
                {g.cards.length > 2000 && (
                  <p>Shared projects support up to 2,000 cards.</p>
                )}
                {g.assets.length > 200 && (
                  <p>Shared projects support up to 200 assets.</p>
                )}
                {Object.values(p.images).reduce(
                  (total, image) => total + assetBytes(image),
                  0,
                ) > 10_000_000 && (
                  <p>
                    Images exceed the 10 MB shared-save limit. Use Images to
                    optimize variants or remove unused originals. Local backups
                    can still be exported.
                  </p>
                )}
                {g.cards.some(
                  (card: any) =>
                    !g.decks.some((d: any) =>
                      d.cards.some((entry: any) => entry.cardId === card.id),
                    ) &&
                    !g.cards.some(
                      (source: any) =>
                        source.left.followUpCardId === card.id ||
                        source.right.followUpCardId === card.id,
                    ),
                ) && (
                  <p>
                    Some cards have no deck or incoming follow-up. They will not
                    be drawn in normal play. Use the “Not in any deck” filter to
                    review them.
                  </p>
                )}
              </div>
            </fieldset>
          </section>
          <aside className="preview-panel">
            <Playtest
              key={`${index}-${preview}`}
              game={g}
              assets={p.images}
              errors={errors}
              revision={
                p.remote?.dirty === false ? p.remote.revision : undefined
              }
              label={
                p.remote
                  ? p.remote.dirty === false
                    ? `Shared revision ${p.remote.revision}`
                    : `Local draft based on shared revision ${p.remote.revision}`
                  : "Local draft"
              }
            />
          </aside>
        </div>
        <footer>
          GAME FACTORY / FIRST EDITION{" "}
          <span>Made for stories with consequences.</span>
        </footer>
      </main>
      <NewGameDialog
        open={showNewGame}
        onClose={() => setShowNewGame(false)}
        onCreate={newGame}
      />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
