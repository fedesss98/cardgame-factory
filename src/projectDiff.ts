// Pure comparison between two game snapshots for the conflict/compare view.
// No React imports: this runs in unit tests (node --experimental-strip-types).

export type DiffField = {
  field: string;
  before: string;
  after: string;
};

export type DiffEntry = {
  group: string;
  id: string;
  change: "added" | "removed" | "changed";
  fields?: DiffField[];
};

export type GameDiff = {
  entries: DiffEntry[];
  added: number;
  removed: number;
  changed: number;
};

const GROUPS = [
  "assets",
  "stats",
  "flags",
  "cards",
  "decks",
  "chapters",
  "endings",
] as const;

// Top-level keys that are entity collections or engine bookkeeping; everything
// else is treated as game settings (title, fallback ending, Android versions…).
const GROUP_KEYS = new Set<string>(GROUPS);
const ENGINE_KEYS = new Set<string>(["schemaVersion", "contentVersion"]);

const MAX_TEXT = 160;

function summarize(value: unknown): string {
  const text =
    typeof value === "string" ? value : JSON.stringify(value) ?? "undefined";
  if (text.length <= MAX_TEXT) return text;
  return text.slice(0, MAX_TEXT - 1) + "…";
}

function fieldComparison(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): DiffField[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const fields: DiffField[] = [];
  for (const key of keys) {
    let same = false;
    try {
      same = JSON.stringify(before[key]) === JSON.stringify(after[key]);
    } catch {
      same = String(before[key]) === String(after[key]);
    }
    if (!same)
      fields.push({
        field: key,
        before: summarize(before[key]),
        after: summarize(after[key]),
      });
  }
  return fields;
}

export function diffProjects(
  beforeGame: any | null,
  beforeImages: Record<string, string> | null,
  afterGame: any | null,
  afterImages: Record<string, string> | null,
): GameDiff {
  const entries: DiffEntry[] = [];
  let added = 0,
    removed = 0,
    changed = 0;
  const left = beforeGame ?? {},
    right = afterGame ?? {};

  for (const group of GROUPS) {
    const before = new Map<string, Record<string, unknown>>();
    const after = new Map<string, Record<string, unknown>>();
    for (const entity of left[group] ?? [])
      before.set(String(entity?.id ?? ""), entity);
    for (const entity of right[group] ?? [])
      after.set(String(entity?.id ?? ""), entity);
    for (const [id] of before) {
      if (!after.has(id)) {
        entries.push({ group, id, change: "removed" });
        removed++;
      }
    }
    for (const [id, entity] of after) {
      if (!before.has(id)) {
        entries.push({ group, id, change: "added" });
        added++;
      } else {
        const fields = fieldComparison(before.get(id)!, entity);
        if (fields.length) {
          entries.push({ group, id, change: "changed", fields });
          changed++;
        }
      }
    }
  }

  const settings = (game: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(game))
      if (
        !GROUP_KEYS.has(key) &&
        !ENGINE_KEYS.has(key) &&
        typeof value !== "object"
      )
        out[key] = value;
    return out;
  };
  const settingsFields = fieldComparison(
    settings(left),
    settings(right),
  );
  if (settingsFields.length) {
    entries.push({ group: "settings", id: "(settings)", change: "changed", fields: settingsFields });
    changed++;
  }

  const leftImages = beforeImages ?? {};
  const rightImages = afterImages ?? {};
  const plusImages = new Set(Object.keys(rightImages));
  for (const id of Object.keys(leftImages)) {
    if (!plusImages.has(id)) {
      entries.push({ group: "images", id, change: "removed" });
      removed++;
    }
  }
  for (const [id, value] of Object.entries(rightImages)) {
    if (!(id in leftImages)) {
      entries.push({ group: "images", id, change: "added" });
      added++;
    } else if (leftImages[id] !== value) {
      entries.push({ group: "images", id, change: "changed" });
      changed++;
    }
  }

  return { entries, added, removed, changed };
}
