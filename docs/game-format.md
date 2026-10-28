# Game format and engine contract

The machine-readable schema is `schema/game.schema.json`, JSON Schema 2020-12.
It describes a project manifest, not a player save. The proposed v1 is intentionally
limited to two choices, integer stats, Boolean flags, chapters and two deck modes.

## Project archive

```text
game.json
assets/                  packaged images and optional WOFF2 fonts
```

ZIP export must include every referenced file. Imported files are data, never
scripts. Reject absolute paths, traversal, symlinks, unexpected executable content,
oversized archives and decompression bombs. The path allowlist is only one layer;
check actual media signatures, decoded sizes and canonical destination paths.
Initial image formats: PNG, JPEG and WebP. No imported SVG/HTML/scripts in v1.
Engine-built theme presets do not require AI-generated images.

## Main entities

| Entity | Purpose |
| --- | --- |
| Game | Identity, language, versions and starting chapter |
| Theme | Preset plus explicit presentation values |
| Asset | Stable ID mapped to a relative file, optional license/credit |
| Stat | Integer min/max/initial value |
| Flag | Boolean value, reset per run or persistent across runs |
| Card | Image/text, two choices, eligibility and repeat policy |
| Deck | Ordered or weighted card references |
| Chapter | Active decks, entry effects and ordered transitions |
| Ending | Optional trigger, unique priority, presentation |
| Android settings | Public package metadata; never signing credentials |

Conditions use one flat all/any group of predicates. Absence of a condition means
true for cards and active decks. For endings, absence means manual fallback only.
The initial editor need not expose every field at once. App icons may be absent
in draft projects, but release validation must require a suitable real icon.

Deck activation is derived from conditions on chapter deck entries. To unlock a
deck, set its flag through a choice; no separate mutable activation list is needed.
Chapter transitions express movement between levels; choices can set flags that
cause those transitions. No direct jump effect or arbitrary code is needed in v1.

## Presentation and organization fields

The editor uses existing schema fields for this authoring increment; no schema
version bump or migration is required.

- `theme.backgroundAssetId` references an image asset used as the player backdrop.
  The player adds a light or dark readability overlay based on the background colour.
- `theme.fontAssetId` references a `kind: "font"` asset. Bundled fonts must be WOFF2
  (maximum 2 MB, `wOF2` signature) and are loaded with `@font-face` in preview and
  exports. `theme.font` stays `system-sans`, `system-serif` or `bundled`.
- `stats[].iconAssetId` references an image shown beside that resource meter.
- `cards[].tags` is an optional list of slugified organizational labels. Tags are
  filtered in the editor only; the engine ignores them. Tag-based conditions would
  require a future schema and engine change.
- `flags[].scope` is `run` (reset on every new game) or `persistent` (saved in the
  player's browser progress and kept across new games until progress is reset).

## Deterministic runtime rules

1. Start with initial stats and run flags; load persistent flags or their defaults.
   Set run/chapter turns to zero, enter the start chapter, and apply onEnter once.
2. Effects execute in array order. Each stat delta clamps immediately to its min/max.
   Flag effects set the specified Boolean value. Check endings after the full batch.
3. On displaying a card, record its ID as seen in the run and current chapter visit.
   A choice increments both turn counters once, then applies its effect batch.
4. Evaluate triggered endings; highest priority wins. Stat limits do not implicitly
   end the game: authors define ending predicates. Record the ending in persistent
   progress. No further transition or card draw occurs after an ending.
5. If still running, evaluate transitions on the current chapter in array order;
   first match wins. Enter at most one chapter per choice, reset chapter turns,
   chapter-seen history and ordered cursors; apply entry effects and check endings
   again. Do not cascade transitions on entry. Run state otherwise carries forward.
6. A chapter transition discards the old choice's follow-up. Without a transition,
   try its follow-up: it must pass its own conditions and repeat policy, but need
   not belong to an active deck. If ineligible, use ordinary selection. A valid
   follow-up takes precedence over immediate-repeat avoidance.
7. Ordinary selection filters chapter deck entries by their conditions, then cards
   by their conditions and repeat policy. Exclude decks with no candidate. Exclude
   the last displayed card if ANY different candidate exists across eligible decks.
   If only the last card remains, allow it when its repeat policy permits.
8. Choose an eligible deck using chapter entry weights. For a weighted deck, choose
   an eligible card using card weights. For an ordered deck, scan cyclically from
   its cursor to the first eligible card, then advance the cursor past that card.
   Ordered entry weights are ignored and must equal 1. Follow-ups do not advance
   deck cursors. A card in two decks has two selection routes by design.
9. With no candidate, display fallbackEndingId. This is a deliberate terminal
   outcome, not an infinite loop or an exception.

oncePerChapter means once per chapter VISIT; revisiting clears that restriction.
oncePerRun does not reset on chapter changes. Unlimited remains repeatable.
Chapter entry does not increment turns. Conditions observe completed-choice counts.

Use a versioned seeded PRNG, stable array iteration and specified draw consumption.
Before implementing replay, choose and lock the exact PRNG algorithm and fixtures.
Same snapshot + engine version + initial progress + seed + choices must reproduce
the outcome; seed alone is insufficient.

## Save contract to implement with the engine

Save game ID, schema/engine version, content hash/version, save compatibility
version, current chapter, stats, flags, run/chapter turns, seen IDs, last/current
card, deck cursors, PRNG state and terminal status. Save a complete resolved state
atomically after each choice so resume does not reapply effects or reroll a card.
Initial card selection must be saved too.

Persistent progress stores persistent flags and discovered ending IDs separately.
Restart resets the run, not progress. Reset all progress is a distinct action.
Changing saveCompatibilityVersion invalidates only run saves and explains why.
For compatible updates validate referenced IDs before resuming; reset an invalid
run safely rather than guessing a replacement card. Preserve known persistent
IDs, initialize new ones, and ignore removed ones. ZIP project backups do not
include player progress or signing secrets.

Implemented in `src/playerSave.ts`. The exported player keeps one run-save key and
one persistent-progress key per game ID. Editor playtest sessions and authoring
drafts use different storage and never read or write these keys. The run save also
stores the game identity, engine/schema versions, content version and a stable
content fingerprint; a compatible content change resumes only when the saved
chapter/card/ending still exist. `src/runTrace.ts` records the same identity plus a
scenario, seed, interventions and final state for shareable, validated replays.

## Structural versus semantic validation

JSON Schema validates shapes, required fields, enum values, bounds and path syntax.
The application validator must also check:

- Unique IDs within each entity list and unique ending priorities.
- All stat/flag/card/deck/chapter/asset references exist and have the expected type.
- Stat min < max, and min <= initial <= max.
- Asset path uniqueness, kind/extension agreement, file existence and actual format.
- Font fields reference fonts; image fields reference images.
- Deck members are unique per deck; chapter deck references are unique per chapter.
- Start and transition targets exist; fallback exists and has no trigger.
- Every other ending has a trigger; ordered weights equal 1.
- Release application ID, version monotonicity, icon requirements and asset budgets.

Warn on unreachable-looking chapters, unused cards/assets, contradictory predicates,
very long rendered text and long/short simulated runs. Only label a condition
impossible when proven within the supported rule model. Simulation is not proof.

## Version policy

schemaVersion changes when the format changes; migrations must preserve backups.
contentVersion identifies editorial revisions; saveCompatibilityVersion declares
intentional save breaks. Android versionCode is a separate release sequence.
A build report must include a content hash; version numbers alone cannot identify
an immutable snapshot. Freeze the format after the first end-to-end prototype.
