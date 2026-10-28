// Changing gameplay semantics requires a new engine version. Playtest traces
// record it so a replay cannot silently use different rules.
export const ENGINE_VERSION = "1.0.0";
export type Game = any;
export type State = {
  stats: Record<string, number>;
  flags: Record<string, boolean>;
  chapter: string;
  turn: number;
  chapterTurn: number;
  seen: string[];
  chapterSeen: string[];
  cursors: Record<string, number>;
  seed: number;
  card?: string;
  ending?: string;
};
export function matches(c: any, s: State): boolean {
  if (!c) return true;
  const a = c.rules.map((r: any) => {
    const v =
      r.kind === "stat"
        ? s.stats[r.statId]
        : r.kind === "flag"
          ? s.flags[r.flagId]
          : r.scope === "run"
            ? s.turn
            : s.chapterTurn;
    return r.kind === "flag" || r.op === "eq"
      ? v === r.value
      : r.op === "lt"
        ? v < r.value
        : r.op === "lte"
          ? v <= r.value
          : r.op === "gt"
            ? v > r.value
            : v >= r.value;
  });
  return c.mode === "all" ? a.every(Boolean) : a.some(Boolean);
}
export type RunOptions = {
  deckId?: string;
  events?: string[];
  onTransition?: () => void;
};
function effects(g: Game, s: State, es: any[], events?: string[]) {
  for (const e of es) {
    if (e.kind === "setFlag") {
      s.flags[e.flagId] = e.value;
      events?.push(`Flag ${e.flagId} = ${e.value}`);
    } else {
      const t = g.stats.find((x: any) => x.id === e.statId);
      s.stats[t.id] = Math.max(t.min, Math.min(t.max, s.stats[t.id] + e.delta));
      events?.push(
        `${t.name}: ${e.delta >= 0 ? "+" : ""}${e.delta} → ${s.stats[t.id]} (clamped to ${t.min}–${t.max})`,
      );
    }
  }
}
function end(g: Game, s: State) {
  const id = g.endings
    .filter((e: any) => e.when && matches(e.when, s))
    .sort((a: any, b: any) => b.priority - a.priority)[0]?.id;
  if (id) s.ending = id;
  else delete s.ending;
}
export function eligible(c: any, s: State) {
  return (
    matches(c.when, s) &&
    !(c.repeat === "oncePerRun" && s.seen.includes(c.id)) &&
    !(c.repeat === "oncePerChapter" && s.chapterSeen.includes(c.id))
  );
}
function weighted(s: State, a: any[], w: (x: any) => number) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  let n = (s.seed / 4294967296) * a.reduce((t, x) => t + w(x), 0);
  return a.find((x) => (n -= w(x)) < 0) ?? a.at(-1);
}
function draw(g: Game, s: State, follow?: string, options: RunOptions = {}) {
  if (s.ending) return;
  let card = g.cards.find((c: any) => c.id === follow && eligible(c, s));
  if (follow)
    options.events?.push(
      `Follow-up ${follow}: ${card ? "accepted" : "ineligible"}`,
    );
  if (!card) {
    let ds = g.chapters
      .find((c: any) => c.id === s.chapter)
      .decks.filter(
        (d: any) =>
          (!options.deckId || d.deckId === options.deckId) &&
          matches(d.when, s),
      )
      .map((d: any) => ({
        entry: d,
        deck: g.decks.find((x: any) => x.id === d.deckId),
      }))
      .map((d: any) => ({
        ...d,
        candidates: d.deck.cards.filter((e: any) =>
          eligible(
            g.cards.find((c: any) => c.id === e.cardId),
            s,
          ),
        ),
      }))
      .filter((d: any) => d.candidates.length);
    if (ds.some((d: any) => d.candidates.some((c: any) => c.cardId !== s.card)))
      ds = ds
        .map((d: any) => ({
          ...d,
          candidates: d.candidates.filter((c: any) => c.cardId !== s.card),
        }))
        .filter((d: any) => d.candidates.length);
    if (!ds.length) {
      s.ending = g.fallbackEndingId;
      options.events?.push(`No eligible cards; fallback ending ${s.ending}`);
      return;
    }
    const d = weighted(s, ds, (d) => d.entry.weight);
    options.events?.push(
      `Draw from ${d.deck.name || d.deck.id} (${d.deck.mode}); immediate repeat avoided when alternatives exist`,
    );
    let id;
    if (d.deck.mode === "ordered") {
      const a = d.deck.cards;
      let i = s.cursors[d.deck.id] ?? 0;
      for (let n = 0; n < a.length; n++) {
        const j = (i + n) % a.length;
        if (d.candidates.some((c: any) => c.cardId === a[j].cardId)) {
          i = j;
          break;
        }
      }
      id = a[i].cardId;
      s.cursors[d.deck.id] = (i + 1) % a.length;
    } else id = weighted(s, d.candidates, (c) => c.weight).cardId;
    card = g.cards.find((c: any) => c.id === id);
  }
  s.card = card.id;
  options.events?.push(`Card: ${card.id}`);
  s.seen.push(card.id);
  s.chapterSeen.push(card.id);
}
export function initialState(
  g: Game,
  seed = 42,
  chapter = g.startChapterId,
  events?: string[],
  persistentFlags?: Record<string, boolean>,
): State {
  const s: State = {
    stats: Object.fromEntries(g.stats.map((x: any) => [x.id, x.initial])),
    flags: Object.fromEntries(
      g.flags.map((x: any) => [
        x.id,
        x.scope === "persistent" &&
        typeof persistentFlags?.[x.id] === "boolean"
          ? persistentFlags[x.id]
          : x.initial,
      ]),
    ),
    chapter,
    turn: 0,
    chapterTurn: 0,
    seen: [],
    chapterSeen: [],
    cursors: {},
    seed,
  };
  effects(
    g,
    s,
    g.chapters.find((c: any) => c.id === s.chapter).onEnter,
    events,
  );
  return s;
}
export function resolveState(
  g: Game,
  s: State,
  options: RunOptions = {},
  transitions = false,
  follow?: string,
  preserveCard = false,
): State {
  end(g, s);
  if (s.ending) {
    options.events?.push(`Ending: ${s.ending} (highest matching priority)`);
    return s;
  }
  const t =
    transitions &&
    g.chapters
      .find((c: any) => c.id === s.chapter)
      .transitions.find((t: any) => matches(t.when, s));
  if (t) {
    options.events?.push(
      `Transition: ${s.chapter} → ${t.toChapterId}; first matching rule`,
    );
    options.onTransition?.();
    s.chapter = t.toChapterId;
    s.chapterTurn = 0;
    s.chapterSeen = [];
    s.cursors = {};
    effects(
      g,
      s,
      g.chapters.find((c: any) => c.id === s.chapter).onEnter,
      options.events,
    );
    end(g, s);
    if (s.ending)
      options.events?.push(`Ending after chapter entry: ${s.ending}`);
  }
  if (!preserveCard || t || !s.card)
    draw(
      g,
      s,
      t ? undefined : follow,
      t ? { events: options.events } : options,
    );
  return s;
}
export function start(
  g: Game,
  seed = 42,
  persistentFlags?: Record<string, boolean>,
): State {
  return resolveState(g, initialState(g, seed, g.startChapterId, undefined, persistentFlags));
}
export function choose(
  g: Game,
  old: State,
  side: "left" | "right",
  options: RunOptions = {},
): State {
  const s = structuredClone(old);
  if (s.ending) return s;
  const c = g.cards.find((c: any) => c.id === s.card)[side];
  options.events?.push(`Choice ${side}: ${c.label}`);
  s.turn++;
  s.chapterTurn++;
  effects(g, s, c.effects, options.events);
  return resolveState(g, s, options, true, c.followUpCardId);
}
