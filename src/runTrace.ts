import { ENGINE_VERSION, type Game, type State } from "./engine.ts";
import { contentFingerprint, stableStringify } from "./fingerprint.ts";
import {
  startScenario,
  step,
  intervene,
  forceCard,
  type Frame,
  type Overrides,
  type Scenario,
} from "./playSession.ts";

export const RUN_TRACE_FORMAT = "game-factory-playtest-run";
export const RUN_TRACE_VERSION = 1;

export type TraceIntervention =
  | { kind: "choice"; side: "left" | "right" }
  | { kind: "overrides"; overrides: Overrides }
  | { kind: "force"; cardId: string };

export type TraceGame = {
  id: string;
  schemaVersion: string;
  contentVersion: number;
  saveCompatibilityVersion: number;
  contentFingerprint: string;
};

export type RunTrace = {
  format: typeof RUN_TRACE_FORMAT;
  traceVersion: number;
  engineVersion: string;
  game: TraceGame;
  source: "shared-revision" | "local-draft";
  revision: number | null;
  label: string;
  scenario: Scenario;
  interventions: TraceIntervention[];
  events: string[];
  finalState: State;
  createdAt: string;
};

export type ReplayedRun = {
  frames: Frame[];
  interventions: TraceIntervention[];
};

function traceGame(g: Game): TraceGame {
  return {
    id: g.id,
    schemaVersion: g.schemaVersion,
    contentVersion: g.contentVersion,
    saveCompatibilityVersion: g.saveCompatibilityVersion,
    contentFingerprint: contentFingerprint(g),
  };
}

function applyInterventions(
  g: Game,
  scenario: Scenario,
  interventions: TraceIntervention[],
): Frame[] {
  const frames: Frame[] = [startScenario(g, scenario)];
  for (const action of interventions) {
    const previous = frames[frames.length - 1];
    if (action.kind === "choice") frames.push(step(g, previous, action.side));
    else if (action.kind === "overrides")
      frames.push(intervene(g, previous, action.overrides));
    else frames.push(forceCard(g, previous, action.cardId));
  }
  return frames;
}

export function createRunTrace({
  game,
  scenario,
  interventions,
  frames,
  revision,
  label,
}: {
  game: Game;
  scenario: Scenario;
  interventions: TraceIntervention[];
  frames: Frame[];
  revision?: number | null;
  label?: string;
}): RunTrace {
  const displayed = frames.at(-1);
  if (!displayed) throw Error("Start a playtest before sharing a run trace.");
  const replayed = applyInterventions(game, scenario, interventions);
  const final = replayed.at(-1)!;
  if (stableStringify(final.state) !== stableStringify(displayed.state))
    throw Error(
      "The displayed playtest state does not match the intervention log. Start a new test before sharing.",
    );
  return {
    format: RUN_TRACE_FORMAT,
    traceVersion: RUN_TRACE_VERSION,
    engineVersion: ENGINE_VERSION,
    game: traceGame(game),
    source: revision == null ? "local-draft" : "shared-revision",
    revision: revision ?? null,
    label: label || (revision == null ? "Local draft" : `Revision ${revision}`),
    scenario: structuredClone(scenario),
    interventions: structuredClone(interventions),
    events: replayed.flatMap((frame) => frame.events),
    finalState: structuredClone(final.state),
    createdAt: new Date().toISOString(),
  };
}

function traceError(message: string): never {
  throw Error(`Cannot replay this run trace: ${message}`);
}

function validateIntervention(value: any, index: number) {
  if (!value || typeof value !== "object")
    traceError(`intervention ${index + 1} is not an object.`);
  if (value.kind === "choice") {
    if (value.side !== "left" && value.side !== "right")
      traceError(`intervention ${index + 1} has an invalid choice.`);
    return;
  }
  if (value.kind === "overrides") {
    if (!value.overrides || typeof value.overrides !== "object")
      traceError(`intervention ${index + 1} has no overrides.`);
    return;
  }
  if (value.kind === "force") {
    if (typeof value.cardId !== "string" || !value.cardId)
      traceError(`intervention ${index + 1} has no card to force.`);
    return;
  }
  traceError(`intervention ${index + 1} has an unknown kind.`);
}

export function validateRunTrace(g: Game, trace: any): asserts trace is RunTrace {
  if (!trace || typeof trace !== "object")
    traceError("the file is not a run trace.");
  if (trace.format !== RUN_TRACE_FORMAT)
    traceError("the file is not a Game Factory playtest run.");
  if (trace.traceVersion !== RUN_TRACE_VERSION)
    traceError("the trace version is not supported.");
  if (trace.engineVersion !== ENGINE_VERSION)
    traceError(
      `it was recorded with engine ${trace.engineVersion || "unknown"}; this player uses ${ENGINE_VERSION}.`,
    );
  if (!trace.game || typeof trace.game !== "object")
    traceError("the trace has no game identity.");
  if (trace.game.id !== g.id)
    traceError("it belongs to a different game.");
  if (trace.game.saveCompatibilityVersion !== g.saveCompatibilityVersion)
    traceError("the save compatibility version changed.");
  const fingerprint = contentFingerprint(g);
  if (trace.game.contentFingerprint !== fingerprint)
    traceError(
      "the game content changed since the run was recorded. Open the matching revision or local draft first.",
    );
  if (!trace.scenario || typeof trace.scenario !== "object")
    traceError("the trace has no scenario.");
  if (!Array.isArray(trace.interventions))
    traceError("the trace has no intervention log.");
  if (trace.interventions.length > 10000)
    traceError("the intervention log is too long.");
  trace.interventions.forEach(validateIntervention);
  if (!trace.finalState || typeof trace.finalState !== "object")
    traceError("the trace has no final state.");
}

export function replayRunTrace(g: Game, trace: any): ReplayedRun {
  validateRunTrace(g, trace);
  const frames = applyInterventions(g, trace.scenario, trace.interventions);
  const final = frames.at(-1)!;
  if (stableStringify(final.state) !== stableStringify(trace.finalState))
    traceError(
      "replaying the recorded choices produced a different state. The trace may be incomplete or edited.",
    );
  return {
    frames,
    interventions: trace.interventions.map((action: TraceIntervention) =>
      structuredClone(action),
    ),
  };
}
