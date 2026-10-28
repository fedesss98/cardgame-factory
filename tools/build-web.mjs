import { build } from "vite";
import { buildPlayer } from "./build-player.mjs";
await buildPlayer();
await build({ base: "./", build: { outDir: "dist", emptyOutDir: true } });
console.log("Frontend and current player runtime built. No archives created.");
