import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const fixture = JSON.parse(await readFile(".build/test-fixture.json", "utf8"));
const game = JSON.parse(await readFile("examples/harbor/game.json", "utf8"));
const images = {
  "harbor-art":
    "data:image/png;base64," +
    (await readFile("examples/harbor/assets/harbor.png")).toString("base64"),
};
const base = "http://127.0.0.1:8789/index.php";
let checks = 0;
function client() {
  let cookie = "",
    csrf = "";
  return {
    async call(action, body, params = {}, status = 200, overrides = {}) {
      const url = new URL(base);
      url.search = new URLSearchParams({ action, ...params });
      const headers = {
        Cookie: cookie,
        Origin: "http://127.0.0.1:5174",
        ...(body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": csrf }),
        ...overrides,
      };
      const r = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const sc = r.headers.get("set-cookie");
      if (sc) cookie = sc.split(";")[0];
      const result = await r.json();
      assert.equal(r.status, status, `${action}: ${JSON.stringify(result)}`);
      if (result.csrf) csrf = result.csrf;
      checks++;
      return result;
    },
  };
}
const admin = client(),
  editor = client(),
  viewer = client(),
  stranger = client();
await admin.call("session");
await admin.call("setup", {
  token: fixture.token,
  email: "admin@example.test",
  display_name: "Test owner",
  password: "Test-owner-password-123",
});
await admin.call(
  "setup",
  {
    token: fixture.token,
    email: "other@example.test",
    display_name: "Other",
    password: "Test-owner-password-123",
  },
  {},
  409,
);
for (const name of ["editor", "viewer", "stranger"])
  await admin.call(
    "users",
    {
      email: `${name}@example.test`,
      display_name: name,
      password: `Test-${name}-password-123`,
    },
    {},
    201,
  );
for (const [c, name] of [
  [editor, "editor"],
  [viewer, "viewer"],
  [stranger, "stranger"],
]) {
  await c.call("session");
  await c.call("login", {
    email: `${name}@example.test`,
    password: `Test-${name}-password-123`,
  });
}
await stranger.call("users", undefined, {}, 403);
const payload = { id: "", expected_revision: 0, game, images };
await admin.call("save", payload, {}, 403, { "X-CSRF-Token": "wrong" });
await admin.call("save", payload, {}, 403, {
  Origin: "https://untrusted.example",
});
const created = await admin.call("save", payload, {}, 201),
  id = created.remote.id;
const loaded = (await admin.call("load", undefined, { id })).project;
assert.deepEqual(loaded.game, game);
assert.deepEqual(loaded.images, images);
await stranger.call("load", undefined, { id }, 404);
await stranger.call("history", undefined, { id }, 404);
await admin.call("members", {
  id,
  email: "editor@example.test",
  role: "editor",
});
await admin.call("members", {
  id,
  email: "viewer@example.test",
  role: "viewer",
});
assert.equal(
  (await viewer.call("load", undefined, { id })).project.remote.role,
  "viewer",
);
await viewer.call("save", { ...payload, id, expected_revision: 1 }, {}, 403);
await editor.call(
  "members",
  { id, email: "stranger@example.test", role: "editor" },
  {},
  403,
);
const changed = structuredClone(game);
changed.title = "Revision two";
await editor.call(
  "save",
  { ...payload, id, expected_revision: 1, game: changed },
  {},
  201,
);
await admin.call("save", { ...payload, id, expected_revision: 1 }, {}, 409);
assert.equal(
  (await admin.call("load", undefined, { id })).project.game.title,
  "Revision two",
);
assert.equal(
  (await admin.call("load", undefined, { id, revision: "1" })).project.game
    .title,
  game.title,
);
assert.equal(
  (await admin.call("history", undefined, { id })).revisions.length,
  2,
);
const invalid = structuredClone(game);
invalid.cards[0].left.followUpCardId = "missing";
await editor.call(
  "save",
  { ...payload, id, expected_revision: 2, game: invalid },
  {},
  422,
);
const unsafe = structuredClone(game);
unsafe.assets[0].path = "assets/../../bad.php";
await editor.call(
  "save",
  { ...payload, id, expected_revision: 2, game: unsafe },
  {},
  422,
);
await editor.call(
  "save",
  {
    ...payload,
    id,
    expected_revision: 2,
    images: {
      "harbor-art":
        "data:image/png;base64," +
        Buffer.from("<?php phpinfo();").toString("base64"),
    },
  },
  {},
  422,
);
assert.equal(
  (await admin.call("history", undefined, { id })).revisions.length,
  2,
);
await admin.call("members", {
  id,
  email: "viewer@example.test",
  role: "remove",
});
await viewer.call("load", undefined, { id, revision: "1" }, 404);
await viewer.call("history", undefined, { id }, 404);
await editor.call(
  "password",
  { old_password: "wrong", password: "New-editor-password-123" },
  {},
  403,
);
await editor.call("password", {
  old_password: "Test-editor-password-123",
  password: "New-editor-password-123",
});
await editor.call("logout", {});
await editor.call("projects", undefined, {}, 401);
await editor.call("session");
await editor.call(
  "login",
  { email: "editor@example.test", password: "Test-editor-password-123" },
  {},
  401,
);
await editor.call("login", {
  email: "editor@example.test",
  password: "New-editor-password-123",
});
// Row lock plus expected revision: exactly one contender can save the same base.
const contenders = await Promise.all(
  [admin, editor].map(async (c) => {
    try {
      await c.call("save", { ...payload, id, expected_revision: 2 }, {}, 201);
      return "saved";
    } catch (e) {
      if (String(e.message).includes("Someone saved a newer revision"))
        return "conflict";
      throw e;
    }
  }),
);
assert.deepEqual(contenders.sort(), ["conflict", "saved"]);
assert.equal(
  (await admin.call("load", undefined, { id })).project.remote.revision,
  3,
);
const anonymous = client();
await anonymous.call("session");
for (let i = 0; i < 15; i++)
  await anonymous.call(
    "login",
    { email: "missing@example.test", password: "incorrect-password" },
    {},
    401,
  );
await anonymous.call(
  "login",
  { email: "missing@example.test", password: "incorrect-password" },
  {},
  429,
);
// Admin recovery: disable, re-enable, archived accounts and password resets.
await admin.call("users", { disable: "admin@example.test" }, {}, 403);
await admin.call("users", { disable: "viewer@example.test" });
await viewer.call("projects", undefined, {}, 401);
await viewer.call(
  "login",
  { email: "viewer@example.test", password: "Test-viewer-password-123" },
  {},
  401,
);
await admin.call("users", { enable: "viewer@example.test" });
await viewer.call("login", {
  email: "viewer@example.test",
  password: "Test-viewer-password-123",
});
await admin.call(
  "users",
  { reset_password: true, email: "admin@example.test", password: "Recovered-admin-password-1" },
  {},
  403,
);
await admin.call("users", {
  reset_password: true,
  email: "editor@example.test",
  password: "Recovered-editor-password-1",
});
await editor.call("projects", undefined, {}, 401);
await editor.call(
  "login",
  { email: "editor@example.test", password: "New-editor-password-123" },
  {},
  401,
);
await editor.call("login", {
  email: "editor@example.test",
  password: "Recovered-editor-password-1",
});
// Ownership hand-over and archival (kept last: they change or remove the project).
await editor.call("transfer", { id, email: "stranger@example.test" }, {}, 403);
await admin.call("transfer", { id, email: "editor@example.test" });
await admin.call("members", undefined, { id }, 403);
await editor.call("members", undefined, { id });
await editor.call("archive", { id, confirm: "wrong-title" }, {}, 422);
await editor.call("archive", { id, confirm: game.title });
await editor.call("load", undefined, { id }, 404);
await editor.call("save", { ...payload, id, expected_revision: 3 }, {}, 404);
await editor.call("projects").then((r) =>
  assert.ok(!r.projects.some((p) => p.id === id), "archived project still listed"),
);
console.log(
  `PASS ${checks} HTTP checks: setup, login, roles, CSRF, origin, validation, immutable history, save conflicts, revocation, password change, throttling, account recovery, ownership hand-over and archival.`,
);
