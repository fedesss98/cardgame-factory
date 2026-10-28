import test from "node:test";
import assert from "node:assert/strict";
import { createBlankProject } from "./newProject.ts";
import {
  flagUses,
  newStat,
  statDeletionReason,
  statUses,
} from "./resources.ts";
import { assetUses } from "./imageAssets.ts";

const artwork =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0YQAAAAASUVORK5CYII=";

test("resource usage finds card, chapter and ending references", () => {
  const { game } = createBlankProject({ artwork });
  const statId = game.stats[0].id;
  game.cards[0].when = {
    mode: "all",
    rules: [{ kind: "stat", statId, op: "gte", value: 50 }],
  };
  game.cards[0].left.effects = [{ kind: "statDelta", statId, delta: -5 }];
  game.chapters[0].onEnter = [{ kind: "statDelta", statId, delta: 5 }];
  game.chapters[0].transitions = [
    {
      when: { mode: "all", rules: [{ kind: "stat", statId, op: "lte", value: 10 }] },
      toChapterId: game.chapters[0].id,
    },
  ];
  game.endings[0].when = {
    mode: "all",
    rules: [{ kind: "stat", statId, op: "lte", value: 0 }],
  };
  const labels = statUses(game, statId).map((use) => use.label);
  assert.ok(labels.some((label) => label.includes("condition")));
  assert.ok(labels.some((label) => label.includes("left choice")));
  assert.ok(labels.some((label) => label.includes("entry")));
  assert.ok(labels.some((label) => label.includes("transition 1")));
  assert.ok(labels.some((label) => label.includes("Ending")));
  game.stats.push(newStat());
  assert.match(statDeletionReason(game, statId), /Remove those references first/);
});

test("a resource icon counts as a real image use", () => {
  const { game } = createBlankProject({ artwork });
  const assetId = game.assets[0].id;
  game.stats[0].iconAssetId = assetId;
  assert.ok(
    assetUses(game, assetId).some((use) => use.label === "Resource: Resolve"),
  );
});

test("flag usage finds conditions and effects across the story", () => {
  const { game } = createBlankProject({ artwork });
  game.flags.push({
    id: "flag-tested",
    name: "Tested",
    initial: false,
    scope: "run",
  });
  const flagId = "flag-tested";
  game.cards[0].when = {
    mode: "all",
    rules: [{ kind: "flag", flagId, value: true }],
  };
  game.cards[0].right.effects = [{ kind: "setFlag", flagId, value: true }];
  game.chapters[0].onEnter = [{ kind: "setFlag", flagId, value: true }];
  game.chapters[0].decks[0].when = {
    mode: "all",
    rules: [{ kind: "flag", flagId, value: true }],
  };
  game.chapters[0].transitions = [
    {
      when: {
        mode: "all",
        rules: [{ kind: "flag", flagId, value: true }],
      },
      toChapterId: game.chapters[0].id,
    },
  ];
  game.endings[0].when = {
    mode: "all",
    rules: [{ kind: "flag", flagId, value: true }],
  };
  const labels = flagUses(game, flagId).map((use) => use.label);
  assert.ok(labels.some((label) => label.includes("condition")));
  assert.ok(labels.some((label) => label.includes("right choice")));
  assert.ok(labels.some((label) => label.includes("entry")));
  assert.ok(labels.some((label) => label.includes("deck")));
  assert.ok(labels.some((label) => label.includes("transition 1")));
  assert.ok(labels.some((label) => label.includes("Ending")));
});

test("an unused resource can be removed while the last one is protected", () => {
  const { game } = createBlankProject({ artwork });
  game.stats.push(newStat());
  assert.equal(statDeletionReason(game, game.stats[0].id), "");
  assert.equal(statDeletionReason(game, game.stats[1].id), "");
  game.stats.pop();
  assert.match(statDeletionReason(game, game.stats[0].id), /Keep at least one/);
});
