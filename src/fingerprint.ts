// Stable content identity shared by player saves and shareable playtest traces.
// Object key order must not change the fingerprint across browsers or machines.
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

// FNV-1a 64-bit over the canonical JSON. This is an identity check, not a
// cryptographic signature; it detects accidental or deliberate content drift.
export function contentFingerprint(value: unknown): string {
  const bytes = new TextEncoder().encode(stableStringify(value));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
