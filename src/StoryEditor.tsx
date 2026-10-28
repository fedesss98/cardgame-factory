import { useEffect, useState } from "react";
import {
  defaultCondition,
  deletionReason,
  deleteStoryItem,
  move,
  newStoryItem,
  setDeckMode,
  setOptional,
  type StoryGroup,
} from "./authoring";
import { ConditionEditor, EffectsEditor, OrderButtons } from "./RuleEditors";
import { flagUses } from "./resources";

const sections: [StoryGroup, string, string][] = [
  [
    "decks",
    "Decks",
    "Group cards, set their order or make some appear more often.",
  ],
  [
    "chapters",
    "Chapters",
    "Choose active decks and decide when the story moves on.",
  ],
  [
    "flags",
    "Flags",
    "Remember events such as helping a merchant or unlocking a route.",
  ],
  [
    "endings",
    "Endings",
    "Define outcomes. When several match, the highest priority wins.",
  ],
];
const names = {
  decks: "deck",
  chapters: "chapter",
  flags: "flag",
  endings: "ending",
};

export function StoryEditor({
  game: g,
  update,
  readOnly = false,
  focusTarget,
}: {
  game: any;
  update: (fn: (g: any) => void) => void;
  readOnly?: boolean;
  focusTarget?: { section: StoryGroup; id: string; serial: number };
}) {
  const [section, setSection] = useState<StoryGroup>("decks");
  const [selected, select] = useState("");
  useEffect(() => {
    if (focusTarget) {
      setSection(focusTarget.section);
      select(focusTarget.id);
    }
  }, [focusTarget]);
  const items = g[section];
  const item = items.find((x: any) => x.id === selected) ?? items[0];
  const edit = (fn: (item: any) => void) =>
    update((next) => fn(next[section].find((x: any) => x.id === item.id)));
  const reason = item ? deletionReason(g, section, item.id) : "";
  const uses = item && section === "flags" ? flagUses(g, item.id) : [];
  const cardName = (id: string) => {
    const c = g.cards.find((c: any) => c.id === id);
    return `${c.character} · ${c.text.slice(0, 45)}`;
  };
  const ranked = [...g.endings]
    .filter((e: any) => e.id !== g.fallbackEndingId)
    .sort((a: any, b: any) => b.priority - a.priority);
  const rank = item ? ranked.findIndex((e) => e.id === item.id) : -1;
  return (
    <div className="story-editor">
      <h2>Build the path through your story.</h2>
      <nav className="story-tabs" aria-label="Story structure">
        {sections.map(([key, title]) => (
          <button
            key={key}
            className={key === section ? "active" : ""}
            aria-pressed={key === section}
            onClick={() => {
              setSection(key);
              select("");
            }}
          >
            {title} <span>{g[key].length}</span>
          </button>
        ))}
      </nav>
      <p className="story-description">
        {sections.find(([key]) => key === section)?.[2]}
      </p>
      <div className="story-picker">
        <label>
          Selected {names[section]}
          <select
            value={item?.id ?? ""}
            onChange={(e) => select(e.target.value)}
          >
            {!items.length && <option value="">No {section} yet</option>}
            {items.map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.name ?? x.title}
                {x.id === g.startChapterId ? " · start" : ""}
                {x.id === g.fallbackEndingId ? " · fallback" : ""}
                {x.scope === "persistent" ? " · persistent" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={readOnly}
          onClick={() => {
            const id = `${names[section]}-${crypto.randomUUID()}`;
            update((next) =>
              next[section].push(newStoryItem(next, section, id)),
            );
            select(id);
          }}
        >
          ＋ Add {names[section]}
        </button>
      </div>
      {item ? (
        <fieldset className="story-form" key={item.id} disabled={readOnly}>
          <div className="eyebrow">{item.id}</div>
          <label>
            {section === "endings" ? "Ending title" : "Name"}
            <input
              maxLength={120}
              value={item.name ?? item.title}
              onChange={(e) =>
                edit((x) => {
                  x[section === "endings" ? "title" : "name"] = e.target.value;
                })
              }
            />
          </label>
          {section === "decks" && (
            <>
              <label>
                Draw mode
                <select
                  value={item.mode}
                  onChange={(e) =>
                    edit((x) =>
                      setDeckMode(x, e.target.value as "ordered" | "weighted"),
                    )
                  }
                >
                  <option value="ordered">In order</option>
                  <option value="weighted">Random, weighted</option>
                </select>
              </label>
              <p className="hint">
                {item.mode === "ordered"
                  ? "Draws cycle through this order, skipping ineligible cards. Switching to this mode resets all weights to 1."
                  : "Higher weights make eligible cards more likely. A weight of 2 is twice as likely as 1 within this deck."}{" "}
                Immediate repeats are avoided when another card is available.
              </p>
              <h3>Cards in this deck</h3>
              {item.cards.map((entry: any, i: number) => (
                <div className="story-entry" key={entry.cardId}>
                  <b>
                    {i + 1}. {cardName(entry.cardId)}
                  </b>
                  {item.mode === "weighted" && (
                    <label>
                      Card weight
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        step={1}
                        value={entry.weight}
                        onChange={(e) =>
                          edit((x) => {
                            x.cards[i].weight = Number(e.target.value);
                          })
                        }
                      />
                    </label>
                  )}
                  <div className="row-actions">
                    <OrderButtons
                      index={i}
                      count={item.cards.length}
                      label={`card ${i + 1}`}
                      onMove={(offset) =>
                        edit((x) => {
                          x.cards = move(x.cards, i, offset);
                        })
                      }
                    />
                    <button
                      aria-label={`Remove card ${i + 1} from deck`}
                      disabled={item.cards.length === 1}
                      onClick={() =>
                        edit((x) => {
                          x.cards.splice(i, 1);
                        })
                      }
                    >
                      Remove from deck
                    </button>
                  </div>
                </div>
              ))}
              <label>
                Add existing card
                <select
                  value=""
                  disabled={item.cards.length === g.cards.length}
                  onChange={(e) => {
                    if (e.target.value)
                      edit((x) =>
                        x.cards.push({ cardId: e.target.value, weight: 1 }),
                      );
                  }}
                >
                  <option value="">Choose a card…</option>
                  {g.cards
                    .filter(
                      (c: any) =>
                        !item.cards.some((e: any) => e.cardId === c.id),
                    )
                    .map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {cardName(c.id)}
                      </option>
                    ))}
                </select>
              </label>
              <p className="hint">
                Every deck needs at least one card. Create new cards in the
                Cards tab.
              </p>
            </>
          )}
          {section === "chapters" && (
            <>
              <label>
                Game starts in
                <select
                  value={g.startChapterId}
                  onChange={(e) =>
                    update((next) => {
                      next.startChapterId = e.target.value;
                    })
                  }
                >
                  {g.chapters.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <EffectsEditor
                game={g}
                title="On entering this chapter"
                value={item.onEnter}
                onChange={(value) =>
                  edit((x) => {
                    x.onEnter = value;
                  })
                }
              />
              <h3>Active decks</h3>
              <p className="hint">
                An eligible deck is chosen by weight first, then a card is drawn
                from it.
              </p>
              {item.decks.map((entry: any, i: number) => (
                <div className="story-entry" key={entry.deckId}>
                  <b>{g.decks.find((d: any) => d.id === entry.deckId).name}</b>
                  <label>
                    Deck weight
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      value={entry.weight}
                      onChange={(e) =>
                        edit((x) => {
                          x.decks[i].weight = Number(e.target.value);
                        })
                      }
                    />
                  </label>
                  <ConditionEditor
                    game={g}
                    title="Use this deck when"
                    value={entry.when}
                    onChange={(value) =>
                      edit((x) => setOptional(x.decks[i], "when", value))
                    }
                  />
                  <button
                    disabled={item.decks.length === 1}
                    onClick={() =>
                      edit((x) => {
                        x.decks.splice(i, 1);
                      })
                    }
                  >
                    Remove deck from chapter
                  </button>
                </div>
              ))}
              <label>
                Add existing deck
                <select
                  value=""
                  disabled={item.decks.length === g.decks.length}
                  onChange={(e) => {
                    if (e.target.value)
                      edit((x) =>
                        x.decks.push({ deckId: e.target.value, weight: 1 }),
                      );
                  }}
                >
                  <option value="">Choose a deck…</option>
                  {g.decks
                    .filter(
                      (d: any) =>
                        !item.decks.some((e: any) => e.deckId === d.id),
                    )
                    .map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              <h3>Chapter transitions</h3>
              <p className="hint">
                Checked after each decision and after endings. The first
                matching transition wins. Returning to a chapter resets its
                decision count and once-per-visit cards.
              </p>
              {item.transitions.map((t: any, i: number) => (
                <div className="story-entry" key={i}>
                  <label>
                    Transition {i + 1}: go to
                    <select
                      value={t.toChapterId}
                      onChange={(e) =>
                        edit((x) => {
                          x.transitions[i].toChapterId = e.target.value;
                        })
                      }
                    >
                      {g.chapters.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.id === item.id ? " (restart this chapter)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ConditionEditor
                    game={g}
                    title={`Transition ${i + 1} conditions`}
                    required
                    value={t.when}
                    onChange={(value) =>
                      edit((x) => {
                        x.transitions[i].when = value;
                      })
                    }
                  />
                  <div className="row-actions">
                    <OrderButtons
                      index={i}
                      count={item.transitions.length}
                      label={`transition ${i + 1}`}
                      onMove={(offset) =>
                        edit((x) => {
                          x.transitions = move(x.transitions, i, offset);
                        })
                      }
                    />
                    <button
                      onClick={() =>
                        edit((x) => {
                          x.transitions.splice(i, 1);
                        })
                      }
                    >
                      Remove transition
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() =>
                  edit((x) =>
                    x.transitions.push({
                      toChapterId:
                        g.chapters.find((c: any) => c.id !== item.id)?.id ??
                        item.id,
                      when: defaultCondition(),
                    }),
                  )
                }
              >
                ＋ Add transition
              </button>
            </>
          )}
          {section === "flags" && (
            <>
              <label>
                Value at the start of a run
                <select
                  value={String(item.initial)}
                  onChange={(e) =>
                    edit((x) => {
                      x.initial = e.target.value === "true";
                    })
                  }
                >
                  <option value="false">False / disabled</option>
                  <option value="true">True / enabled</option>
                </select>
              </label>
              <label>
                Scope
                <select
                  value={item.scope}
                  onChange={(e) =>
                    edit((x) => {
                      x.scope = e.target.value;
                    })
                  }
                >
                  <option value="run">This run only</option>
                  <option value="persistent">Across new games</option>
                </select>
              </label>
              <p className="story-description">
                Set this flag in a card choice or chapter entry effect. Then use
                it as a condition on cards, decks, transitions or endings.
              </p>
              <p className="hint">
                {item.scope === "persistent"
                  ? "Persistent flags are saved in the player's browser and survive New game. Reset all progress clears them."
                  : "Run flags reset whenever a new game starts."}
              </p>
              {uses.length > 0 && (
                <p className="hint">
                  Used by: {uses.map((use) => use.label).join(" · ")}
                </p>
              )}
            </>
          )}
          {section === "endings" && (
            <>
              <label>
                Ending story
                <textarea
                  rows={4}
                  maxLength={4000}
                  value={item.text}
                  onChange={(e) =>
                    edit((x) => {
                      x.text = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Ending artwork
                <select
                  value={item.imageAssetId ?? ""}
                  onChange={(e) =>
                    edit((x) => setOptional(x, "imageAssetId", e.target.value))
                  }
                >
                  <option value="">No artwork</option>
                  {g.assets
                    .filter((a: any) => a.kind === "image")
                    .map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.id}
                      </option>
                    ))}
                </select>
              </label>
              {item.id === g.fallbackEndingId ? (
                <p className="story-description">
                  This is the fallback: it appears when no eligible card
                  remains. It has no conditions and does not compete with the
                  other endings.
                </p>
              ) : (
                <>
                  <div className="priority-bar">
                    <b>
                      Priority {rank + 1} of {ranked.length} · highest first
                    </b>
                    <OrderButtons
                      index={rank}
                      count={ranked.length}
                      label="ending priority"
                      onMove={(offset) =>
                        update((next) => {
                          const other = next.endings.find(
                              (e: any) => e.id === ranked[rank + offset].id,
                            ),
                            current = next.endings.find(
                              (e: any) => e.id === item.id,
                            );
                          [current.priority, other.priority] = [
                            other.priority,
                            current.priority,
                          ];
                        })
                      }
                    />
                  </div>
                  <ol className="ending-order">
                    {ranked.map((e) => (
                      <li key={e.id}>
                        {e.title}
                        {e.id === item.id ? " · selected" : ""}
                      </li>
                    ))}
                  </ol>
                  <ConditionEditor
                    game={g}
                    title="End the game when"
                    required
                    value={item.when}
                    onChange={(value) =>
                      edit((x) => {
                        x.when = value;
                      })
                    }
                  />
                </>
              )}
            </>
          )}
          <div className="delete-story">
            <button
              disabled={!!reason}
              onClick={() => {
                if (
                  !window.confirm(
                    `Delete “${item.name ?? item.title}”? This cannot be undone. Export a backup first if you need to keep it.`,
                  )
                )
                  return;
                update((next) => {
                  deleteStoryItem(next, section, item.id);
                });
                select("");
              }}
            >
              Delete {names[section]}
            </button>
            <p className="hint">
              {reason ||
                "This item has no blocking references. Export a backup before removing important work."}
            </p>
          </div>
        </fieldset>
      ) : (
        <p className="story-description">
          Add your first {names[section]} to get started.
        </p>
      )}
    </div>
  );
}
