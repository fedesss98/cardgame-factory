import test from "node:test";
import assert from "node:assert/strict";
import { allTags, parseTags, slugifyTag } from "./tags.ts";

test("tag slugs satisfy the game id format", () => {
  assert.equal(slugifyTag("Storm Warning"), "storm-warning");
  assert.equal(slugifyTag("  merchant / ally  "), "merchant-ally");
  assert.equal(slugifyTag("3 acts"), "tag-3-acts");
  assert.equal(slugifyTag("!!!"), "");
  assert.ok(/^[a-z][a-z0-9_-]{0,63}$/.test(slugifyTag("A".repeat(100))));
});

test("tags parse, deduplicate and collect across cards", () => {
  assert.deepEqual(parseTags("storm, Storm, 3 acts, ,"), [
    "storm",
    "tag-3-acts",
  ]);
  assert.deepEqual(
    allTags([
      { tags: ["storm", "ally"] },
      { tags: ["ally"] },
      {},
    ]),
    ["ally", "storm"],
  );
});
