import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "./validate.ts";
import { contentFingerprint } from "./fingerprint.ts";

const examples = [
  {
    name: "harbor",
    game: JSON.parse(
      readFileSync(
        new URL("../examples/harbor/game.json", import.meta.url),
        "utf8",
      ),
    ),
    image: readFileSync(
      new URL("../examples/harbor/assets/harbor.png", import.meta.url),
    ),
  },
  {
    name: "ember",
    game: JSON.parse(
      readFileSync(
        new URL("../examples/ember/game.json", import.meta.url),
        "utf8",
      ),
    ),
    image: readFileSync(
      new URL("../examples/ember/assets/ember.png", import.meta.url),
    ),
  },
];

test("both example games are valid, visually distinct and have real images", () => {
  for (const example of examples) {
    assert.deepEqual(validate(example.game), [], example.name);
    assert.equal(example.image.subarray(1, 4).toString(), "PNG");
    assert.ok(example.image.length > 100);
  }
  const [harbor, ember] = examples;
  assert.notDeepEqual(harbor.game.theme, ember.game.theme);
  assert.notEqual(
    contentFingerprint(harbor.game),
    contentFingerprint(ember.game),
  );
});
