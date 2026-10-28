import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRunReport } from "./runReport.ts";
import { startScenario, step, type Frame } from "./playSession.ts";

const game = JSON.parse(
  readFileSync(new URL("../examples/harbor/game.json", import.meta.url), "utf8"),
);

test("report lists observed coverage, choices and no false dead ends", () => {
  const frames: Frame[] = [
    startScenario(game, { chapterId: game.startChapterId, seed: 42 }),
  ];
  for (const side of ["right", "left", "right"] as const)
    frames.push(step(game, frames[frames.length - 1], side));
  const report = buildRunReport(game, frames, ["example warning"]);
  assert.equal(report.choices.length, 3);
  assert.deepEqual(
    report.choices.map((choice) => choice.side),
    ["right", "left", "right"],
  );
  assert.deepEqual(report.coverage.chapters, ["prepare", "weather"]);
  assert.deepEqual(report.coverage.endings, ["survived"]);
  assert.ok(report.coverage.cards.includes("merchant"));
  assert.ok(report.coverage.cards.includes("thanks"));
  assert.ok(report.coverage.cards.includes("storm"));
  assert.ok(report.unreached.cards.includes("watch"));
  assert.equal(report.deadEnds.length, 0);
  assert.deepEqual(report.errors, ["example warning"]);
  assert.equal(report.fallbackEndingId, "no-events");
});

test("report identifies an observed fallback dead end", () => {
  const g = structuredClone(game);
  g.chapters[0].transitions = [];
  g.decks[0].cards = [{ cardId: "merchant", weight: 1 }];
  const frames: Frame[] = [
    startScenario(g, { chapterId: g.startChapterId, seed: 42 }),
  ];
  frames.push(step(g, frames[0], "left"));
  const report = buildRunReport(g, frames);
  assert.equal(report.deadEnds.length, 1);
  assert.match(report.deadEnds[0].reason, /fallback ending no-events/);
  assert.equal(report.choices.length, 1);
});
