import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
// Build must have completed first. Whitelist package inputs; never copy configs/storage.
const zip = new JSZip();
async function add(dir, prefix) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await add(path, prefix + entry.name + "/");
    else zip.file(prefix + entry.name, await readFile(path));
  }
}
await add("dist", "public_html/");
zip.file(
  "public_html/api/index.php",
  await readFile("server/public/index.php"),
);
for (const file of ["app.php", "validation.php", "config.example.php"])
  zip.file("game-factory-private/" + file, await readFile("server/" + file));
zip.file(
  "game-factory-private/game.schema.json",
  await readFile("schema/game.schema.json"),
);
zip.file("game-factory-private/.htaccess", "Require all denied\n");
await add("server/vendor", "game-factory-private/vendor/");
zip.file(
  "database/002_collaboration.sql",
  await readFile("database/002_collaboration.sql"),
);
zip.file("HOSTINGER-SETUP.md", await readFile("docs/HOSTINGER-SETUP.md"));
zip.file("VISUAL-AUTHORING.md", await readFile("docs/VISUAL-AUTHORING.md"));
zip.file("ANDROID-BUILD.md", await readFile("tools/android-export/README.md"));
await writeFile(
  "game-factory-collaboration.zip",
  await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
);
console.log(
  "Created game-factory-collaboration.zip. Contains no live config, storage or test accounts.",
);
