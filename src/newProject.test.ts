import test from "node:test";
import assert from "node:assert/strict";
import { createBlankProject } from "./newProject.ts";
import { validateProject } from "./validate.ts";
import { choose, start } from "./engine.ts";
import { createProjectArchive } from "./projectArchive.ts";

const artwork =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0YQAAAAASUVORK5CYII=";

test("a blank project is valid, self-contained and free of example content", () => {
  const project = createBlankProject({ artwork });
  assert.equal(project.starter, true);
  assert.deepEqual(validateProject(project.game, project.images), []);
  assert.equal(project.game.stats.length, 1);
  assert.equal(project.game.flags.length, 0);
  assert.equal(project.game.cards.length, 1);
  assert.equal(project.game.decks.length, 1);
  assert.equal(project.game.chapters.length, 1);
  assert.equal(project.game.endings.length, 1);
  assert.equal(project.game.startChapterId, project.game.chapters[0].id);
  assert.equal(project.game.fallbackEndingId, project.game.endings[0].id);
  assert.ok(!JSON.stringify(project.game).toLowerCase().includes("harbor"));
  assert.ok(!JSON.stringify(project.game).toLowerCase().includes("ember"));
});

test("a blank project accepts wizard values and reaches its fallback ending", () => {
  const project = createBlankProject({
    artwork,
    title: "Glass Harbor",
    resourceName: "Focus",
    resourceInitial: 12,
    chapterName: "Arrival",
  });
  assert.equal(project.game.title, "Glass Harbor");
  assert.equal(project.game.stats[0].name, "Focus");
  assert.equal(project.game.stats[0].initial, 12);
  assert.equal(project.game.chapters[0].name, "Arrival");
  const first = start(project.game);
  assert.ok(first.card);
  const next = choose(project.game, first, "left");
  assert.equal(next.ending, project.game.fallbackEndingId);
});

test("a blank project exports as a complete backup", async () => {
  const project = createBlankProject({ artwork });
  const zip = await createProjectArchive(project, "backup");
  assert.ok(zip.file("game.json"));
  assert.ok(zip.file("assets/placeholder.png"));
});
