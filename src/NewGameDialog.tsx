import { useEffect, useState } from "react";
import type { NewGameOptions } from "./newProject";
import { themePresets } from "./theme";

export function NewGameDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (options: NewGameOptions) => void;
}) {
  const [title, setTitle] = useState("Untitled story");
  const [preset, setPreset] = useState(1);
  const [resourceName, setResourceName] = useState("Resolve");
  const [resourceInitial, setResourceInitial] = useState(50);
  const [chapterName, setChapterName] = useState("Chapter one");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle("Untitled story");
    setPreset(1);
    setResourceName("Resolve");
    setResourceInitial(50);
    setChapterName("Chapter one");
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="new-game-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-game-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) {
            setError("Give the story a title.");
            return;
          }
          if (!resourceName.trim()) {
            setError("Name the first resource.");
            return;
          }
          if (!chapterName.trim()) {
            setError("Name the first chapter.");
            return;
          }
          if (
            !Number.isFinite(resourceInitial) ||
            resourceInitial < 0 ||
            resourceInitial > 100
          ) {
            setError("The starting value must be between 0 and 100.");
            return;
          }
          onCreate({
            title,
            theme: structuredClone(themePresets[preset].theme),
            resourceName,
            resourceInitial: Math.round(resourceInitial),
            chapterName,
          });
        }}
      >
        <div className="dialog-head">
          <div>
            <div className="eyebrow">NEW GAME</div>
            <h2 id="new-game-title">Start with a blank canvas.</h2>
          </div>
          <button type="button" className="dialog-close" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="hint">
          This creates a valid one-scene starter with no example content. You can
          change every value later.
        </p>
        <label>
          Story title
          <input
            autoFocus
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Visual theme
          <select
            value={preset}
            onChange={(event) => setPreset(Number(event.target.value))}
          >
            {themePresets.map((item, index) => (
              <option key={item.theme.preset} value={index}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-grid">
          <label>
            First resource
            <input
              maxLength={120}
              value={resourceName}
              onChange={(event) => setResourceName(event.target.value)}
            />
          </label>
          <label>
            Starting value
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={resourceInitial}
              onChange={(event) => setResourceInitial(Number(event.target.value))}
            />
          </label>
        </div>
        <label>
          First chapter
          <input
            maxLength={120}
            value={chapterName}
            onChange={(event) => setChapterName(event.target.value)}
          />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Create game
          </button>
        </div>
      </form>
    </div>
  );
}
