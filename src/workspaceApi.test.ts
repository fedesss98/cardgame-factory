import { test } from "node:test";
import assert from "node:assert/strict";
import { api, loadShared, RequestError } from "./workspaceApi.ts";

test("workspace requests preserve session cookies, CSRF, explicit revisions and expiry errors", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { href: "https://factory.example.test/studio/" } },
  });
  const requests: { url: URL; init?: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (input: URL, init?: RequestInit) => {
    const url = new URL(input);
    requests.push({ url, init });
    switch (url.searchParams.get("action")) {
      case "session":
        return Response.json({ csrf: "test-token", user: null });
      case "login":
        return Response.json({ csrf: "rotated-token", user: { id: 1 } });
      case "load":
        return Response.json({
          project: {
            game: { title: "Saved" },
            images: {},
            remote: { id: "project", revision: 4, role: "viewer" },
          },
        });
      case "history":
        return Response.json({
          revisions: [
            { revision: 5 },
            { revision: 4, display_name: "Author", created_at: "2026-10-27" },
          ],
        });
      default:
        return Response.json({ error: "Session expired" }, { status: 401 });
    }
  });
  try {
    await api("session");
    await api("login", {
      email: "test@example.invalid",
      password: "test-only",
    });
    assert.equal(requests[1].init?.method, "POST");
    assert.equal(
      (requests[1].init?.headers as Record<string, string>)["X-CSRF-Token"],
      "test-token",
    );
    const saved = await loadShared("project", 4);
    assert.equal(
      requests
        .find((r) => r.url.searchParams.get("action") === "load")
        ?.url.searchParams.get("revision"),
      "4",
    );
    assert.equal(saved.remote?.revision, 4);
    assert.equal(saved.remote?.savedBy, "Author");
    assert.equal(saved.remote?.dirty, false);
    await assert.rejects(
      api("save", {}),
      (e) => e instanceof RequestError && e.status === 401,
    );
    assert.equal(
      (requests.at(-1)?.init?.headers as Record<string, string>)[
        "X-CSRF-Token"
      ],
      "rotated-token",
    );
    for (const r of requests) {
      assert.equal(r.url.pathname, "/studio/api/index.php");
      assert.equal(r.init?.credentials, "same-origin");
      assert.equal(r.init?.cache, "no-store");
      assert.equal(r.url.toString().includes("test-only"), false);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
