import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { choose as chooseInEngine } from "./engine";
import { Player } from "./PlayerView";
import { validate } from "./validate";
import {
  clearProgress,
  defaultProgress,
  gameIdentity,
  loadPlayer,
  recordProgress,
  savePlayer,
  startNewRun,
  type GameIdentity,
  type LoadedPlayer,
  type PersistentProgress,
  type StorageLike,
} from "./playerSave";
import "./style.css";

function browserStorage(): { storage: StorageLike; available: boolean } {
  try {
    const storage = window.localStorage;
    const key = "game-factory:storage-check";
    storage.setItem(key, "1");
    storage.removeItem(key);
    return { storage, available: true };
  } catch {
    return {
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("Storage is unavailable");
        },
        removeItem: () => {},
      },
      available: false,
    };
  }
}

function SavedPlayer({ game }: { game: any }) {
  const identityRef = useRef<GameIdentity | null>(null);
  if (!identityRef.current) identityRef.current = gameIdentity(game);
  const identity = identityRef.current;
  const storageRef = useRef<{
    storage: StorageLike;
    available: boolean;
  } | null>(null);
  if (!storageRef.current) storageRef.current = browserStorage();
  const storage = storageRef.current.storage;
  const loadedRef = useRef<LoadedPlayer | null>(null);
  if (!loadedRef.current)
    loadedRef.current = loadPlayer(game, identity, storage);
  const loaded = loadedRef.current;
  const [state, setState] = useState(loaded.state);
  const [progress, setProgress] = useState<PersistentProgress>(loaded.progress);
  const [notice, setNotice] = useState(
    storageRef.current.available
      ? loaded.notice
      : "Local saves are unavailable. This run works, but progress cannot be resumed after closing the tab.",
  );
  const stateRef = useRef(state);
  const progressRef = useRef(progress);
  const issueRef = useRef("");

  function persist(nextState = stateRef.current, nextProgress = progressRef.current) {
    const result = savePlayer(identity, nextState, nextProgress, storage);
    if (!result.ok) {
      const message = result.message || "Progress cannot be saved.";
      if (message !== issueRef.current) {
        issueRef.current = message;
        setNotice(message);
      }
    } else if (issueRef.current) {
      issueRef.current = "";
      setNotice("Progress saved in this browser.");
    }
  }

  useEffect(() => {
    // Persist the initial or repaired state so a reload can resume it.
    persist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const flush = () => persist();
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", visibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit(nextState = stateRef.current) {
    const nextProgress = recordProgress(game, nextState, progressRef.current);
    stateRef.current = nextState;
    progressRef.current = nextProgress;
    setState(nextState);
    setProgress(nextProgress);
    persist(nextState, nextProgress);
  }

  function choose(side: "left" | "right") {
    if (stateRef.current.ending) return;
    try {
      commit(chooseInEngine(game, stateRef.current, side));
    } catch (error) {
      setNotice((error as Error).message);
    }
  }

  function newGame() {
    setNotice("New game started. Persistent progress was kept.");
    commit(startNewRun(game, progressRef.current));
  }

  function resetAllProgress() {
    if (
      !window.confirm(
        "Reset all persistent flags and discovered endings? The current run will also restart.",
      )
    )
      return;
    clearProgress(identity, storage);
    const fresh = defaultProgress(game);
    const next = startNewRun(game, fresh);
    progressRef.current = fresh;
    stateRef.current = next;
    setProgress(fresh);
    setState(next);
    setNotice("All persistent progress was reset.");
    persist(next, fresh);
  }

  return (
    <Player
      game={game}
      assets={Object.fromEntries(
        game.assets.map((a: any) => [a.id, a.path]),
      )}
      session={{
        state,
        choose,
        restart: newGame,
        newGame,
      }}
      notice={notice}
      progress={{
        discovered: progress.endings.length,
        total: game.endings.length,
        onReset: resetAllProgress,
      }}
    />
  );
}

fetch("./game.json")
  .then((r) => {
    if (!r.ok) throw Error("Game file not found");
    return r.json();
  })
  .then((game) => {
    const errors = validate(game);
    if (errors.length) throw Error(errors.join("\n"));
    document.title = game.title;
    createRoot(document.getElementById("root")!).render(
      <main className="standalone">
        <SavedPlayer game={game} />
      </main>,
    );
  })
  .catch((e) => {
    document.getElementById("root")!.textContent =
      `Unable to load game: ${e.message}`;
  });
