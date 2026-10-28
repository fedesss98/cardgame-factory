import { useEffect, useRef, useState } from "react";
import { Player } from "./PlayerView";
import { ENGINE_VERSION } from "./engine";
import { sameImages } from "./useProjectHistory";
import {
  startScenario,
  step,
  intervene,
  forceCard,
  eligibility,
  type Scenario,
  type Overrides,
  type Frame,
} from "./playSession";
import {
  createRunTrace,
  replayRunTrace,
  type TraceIntervention,
} from "./runTrace";
import { buildRunReport } from "./runReport";

type Snapshot = { game: any; assets: Record<string, string>; label: string };
function scenarioValues(scenario: Scenario) {
  const values: Record<string, string> = {};
  for (const [id, value] of Object.entries(scenario.stats || {}))
    values["stat:" + id] = String(value);
  for (const [id, value] of Object.entries(scenario.flags || {}))
    values["flag:" + id] = String(value);
  if (scenario.turn !== undefined) values.turn = String(scenario.turn);
  if (scenario.chapterTurn !== undefined)
    values.chapterTurn = String(scenario.chapterTurn);
  return values;
}
export function Playtest({
  game,
  assets,
  errors,
  label,
  revision,
}: Snapshot & { errors: string[]; revision?: number }) {
  const capture = () => structuredClone({ game, assets, label });
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() =>
    errors.length ? null : capture(),
  );
  const [frames, setFrames] = useState<Frame[]>(() =>
    errors.length
      ? []
      : [startScenario(game, { chapterId: game.startChapterId, seed: 42 })],
  );
  const [interventions, setInterventions] = useState<TraceIntervention[]>([]);
  const [scenario, setScenario] = useState<Scenario>({
    chapterId: game.startChapterId,
    seed: 42,
  });
  const [chapter, setChapter] = useState(game.startChapterId),
    [deck, setDeck] = useState(""),
    [seed, setSeed] = useState("42");
  const [values, setValues] = useState<Record<string, string>>({});
  const [forced, setForced] = useState(""),
    [expanded, setExpanded] = useState(false),
    [debug, setDebug] = useState(false),
    [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null),
    opener = useRef<HTMLButtonElement>(null);
  const frame = frames.at(-1),
    g = snapshot?.game;
  const report = g ? buildRunReport(g, frames, errors) : null;
  function attempt(action: () => void) {
    try {
      action();
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function applyLatest() {
    if (errors.length) {
      setMessage(errors[0]);
      return;
    }
    const next = { chapterId: game.startChapterId, seed: 42 };
    setSnapshot(capture());
    setScenario(next);
    setFrames([startScenario(game, next)]);
    setInterventions([]);
    setChapter(next.chapterId);
    setDeck("");
    setSeed("42");
    setValues({});
    setForced("");
    setMessage("");
  }
  const overrides = (): Overrides => {
    const result: Overrides = { stats: {}, flags: {} };
    for (const stat of g.stats)
      if (values["stat:" + stat.id])
        result.stats![stat.id] = Number(values["stat:" + stat.id]);
    for (const flag of g.flags)
      if (values["flag:" + flag.id])
        result.flags![flag.id] = values["flag:" + flag.id] === "true";
    for (const key of ["turn", "chapterTurn"] as const)
      if (values[key]) result[key] = Number(values[key]);
    return result;
  };
  const push = (
    make: (previous: Frame) => Frame,
    intervention?: TraceIntervention,
  ) => {
    setFrames((old) => [...old.slice(-199), make(old[old.length - 1])]);
    if (intervention)
      setInterventions((old) => [...old, intervention]);
  };
  const edit = (key: string, value: string) =>
    setValues((old) => ({ ...old, [key]: value }));
  function startRun(next: Scenario, initial = startScenario(g, next)) {
    setScenario(next);
    setFrames([initial]);
    setInterventions([]);
    setChapter(next.chapterId);
    setDeck(next.deckId || "");
    setSeed(String(next.seed));
    setValues(scenarioValues(next));
    setForced("");
  }
  function downloadJson(name: string, value: unknown) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], {
        type: "application/json",
      }),
    );
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  function shareRun() {
    if (!snapshot || !frame) return;
    try {
      const trace = createRunTrace({
        game: snapshot.game,
        scenario,
        interventions,
        frames,
        revision,
        label: snapshot.label,
      });
      downloadJson(`${snapshot.game.id}-playtest-run.json`, trace);
      setMessage(
        "Run trace downloaded. It records the scenario, interventions, content fingerprint and final state.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function loadRun(file: File) {
    try {
      if (!g) throw Error("Load a playable snapshot before replaying a run.");
      const trace = JSON.parse(await file.text());
      const replayed = replayRunTrace(g, trace);
      setScenario(trace.scenario);
      setFrames(replayed.frames);
      setInterventions(replayed.interventions);
      setChapter(trace.scenario.chapterId);
      setDeck(trace.scenario.deckId || "");
      setSeed(String(trace.scenario.seed));
      setValues(scenarioValues(trace.scenario));
      setForced("");
      setMessage(
        `Replayed ${
          trace.source === "shared-revision"
            ? `shared revision ${trace.revision}`
            : "a local-draft"
        } trace recorded ${new Date(trace.createdAt).toLocaleString()}.`,
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function close() {
    if (document.fullscreenElement === root.current)
      void document.exitFullscreen().catch(() => {});
    setExpanded(false);
  }
  useEffect(() => {
    if (!expanded || !root.current) return;
    const container = root.current;
    let nativeActive = document.fullscreenElement === container;
    function fullscreenChanged() {
      if (document.fullscreenElement === container) nativeActive = true;
      else if (nativeActive) {
        nativeActive = false;
        setExpanded(false);
      }
    }
    document.addEventListener("fullscreenchange", fullscreenChanged);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const siblings: { node: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = container;
    while (branch.parentElement && branch !== document.body) {
      for (const child of Array.from(branch.parentElement.children))
        if (child !== branch && child instanceof HTMLElement) {
          siblings.push({ node: child, inert: child.inert });
          child.inert = true;
        }
      branch = branch.parentElement;
    }
    container.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const focusable = Array.from(
          container.querySelectorAll<HTMLElement>(
            'button,input,select,textarea,[tabindex="0"],summary',
          ),
        ).filter(
          (el) => !el.hasAttribute("disabled") && el.getClientRects().length,
        );
        const first = focusable[0],
          last = focusable.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === container)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    container.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("fullscreenchange", fullscreenChanged);
      container.removeEventListener("keydown", key);
      document.body.style.overflow = previousOverflow;
      siblings.forEach(({ node, inert }) => {
        node.inert = inert;
      });
      opener.current?.focus();
    };
  }, [expanded]);
  async function fullscreen() {
    setExpanded(true);
    setDebug(false);
    if (root.current) root.current.scrollTop = 0;
    try {
      if (!root.current?.requestFullscreen) throw Error();
      await root.current.requestFullscreen();
      setMessage("");
    } catch {
      setMessage("Browser fullscreen is unavailable. Expanded view is active.");
    }
  }
  const stale =
    snapshot &&
    (JSON.stringify(game) !== JSON.stringify(snapshot.game) ||
      !sameImages(assets, snapshot.assets));
  return (
    <div
      ref={root}
      tabIndex={-1}
      className={"playtest-workspace" + (expanded ? " expanded" : "")}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label="Playtest workspace"
    >
      <div className="playtest-toolbar">
        <strong>Playtest</strong>
        <button
          ref={opener}
          onClick={() => (expanded ? close() : setExpanded(true))}
        >
          {expanded ? "Back to editor" : "Expand playtest"}
        </button>
        <button onClick={() => void fullscreen()}>Fullscreen</button>
        <button
          aria-pressed={debug && expanded}
          onClick={() => {
            setDebug(!expanded || !debug);
            setExpanded(true);
          }}
        >
          {debug && expanded ? "Hide test controls" : "Test controls"}
        </button>
        <button disabled={!!errors.length} onClick={applyLatest}>
          Apply latest edits · restart
        </button>
      </div>
      <p className="hint">
        {snapshot?.label || label} · {g?.title || game.title}
        {stale
          ? " · New edits available; this run is unchanged."
          : " · Snapshot captured for this run."}
      </p>
      {!!errors.length && (
        <p role="alert">
          Latest draft has errors: {errors[0]} Fix it before applying edits.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!snapshot && !errors.length && (
        <button onClick={applyLatest}>Load playable snapshot</button>
      )}
      {g && frame && (
        <div
          className={
            "playtest-layout" + (debug && expanded ? " with-controls" : "")
          }
        >
          <div className="playtest-stage">
            <Player
              game={g}
              assets={snapshot!.assets}
              session={{
                state: frame.state,
                choose: (side) =>
                  push(
                    (old) => step(g, old, side),
                    { kind: "choice", side },
                  ),
                restart: () => startRun(scenario),
              }}
            />
            <p className="hint">
              Focus the player to use ← / →. Swipe or use buttons.{" "}
              {frame.deckId && `Isolated deck: ${frame.deckId}.`}
            </p>
          </div>
          {debug && expanded && (
            <section
              className="playtest-controls"
              aria-label="Scenario controls"
            >
              <h2>Test a scene</h2>
              <p className="hint">
                These controls affect only this test. Start applies chapter
                entry effects, then overrides. Earlier chapters are not
                simulated.
              </p>
              <label>
                Chapter
                <select
                  aria-label="Chapter"
                  value={chapter}
                  onChange={(e) => {
                    setChapter(e.target.value);
                    setDeck("");
                  }}
                >
                  {g.chapters.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Deck
                <select
                  aria-label="Deck"
                  value={deck}
                  onChange={(e) => setDeck(e.target.value)}
                >
                  <option value="">All chapter decks (normal rules)</option>
                  {g.chapters
                    .find((c: any) => c.id === chapter)
                    ?.decks.map((entry: any) => (
                      <option key={entry.deckId} value={entry.deckId}>
                        {g.decks.find((d: any) => d.id === entry.deckId)
                          ?.name || entry.deckId}
                      </option>
                    ))}
                </select>
              </label>
              <p className="hint">
                Isolation limits automatic draws. Follow-ups can leave the deck;
                transitions clear isolation. Conditions and repeat limits still
                apply.
              </p>
              <label>
                Random seed
                <input
                  type="number"
                  min="0"
                  max="4294967295"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                />
              </label>
              <h3>Test overrides</h3>
              <p className="hint">
                Leave blank to keep the normal/current value.
              </p>
              {g.stats.map((s: any) => (
                <label key={s.id}>
                  {s.name} ({s.min}–{s.max})
                  <input
                    type="number"
                    min={s.min}
                    max={s.max}
                    placeholder="Unchanged"
                    value={values["stat:" + s.id] || ""}
                    onChange={(e) => edit("stat:" + s.id, e.target.value)}
                  />
                </label>
              ))}
              {g.flags.map((f: any) => (
                <label key={f.id}>
                  {f.name}
                  <select
                    value={values["flag:" + f.id] || ""}
                    onChange={(e) => edit("flag:" + f.id, e.target.value)}
                  >
                    <option value="">Unchanged</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </label>
              ))}
              {(["turn", "chapterTurn"] as const).map((key) => (
                <label key={key}>
                  {key === "turn"
                    ? "Completed run turns"
                    : "Completed chapter turns"}
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Unchanged"
                    value={values[key] || ""}
                    onChange={(e) => edit(key, e.target.value)}
                  />
                </label>
              ))}
              <div className="playtest-actions">
                <button
                  onClick={() =>
                    attempt(() => {
                      if (!seed.trim()) throw Error("Enter a seed.");
                      const next = {
                        ...overrides(),
                        chapterId: chapter,
                        deckId: deck || undefined,
                        seed: Number(seed),
                      };
                      const initial = startScenario(g, next);
                      startRun(next, initial);
                    })
                  }
                >
                  Start test
                </button>
                <button
                  onClick={() =>
                    attempt(() => {
                      const overridesForRun = overrides();
                      const next = intervene(g, frame, overridesForRun);
                      push(() => next, {
                        kind: "overrides",
                        overrides: overridesForRun,
                      });
                    })
                  }
                >
                  Apply overrides to current run
                </button>
                <button onClick={() => setValues({})}>
                  Clear override fields
                </button>
                <button
                  onClick={() => {
                    startRun({ chapterId: g.startChapterId, seed: 42 });
                  }}
                >
                  Play from beginning
                </button>
                <button
                  disabled={frames.length < 2}
                  onClick={() => {
                    setFrames((old) => old.slice(0, -1));
                    setInterventions((old) => old.slice(0, -1));
                  }}
                >
                  Step back
                </button>
              </div>
              <p className="hint">
                Applying overrides reevaluates endings/transitions without
                counting a choice. Keeps the current card unless the chapter
                changes.
              </p>
              <details>
                <summary>Force a card (bypasses rules)</summary>
                <label>
                  Card to force
                  <select
                    value={forced}
                    onChange={(e) => setForced(e.target.value)}
                  >
                    <option value="">Choose a card</option>
                    {g.cards.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.character} · {c.id}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={!forced}
                  onClick={() =>
                    attempt(() =>
                      push(
                        () => forceCard(g, frame, forced),
                        { kind: "force", cardId: forced },
                      ),
                    )
                  }
                >
                  Force card
                </button>
                <p className="hint">
                  Bypasses eligibility, repeat limits, deck membership and the
                  current ending. Recorded as a test intervention.
                </p>
              </details>
              <details open>
                <summary>Share or replay this run</summary>
                <p className="hint">
                  {revision
                    ? `Tied to shared revision ${revision}.`
                    : "Local draft; this is not an immutable shared revision."}{" "}
                  Engine {ENGINE_VERSION}. Replay checks the game identity,
                  content fingerprint, compatibility version, scenario, seed and
                  every intervention before accepting the trace.
                </p>
                <div className="playtest-actions">
                  <button disabled={!frame} onClick={shareRun}>
                    Download run trace
                  </button>
                  <label className="trace-import">
                    Load run trace
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void loadRun(file);
                      }}
                    />
                  </label>
                </div>
                <p className="hint">
                  A trace includes the scenario, {interventions.length} recorded
                  intervention{interventions.length === 1 ? "" : "s"}, the
                  ordered event log and the final state. Opening it requires the
                  matching game content.
                </p>
              </details>
              <details open>
                <summary>Playtest report</summary>
                {report && (
                  <>
                    <p>
                      {report.steps} retained states · {report.choices.length}{" "}
                      choices · {report.errors.length} validation error
                      {report.errors.length === 1 ? "" : "s"}.
                    </p>
                    <dl className="state-values">
                      <dt>Cards observed</dt>
                      <dd>
                        {report.coverage.cards.length} / {g.cards.length}
                      </dd>
                      <dt>Chapters observed</dt>
                      <dd>
                        {report.coverage.chapters.length} / {g.chapters.length}
                      </dd>
                      <dt>Endings observed</dt>
                      <dd>
                        {report.coverage.endings.length} / {g.endings.length}
                      </dd>
                    </dl>
                    <h3>Choice history</h3>
                    {report.choices.length ? (
                      <ol className="run-log">
                        {report.choices.map((choice) => (
                          <li key={choice.step}>
                            Step {choice.step} · {choice.chapter} ·{" "}
                            {choice.character || choice.card || "unknown card"} ·{" "}
                            {choice.side || "?"}: {choice.label}
                            {choice.ending ? ` → ending ${choice.ending}` : ""}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p>No choices recorded yet.</p>
                    )}
                    <h3>Dead ends</h3>
                    {report.deadEnds.length ? (
                      <ul>
                        {report.deadEnds.map((deadEnd) => (
                          <li key={deadEnd.step}>
                            Step {deadEnd.step} · {deadEnd.chapter} ·{" "}
                            {deadEnd.reason}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>None observed in the retained run.</p>
                    )}
                    <h3>Unreached content</h3>
                    <p className="hint">
                      Cards: {report.unreached.cards.join(", ") || "none"}.
                      <br />
                      Chapters: {report.unreached.chapters.join(", ") || "none"}.
                      <br />
                      Endings: {report.unreached.endings.join(", ") || "none"}.
                    </p>
                    {report.errors.length > 0 && (
                      <div role="alert">
                        {report.errors.map((error, index) => (
                          <p key={index}>{error}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </details>
              <details open>
                <summary>Current state</summary>
                <dl className="state-values">
                  <dt>Chapter / card</dt>
                  <dd>
                    {frame.state.chapter} / {frame.state.card || "none"}
                  </dd>
                  <dt>Ending</dt>
                  <dd>{frame.state.ending || "none"}</dd>
                  <dt>Turns (run / chapter)</dt>
                  <dd>
                    {frame.state.turn} / {frame.state.chapterTurn}
                  </dd>
                  {g.stats.map((s: any) => (
                    <div key={s.id}>
                      <dt>{s.name}</dt>
                      <dd>{frame.state.stats[s.id]}</dd>
                    </div>
                  ))}
                  {g.flags.map((f: any) => (
                    <div key={f.id}>
                      <dt>{f.name}</dt>
                      <dd>{String(frame.state.flags[f.id])}</dd>
                    </div>
                  ))}
                </dl>
                <details>
                  <summary>Repeat history, cursors and random state</summary>
                  <pre>
                    {JSON.stringify(
                      {
                        seed: frame.state.seed,
                        seen: frame.state.seen,
                        chapterSeen: frame.state.chapterSeen,
                        cursors: frame.state.cursors,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </details>
              <details>
                <summary>Card eligibility for next draw</summary>
                <p className="hint">
                  This is the current state, not the state before the displayed
                  card was drawn. Drawing pauses at an ending.
                </p>
                <ul>
                  {eligibility(g, frame).map((r, i) => (
                    <li key={i}>
                      <strong>
                        {r.deck} / {r.card}
                      </strong>
                      <br />
                      {r.reason}
                    </li>
                  ))}
                </ul>
              </details>
              <details open>
                <summary>Run log · {frames.length} retained steps</summary>
                <p className="hint">
                  Last 200 steps retained. Step back discards the later branch.
                </p>
                <ol className="run-log">
                  {frames.map((f, i) => (
                    <li key={i}>
                      {f.events.map((event, j) => (
                        <div key={j}>{event}</div>
                      ))}
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
