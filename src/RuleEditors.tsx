import {
  defaultCondition,
  move,
  type Comparison,
  type Condition,
  type Effect,
  type Predicate,
} from "./authoring";

type Named = { id: string; name: string; scope?: string };
type Resources = { stats: Named[]; flags: Named[] };
const operators: [Comparison, string][] = [
  ["eq", "equals"],
  ["lt", "less than"],
  ["lte", "at most"],
  ["gt", "greater than"],
  ["gte", "at least"],
];

export function OrderButtons({
  index,
  count,
  onMove,
  label,
}: {
  index: number;
  count: number;
  onMove: (offset: number) => void;
  label: string;
}) {
  return (
    <span className="order-buttons">
      <button
        type="button"
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
    </span>
  );
}

export function ConditionEditor({
  game,
  value,
  onChange,
  title = "Conditions",
  required = false,
}: {
  game: Resources;
  value?: Condition;
  onChange: (value: Condition | undefined) => void;
  title?: string;
  required?: boolean;
}) {
  function replace(index: number, rule: Predicate) {
    if (value)
      onChange({
        ...value,
        rules: value.rules.map((r, i) => (i === index ? rule : r)),
      });
  }
  return (
    <fieldset className="rule-editor">
      <legend>{title}</legend>
      {!value ? (
        <div className="rule-empty">
          <p>No conditions. Always eligible.</p>
          <button onClick={() => onChange(defaultCondition())}>
            Add condition
          </button>
        </div>
      ) : (
        <>
          <div className="rule-toolbar">
            <label>
              Match
              <select
                value={value.mode}
                onChange={(e) =>
                  onChange({
                    ...value,
                    mode: e.target.value as Condition["mode"],
                  })
                }
              >
                <option value="all">All rules (AND)</option>
                <option value="any">Any rule (OR)</option>
              </select>
            </label>
            {!required && (
              <button onClick={() => onChange(undefined)}>
                Remove conditions
              </button>
            )}
          </div>
          {value.rules.map((r, i) => (
            <div className="rule-row" key={i}>
              <label>
                Rule {i + 1}
                <select
                  value={r.kind}
                  onChange={(e) =>
                    replace(
                      i,
                      e.target.value === "stat"
                        ? {
                            kind: "stat",
                            statId: game.stats[0].id,
                            op: "gte",
                            value: 50,
                          }
                        : e.target.value === "flag"
                          ? {
                              kind: "flag",
                              flagId: game.flags[0].id,
                              value: true,
                            }
                          : {
                              kind: "turn",
                              scope: "chapter",
                              op: "gte",
                              value: 5,
                            },
                    )
                  }
                >
                  <option value="stat">Resource</option>
                  <option value="flag" disabled={!game.flags.length}>
                    Story flag
                  </option>
                  <option value="turn">Decisions made</option>
                </select>
              </label>
              {r.kind === "stat" ? (
                <label>
                  Resource
                  <select
                    value={r.statId}
                    onChange={(e) =>
                      replace(i, { ...r, statId: e.target.value })
                    }
                  >
                    {game.stats.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : r.kind === "flag" ? (
                <label>
                  Flag
                  <select
                    value={r.flagId}
                    onChange={(e) =>
                      replace(i, { ...r, flagId: e.target.value })
                    }
                  >
                    {game.flags.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {f.scope === "persistent" ? " · persistent" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Count in
                  <select
                    value={r.scope}
                    onChange={(e) =>
                      replace(i, {
                        ...r,
                        scope: e.target.value as "run" | "chapter",
                      })
                    }
                  >
                    <option value="chapter">This chapter visit</option>
                    <option value="run">Entire run</option>
                  </select>
                </label>
              )}
              {r.kind === "flag" ? (
                <label>
                  Is
                  <select
                    value={String(r.value)}
                    onChange={(e) =>
                      replace(i, { ...r, value: e.target.value === "true" })
                    }
                  >
                    <option value="true">True / enabled</option>
                    <option value="false">False / disabled</option>
                  </select>
                </label>
              ) : (
                <>
                  <label>
                    Comparison
                    <select
                      value={r.op}
                      onChange={(e) =>
                        replace(i, { ...r, op: e.target.value as Comparison })
                      }
                    >
                      {operators.map(([op, name]) => (
                        <option key={op} value={op}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Value
                    <input
                      type="number"
                      step="1"
                      min={r.kind === "turn" ? 0 : undefined}
                      value={r.value}
                      onChange={(e) =>
                        replace(i, { ...r, value: Number(e.target.value) })
                      }
                    />
                  </label>
                </>
              )}
              <button
                aria-label={`Remove rule ${i + 1}`}
                disabled={value.rules.length === 1}
                onClick={() =>
                  onChange({
                    ...value,
                    rules: value.rules.filter((_, n) => i !== n),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            disabled={value.rules.length >= 20}
            onClick={() =>
              onChange({
                ...value,
                rules: [...value.rules, defaultCondition().rules[0]],
              })
            }
          >
            ＋ Add rule
          </button>
          <p className="hint">
            Decisions are counted after a choice. Chapter counts reset on every
            chapter entry.
          </p>
        </>
      )}
    </fieldset>
  );
}

export function EffectsEditor({
  game,
  value,
  onChange,
  title = "Effects",
}: {
  game: Resources;
  value: Effect[];
  onChange: (value: Effect[]) => void;
  title?: string;
}) {
  const replace = (index: number, effect: Effect) =>
    onChange(value.map((e, i) => (i === index ? effect : e)));
  return (
    <fieldset className="rule-editor effects-editor">
      <legend>{title}</legend>
      <p className="hint">
        Applied from top to bottom. Resource changes stop at their minimum and
        maximum.
      </p>
      {value.map((e, i) => (
        <div className="rule-row" key={i}>
          <label>
            Effect {i + 1}
            <select
              value={e.kind}
              onChange={(event) =>
                replace(
                  i,
                  event.target.value === "statDelta"
                    ? { kind: "statDelta", statId: game.stats[0].id, delta: 0 }
                    : {
                        kind: "setFlag",
                        flagId: game.flags[0].id,
                        value: true,
                      },
                )
              }
            >
              <option value="statDelta">Change resource</option>
              <option value="setFlag" disabled={!game.flags.length}>
                Set story flag
              </option>
            </select>
          </label>
          {e.kind === "statDelta" ? (
            <>
              <label>
                Resource
                <select
                  value={e.statId}
                  onChange={(event) =>
                    replace(i, { ...e, statId: event.target.value })
                  }
                >
                  {game.stats.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Change (+ / −)
                <input
                  type="number"
                  step="1"
                  value={e.delta}
                  onChange={(event) =>
                    replace(i, { ...e, delta: Number(event.target.value) })
                  }
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Flag
                <select
                  value={e.flagId}
                  onChange={(event) =>
                    replace(i, { ...e, flagId: event.target.value })
                  }
                >
                  {game.flags.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.scope === "persistent" ? " · persistent" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Set to
                <select
                  value={String(e.value)}
                  onChange={(event) =>
                    replace(i, { ...e, value: event.target.value === "true" })
                  }
                >
                  <option value="true">True / enabled</option>
                  <option value="false">False / disabled</option>
                </select>
              </label>
            </>
          )}
          <div className="row-actions">
            <OrderButtons
              index={i}
              count={value.length}
              label={`effect ${i + 1}`}
              onMove={(offset) => onChange(move(value, i, offset))}
            />
            <button
              aria-label={`Remove effect ${i + 1}`}
              onClick={() => onChange(value.filter((_, n) => n !== i))}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      {!value.length && <p className="hint">No changes yet.</p>}
      <button
        disabled={value.length >= 30}
        onClick={() =>
          onChange([
            ...value,
            { kind: "statDelta", statId: game.stats[0].id, delta: 0 },
          ])
        }
      >
        ＋ Add effect
      </button>
      {!game.flags.length && (
        <p className="hint">
          Create a flag in Structure & rules to remember a story event.
        </p>
      )}
    </fieldset>
  );
}
