import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { start, choose, type State } from "./engine";
import { isLightColor } from "./theme";

const SWIPE_SLOP = 8;
const SWIPE_DISTANCE = 64;
const SWIPE_FLICK_DISTANCE = 24;
const SWIPE_FLICK_VELOCITY = 0.4;

type SwipeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastAt: number;
  dx: number;
  dy: number;
  axis: "pending" | "horizontal" | "vertical";
  velocity: number;
};

export function Player({
  game: input,
  assets,
  session,
  notice,
  progress,
}: {
  game: any;
  assets: Record<string, string>;
  session?: {
    state: State;
    choose: (side: "left" | "right") => void;
    restart: () => void;
    newGame?: () => void;
  };
  notice?: string;
  progress?: {
    discovered: number;
    total: number;
    onReset: () => void;
  };
}) {
  const [snapshot] = useState(() => input);
  const game = session ? input : snapshot;
  const [local, set] = useState(() => start(game));
  const s = session?.state || local;
  const pick = (side: "left" | "right") =>
    session ? session.choose(side) : set((old) => choose(game, old, side));
  const newRun = () =>
    session ? (session.newGame ?? session.restart)() : set(start(game));
  const card = game.cards.find((c: any) => c.id === s.card);
  const ending = game.endings.find((e: any) => e.id === s.ending);
  const backgroundArt = game.theme.backgroundAssetId
    ? assets[game.theme.backgroundAssetId]
    : undefined;
  const bundledFont =
    game.theme.font === "bundled" && game.theme.fontAssetId
      ? assets[game.theme.fontAssetId]
      : undefined;
  const bundledFamily = `GameFactoryBundled-${game.id}`;
  const overlay = isLightColor(game.theme.background)
    ? "rgba(255, 255, 255, 0.55)"
    : "rgba(0, 0, 0, 0.45)";
  const gesture = useRef<SwipeGesture | null>(null);
  const [swipe, setSwipe] = useState<{ dx: number; armed: boolean }>();

  useEffect(() => {
    gesture.current = null;
    setSwipe(undefined);
  }, [s.card, s.ending, s.turn]);

  function startSwipe(e: ReactPointerEvent<HTMLElement>) {
    if (gesture.current || (e.pointerType === "mouse" && e.button !== 0))
      return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "button, a, input, textarea, select, [contenteditable=true]",
      )
    )
      return;
    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastAt: e.timeStamp,
      dx: 0,
      dy: 0,
      axis: "pending",
      velocity: 0,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function moveSwipe(e: ReactPointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== e.pointerId) return;
    active.dx = e.clientX - active.startX;
    active.dy = e.clientY - active.startY;
    const elapsed = e.timeStamp - active.lastAt;
    if (elapsed > 0) active.velocity = (e.clientX - active.lastX) / elapsed;
    active.lastX = e.clientX;
    active.lastAt = e.timeStamp;
    if (active.axis === "pending") {
      if (Math.hypot(active.dx, active.dy) < SWIPE_SLOP) return;
      active.axis =
        Math.abs(active.dx) > Math.abs(active.dy) ? "horizontal" : "vertical";
    }
    if (active.axis !== "horizontal") {
      setSwipe(undefined);
      return;
    }
    if (e.cancelable) e.preventDefault();
    setSwipe({
      dx: active.dx,
      armed: Math.abs(active.dx) >= SWIPE_DISTANCE,
    });
  }

  function endSwipe(e: ReactPointerEvent<HTMLElement>, cancelled = false) {
    const active = gesture.current;
    if (!active || active.pointerId !== e.pointerId) return;
    gesture.current = null;
    setSwipe(undefined);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (cancelled || active.axis !== "horizontal") return;
    const distance = Math.abs(active.dx);
    const flick =
      distance >= SWIPE_FLICK_DISTANCE &&
      Math.abs(active.velocity) >= SWIPE_FLICK_VELOCITY;
    if (distance < SWIPE_DISTANCE && !flick) return;
    pick(active.dx < 0 ? "left" : "right");
  }

  const dragOffset = swipe ? Math.max(-120, Math.min(120, swipe.dx)) : 0;
  return (
    <div
      className="player"
      tabIndex={0}
      aria-label="Game player. Use left and right arrow keys to choose."
      onKeyDown={(e) => {
        if (
          e.repeat ||
          s.ending ||
          (e.target as HTMLElement).matches(
            "input,textarea,select,[contenteditable=true]",
          )
        )
          return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          pick(e.key === "ArrowLeft" ? "left" : "right");
        }
      }}
      style={
        {
          background: game.theme.background,
          backgroundImage: backgroundArt
            ? `linear-gradient(${overlay}, ${overlay}), url("${backgroundArt}")`
            : undefined,
          backgroundSize: backgroundArt ? "cover" : undefined,
          backgroundPosition: backgroundArt ? "center" : undefined,
          color: game.theme.surface,
          "--game-reading-font":
            game.theme.font === "system-sans"
              ? "system-ui, Segoe UI, sans-serif"
              : game.theme.font === "bundled"
                ? "var(--game-bundled-font, Georgia, serif)"
                : "Georgia, serif",
          "--game-bundled-font": bundledFont
            ? `"${bundledFamily}", Georgia, serif`
            : "Georgia, serif",
          "--game-accent": game.theme.accent,
        } as CSSProperties
      }
    >
      {bundledFont && (
        <style>{`@font-face { font-family: "${bundledFamily}"; src: url("${bundledFont}") format("woff2"); font-display: swap; }`}</style>
      )}
      <div className="player-top">
        <span>{game.title}</span>
        <span>
          TURN {s.turn + 1}
          {s.chapterTurn > 0 ? ` · CHAPTER ${s.chapterTurn}` : ""}
        </span>
      </div>
      <div className="meters" aria-label="Resources">
        {game.stats.map((t: any) => (
          <div key={t.id}>
            <span className="meter-label">
              {t.iconAssetId && assets[t.iconAssetId] && (
                <img
                  className="meter-icon"
                  src={assets[t.iconAssetId]}
                  alt=""
                />
              )}
              <span>
                {t.name} <b>{s.stats[t.id]}</b>
              </span>
            </span>
            <progress
              aria-label={`${t.name}: ${s.stats[t.id]} of ${t.max}`}
              max={t.max - t.min}
              value={s.stats[t.id] - t.min}
            />
          </div>
        ))}
      </div>
      <p className="chapter-label">
        {game.chapters.find((c: any) => c.id === s.chapter)?.name}
      </p>
      {notice && (
        <p className="player-notice" role="status">
          {notice}
        </p>
      )}
      <div className="player-scene" aria-live="polite" aria-atomic="true">
        {ending ? (
          <div className="end-card" key={ending.id}>
            <span>THE END</span>
            {ending.imageAssetId && (
              <img
                className="ending-art"
                src={assets[ending.imageAssetId]}
                alt=""
              />
            )}
            <h2>{ending.title}</h2>
            <p>{ending.text}</p>
            <button onClick={newRun}>Play again ↻</button>
          </div>
        ) : (
          card && (
            <div key={card.id} className="player-card-step">
              <article
                className={"playing-card" + (swipe ? " is-swiping" : "")}
                style={{
                  background: game.theme.surface,
                  color: game.theme.text,
                  transform: dragOffset
                    ? `translateX(${dragOffset}px) rotate(${dragOffset / 32}deg)`
                    : undefined,
                  opacity: swipe
                    ? 1 - Math.min(Math.abs(dragOffset) / 700, 0.18)
                    : undefined,
                }}
                onPointerDown={startSwipe}
                onPointerMove={moveSwipe}
                onPointerUp={(e) => endSwipe(e)}
                onPointerCancel={(e) => endSwipe(e, true)}
                onLostPointerCapture={(e) => {
                  if (gesture.current?.pointerId === e.pointerId) {
                    gesture.current = null;
                    setSwipe(undefined);
                  }
                }}
              >
                <img
                  draggable={false}
                  src={assets[card.imageAssetId]}
                  alt={card.imageAlt}
                />
                <div>
                  <h2>{card.character}</h2>
                  <p>{card.text}</p>
                </div>
              </article>
              <p
                className="swipe-hint"
                data-active={swipe ? "true" : "false"}
                aria-hidden="true"
              >
                {swipe?.armed
                  ? swipe.dx < 0
                    ? "← Release for the left choice"
                    : "Release for the right choice →"
                  : "Swipe left or right"}
              </p>
              <div
                className="choices"
                role="group"
                aria-label="Choose a response. Swipe the card left or right, or use these buttons."
              >
                <button onClick={() => pick("left")}>
                  ← {card.left.label}
                </button>
                <button onClick={() => pick("right")}>
                  {card.right.label} →
                </button>
              </div>
            </div>
          )
        )}
      </div>
      <div className="player-actions">
        <button className="restart" onClick={newRun}>
          {session?.newGame ? "New game" : "Restart preview"}
        </button>
        {progress && (
          <div className="player-progress">
            <span>
              Endings discovered: {progress.discovered} / {progress.total}
            </span>
            <button
              className="reset-progress"
              onClick={progress.onReset}
              aria-label="Reset all persistent progress"
            >
              Reset all progress
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
