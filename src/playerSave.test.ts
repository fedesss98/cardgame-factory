import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { choose, start } from "./engine.ts";
import {
  clearProgress,
  defaultProgress,
  gameIdentity,
  loadPlayer,
  loadProgress,
  playerProgressKey,
  playerSaveKey,
  recordProgress,
  savePlayer,
  saveProgress,
  startNewRun,
  type StorageLike,
} from "./playerSave.ts";

const harbor = JSON.parse(
  readFileSync(new URL("../examples/harbor/game.json", import.meta.url), "utf8"),
);
const ember = JSON.parse(
  readFileSync(new URL("../examples/ember/game.json", import.meta.url), "utf8"),
);

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

test("a resolved run round-trips without rerolling or reapplying effects", () => {
  const g = structuredClone(harbor);
  const storage = memoryStorage();
  const identity = gameIdentity(g);
  const progress = defaultProgress(g);
  const state = choose(g, start(g), "right");
  assert.equal(savePlayer(identity, state, progress, storage).ok, true);
  const loaded = loadPlayer(g, identity, storage);
  assert.equal(loaded.status, "resumed");
  assert.deepEqual(loaded.state, state);
  assert.deepEqual(loaded.progress, progress);
  assert.match(loaded.notice, /Resumed/);
});

test("persistent flags and discovered endings survive New game but not reset", () => {
  const g = structuredClone(ember);
  const storage = memoryStorage();
  const identity = gameIdentity(g);
  let progress = defaultProgress(g);
  progress.flags["ember-veteran"] = true;
  const saved = startNewRun(g, progress);
  saved.ending = "saved";
  progress = recordProgress(g, saved, progress);
  assert.ok(progress.endings.includes("saved"));
  assert.equal(saveProgress(identity, progress, storage).ok, true);

  const next = startNewRun(g, progress);
  assert.equal(next.flags["ember-veteran"], true);
  assert.equal(next.ending, undefined);
  assert.deepEqual(loadProgress(g, storage), progress);

  clearProgress(identity, storage);
  assert.deepEqual(loadProgress(g, storage), defaultProgress(g));
});

test("incompatible save versions reset only the run and keep progress", () => {
  const g = structuredClone(harbor);
  const storage = memoryStorage();
  const identity = gameIdentity(g);
  const progress = defaultProgress(g);
  const state = choose(g, start(g), "right");
  savePlayer(identity, state, progress, storage);

  const updated = structuredClone(g);
  updated.saveCompatibilityVersion = 2;
  const loaded = loadPlayer(updated, gameIdentity(updated), storage);
  assert.equal(loaded.status, "reset");
  assert.match(loaded.notice, /not compatible/);
  assert.notDeepEqual(loaded.state, state);
  assert.equal(storage.getItem(playerSaveKey(g.id)), null);
  assert.ok(storage.getItem(playerProgressKey(g.id)));
});

test("compatible content changes resume, but a missing current card resets safely", () => {
  const g = structuredClone(harbor);
  const storage = memoryStorage();
  const identity = gameIdentity(g);
  const state = choose(g, start(g), "right");
  savePlayer(identity, state, defaultProgress(g), storage);

  const renamed = structuredClone(g);
  renamed.title = "Harbor Council revised";
  const resumed = loadPlayer(renamed, gameIdentity(renamed), storage);
  assert.equal(resumed.status, "resumed");
  assert.deepEqual(resumed.state, state);
  assert.match(resumed.notice, /content changed/);

  const broken = structuredClone(renamed);
  broken.cards = broken.cards.filter((card: any) => card.id !== state.card);
  const reset = loadPlayer(broken, gameIdentity(broken), storage);
  assert.equal(reset.status, "reset");
  assert.match(reset.notice, /no longer available/);
});

test("damaged saves and removed references are handled without guessing", () => {
  const g = structuredClone(harbor);
  const storage = memoryStorage();
  const identity = gameIdentity(g);
  storage.setItem(playerSaveKey(g.id), "{not json");
  assert.equal(loadPlayer(g, identity, storage).status, "reset");

  const state = choose(g, start(g), "left");
  savePlayer(identity, state, defaultProgress(g), storage);
  const updated = structuredClone(g);
  updated.flags = updated.flags.filter(
    (flag: any) => flag.id !== "merchant-helped",
  );
  updated.cards = updated.cards.map((card: any) =>
    card.id === state.card
      ? { ...card, left: { ...card.left, effects: [] } }
      : card,
  );
  const loaded = loadPlayer(updated, gameIdentity(updated), storage);
  assert.equal(loaded.status, "resumed");
  assert.equal("merchant-helped" in loaded.state.flags, false);
});
