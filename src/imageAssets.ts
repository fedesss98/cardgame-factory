export const imageTypes = ["image/png", "image/jpeg", "image/webp"];
export const dataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("The image could not be read."));
    reader.readAsDataURL(blob);
  });
export function assetBytes(value = "") {
  const encoded = value.split(",")[1];
  return value.startsWith("data:") && encoded
    ? Math.floor((encoded.length * 3) / 4) -
        (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0)
    : 0;
}
export async function readImage(file: Blob) {
  if (!imageTypes.includes(file.type) || file.size > 5_000_000)
    throw Error("Choose a PNG, JPEG or WebP under 5 MB.");
  const image = await createImageBitmap(file);
  try {
    if (
      image.width > 8192 ||
      image.height > 8192 ||
      image.width * image.height > 16_000_000
    )
      throw Error(
        "Image dimensions exceed 8,192 pixels or 16 megapixels. Resize it before uploading.",
      );
  } finally {
    image.close();
  }
  return dataUrl(file);
}
export async function readFont(file: File) {
  if (!file.name.toLowerCase().endsWith(".woff2") || file.size > 2_000_000)
    throw Error("Choose a WOFF2 font under 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 48 || String.fromCharCode(...bytes.slice(0, 4)) !== "wOF2")
    throw Error("This file is not a valid WOFF2 font.");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    header.getUint32(8) !== bytes.length ||
    !header.getUint16(12) ||
    header.getUint16(14) !== 0 ||
    header.getUint32(16) > 50_000_000 ||
    !header.getUint32(20) ||
    header.getUint32(20) > bytes.length - 48
  )
    throw Error("This file has an invalid WOFF2 header.");
  return dataUrl(new Blob([bytes], { type: "font/woff2" }));
}
export function fontAsset(file: File) {
  const id = "font-" + crypto.randomUUID();
  const stem =
    file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .slice(0, 48) || "font";
  return { id, kind: "font", path: `assets/${stem}-${id}.woff2` };
}
export function imageAsset(blob: Blob, name: string) {
  const id = "art-" + crypto.randomUUID();
  const stem =
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .slice(0, 48) || "image";
  const ext =
    blob.type === "image/jpeg"
      ? "jpg"
      : blob.type === "image/webp"
        ? "webp"
        : "png";
  return { id, kind: "image", path: `assets/${stem}-${id}.${ext}` };
}
const referenceKeys = new Set([
  "imageAssetId",
  "backgroundAssetId",
  "iconAssetId",
  "fontAssetId",
]);
export function replaceAssetReferences(game: any, from: string, to: string) {
  function walk(value: any) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (referenceKeys.has(key) && child === from) value[key] = to;
      else if (typeof child === "object") walk(child);
    }
  }
  walk(game);
}
export function assetUses(
  game: any,
  id: string,
): { label: string; group: string; id?: string }[] {
  const uses = game.cards
    .filter((c: any) => c.imageAssetId === id)
    .map((c: any) => ({
      label: `Card: ${c.character}`,
      group: "cards",
      id: c.id,
    }));
  for (const e of game.endings)
    if (e.imageAssetId === id)
      uses.push({ label: `Ending: ${e.title}`, group: "endings", id: e.id });
  for (const stat of game.stats)
    if (stat.iconAssetId === id)
      uses.push({ label: `Resource: ${stat.name}`, group: "settings" });
  if (game.theme.backgroundAssetId === id || game.theme.fontAssetId === id)
    uses.push({ label: "Game theme", group: "settings" });
  if (game.android.iconAssetId === id)
    uses.push({ label: "Android icon", group: "settings" });
  return uses;
}
export type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
  maxEdge: number;
  quality: number;
};
export async function cropImage(source: string, crop: Crop): Promise<Blob> {
  if (
    Object.values(crop).some((v) => !Number.isFinite(v)) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    crop.x + crop.width > 100 ||
    crop.y + crop.height > 100 ||
    crop.maxEdge < 128 ||
    crop.maxEdge > 4096 ||
    crop.quality < 0.1 ||
    crop.quality > 1
  )
    throw Error("Choose a valid crop rectangle, output size and quality.");
  const response = await fetch(source);
  if (!response.ok) throw Error("Cannot read the source image.");
  const image = await createImageBitmap(await response.blob());
  try {
    const width = (image.width * crop.width) / 100,
      height = (image.height * crop.height) / 100;
    const scale = Math.min(1, crop.maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Image editing is unavailable in this browser.");
    ctx.drawImage(
      image,
      (image.width * crop.x) / 100,
      (image.height * crop.y) / 100,
      width,
      height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(Error("Image conversion failed.")),
        "image/webp",
        crop.quality,
      ),
    );
  } finally {
    image.close();
  }
}
