import { useState } from "react";
import { parseTags } from "./tags";

export function CardTags({
  tags,
  onChange,
  readOnly = false,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = (value = draft) => {
    const next = parseTags(value);
    if (!next.length) return;
    onChange([...new Set([...tags, ...next])]);
    setDraft("");
  };
  return (
    <div className="tag-editor">
      <label>
        Tags
        <input
          value={draft}
          disabled={readOnly}
          placeholder="storm, ally, chapter-two"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(event.currentTarget.value);
            }
          }}
          onBlur={(event) => add(event.currentTarget.value)}
        />
      </label>
      <div className="tag-list" aria-label="Card tags">
        {tags.map((tag) => (
          <span className="tag-chip" key={tag}>
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              disabled={readOnly}
              onClick={() => onChange(tags.filter((item) => item !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        {!tags.length && <small>No tags yet. Tags are for finding cards.</small>}
      </div>
    </div>
  );
}
