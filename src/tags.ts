export function slugifyTag(value: string): string {
  let slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!slug) return "";
  if (!/^[a-z]/.test(slug)) slug = `tag-${slug}`.slice(0, 64);
  return slug;
}

export function parseTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map(slugifyTag)
        .filter(Boolean),
    ),
  ];
}

export function allTags(cards: { tags?: string[] }[]): string[] {
  return [
    ...new Set(cards.flatMap((card) => (Array.isArray(card.tags) ? card.tags : []))),
  ].sort();
}
