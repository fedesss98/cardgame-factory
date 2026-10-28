import { test } from "node:test";
import assert from "node:assert";
import { diffProjects } from "./projectDiff.ts";

// The helper returns `any` on purpose: diff logic is shape-tolerant like the editor.
/* eslint-disable */
const game = (overrides: any = {}): any => ({
  schemaVersion: "https://example.invalid/game/v1",
  contentVersion: 1,
  title: "Harbor",
  fallbackEndingId: "peace",
  assets: [{ id: "art", kind: "image", path: "art.png" }],
  stats: [{ id: "gold", min: 0, max: 10, initial: 5 }],
  flags: [],
  cards: [
    { id: "c1", text: "Old text", choices: [] },
    { id: "c2", text: "Keep", choices: [] },
  ],
  decks: [],
  chapters: [],
  endings: [],
  ...overrides,
});

test("identical snapshots produce no differences", () => {
  const diff = diffProjects(game(), {}, game(), {});
  assert.equal(diff.entries.length, 0);
  assert.deepEqual({ added: diff.added, removed: diff.removed, changed: diff.changed }, { added: 0, removed: 0, changed: 0 });
});

test("added, removed and changed cards are detected with field detail", () => {
  const before = game();
  const after = game();
  after.cards = [
    { id: "c1", text: "New text", choices: [] },
    { id: "c3", text: "Arrives", choices: [] },
  ];
  const diff = diffProjects(before, {}, after, {});
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  assert.equal(diff.changed, 1);
  const changedEntry = diff.entries.find((e) => e.change === "changed");
  assert.ok(changedEntry);
  assert.equal(changedEntry!.group, "cards");
  assert.equal(changedEntry!.id, "c1");
  assert.deepEqual(changedEntry!.fields!.map((f) => f.field), ["text"]);
});

test("complex fields are reported as one summarized field", () => {
  const before = game();
  const after = game();
  after.cards = [
    { id: "c1", text: "Old text", choices: [{ prompt: "Board", effects: [] }] },
    { id: "c2", text: "Keep", choices: [] },
  ];
  const diff = diffProjects(before, {}, after, {});
  const field = diff.entries[0].fields![0];
  assert.equal(field.field, "choices");
});

test("top-level scalars outside groups become one settings entry", () => {
  const diff = diffProjects(game(), {}, game({ title: "Harbor II" }), {});
  assert.equal(diff.entries.length, 1);
  assert.equal(diff.entries[0].group, "settings");
  assert.equal(diff.entries[0].fields![0].field, "title");
});

test("engine bookkeeping keys are never reported", () => {
  const diff = diffProjects(game(), {}, game({ schemaVersion: "other" }), {});
  assert.equal(diff.entries.length, 0);
});

test("images are compared by id and bytes", () => {
  const before = { a: "data:image/png;base64,AAAA", b: "data:image/png;base64,BBBB" };
  const after = { a: "data:image/png;base64,AAAA", b: "data:image/png;base64,CCCC", c: "data:image/png;base64,EEEE" };
  const diff = diffProjects(game(), before, game(), after);
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 0);
  assert.equal(diff.changed, 1);
  assert.ok(diff.entries.find((e) => e.group === "images" && e.id === "c" && e.change === "added"));
  assert.ok(diff.entries.find((e) => e.group === "images" && e.id === "b" && e.change === "changed"));
});

test("null snapshots are treated as empty", () => {
  const diff = diffProjects(null, null, game(), {});
  assert.ok(diff.entries.length > 0);
});
