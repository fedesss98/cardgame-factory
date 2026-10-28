import { useState } from "react";
import { move } from "./authoring";

export function CardTools({
  game,
  cardId,
  update,
  onSelect,
  readOnly,
}: {
  game: any;
  cardId: string;
  update: (fn: (g: any) => void) => void;
  onSelect: (id: string) => void;
  readOnly: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [deckId, setDeck] = useState("");
  const [search, setSearch] = useState("");
  const index = game.cards.findIndex((c: any) => c.id === cardId);
  const card = game.cards[index];
  const validSelected = selected.filter((id) =>
    game.cards.some((c: any) => c.id === id),
  );
  const deck = game.decks.find((d: any) => d.id === deckId) || game.decks[0];
  const soleDeck = game.decks.find(
    (d: any) => d.cards.length === 1 && d.cards[0].cardId === cardId,
  );
  const reason =
    game.cards.length <= 1
      ? "Keep at least one card."
      : soleDeck
        ? `Add another card to “${soleDeck.name}” before deleting.`
        : "";
  const visible = game.cards.filter((c: any) =>
    `${c.id} ${c.character} ${c.text}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <fieldset className="card-tools" disabled={readOnly}>
      <div className="author-actions">
        <button
          onClick={() => {
            const id = "card-" + crypto.randomUUID();
            update((g) => {
              const i = g.cards.findIndex((c: any) => c.id === cardId);
              if (i < 0) throw Error("Select a card first.");
              const copy = structuredClone(g.cards[i]);
              copy.id = id;
              copy.character = `${copy.character.slice(0, 112)} (copy)`;
              for (const side of ["left", "right"])
                if (copy[side].followUpCardId === cardId)
                  copy[side].followUpCardId = id;
              g.cards.splice(i + 1, 0, copy);
              for (const d of g.decks) {
                const position = d.cards.findIndex(
                  (c: any) => c.cardId === cardId,
                );
                if (position >= 0)
                  d.cards.splice(position + 1, 0, {
                    ...d.cards[position],
                    cardId: id,
                  });
              }
            });
            onSelect(id);
          }}
        >
          Duplicate card
        </button>
        <button
          disabled={!!reason}
          title={reason}
          onClick={() => {
            if (
              !window.confirm(
                `Delete “${card.character}”? Its deck memberships and incoming follow-ups will be removed. Undo can restore them.`,
              )
            )
              return;
            update((g) => {
              if (
                g.cards.length <= 1 ||
                g.decks.some(
                  (d: any) =>
                    d.cards.length === 1 && d.cards[0].cardId === cardId,
                )
              )
                throw Error(
                  "The last card in a game or deck cannot be deleted.",
                );
              g.cards = g.cards.filter((c: any) => c.id !== cardId);
              for (const d of g.decks)
                d.cards = d.cards.filter((c: any) => c.cardId !== cardId);
              for (const c of g.cards)
                for (const side of ["left", "right"])
                  if (c[side].followUpCardId === cardId)
                    delete c[side].followUpCardId;
            });
            onSelect(game.cards[Math.max(0, index - 1)].id);
          }}
        >
          Delete card
        </button>
        {[-1, 1].map((offset) => (
          <button
            key={offset}
            disabled={index + offset < 0 || index + offset >= game.cards.length}
            onClick={() => {
              update((g) => {
                g.cards = move(
                  g.cards,
                  g.cards.findIndex((c: any) => c.id === cardId),
                  offset,
                );
              });
              onSelect(cardId);
            }}
          >
            {offset < 0 ? "↑ Move earlier" : "↓ Move later"}
          </button>
        ))}
      </div>
      <p className="hint">
        {reason ||
          "Card list order is for editing; gameplay order is set inside each deck."}
      </p>
      <details>
        <summary>
          Bulk deck membership · {validSelected.length} selected
        </summary>
        <label>
          Find cards to group
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="author-actions">
          <button
            onClick={() =>
              setSelected([
                ...new Set([...selected, ...visible.map((c: any) => c.id)]),
              ])
            }
          >
            Select visible
          </button>
          <button onClick={() => setSelected([])}>Clear selection</button>
        </div>
        <div className="bulk-card-list">
          {visible.map((c: any) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={validSelected.includes(c.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, c.id]
                      : selected.filter((id) => id !== c.id),
                  )
                }
              />
              {c.character} · {c.text.slice(0, 65)}
            </label>
          ))}
        </div>
        <label>
          Target deck
          <select value={deck.id} onChange={(e) => setDeck(e.target.value)}>
            {game.decks.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <div className="author-actions">
          <button
            disabled={!validSelected.length}
            onClick={() =>
              update((g) => {
                const d = g.decks.find((d: any) => d.id === deck.id);
                for (const id of validSelected)
                  if (!d.cards.some((c: any) => c.cardId === id))
                    d.cards.push({ cardId: id, weight: 1 });
              })
            }
          >
            Add selected to deck
          </button>
          <button
            disabled={
              !validSelected.length ||
              !deck.cards.some((c: any) => !validSelected.includes(c.cardId))
            }
            onClick={() =>
              update((g) => {
                const d = g.decks.find((d: any) => d.id === deck.id);
                const remaining = d.cards.filter(
                  (c: any) => !validSelected.includes(c.cardId),
                );
                if (!remaining.length)
                  throw Error("Keep at least one card in the deck.");
                d.cards = remaining;
              })
            }
          >
            Remove selected from deck
          </button>
        </div>
        <p className="hint">
          New memberships are appended with weight 1. A deck must keep at least
          one card. Each bulk action can be undone.
        </p>
      </details>
    </fieldset>
  );
}
