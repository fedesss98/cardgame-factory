import JSZip from "jszip";
import { validate, validateProject } from "./validate";
import { readFont, readImage } from "./imageAssets";
import type { Project } from "./TeamWorkspace";

// Read the central directory before asking a decompressor to allocate output.
function inspectZip(bytes: Uint8Array): Map<string, number> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = () => {
    throw Error(
      "Unsupported or damaged backup ZIP. Use a Game Factory project backup (not a web/Android export).",
    );
  };
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  if (end < 0) return fail();
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    start = view.getUint32(end + 16, true);
  if (
    view.getUint32(end + 4, true) !== 0 ||
    count !== view.getUint16(end + 8, true) ||
    count > 500 ||
    count === 0 ||
    start + size !== end
  )
    return fail();
  const names = new Map<string, number>(),
    folded = new Set<string>(),
    ranges: [number, number][] = [];
  let offset = start,
    total = 0;
  const decode = new TextDecoder("utf-8", { fatal: true });
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      return fail();
    const flags = view.getUint16(offset + 8, true),
      method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true),
      expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true),
      next = offset + 46 + nameLength + extra + comment;
    if (
      next > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      view.getUint16(offset + 34, true) !== 0 ||
      ((view.getUint32(offset + 38, true) >>> 16) & 0xf000) === 0xa000
    )
      return fail();
    const name = decode.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    const directory = name.endsWith("/");
    if (
      !(
        name === "game.json" ||
        /^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(name) ||
        /^assets\/(?:[A-Za-z0-9_-]+\/)*$/.test(name)
      ) ||
      name.includes("..") ||
      folded.has(name.toLowerCase())
    )
      return fail();
    folded.add(name.toLowerCase());
    const limit = directory ? 0 : name === "game.json" ? 2_000_000 : 5_000_000;
    if (expanded > limit || (total += expanded) > 50_000_000)
      throw Error(
        "Backup exceeds its expanded-size limits (2 MB JSON, 5 MB per asset, 50 MB total).",
      );
    if (
      local + 30 > start ||
      view.getUint32(local, true) !== 0x04034b50 ||
      view.getUint16(local + 8, true) !== method ||
      view.getUint16(local + 6, true) !== flags
    )
      return fail();
    const localNameLength = view.getUint16(local + 26, true),
      dataStart =
        local + 30 + localNameLength + view.getUint16(local + 28, true);
    if (
      dataStart + compressed > start ||
      decode.decode(
        bytes.subarray(local + 30, local + 30 + localNameLength),
      ) !== name
    )
      return fail();
    if (
      !(flags & 8) &&
      (view.getUint32(local + 18, true) !== compressed ||
        view.getUint32(local + 22, true) !== expanded)
    )
      return fail();
    ranges.push([local, dataStart + compressed]);
    names.set(name, expanded);
    offset = next;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  if (
    offset !== end ||
    ranges.some((range, i) => i > 0 && range[0] < ranges[i - 1][1])
  )
    return fail();
  return names;
}
function boundedRead(
  file: JSZip.JSZipObject,
  limit: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0,
      done = false;
    // JSZip's browser streaming method is present at runtime but omitted from its types.
    type EntryStream = {
      on(event: string, handler: (data: any) => void): EntryStream;
      pause(): EntryStream;
      resume(): EntryStream;
    };
    const stream = (
      file as JSZip.JSZipObject & {
        internalStream(type: "uint8array"): EntryStream;
      }
    ).internalStream("uint8array");
    stream
      .on("data", (chunk: Uint8Array) => {
        if (done) return;
        size += chunk.length;
        if (size > limit) {
          done = true;
          stream.pause();
          chunks.length = 0;
          reject(Error("Expanded ZIP entry exceeds its declared size."));
        } else chunks.push(chunk);
      })
      .on("error", (error: Error) => {
        if (!done) {
          done = true;
          chunks.length = 0;
          reject(error);
        }
      })
      .on("end", () => {
        if (done) return;
        done = true;
        if (size !== limit) {
          reject(Error("ZIP entry size mismatch."));
          return;
        }
        const result = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(result);
      })
      .resume();
  });
}
export async function importProject(file: File): Promise<Project> {
  if (file.size > 50_000_000) throw Error("Archive exceeds 50 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    sizes = inspectZip(bytes);
  const zip = await JSZip.loadAsync(bytes);
  if (!sizes.has("game.json") || !zip.file("game.json"))
    throw Error("Choose a project backup ZIP.");
  const game = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await boundedRead(zip.file("game.json")!, sizes.get("game.json")!),
    ),
  );
  const errors = validate(game);
  if (errors.length) throw Error(errors[0]);
  if (game.cards.length > 2000 || game.assets.length > 200)
    throw Error("Project limit: 2,000 cards and 200 assets.");
  const images: Record<string, string> = {};
  for (const a of game.assets) {
    const entry = zip.file(a.path),
      size = sizes.get(a.path);
    if (!entry || size === undefined) throw Error(`Missing asset: ${a.path}`);
    const bytes = await boundedRead(entry, size);
    const type = a.path.endsWith(".png")
      ? "image/png"
      : a.path.endsWith(".webp")
        ? "image/webp"
        : a.path.endsWith(".woff2")
          ? "font/woff2"
          : "image/jpeg";
    const blob = new Blob([bytes as BlobPart], { type });
    images[a.id] =
      a.kind === "image"
        ? await readImage(blob)
        : await readFont(new File([blob], a.path, { type }));
  }
  const complete = validateProject(game, images);
  if (complete.length) throw Error(complete[0]);
  return { draftId: crypto.randomUUID(), game, images };
}
