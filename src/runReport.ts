import type { Game } from "./engine.ts";
import type { Frame } from "./playSession.ts";

export type ChoiceRecord = {
  step: number;
  chapter: string;
  card?: string;
  character?: string;
  side?: "left" | "right";
  label: string;
  ending?: string;
};

export type DeadEnd = {
  step: number;
  chapter: string;
  card?: string;
  reason: string;
};

export type RunReport = {
  errors: string[];
  steps: number;
  choices: ChoiceRecord[];
  coverage: {
    cards: string[];
    chapters: string[];
    endings: string[];
  };
  unreached: {
    cards: string[];
    chapters: string[];
    endings: string[];
  };
  deadEnds: DeadEnd[];
  fallbackEndingId: string;
};

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

// Derive a lean, deterministic report from retained playtest frames. It reports
// observed coverage only; it does not claim that unreached content is impossible.
export function buildRunReport(
  game: Game,
  frames: Frame[],
  errors: string[] = [],
): RunReport {
  const knownCards = new Set(game.cards.map((card: any) => card.id));
  const knownChapters = new Set(game.chapters.map((chapter: any) => chapter.id));
  const knownEndings = new Set(game.endings.map((ending: any) => ending.id));
  const cards = new Set<string>();
  const chapters = new Set<string>();
  const endings = new Set<string>();
  const choices: ChoiceRecord[] = [];
  const deadEnds: DeadEnd[] = [];

  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    const state = frame.state;
    if (knownChapters.has(state.chapter)) chapters.add(state.chapter);
    for (const id of state.seen) if (knownCards.has(id)) cards.add(id);
    if (state.card && knownCards.has(state.card)) cards.add(state.card);
    if (state.ending && knownEndings.has(state.ending))
      endings.add(state.ending);

    const previous = frames[index - 1];
    const choiceEvent = frame.events.find((event) =>
      /^Choice (left|right): /.test(event),
    );
    if (choiceEvent && previous) {
      const match = choiceEvent.match(/^Choice (left|right): (.*)$/);
      const card = previous.state.card;
      choices.push({
        step: index,
        chapter: previous.state.chapter,
        ...(card ? { card } : {}),
        ...(card
          ? {
              character: game.cards.find((candidate: any) => candidate.id === card)
                ?.character,
            }
          : {}),
        ...(match?.[1] === "left" || match?.[1] === "right"
          ? { side: match[1] }
          : {}),
        label: match?.[2] || "Choice",
        ...(state.ending ? { ending: state.ending } : {}),
      });
    }

    for (const event of frame.events) {
      if (/No eligible cards; fallback ending/.test(event))
        deadEnds.push({
          step: index,
          chapter: state.chapter,
          ...(state.card ? { card: state.card } : {}),
          reason: event,
        });
    }
  }

  const coverage = {
    cards: Array.from(cards),
    chapters: Array.from(chapters),
    endings: Array.from(endings),
  };
  return {
    errors: [...errors],
    steps: frames.length,
    choices,
    coverage,
    unreached: {
      cards: unique(
        game.cards
          .map((card: any) => card.id)
          .filter((id: string) => !cards.has(id)),
      ),
      chapters: unique(
        game.chapters
          .map((chapter: any) => chapter.id)
          .filter((id: string) => !chapters.has(id)),
      ),
      endings: unique(
        game.endings
          .map((ending: any) => ending.id)
          .filter((id: string) => !endings.has(id)),
      ),
    },
    deadEnds,
    fallbackEndingId: game.fallbackEndingId,
  };
}
