import Ajv from "ajv/dist/2020.js";
import schema from "../schema/game.schema.json" with { type: "json" };
const check = new Ajv({ allErrors: true }).compile<any>(schema);
export function validateProject(
  g: any,
  images: Record<string, string>,
): string[] {
  const errors = validate(g);
  if (errors.length) return errors;
  return g.assets
    .filter((a: any) => !images[a.id])
    .map(
      (a: any) =>
        `Missing asset data: ${a.id}. Upload the image or restore a complete backup.`,
    );
}
export function validate(g: any): string[] {
  if (!check(g))
    return (check.errors ?? []).map(
      (e) =>
        e.keyword === "minLength" &&
        /^\/stats\/\d+\/name$/.test(e.instancePath)
          ? `Resource ${Number(e.instancePath.split("/")[2]) + 1} needs a name. Open Game settings → Resources to add one.`
          : `${e.instancePath || "Project"} ${e.message}`,
    );
  const errors: string[] = [];
  const refs: Record<string, string> = {
    statId: "stats",
    flagId: "flags",
    cardId: "cards",
    followUpCardId: "cards",
    deckId: "decks",
    toChapterId: "chapters",
    startChapterId: "chapters",
    fallbackEndingId: "endings",
    imageAssetId: "assets",
    iconAssetId: "assets",
    backgroundAssetId: "assets",
    fontAssetId: "assets",
  };
  function walk(o: any, path = "") {
    if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o)) {
        if (refs[k]) {
          const target = g[refs[k]].find((x: any) => x.id === v);
          if (!target) errors.push(`${path}/${k}: Unknown ${k}: ${v}`);
          else if (
            refs[k] === "assets" &&
            target.kind !== (k === "fontAssetId" ? "font" : "image")
          )
            errors.push(`${path}/${k}: Wrong asset kind for ${k}: ${v}`);
        }
        if (typeof v === "object") walk(v, `${path}/${k}`);
      }
  }
  walk(g);
  for (const key of [
    "assets",
    "stats",
    "flags",
    "cards",
    "decks",
    "chapters",
    "endings",
  ])
    if (new Set(g[key].map((e: any) => e.id)).size !== g[key].length)
      errors.push(`Duplicate IDs in ${key}`);
  for (const s of g.stats)
    if (s.min >= s.max || s.initial < s.min || s.initial > s.max)
      errors.push(`Invalid range: ${s.name}`);
  if (new Set(g.assets.map((a: any) => a.path)).size !== g.assets.length)
    errors.push("Asset paths must be unique");
  for (const deck of g.decks) {
    if (
      new Set(deck.cards.map((c: any) => c.cardId)).size !== deck.cards.length
    )
      errors.push(`Deck “${deck.name}”: a card can only appear once`);
    if (deck.mode === "ordered" && deck.cards.some((c: any) => c.weight !== 1))
      errors.push(`Deck “${deck.name}”: ordered cards must have weight 1`);
  }
  for (const chapter of g.chapters)
    if (
      new Set(chapter.decks.map((d: any) => d.deckId)).size !==
      chapter.decks.length
    )
      errors.push(`Chapter “${chapter.name}”: a deck can only appear once`);
  if (new Set(g.endings.map((e: any) => e.priority)).size !== g.endings.length)
    errors.push("Ending priorities must be unique");
  for (const ending of g.endings) {
    if (ending.id === g.fallbackEndingId && ending.when)
      errors.push(`Fallback ending “${ending.title}” cannot have conditions`);
    if (ending.id !== g.fallbackEndingId && !ending.when)
      errors.push(`Ending “${ending.title}” needs conditions`);
  }
  return errors;
}
