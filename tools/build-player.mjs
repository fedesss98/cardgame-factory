import { build } from "vite";
import { mkdir, cp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

export async function buildPlayer() {
  await build({
    base: "./",
    publicDir: false,
    build: {
      outDir: ".build/player",
      emptyOutDir: true,
      rollupOptions: { input: resolve("player.html") },
    },
  });
  const target = resolve("public/player-runtime");
  if (target !== resolve(process.cwd(), "public", "player-runtime"))
    throw Error("Unexpected player output path.");
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(".build/player/assets", resolve(target, "assets"), {
    recursive: true,
  });
  await writeFile(
    resolve(target, "index.html"),
    await readFile(".build/player/player.html"),
  );
  const files = [
    "index.html",
    ...(await readdir(resolve(target, "assets"))).map(
      (name) => "assets/" + name,
    ),
  ];
  const hashes = Object.fromEntries(
    await Promise.all(
      files.map(async (path) => [
        path,
        createHash("sha256")
          .update(await readFile(resolve(target, path)))
          .digest("hex"),
      ]),
    ),
  );
  await writeFile(
    resolve(target, "manifest.json"),
    JSON.stringify({ files, hashes }, null, 2),
  );
}
