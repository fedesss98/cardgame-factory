import {
  choose,
  initialState,
  resolveState,
  matches,
  eligible,
  type State,
  type Game,
} from "./engine.ts";
export type Overrides = {
  stats?: Record<string, number>;
  flags?: Record<string, boolean>;
  turn?: number;
  chapterTurn?: number;
};
export type Scenario = Overrides & {
  chapterId: string;
  deckId?: string;
  seed: number;
};
export type Frame = { state: State; deckId?: string; events: string[] };
function apply(g: Game, s: State, overrides: Overrides) {
  for (const [id, value] of Object.entries(overrides.stats || {})) {
    const stat = g.stats.find((x: any) => x.id === id);
    if (
      !stat ||
      !Number.isFinite(value) ||
      value < stat.min ||
      value > stat.max
    )
      throw Error(
        `Resource ${id} must be between ${stat?.min} and ${stat?.max}.`,
      );
    s.stats[id] = value;
  }
  for (const [id, value] of Object.entries(overrides.flags || {})) {
    if (!(id in s.flags) || typeof value !== "boolean")
      throw Error("Invalid flag override.");
    s.flags[id] = value;
  }
  for (const key of ["turn", "chapterTurn"] as const) {
    const value = overrides[key];
    if (value !== undefined) {
      if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000)
        throw Error(
          "Turn counters must be whole numbers from 0 to 1,000,000,000.",
        );
      s[key] = value;
    }
  }
}
export function startScenario(g: Game, scenario: Scenario): Frame {
  const chapter = g.chapters.find((c: any) => c.id === scenario.chapterId);
  if (!chapter) throw Error("Select a valid chapter.");
  if (
    scenario.deckId &&
    !chapter.decks.some((d: any) => d.deckId === scenario.deckId)
  )
    throw Error("Select a deck belonging to this chapter.");
  if (
    !Number.isInteger(scenario.seed) ||
    scenario.seed < 0 ||
    scenario.seed > 4294967295
  )
    throw Error("Seed must be a whole number from 0 to 4,294,967,295.");
  const events = [
    `Start chapter: ${chapter.name}; seed ${scenario.seed}. Earlier chapters were not simulated.`,
  ];
  const state = initialState(g, scenario.seed, chapter.id, events);
  apply(g, state, scenario);
  events.push("Test overrides applied after chapter entry effects.");
  resolveState(g, state, { deckId: scenario.deckId, events });
  return { state, deckId: scenario.deckId, events };
}
export function step(g: Game, frame: Frame, side: "left" | "right"): Frame {
  const events: string[] = [];
  let deckId = frame.deckId;
  const state = choose(g, frame.state, side, {
    deckId,
    events,
    onTransition: () => {
      deckId = undefined;
    },
  });
  return { state, deckId, events };
}
export function intervene(g: Game, frame: Frame, overrides: Overrides): Frame {
  const state = structuredClone(frame.state),
    events = ["Applied test overrides: " + JSON.stringify(overrides)];
  let deckId = frame.deckId;
  apply(g, state, overrides);
  state.ending = undefined;
  resolveState(
    g,
    state,
    {
      deckId,
      events,
      onTransition: () => {
        deckId = undefined;
      },
    },
    true,
    undefined,
    true,
  );
  events.push(
    "Endings/transitions reevaluated; current card retained unless a transition occurred. No choice or turn increment.",
  );
  return { state, deckId, events };
}
export function forceCard(g: Game, frame: Frame, id: string): Frame {
  if (!g.cards.some((c: any) => c.id === id)) throw Error("Choose a card.");
  const state = structuredClone(frame.state);
  state.card = id;
  state.ending = undefined;
  state.seen.push(id);
  state.chapterSeen.push(id);
  return {
    state,
    deckId: frame.deckId,
    events: [
      `FORCED card ${id}: bypassed conditions, membership, repeat limits and ending. No turn increment.`,
    ],
  };
}
export function eligibility(
  g: Game,
  frame: Frame,
): { deck: string; card: string; reason: string }[] {
  const s = frame.state;
  return g.chapters
    .find((c: any) => c.id === s.chapter)
    .decks.flatMap((entry: any) => {
      const deck = g.decks.find((d: any) => d.id === entry.deckId);
      return deck.cards.map((item: any) => {
        const card = g.cards.find((c: any) => c.id === item.cardId);
        const reasons = [];
        if (frame.deckId && frame.deckId !== deck.id)
          reasons.push("excluded by deck isolation");
        if (!matches(entry.when, s))
          reasons.push("chapter deck conditions are false");
        if (!matches(card.when, s)) reasons.push("card conditions are false");
        if (card.repeat === "oncePerRun" && s.seen.includes(card.id))
          reasons.push("already seen this run");
        if (card.repeat === "oncePerChapter" && s.chapterSeen.includes(card.id))
          reasons.push("already seen this chapter visit");
        if (!reasons.length && eligible(card, s) && card.id === s.card)
          reasons.push(
            "eligible, but immediate repeat avoided if alternatives exist",
          );
        return {
          deck: deck.name || deck.id,
          card: `${card.character}: ${card.id}`,
          reason: reasons.join("; ") || "eligible for next draw",
        };
      });
    });
}
