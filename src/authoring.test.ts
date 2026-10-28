import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deleteStoryItem,
  deletionReason,
  move,
  newStoryItem,
  setDeckMode,
  setOptional,
} from "./authoring.ts";
import { validate } from "./validate.ts";
import { start, choose } from "./engine.ts";
const sample = JSON.parse(
  readFileSync(
    new URL("../examples/harbor/game.json", import.meta.url),
    "utf8",
  ),
);

test("empty resource names explain where to fix a failed save", () => {
  const g = structuredClone(sample);
  g.stats[1].name = "";
  assert.equal(
    validate(g)[0],
    "Resource 2 needs a name. Open Game settings → Resources to add one.",
  );
});

test("all new story entities satisfy the existing export contract", () => {
  const g = structuredClone(sample);
  for (const group of ["decks", "chapters", "flags", "endings"] as const) {
    g[group].push(newStoryItem(g, group, "new-" + group));
    assert.deepEqual(validate(g), []);
  }
});

test("deletion protects references and permits removing unused structure", () => {
  const g = structuredClone(sample);
  for (const [group, id] of [
    ["decks", "preparation"],
    ["chapters", "prepare"],
    ["chapters", "weather"],
    ["flags", "merchant-helped"],
    ["endings", "no-events"],
  ] as const) {
    assert.ok(deletionReason(g, group, id));
    assert.equal(deleteStoryItem(g, group, id), false);
  }
  g.flags.push(newStoryItem(g, "flags", "unused"));
  assert.equal(deleteStoryItem(g, "flags", "unused"), true);
  g.chapters[0].transitions = [];
  assert.equal(deleteStoryItem(g, "chapters", "weather"), true);
  assert.equal(deleteStoryItem(g, "decks", "storm-deck"), true);
  assert.deepEqual(validate(g), []);
});

test("ordered mode resets weights; optional conditions are omitted from serialized output", () => {
  const g = structuredClone(sample);
  g.decks[0].cards[0].weight = 7;
  setDeckMode(g.decks[0], "ordered");
  assert.equal(g.decks[0].cards[0].weight, 1);
  setOptional(g.cards[1], "when", undefined);
  assert.equal("when" in g.cards[1], false);
  assert.deepEqual(validate(g), []);
});

test("semantic validation catches rules rejected by the shared backend", () => {
  const fixtures: [string, (g: any) => void][] = [
    [
      "priorities",
      (g) => {
        g.endings[1].priority = g.endings[0].priority;
      },
    ],
    [
      "cannot have conditions",
      (g) => {
        g.endings[2].when = g.endings[0].when;
      },
    ],
    [
      "needs conditions",
      (g) => {
        delete g.endings[0].when;
      },
    ],
    [
      "weight 1",
      (g) => {
        g.decks[0].cards[0].weight = 5;
      },
    ],
    [
      "card can only",
      (g) => {
        g.decks[0].cards.push(g.decks[0].cards[0]);
      },
    ],
    [
      "deck can only",
      (g) => {
        g.chapters[0].decks.push(g.chapters[0].decks[0]);
      },
    ],
    [
      "paths must be unique",
      (g) => {
        g.assets.push({ ...g.assets[0], id: "duplicate-path" });
      },
    ],
    [
      "Wrong asset kind",
      (g) => {
        g.assets[0].kind = "font";
      },
    ],
    [
      "Unknown flagId",
      (g) => {
        g.flags = [];
      },
    ],
  ];
  for (const [message, edit] of fixtures) {
    const g = structuredClone(sample);
    edit(g);
    assert.ok(
      validate(g).some((e) => e.includes(message)),
      message,
    );
  }
});

test("reordering effects preserves clamping order instead of summing deltas", () => {
  const g = structuredClone(sample);
  g.cards[0].left.effects = [
    { kind: "statDelta", statId: "supplies", delta: 100 },
    { kind: "statDelta", statId: "supplies", delta: -20 },
  ];
  assert.equal(choose(g, start(g), "left").stats.supplies, 80);
  g.cards[0].left.effects = move(g.cards[0].left.effects, 1, -1);
  assert.equal(choose(g, start(g), "left").stats.supplies, 100);
});

// Uses the same condition/effect shapes produced by the visual controls.
function threeChapterGame() {
  const g = structuredClone(sample);
  const condition = (flagId: string, value: boolean) => ({
    mode: "all",
    rules: [{ kind: "flag", flagId, value }],
  });
  const turns = {
    mode: "all",
    rules: [{ kind: "turn", scope: "chapter", op: "gte", value: 1 }],
  };
  g.cards.forEach((c: any) => {
    c.left.effects = [];
    c.right.effects = [];
    c.repeat = "unlimited";
    delete c.when;
    delete c.right.followUpCardId;
  });
  g.cards[0].right.effects = [
    { kind: "setFlag", flagId: "merchant-helped", value: true },
  ];
  // This old-chapter follow-up must lose to the transition.
  g.cards[0].right.followUpCardId = "storm";
  g.decks = [
    {
      id: "intro",
      name: "Intro",
      mode: "ordered",
      cards: [{ cardId: "merchant", weight: 1 }],
    },
    {
      id: "helped",
      name: "Helped",
      mode: "weighted",
      cards: [{ cardId: "thanks", weight: 3 }],
    },
    {
      id: "alone",
      name: "Alone",
      mode: "ordered",
      cards: [{ cardId: "watch", weight: 1 }],
    },
    {
      id: "final",
      name: "Final",
      mode: "ordered",
      cards: [{ cardId: "storm", weight: 1 }],
    },
  ];
  g.chapters = [
    {
      id: "intro",
      name: "Intro",
      onEnter: [],
      decks: [{ deckId: "intro", weight: 1 }],
      transitions: [{ when: turns, toChapterId: "branch" }],
    },
    {
      id: "branch",
      name: "Branch",
      onEnter: [{ kind: "statDelta", statId: "supplies", delta: 5 }],
      decks: [
        {
          deckId: "helped",
          weight: 1,
          when: condition("merchant-helped", true),
        },
        {
          deckId: "alone",
          weight: 1,
          when: condition("merchant-helped", false),
        },
      ],
      transitions: [{ when: turns, toChapterId: "final" }],
    },
    {
      id: "final",
      name: "Final",
      onEnter: [],
      decks: [{ deckId: "final", weight: 1 }],
      transitions: [],
    },
  ];
  g.startChapterId = "intro";
  g.cards[3].left.effects = [
    { kind: "setFlag", flagId: "storm-resolved", value: true },
  ];
  g.endings[0].when = {
    mode: "all",
    rules: [
      ...condition("storm-resolved", true).rules,
      ...condition("merchant-helped", true).rules,
    ],
  };
  return g;
}

test("three chapters use a flag-gated deck, entry effects, and highest-priority ending", () => {
  const g = threeChapterGame();
  assert.deepEqual(validate(g), []);
  let s = choose(g, start(g), "right");
  assert.equal(s.chapter, "branch");
  assert.equal(s.card, "thanks");
  assert.equal(s.chapterTurn, 0);
  assert.equal(s.stats.supplies, 55);
  s = choose(g, s, "left");
  assert.equal(s.chapter, "final");
  s = choose(g, s, "left");
  assert.equal(s.ending, "empty-stores");
  let alternative = choose(g, start(g), "left");
  assert.equal(alternative.card, "watch");
  alternative = choose(g, choose(g, alternative, "left"), "left");
  assert.equal(alternative.ending, "survived");
});

test("transition ordering selects the first match and chapter visits reset repeat eligibility", () => {
  const g = threeChapterGame();
  g.cards[0].repeat = "oncePerChapter";
  g.chapters[0].transitions.push({
    ...g.chapters[0].transitions[0],
    toChapterId: "intro",
  });
  assert.equal(choose(g, start(g), "left").chapter, "branch");
  g.chapters[0].transitions = move(g.chapters[0].transitions, 1, -1);
  const s = choose(g, start(g), "left");
  assert.equal(s.chapter, "intro");
  assert.equal(s.card, "merchant");
  assert.equal(s.ending, undefined);
  assert.deepEqual(s.chapterSeen, ["merchant"]);
});
