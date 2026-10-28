export type Comparison = "eq" | "lt" | "lte" | "gt" | "gte";
export type Predicate =
  | { kind: "stat"; statId: string; op: Comparison; value: number }
  | { kind: "flag"; flagId: string; value: boolean }
  | { kind: "turn"; scope: "run" | "chapter"; op: Comparison; value: number };
export type Condition = { mode: "all" | "any"; rules: Predicate[] };
export type Effect =
  | { kind: "statDelta"; statId: string; delta: number }
  | { kind: "setFlag"; flagId: string; value: boolean };
export type StoryGroup = "decks" | "chapters" | "flags" | "endings";

export const defaultCondition = (): Condition => ({
  mode: "all",
  rules: [{ kind: "turn", scope: "chapter", op: "gte", value: 5 }],
});

export function move<T>(items: T[], index: number, offset: number): T[] {
  const next = [...items],
    target = index + offset;
  if (
    index < 0 ||
    index >= items.length ||
    target < 0 ||
    target >= items.length
  )
    return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function newStoryItem(g: any, group: StoryGroup, id: string): any {
  switch (group) {
    case "decks":
      return {
        id,
        name: "New deck",
        mode: "ordered",
        cards: [{ cardId: g.cards[0].id, weight: 1 }],
      };
    case "chapters":
      return {
        id,
        name: "New chapter",
        onEnter: [],
        decks: [{ deckId: g.decks[0].id, weight: 1 }],
        transitions: [],
      };
    case "flags":
      return { id, name: "New story flag", initial: false, scope: "run" };
    case "endings":
      return {
        id,
        title: "New ending",
        text: "How does this story end?",
        priority: Math.max(...g.endings.map((e: any) => e.priority)) + 1,
        when: defaultCondition(),
      };
  }
}

export function deletionReason(g: any, group: StoryGroup, id: string): string {
  if (group === "endings")
    return id === g.fallbackEndingId
      ? "The fallback ending is required. You can edit its title and story."
      : "";
  if (group === "chapters") {
    if (g.startChapterId === id)
      return "Choose a different starting chapter before deleting this one.";
    const source = g.chapters.find(
      (c: any) =>
        c.id !== id && c.transitions.some((t: any) => t.toChapterId === id),
    );
    return source ? `Remove the transition from “${source.name}” first.` : "";
  }
  if (group === "decks") {
    const source = g.chapters.find((c: any) =>
      c.decks.some((d: any) => d.deckId === id),
    );
    return source ? `Remove this deck from “${source.name}” first.` : "";
  }
  const used = (o: any): boolean =>
    o !== null &&
    typeof o === "object" &&
    (o.flagId === id || Object.values(o).some(used));
  return used(g)
    ? "Remove this flag from conditions and effects before deleting it."
    : "";
}

// Mutators keep references stable; labels can be freely renamed in the editor.
export function deleteStoryItem(
  g: any,
  group: StoryGroup,
  id: string,
): boolean {
  if (deletionReason(g, group, id)) return false;
  g[group] = g[group].filter((item: any) => item.id !== id);
  return true;
}

export function setDeckMode(deck: any, mode: "weighted" | "ordered") {
  deck.mode = mode;
  if (mode === "ordered")
    deck.cards.forEach((c: any) => {
      c.weight = 1;
    });
}

export function setOptional(o: any, key: string, value: unknown) {
  if (value === undefined || value === "") delete o[key];
  else o[key] = value;
}
