import { useEffect, useRef } from "react";

/**
 * What the loader shows, by pace and colour: waiting for the first token (slow, and slower still
 * at first), working (fast), speaking (steady), done (the dots spread and close once), and failed
 * (red, slowest).
 */
export type LoaderMood = "waiting" | "working" | "speaking" | "done" | "failed";

/** The dots that pulse, as a five-by-five grid: a cross through the middle. */
const MATRIX = ["10001", "01010", "00100", "01010", "10001"] as const;

const DOTS = MATRIX.flatMap((row, y) =>
  [...row].map((cell, x) => ({
    x,
    y,
    active: cell === "1",
    // Where the pulse is in its cycle relative to the first dot: a wave across the grid.
    offset: ((y * row.length + x) * 0.04) / 1.2,
    // The dot's place along the diagonal, for its colour.
    along: (x + y) / ((row.length - 1) * 2),
  })),
);

/**
 * Seconds per cycle for each mood: where it starts on entering the mood (or carries on from the
 * pace it had), where it settles, and how many seconds it takes to get most of the way there.
 */
const PACE: Record<LoaderMood, { start?: number; settle?: number; ease: number }> = {
  waiting: { start: 3, settle: 2, ease: 2.5 },
  working: { start: 0.6, settle: 0.6, ease: 0.1 },
  speaking: { settle: 1.5, ease: 0.4 },
  done: { ease: 1 },
  failed: { start: 4, settle: 4, ease: 1 },
};

/** How long the done spread takes, in milliseconds. */
const SPREAD_MS = 450;

/** A dot's colour: its place along the diagonal, from the mood's first colour to its last. */
const dotColour = (along: number): string =>
  along <= 0.5
    ? `color-mix(in oklab, var(--lk-loader-from), var(--lk-loader-via) ${Math.round(along * 200)}%)`
    : `color-mix(in oklab, var(--lk-loader-via), var(--lk-loader-to) ${Math.round((along - 0.5) * 200)}%)`;

/**
 * A grid of dots whose pulse says what the agent is doing. The pulse is driven a frame at a time
 * rather than by a CSS animation, so a change of pace eases instead of jumping to a new point in
 * the cycle. Where the reader asks for reduced motion, the dots only brighten and dim: they do not
 * grow or move.
 */
export function Loader({
  mood,
  dotSize = 4,
  gap = 2,
}: {
  mood: LoaderMood;
  dotSize?: number;
  gap?: number;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const current = useRef(mood);
  current.current = mood;

  useEffect(() => {
    const element = grid.current;
    if (element === null) return;
    const dots = [...element.children] as HTMLElement[];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let shown: LoaderMood | undefined;
    let period = PACE[current.current].start ?? 2;
    let phase = 0;
    let last = performance.now();
    let doneAt = 0;
    let frame = 0;

    const draw = (now: number) => {
      const seconds = Math.min(now - last, 100) / 1000;
      last = now;
      const mood = current.current;
      const pace = PACE[mood];
      if (mood !== shown) {
        period = pace.start ?? period;
        if (mood === "done") doneAt = now;
        shown = mood;
      }
      const settle = pace.settle ?? period;
      period += (settle - period) * (1 - Math.exp(-seconds / pace.ease));
      phase = (phase + seconds / period) % 1;

      DOTS.forEach((dot, i) => {
        const span = dots[i];
        if (span === undefined || !dot.active) return;
        const t = (phase - dot.offset + 1) % 1;
        const lift = (1 - Math.cos(2 * Math.PI * t)) / 2;
        span.style.opacity = String(0.2 + 0.8 * lift);
        span.style.transform = reduce.matches
          ? ""
          : `scale(${0.8 + 0.38 * lift}) translateY(${-1 + 2 * lift}px)`;
      });

      const spread =
        mood === "done" && !reduce.matches ? Math.min(1, (now - doneAt) / SPREAD_MS) : 1;
      element.style.gap = `${gap * (1 + 1.5 * Math.sin(Math.PI * spread))}px`;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [gap]);

  return (
    <div
      ref={grid}
      className="lk-loader"
      data-mood={mood}
      aria-hidden="true"
      style={{
        gridTemplateColumns: `repeat(5, ${dotSize}px)`,
        gridTemplateRows: `repeat(5, ${dotSize}px)`,
        gap: `${gap}px`,
      }}
    >
      {DOTS.map((dot) => (
        <span
          key={`${dot.x}-${dot.y}`}
          className={dot.active ? "active" : undefined}
          style={{ background: dotColour(dot.along) }}
        />
      ))}
    </div>
  );
}
