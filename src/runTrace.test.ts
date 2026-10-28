import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createRunTrace,
  replayRunTrace,
  RUN_TRACE_FORMAT,
  type TraceIntervention,
} from "./runTrace.ts";
import {
  forceCard,
  intervene,
  startScenario,
  step,
  type Scenario,
} from "./playSession.ts";

const game = JSON.parse(
  readFileSync(new URL("../examples/harbor/game.json", import.meta.url), "utf8"),
);
const scenario: Scenario = { chapterId: game.startChapterId, seed: 42 };

function recordedRun() {
  const frames = [startScenario(game, scenario)];
  const interventions: TraceIntervention[] = [];
  for (const side of ["right", "left", "right"] as const) {
    frames.push(step(game, frames[frames.length - 1], side));
    interventions.push({ kind: "choice", side });
  }
  return { frames, interventions };
}

test("a shared revision trace replays the same frames and final state", () => {
  const run = recordedRun();
  const trace = createRunTrace({
    game,
    scenario,
    interventions: run.interventions,
    frames: run.frames,
    revision: 7,
    label: "Saved revision 7",
  });
  assert.equal(trace.format, RUN_TRACE_FORMAT);
  assert.equal(trace.source, "shared-revision");
  assert.equal(trace.revision, 7);
  assert.equal(trace.events.length > 0, true);
  const replay = replayRunTrace(game, structuredClone(trace));
  assert.deepEqual(
    replay.frames.map((frame) => frame.state),
    run.frames.map((frame) => frame.state),
  );
  assert.deepEqual(replay.interventions, run.interventions);
});

test("overrides and forced cards replay as explicit interventions", () => {
  const initial = startScenario(game, scenario);
  const chosen = step(game, initial, "right");
  const changed = intervene(game, chosen, { stats: { supplies: 80 } });
  const forced = forceCard(game, changed, "thanks");
  const trace = createRunTrace({
    game,
    scenario,
    interventions: [
      { kind: "choice", side: "right" },
      { kind: "overrides", overrides: { stats: { supplies: 80 } } },
      { kind: "force", cardId: "thanks" },
    ],
    frames: [initial, chosen, changed, forced],
    revision: null,
  });
  const replay = replayRunTrace(game, trace);
  assert.deepEqual(
    replay.frames.map((frame) => frame.state),
    [initial, chosen, changed, forced].map((frame) => frame.state),
  );
  assert.equal(replay.interventions.length, 3);
  assert.equal(replay.frames.at(-1)?.state.card, "thanks");
  assert.equal(trace.source, "local-draft");
});

test("replays reject incompatible content, engine versions and edited states", () => {
  const run = recordedRun();
  const trace = createRunTrace({
    game,
    scenario,
    interventions: run.interventions,
    frames: run.frames,
    revision: 3,
  });
  assert.throws(
    () =>
      replayRunTrace(game, {
        ...trace,
        game: { ...trace.game, contentFingerprint: "0".repeat(16) },
      }),
    /content changed/,
  );
  assert.throws(
    () => replayRunTrace(game, { ...trace, engineVersion: "0.0.0" }),
    /engine/,
  );
  assert.throws(
    () => replayRunTrace(game, { ...trace, game: { ...trace.game, id: "other" } }),
    /different game/,
  );
  const edited = structuredClone(trace);
  edited.finalState.stats.supplies = 99;
  assert.throws(() => replayRunTrace(game, edited), /different state/);
  assert.throws(
    () =>
      replayRunTrace(game, {
        ...trace,
        interventions: [{ kind: "choice", side: "up" }],
      }),
    /invalid choice/,
  );
});
