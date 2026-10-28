import { move, setOptional } from "./authoring";
import { OrderButtons } from "./RuleEditors";
import { newStat, statDeletionReason, statUses } from "./resources";

export function ResourceSettings({
  game,
  update,
  assets,
  readOnly = false,
}: {
  game: any;
  update: (fn: (game: any) => void) => void;
  assets: Record<string, string>;
  readOnly?: boolean;
}) {
  return (
    <fieldset className="resource-settings" disabled={readOnly}>
      <div className="section-head">
        <div>
          <h3>Resources</h3>
          <p>
            These are the meters players manage. Add up to six, reorder them,
            and give each one a clear name and range.
          </p>
        </div>
        <button
          disabled={game.stats.length >= 6}
          onClick={() => update((next) => next.stats.push(newStat()))}
        >
          ＋ Add resource
        </button>
      </div>
      {game.stats.map((stat: any, index: number) => {
        const reason = statDeletionReason(game, stat.id);
        const uses = statUses(game, stat.id);
        const invalidRange =
          !Number.isFinite(stat.min) ||
          !Number.isFinite(stat.max) ||
          stat.min >= stat.max;
        const invalidInitial =
          !Number.isFinite(stat.initial) ||
          stat.initial < stat.min ||
          stat.initial > stat.max;
        return (
          <div className="resource-row" key={stat.id}>
            <div className="resource-main">
              <label>
                Name
                <input
                  maxLength={120}
                  aria-invalid={stat.name.length === 0}
                  value={stat.name}
                  onChange={(event) =>
                    update((next) => {
                      next.stats.find((item: any) => item.id === stat.id).name =
                        event.target.value;
                    })
                  }
                />
              </label>
              {stat.name.length === 0 && (
                <small className="field-error">Give this resource a name.</small>
              )}
              <div className="resource-numbers">
                <label>
                  Min
                  <input
                    type="number"
                    step={1}
                    value={stat.min}
                    onChange={(event) =>
                      update((next) => {
                        next.stats.find(
                          (item: any) => item.id === stat.id,
                        ).min = Number(event.target.value);
                      })
                    }
                  />
                </label>
                <label>
                  Max
                  <input
                    type="number"
                    step={1}
                    value={stat.max}
                    onChange={(event) =>
                      update((next) => {
                        next.stats.find(
                          (item: any) => item.id === stat.id,
                        ).max = Number(event.target.value);
                      })
                    }
                  />
                </label>
                <label>
                  Start
                  <input
                    type="number"
                    step={1}
                    value={stat.initial}
                    onChange={(event) =>
                      update((next) => {
                        next.stats.find(
                          (item: any) => item.id === stat.id,
                        ).initial = Number(event.target.value);
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Icon
                <select
                  value={stat.iconAssetId ?? ""}
                  onChange={(event) =>
                    update((next) =>
                      setOptional(
                        next.stats.find((item: any) => item.id === stat.id),
                        "iconAssetId",
                        event.target.value,
                      ),
                    )
                  }
                >
                  <option value="">No icon</option>
                  {game.assets
                    .filter((asset: any) => asset.kind === "image")
                    .map((asset: any) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.path.split("/").pop()}
                      </option>
                    ))}
                </select>
              </label>
              {stat.iconAssetId && assets[stat.iconAssetId] && (
                <img
                  className="resource-icon-preview"
                  src={assets[stat.iconAssetId]}
                  alt=""
                />
              )}
            </div>
            <div className="resource-side">
              <OrderButtons
                index={index}
                count={game.stats.length}
                label={`${stat.name} resource`}
                onMove={(offset) =>
                  update((next) => {
                    next.stats = move(next.stats, index, offset);
                  })
                }
              />
              <button
                disabled={!!reason}
                title={reason}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Delete the “${stat.name}” resource? This cannot be undone.`,
                    )
                  )
                    return;
                  update((next) => {
                    next.stats = next.stats.filter(
                      (item: any) => item.id !== stat.id,
                    );
                  });
                }}
              >
                Delete
              </button>
            </div>
            {uses.length > 0 && (
              <small className="resource-uses">
                Used by: {uses.map((use) => use.label).join(" · ")}
              </small>
            )}
            {invalidRange && (
              <small className="field-error">
                Minimum must be below maximum.
              </small>
            )}
            {invalidInitial && (
              <small className="field-error">
                Starting value must stay between minimum and maximum.
              </small>
            )}
          </div>
        );
      })}
      {game.stats.length >= 6 && (
        <p className="hint">A game can define at most six resources.</p>
      )}
    </fieldset>
  );
}
