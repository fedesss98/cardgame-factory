import { useState } from "react";
import { validateProject } from "./validate";

export function JsonEditor({
  game,
  images,
  onApply,
}: {
  game: any;
  images: Record<string, string>;
  onApply: (game: any) => void;
}) {
  const current = JSON.stringify(game, null, 2);
  const [base, setBase] = useState(current);
  const [draft, setDraft] = useState(current);
  const [message, setMessage] = useState("");
  const stale = current !== base;
  return (
    <div className="settings">
      <h2>Advanced JSON</h2>
      <p>
        Optional full-project editor. Use Structure &amp; rules for visual
        authoring. Changes here are applied only when you validate them.
      </p>
      {stale && (
        <p role="alert" className="errors">
          The project changed after this draft was opened. Reload it before
          applying JSON so newer work is not overwritten.
        </p>
      )}
      <textarea
        className="code"
        aria-label="Game structure JSON"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="row-actions">
        <button
          className="primary"
          disabled={stale}
          onClick={() => {
            try {
              const next = JSON.parse(draft),
                errors = validateProject(next, images);
              if (errors.length) throw new Error(errors.join("; "));
              onApply(next);
              setBase(JSON.stringify(next, null, 2));
              setMessage(
                "Rules applied. Click Apply edits to restart the playtest.",
              );
            } catch (e) {
              setMessage(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Validate &amp; apply
        </button>
        <button
          onClick={() => {
            setBase(current);
            setDraft(current);
            setMessage("Draft reloaded from the project.");
          }}
        >
          Reload from project
        </button>
      </div>
      <p role="status" className="hint">
        {message}
      </p>
    </div>
  );
}
