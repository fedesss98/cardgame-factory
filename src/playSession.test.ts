import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { start, choose } from "./engine.ts";
import {
  startScenario,
  step,
  intervene,
  forceCard,
  eligibility,
} from "./playSession.ts";
const game = JSON.parse(
  readFileSync(
    new URL("../examples/harbor/game.json", import.meta.url),
    "utf8",
  ),
);
test("normal test run matches production, with immutable rewind states", () => {
  const source = structuredClone(game);
  let frame = startScenario(game, { chapterId: game.startChapterId, seed: 42 });
  let production = start(game);
  const initial = structuredClone(frame);
  assert.deepEqual(frame.state, production);
  for (const side of ["right", "left", "right"] as const) {
    production = choose(game, production, side);
    frame = step(game, frame, side);
    assert.deepEqual(frame.state, production);
  }
  assert.deepEqual(
    step(game, initial, "right"),
    step(game, structuredClone(initial), "right"),
  );
  assert.deepEqual(game, source);
  assert.equal(frame.state.ending, "survived");
});
test("chapter entry precedes overrides; interventions validate and do not mutate content", () => {
  const g = structuredClone(game);
  g.chapters[1].onEnter = [
    { kind: "statDelta", statId: "supplies", delta: -20 },
  ];
  const frame = startScenario(g, {
    chapterId: "weather",
    seed: 7,
    stats: { supplies: 80 },
  });
  assert.equal(frame.state.stats.supplies, 80);
  assert.equal(frame.state.card, "storm");
  assert.equal(
    intervene(g, frame, { stats: { supplies: 0 } }).state.ending,
    "empty-stores",
  );
  assert.equal(frame.state.stats.supplies, 80);
  assert.throws(
    () => intervene(g, frame, { stats: { supplies: 101 } }),
    /between/,
  );
  assert.throws(
    () => startScenario(g, { chapterId: "weather", seed: -1 }),
    /Seed/,
  );
  const forced = forceCard(g, frame, "thanks");
  assert.equal(forced.state.card, "thanks");
  assert.equal(forced.state.flags["merchant-helped"], false);
  assert.match(forced.events[0], /FORCED/);
  assert.ok(eligibility(g, frame).length);
});
test("deck isolation obeys conditions and clears even on a same-chapter transition", () => {
  const g = structuredClone(game),
    chapter = g.chapters[0],
    deckId = chapter.decks[0].deckId;
  const frame = startScenario(g, { chapterId: chapter.id, deckId, seed: 42 });
  chapter.transitions = [
    {
      toChapterId: chapter.id,
      when: {
        mode: "all",
        rules: [{ kind: "turn", scope: "chapter", op: "gte", value: 1 }],
      },
    },
  ];
  assert.equal(step(g, frame, "left").deckId, undefined);
  chapter.decks[0].when = {
    mode: "all",
    rules: [{ kind: "flag", flagId: "merchant-helped", value: true }],
  };
  const blocked = startScenario(g, { chapterId: chapter.id, deckId, seed: 42 });
  assert.equal(blocked.state.ending, g.fallbackEndingId);
  assert.match(eligibility(g, blocked)[0].reason, /deck conditions/);
});
