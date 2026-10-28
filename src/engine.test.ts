import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { start, choose } from "./engine.ts";
const game = JSON.parse(
  readFileSync(
    new URL("../examples/harbor/game.json", import.meta.url),
    "utf8",
  ),
);
test("right branch follows merchant then advances chapter and ends", () => {
  let s = start(game);
  assert.equal(s.card, "merchant");
  s = choose(game, s, "right");
  assert.equal(s.card, "thanks");
  assert.equal(s.stats.supplies, 40);
  s = choose(game, s, "left");
  assert.equal(s.chapter, "weather");
  assert.equal(s.card, "storm");
  s = choose(game, s, "right");
  assert.equal(s.ending, "survived");
});
test("left branch skips gated follow-up", () => {
  let s = choose(game, start(game), "left");
  assert.equal(s.card, "watch");
  s = choose(game, s, "left");
  assert.equal(s.card, "storm");
});
test("fatal ending takes priority over chapter transition", () => {
  const g = structuredClone(game);
  g.stats[0].initial = 5;
  const s = choose(g, start(g), "right");
  assert.equal(s.ending, "empty-stores");
  assert.equal(s.stats.supplies, 0);
});
test("same initial state, seed and choices reproduce state", () => {
  const play = () =>
    ["right", "left", "right"].reduce(
      (s, c) => choose(game, s, c as "left" | "right"),
      start(game, 7),
    );
  assert.deepEqual(play(), play());
});
test("exhausted decks resolve fallback", () => {
  const g = structuredClone(game);
  g.chapters[0].transitions = [];
  g.decks[0].cards = [{ cardId: "merchant", weight: 1 }];
  assert.equal(choose(g, start(g), "left").ending, "no-events");
});
