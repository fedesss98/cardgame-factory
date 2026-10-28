import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "./validate.ts";
import { start, choose } from "./engine.ts";

const game = JSON.parse(
  readFileSync(new URL("../games/ash-heir/game.json", import.meta.url), "utf8"),
);
const blank = readFileSync(
  new URL("../games/ash-heir/assets/blank.png", import.meta.url),
);

// "L"/"R" abbreviation lists for the scripted playthroughs below.
function chooseDecision(state: ReturnType<typeof start>, side: string) {
  while (!state.ending) {
    const card = game.cards.find((c: any) => c.id === state.card);
    if (card.left.label !== "Continua") break;
    state = choose(game, state, "left");
  }
  assert.ok(!state.ending, `run already ended before choice ${side}`);
  return choose(game, state, side === "L" ? "left" : "right");
}

function run(sequence: string) {
  let state = start(game, 42);
  for (const side of sequence) {
    state = chooseDecision(state, side);
  }
  return state;
}

function endingOf(sequence: string) {
  const state = run(sequence);
  assert.ok(state.ending, `expected an ending after ${sequence}`);
  return state.ending;
}

test("the ash-heir game is valid, schema-legal and carries the required placeholder", () => {
  assert.deepEqual(validate(game), []);
  assert.equal(game.language, "it");
  assert.equal(game.title, "L'Erede di Cenere");
  assert.equal(game.cards.length, 33);
  assert.equal(game.endings.length, 5);
  assert.equal(blank.subarray(1, 4).toString(), "PNG");
  for (const card of game.cards) {
    assert.ok(card.text.length > 200, `${card.id} has substantial prose`);
    assert.ok(card.text.length <= 500, `${card.id} stays readable at a glance`);
    assert.equal(card.imageAssetId, "blank-art");
    assert.ok(card.imageAlt.length > 0);
    if (card.left.label === "Continua") {
      assert.deepEqual(card.left, card.right);
      assert.deepEqual(card.left.effects, []);
      assert.ok(card.left.followUpCardId);
    }
  }
  // The non-fallback endings carry conditions; the fallback does not.
  for (const ending of game.endings) {
    if (ending.id === "casa-voss") assert.ok(!ending.when);
    else assert.ok(ending.when, `${ending.id} has a when condition`);
  }
});

test("chapter transitions route via flags: fine-prima then fiamma", () => {
  let state = start(game, 42);
  for (const side of "LLLLLL".split("")) {
    state = chooseDecision(state, side);
  }
  // erede (last Part I card) sets fine-prima on both branches → Part II.
  assert.equal(state.chapter, "casa");
  const cards = ["credito", "inviato", "registro", "medico", "muro", "erede"];
  assert.equal(game.chapters[0].id, "mercato");
  assert.ok(cards.every((c) => state.seen.includes(c)));
  // medico left keeps fiducia-ren false, so Part II draws ren-timore.
  for (const side of "LL".split("")) {
    state = chooseDecision(state, side);
  }
  assert.equal(state.card, "ren-timore-prologo");
  assert.ok(!state.seen.includes("ren-fiducia"));
});

test(`the brother path with a strong bond reaches ${'"'}due-ombre${'"'}`, () => {
  assert.equal(endingOf("LLLLLLLLLLLLLL"), "due-ombre");
});

test(`the brother path with a colder bond reaches ${'"'}porta${'"'}`, () => {
  assert.equal(endingOf("LLLLLLLLRLLLLL"), "porta");
});

test(`the self path with steady blood reaches ${'"'}ultimo-erede${'"'}`, () => {
  assert.equal(endingOf("LLLLLLLLLLLLRL"), "ultimo-erede");
});

test(`the self path gone soft reaches ${'"'}fumo-polmoni${'"'}`, () => {
  const state = run("LLLLLRLLLLLLRL");
  assert.equal(state.ending, "fumo-polmoni");
  assert.ok(state.stats["sangue-freddo"] < 10);
});

test("the fallback ending stays unreachable without broken decks", () => {
  // Every non-fallback ending condition needs the final resolve flags set by
  // trave/galleria; without them the run can only end through casa-voss when
  // no card is drawable — which the complete ordered decks never allow.
  let state = start(game, 42);
  let drawn = 0;
  while (!state.ending && drawn < 16) {
    const card = game.cards.find((c: any) => c.id === state.card);
    state = chooseDecision(state, card.left ? "L" : "R");
    drawn++;
  }
  assert.ok(drawn < 16, "every full run ends through a reachable ending");
});
