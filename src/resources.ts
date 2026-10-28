export type ResourceUse = {
  label: string;
  group: "cards" | "chapters" | "endings";
  id?: string;
};

export function newStat() {
  return {
    id: `stat-${crypto.randomUUID()}`,
    name: "New resource",
    min: 0,
    max: 100,
    initial: 50,
  };
}

function conditionUses(
  condition: any,
  statId: string,
  label: string,
  group: ResourceUse["group"],
  id: string | undefined,
  uses: ResourceUse[],
) {
  if (
    condition?.rules?.some(
      (rule: any) => rule.kind === "stat" && rule.statId === statId,
    )
  )
    uses.push({ label, group, id });
}

function effectsUse(
  effects: any[],
  statId: string,
  label: string,
  group: ResourceUse["group"],
  id: string | undefined,
  uses: ResourceUse[],
) {
  if (
    Array.isArray(effects) &&
    effects.some(
      (effect: any) => effect.kind === "statDelta" && effect.statId === statId,
    )
  )
    uses.push({ label, group, id });
}

export function statUses(game: any, statId: string): ResourceUse[] {
  const uses: ResourceUse[] = [];
  for (const card of game.cards ?? []) {
    conditionUses(
      card.when,
      statId,
      `Card “${card.character}” condition`,
      "cards",
      card.id,
      uses,
    );
    for (const side of ["left", "right"] as const)
      effectsUse(
        card[side]?.effects,
        statId,
        `Card “${card.character}” ${side} choice`,
        "cards",
        card.id,
        uses,
      );
  }
  for (const chapter of game.chapters ?? []) {
    effectsUse(
      chapter.onEnter,
      statId,
      `Chapter “${chapter.name}” entry`,
      "chapters",
      chapter.id,
      uses,
    );
    for (const entry of chapter.decks ?? []) {
      const deck = (game.decks ?? []).find((item: any) => item.id === entry.deckId);
      conditionUses(
        entry.when,
        statId,
        `Chapter “${chapter.name}” deck “${deck?.name ?? entry.deckId}” condition`,
        "chapters",
        chapter.id,
        uses,
      );
    }
    (chapter.transitions ?? []).forEach((transition: any, index: number) =>
      conditionUses(
        transition.when,
        statId,
        `Chapter “${chapter.name}” transition ${index + 1}`,
        "chapters",
        chapter.id,
        uses,
      ),
    );
  }
  for (const ending of game.endings ?? [])
    conditionUses(
      ending.when,
      statId,
      `Ending “${ending.title}” condition`,
      "endings",
      ending.id,
      uses,
    );
  return uses;
}

export function flagUses(game: any, flagId: string): ResourceUse[] {
  const uses: ResourceUse[] = [];
  for (const card of game.cards ?? []) {
    if (
      card.when?.rules?.some(
        (rule: any) => rule.kind === "flag" && rule.flagId === flagId,
      )
    )
      uses.push({
        label: `Card “${card.character}” condition`,
        group: "cards",
        id: card.id,
      });
    for (const side of ["left", "right"] as const)
      if (
        card[side]?.effects?.some(
          (effect: any) =>
            effect.kind === "setFlag" && effect.flagId === flagId,
        )
      )
        uses.push({
          label: `Card “${card.character}” ${side} choice`,
          group: "cards",
          id: card.id,
        });
  }
  for (const chapter of game.chapters ?? []) {
    if (
      chapter.onEnter?.some(
        (effect: any) =>
          effect.kind === "setFlag" && effect.flagId === flagId,
      )
    )
      uses.push({
        label: `Chapter “${chapter.name}” entry`,
        group: "chapters",
        id: chapter.id,
      });
    for (const entry of chapter.decks ?? []) {
      const deck = (game.decks ?? []).find(
        (item: any) => item.id === entry.deckId,
      );
      if (
        entry.when?.rules?.some(
          (rule: any) => rule.kind === "flag" && rule.flagId === flagId,
        )
      )
        uses.push({
          label: `Chapter “${chapter.name}” deck “${deck?.name ?? entry.deckId}” condition`,
          group: "chapters",
          id: chapter.id,
        });
    }
    (chapter.transitions ?? []).forEach((transition: any, index: number) => {
      if (
        transition.when?.rules?.some(
          (rule: any) => rule.kind === "flag" && rule.flagId === flagId,
        )
      )
        uses.push({
          label: `Chapter “${chapter.name}” transition ${index + 1}`,
          group: "chapters",
          id: chapter.id,
        });
    });
  }
  for (const ending of game.endings ?? [])
    if (
      ending.when?.rules?.some(
        (rule: any) => rule.kind === "flag" && rule.flagId === flagId,
      )
    )
      uses.push({
        label: `Ending “${ending.title}” condition`,
        group: "endings",
        id: ending.id,
      });
  return uses;
}

export function statDeletionReason(game: any, statId: string): string {
  if ((game.stats ?? []).length <= 1) return "Keep at least one resource.";
  const uses = statUses(game, statId);
  if (!uses.length) return "";
  return `This resource is used by ${uses.length} rule${
    uses.length === 1 ? "" : "s"
  }: ${uses
    .slice(0, 3)
    .map((use) => use.label)
    .join(", ")}${uses.length > 3 ? "…" : ""}. Remove those references first.`;
}
