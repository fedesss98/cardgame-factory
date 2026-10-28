import {
  ENGINE_VERSION,
  start,
  type Game,
  type State,
} from "./engine.ts";
import { contentFingerprint } from "./fingerprint.ts";

export const PLAYER_SAVE_FORMAT = "game-factory-player-save";
export const PLAYER_SAVE_VERSION = 1;

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type PersistentProgress = {
  flags: Record<string, boolean>;
  endings: string[];
};

export type GameIdentity = {
  gameId: string;
  schemaVersion: string;
  contentVersion: number;
  saveCompatibilityVersion: number;
  fingerprint: string;
  engineVersion: string;
};

export type PlayerSave = {
  format: typeof PLAYER_SAVE_FORMAT;
  saveVersion: number;
  engineVersion: string;
  gameId: string;
  schemaVersion: string;
  contentVersion: number;
  saveCompatibilityVersion: number;
  contentFingerprint: string;
  state: State;
  savedAt: string;
};

export type LoadStatus = "new" | "resumed" | "reset";
export type LoadedPlayer = {
  state: State;
  progress: PersistentProgress;
  status: LoadStatus;
  notice: string;
  save?: PlayerSave;
};

export function gameIdentity(g: Game): GameIdentity {
  return {
    gameId: g.id,
    schemaVersion: g.schemaVersion,
    contentVersion: g.contentVersion,
    saveCompatibilityVersion: g.saveCompatibilityVersion,
    fingerprint: contentFingerprint(g),
    engineVersion: ENGINE_VERSION,
  };
}

export function playerSaveKey(gameId: string) {
  return `game-factory:player-save:${gameId}`;
}
export function playerProgressKey(gameId: string) {
  return `game-factory:player-progress:${gameId}`;
}

export function defaultProgress(g: Game): PersistentProgress {
  return {
    flags: Object.fromEntries(
      g.flags
        .filter((f: any) => f.scope === "persistent")
        .map((f: any) => [f.id, f.initial]),
    ),
    endings: [],
  };
}

export function loadProgress(
  g: Game,
  storage: StorageLike,
): PersistentProgress {
  const progress = defaultProgress(g);
  let raw: any;
  try {
    raw = JSON.parse(storage.getItem(playerProgressKey(g.id)) || "null");
  } catch {
    return progress;
  }
  if (!raw || typeof raw !== "object") return progress;
  const storedFlags =
    raw.flags && typeof raw.flags === "object" ? raw.flags : {};
  for (const flag of g.flags)
    if (flag.scope === "persistent" && typeof storedFlags[flag.id] === "boolean")
      progress.flags[flag.id] = storedFlags[flag.id];
  if (Array.isArray(raw.endings))
    progress.endings = Array.from(
      new Set(
        raw.endings.filter(
          (id: unknown): id is string =>
            typeof id === "string" &&
            g.endings.some((ending: any) => ending.id === id),
        ),
      ),
    );
  return progress;
}

export function recordProgress(
  g: Game,
  state: State,
  progress: PersistentProgress,
): PersistentProgress {
  const flags = { ...progress.flags };
  for (const flag of g.flags)
    if (flag.scope === "persistent" && typeof state.flags[flag.id] === "boolean")
      flags[flag.id] = state.flags[flag.id];
  const endings = new Set(
    progress.endings.filter((id) =>
      g.endings.some((ending: any) => ending.id === id),
    ),
  );
  if (
    state.ending &&
    g.endings.some((ending: any) => ending.id === state.ending)
  )
    endings.add(state.ending);
  return { flags, endings: Array.from(endings) };
}

export function startNewRun(
  g: Game,
  progress: PersistentProgress,
  seed = 42,
): State {
  return start(g, seed, progress.flags);
}

export function saveProgress(
  identity: GameIdentity,
  progress: PersistentProgress,
  storage: StorageLike,
): { ok: boolean; message?: string } {
  try {
    storage.setItem(
      playerProgressKey(identity.gameId),
      JSON.stringify(progress),
    );
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "Progress cannot be saved in this browser. Keep this tab open or free local storage.",
    };
  }
}

export function savePlayer(
  identity: GameIdentity,
  state: State,
  progress: PersistentProgress,
  storage: StorageLike,
): { ok: boolean; message?: string } {
  const save: PlayerSave = {
    format: PLAYER_SAVE_FORMAT,
    saveVersion: PLAYER_SAVE_VERSION,
    engineVersion: identity.engineVersion,
    gameId: identity.gameId,
    schemaVersion: identity.schemaVersion,
    contentVersion: identity.contentVersion,
    saveCompatibilityVersion: identity.saveCompatibilityVersion,
    contentFingerprint: identity.fingerprint,
    state,
    savedAt: new Date().toISOString(),
  };
  try {
    // One setItem per key is atomic. The run is written first so a progress
    // write failure never leaves a progress record ahead of the run it describes.
    storage.setItem(playerSaveKey(identity.gameId), JSON.stringify(save));
  } catch {
    return {
      ok: false,
      message:
        "Progress cannot be saved in this browser. Keep this tab open or free local storage.",
    };
  }
  const persisted = saveProgress(identity, progress, storage);
  if (!persisted.ok) return persisted;
  return { ok: true };
}

export function clearProgress(identity: GameIdentity, storage: StorageLike) {
  try {
    storage.removeItem(playerProgressKey(identity.gameId));
  } catch {
    // A blocked storage API is already reported by savePlayer.
  }
}

function reset(
  g: Game,
  identity: GameIdentity,
  progress: PersistentProgress,
  storage: StorageLike,
  reason: string,
): LoadedPlayer {
  try {
    storage.removeItem(playerSaveKey(identity.gameId));
  } catch {
    // The old save may remain, but the player still starts safely.
  }
  return {
    state: startNewRun(g, progress),
    progress,
    status: "reset",
    notice: `${reason} A new run was started; persistent progress was kept.`,
  };
}

function finiteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function normalizeState(
  g: Game,
  raw: any,
  progress: PersistentProgress,
): State | null {
  if (!raw || typeof raw !== "object") return null;
  if (
    typeof raw.chapter !== "string" ||
    !g.chapters.some((chapter: any) => chapter.id === raw.chapter)
  )
    return null;
  if (!raw.stats || typeof raw.stats !== "object") return null;
  if (!raw.flags || typeof raw.flags !== "object") return null;
  if (!finiteInteger(raw.turn) || raw.turn < 0) return null;
  if (!finiteInteger(raw.chapterTurn) || raw.chapterTurn < 0) return null;
  if (!finiteInteger(raw.seed) || raw.seed < 0 || raw.seed > 4294967295)
    return null;

  const ending =
    raw.ending === undefined || raw.ending === null
      ? undefined
      : String(raw.ending);
  if (
    ending &&
    !g.endings.some((candidate: any) => candidate.id === ending)
  )
    return null;
  const card =
    raw.card === undefined || raw.card === null ? undefined : String(raw.card);
  if (card && !g.cards.some((candidate: any) => candidate.id === card))
    return null;
  // A running save must have a resolved current card, or a terminal ending.
  if (!ending && !card) return null;

  const stats: Record<string, number> = {};
  for (const stat of g.stats) {
    const value = raw.stats[stat.id];
    if (typeof value !== "number" || !Number.isFinite(value))
      stats[stat.id] = stat.initial;
    else
      stats[stat.id] = Math.max(
        stat.min,
        Math.min(stat.max, Math.round(value)),
      );
  }
  const flags: Record<string, boolean> = {};
  for (const flag of g.flags) {
    const value = raw.flags[flag.id];
    if (typeof value === "boolean") flags[flag.id] = value;
    else if (
      flag.scope === "persistent" &&
      typeof progress.flags[flag.id] === "boolean"
    )
      flags[flag.id] = progress.flags[flag.id];
    else flags[flag.id] = flag.initial;
  }
  const knownCards = new Set(g.cards.map((candidate: any) => candidate.id));
  const seen = Array.isArray(raw.seen)
    ? raw.seen.filter(
        (id: unknown): id is string =>
          typeof id === "string" && knownCards.has(id),
      )
    : [];
  const chapterSeen = Array.isArray(raw.chapterSeen)
    ? raw.chapterSeen.filter(
        (id: unknown): id is string =>
          typeof id === "string" && knownCards.has(id),
      )
    : [];
  const knownDecks = new Set(g.decks.map((deck: any) => deck.id));
  const cursors: Record<string, number> = {};
  if (raw.cursors && typeof raw.cursors === "object")
    for (const [id, value] of Object.entries(raw.cursors))
      if (
        knownDecks.has(id) &&
        finiteInteger(value) &&
        value >= 0
      )
        cursors[id] = value;

  const state: State = {
    stats,
    flags,
    chapter: raw.chapter,
    turn: raw.turn,
    chapterTurn: raw.chapterTurn,
    seen,
    chapterSeen,
    cursors,
    seed: raw.seed,
  };
  if (card) state.card = card;
  if (ending) state.ending = ending;
  return state;
}

export function loadPlayer(
  g: Game,
  identity: GameIdentity,
  storage: StorageLike,
): LoadedPlayer {
  const progress = loadProgress(g, storage);
  let raw: string | null;
  try {
    raw = storage.getItem(playerSaveKey(identity.gameId));
  } catch {
    return {
      state: startNewRun(g, progress),
      progress,
      status: "new",
      notice:
        "Local saves are unavailable. This run works, but progress cannot be resumed after closing the tab.",
    };
  }
  if (!raw)
    return {
      state: startNewRun(g, progress),
      progress,
      status: "new",
      notice: "New game. Progress is saved in this browser.",
    };

  let save: PlayerSave;
  try {
    save = JSON.parse(raw);
  } catch {
    return reset(
      g,
      identity,
      progress,
      storage,
      "The saved run was damaged and could not be read.",
    );
  }
  if (
    !save ||
    save.format !== PLAYER_SAVE_FORMAT ||
    save.saveVersion !== PLAYER_SAVE_VERSION ||
    save.gameId !== identity.gameId
  )
    return reset(
      g,
      identity,
      progress,
      storage,
      "The saved run belongs to an unsupported save format.",
    );
  if (save.saveCompatibilityVersion !== identity.saveCompatibilityVersion)
    return reset(
      g,
      identity,
      progress,
      storage,
      "This game update is not compatible with the saved run.",
    );

  const state = normalizeState(g, save.state, progress);
  if (!state)
    return reset(
      g,
      identity,
      progress,
      storage,
      "The saved run references content that is no longer available.",
    );

  const nextProgress = recordProgress(g, state, progress);
  const changed = save.contentFingerprint !== identity.fingerprint;
  let notice = "Resumed your saved run.";
  if (save.savedAt) {
    const when = new Date(save.savedAt);
    if (!Number.isNaN(when.getTime()))
      notice = `Resumed your saved run from ${when.toLocaleString()}.`;
  }
  if (changed)
    notice +=
      " The game content changed, but the saved state remained compatible.";
  return {
    state,
    progress: nextProgress,
    status: "resumed",
    notice,
    save,
  };
}
