# Visual story authoring

The new controls use the existing game format. Existing backups and shared games
open without a content migration. JSON editing is optional in **Advanced JSON**.

1. In **Cards**, write a scene and the two choices. Add effects to change resources
   or set story flags. Effects run top to bottom; use arrows to change their order.
   Choose a follow-up card when you want a specific next encounter.
2. In **Structure & rules → Decks**, create groups of cards. Add existing cards,
   reorder them, and choose **In order** or **Random, weighted**. A larger weight
   means a higher relative chance. Switching to ordered mode sets all weights to 1.
   Removing a card from a deck does not delete the card itself.
3. In **Chapters**, choose the starting chapter and the decks available in each
   chapter. Each chapter must retain a deck; each deck must retain a card. Chapter
   entry effects can set flags or adjust resources. Add transitions and move them
   up/down: only the first matching transition runs after each decision.
4. In **Flags**, name events you want to remember. For example, start “Helped the
   merchant” as false, set it true in a card choice, then require it for a special
   deck. Set **Scope** to **This run only** or **Across new games**; persistent flags
   are saved in the player's browser and survive New game until **Reset all progress**.
   Persistent flags show a badge in the flag picker and in the structure list.
5. In **Endings**, set the text, optional existing image and conditions. Move an
   ending's priority up/down to decide which wins when several match. The fallback
   ending has no conditions and appears only when there are no eligible cards.
6. Click **Apply edits** beside the preview to start a playtest with your latest
   changes. Local drafts autosave in this browser. Shared copies need **Save online**.
7. Export a **Project backup** regularly. Export a **Playable website** or **Android
   project** when ready. The Android ZIP still needs Android Studio to build/sign;
   it is not a Play Store AAB.

## New games and presentation

**New game** opens a short setup wizard for the title, visual theme, first resource
and starting value, and first chapter. It creates a valid one-scene starter with no
example content: one resource, one placeholder card (once per run), one deck, one
chapter and a fallback ending. First launch does the same with defaults and shows a
dismissible **Start here** checklist. Harbor Council and Ember Station remain
separate example buttons. The checklist marker stays in browser storage and is never
written into `game.json`.

**Game settings** controls presentation without changing gameplay:

- **Theme presets** (Parchment, Midnight, Storybook) replace the theme colours and
  font choice. Colours remain individually editable.
- **Background image** uses an existing image asset and adds a readability overlay
  chosen from the background colour's luminance. Remove it to use the background
  colour alone.
- **Bundled font** accepts WOFF2 files up to 2 MB, verifies the `wOF2` signature and
  loads the font through `@font-face` in the preview and exported players. System
  serif and sans remain available.
- **Contrast warnings** report card text/surface, surface/background and accent/
  background ratios below readable thresholds.

**Resources** (also in Game settings) manages one to six meters. Each row edits the
name, minimum, maximum, starting value and an optional icon from the image library.
Deleting a resource is blocked while any card condition or effect, chapter entry,
deck condition, transition or ending references it; the row lists those references.
The player shows the icon beside the meter when one is set.

**Card tags** are optional labels for organizing the card browser. They are
slugified to the game ID format, deduplicated, and shown as a tag filter. Tags do not
affect gameplay: tag-based conditions would require a schema and engine change.

## Conditions and resolution order

Conditions can check resources, true/false flags or decisions made. Choose **All
rules (AND)** to require every rule or **Any rule (OR)** to require at least one.
The chapter decision count resets on each visit; the run count keeps increasing.
New conditions default to five chapter decisions: change that default to your intent.

After a choice: count the decision, apply its effects, check endings, check the
chapter's transitions, apply any new chapter's entry effects, check endings again,
and draw a card. A chapter transition takes precedence over a follow-up. Follow-ups
still respect card conditions and repeat limits. No immediate repeat is selected
from a deck when another eligible card is available.

Names can change without breaking links: internal IDs remain stable. Deleting a
referenced deck, flag or chapter is blocked, with an explanation. The starting
chapter and fallback ending are protected. Authoring undo/redo covers the current
session (40 steps); still back up important work.
Conditions are flat All/Any groups, not nested expressions or custom scripts.

## Validation and current limits

Invalid numbers, empty required names and broken references appear below the editor
and prevent playtesting/export. Validation also rejects duplicate deck membership,
duplicate priorities, conditions on the fallback ending and missing ending conditions.
These checks establish valid structure, not a guarantee that every ending is reachable.

New cards start with no effects and enter the first deck. They inherit artwork,
choice labels and repeat policy from the selected card; review these before use.
Undo/redo, card deletion, a reusable image library and exported-player save/resume
are implemented. An automatic signed Android build service and an app-icon editor
are still absent.

## Verification of this increment

- Fifty-seven automated tests cover gameplay, authoring invariants, exports, player
  save compatibility, trace replay and playtest reports, including three chapters,
  a flag-gated branch, entry effects, ending precedence, image preservation, export
  snapshots and Android string escaping. New tests cover blank-project validity and
  playthrough, backup export of the placeholder, resource and flag usage/deletion
  guards, resource-icon image uses, tag slugification and WCAG contrast warnings.
- TypeScript and production editor/player builds pass.
- Browser checks cover a separate “Visual editor demo”: adding and renaming a deck,
  card membership/order/weights, a flag, a third chapter, entry effect, transition,
  ending conditions/artwork, and a playthrough through all three chapters.
- A headless Chrome flow ran against the deployed build on 27 October 2026 and
  confirmed: first launch creates one valid blank project with the Start-here
  checklist; the wizard creates “Glass Harbor” with theme Storybook, resource
  “Focus 12” and chapter “Arrival”; checklist dismissal persists; theme presets,
  resource add/edit, background picker and font upload render; a low-contrast pair
  raises the warning; card tags “storm”/“ally” appear as chips and filter two cards
  to one; and a new flag exposes the run/persistent scope selector.
- The static editor, player runtime and export template are deployed to
  `factory.fedeama.it`, with remote SHA-256 hashes matching the local build. A
  compiled Android APK/AAB remains unverified.
