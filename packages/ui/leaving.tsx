import { type ReactNode, useCallback, useEffect, useReducer, useRef } from "react";

/** An item to draw: one that is present, or one that has gone and is drawn while it leaves. */
export interface Shown<T> {
  readonly key: string;
  readonly value: T;
  readonly leaving: boolean;
}

/**
 * The items present now, with each item shown last time that has since gone kept as leaving,
 * after the item that came before it. An item that comes back while leaving is present again.
 */
export function withLeaving<T extends { readonly key: string }>(
  previous: readonly Shown<T>[],
  current: readonly T[],
): Shown<T>[] {
  const present = new Set(current.map((item) => item.key));
  const gone = new Map<string | undefined, Shown<T>[]>();
  let anchor: string | undefined;
  for (const item of previous) {
    if (present.has(item.key)) anchor = item.key;
    else gone.set(anchor, [...(gone.get(anchor) ?? []), { ...item, leaving: true }]);
  }
  return [
    ...(gone.get(undefined) ?? []),
    ...current.flatMap((value) => [
      { key: value.key, value, leaving: false },
      ...(gone.get(value.key) ?? []),
    ]),
  ];
}

const reducedMotion = (): boolean =>
  typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * `current`, and each item that has just gone from it until it has finished leaving. Where motion
 * is reduced an item goes at once.
 */
export function useLeaving<T extends { readonly key: string }>(
  current: readonly T[],
): { readonly shown: readonly Shown<T>[]; readonly left: (key: string) => void } {
  const shown = useRef<readonly Shown<T>[]>([]);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  shown.current = reducedMotion()
    ? current.map((value) => ({ key: value.key, value, leaving: false }))
    : withLeaving(shown.current, current);
  const left = useCallback((key: string) => {
    shown.current = shown.current.filter((item) => !(item.leaving && item.key === key));
    redraw();
  }, []);
  return { shown: shown.current, left };
}

/** The longest a leaving item stays, should its transition not run (a browser without it). */
const LEAVING_AT_MOST_MS = 1000;

/**
 * One item of the transcript. While leaving it closes up and fades (in CSS), cannot be reached,
 * and is removed when its transition ends.
 */
export function TranscriptItem({
  id,
  leaving,
  onLeft,
  children,
}: {
  id: string;
  leaving: boolean;
  onLeft: (key: string) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => onLeft(id), LEAVING_AT_MOST_MS);
    return () => clearTimeout(timer);
  }, [id, leaving, onLeft]);
  return (
    <div
      className="lk-item"
      {...(leaving ? { "data-leaving": "" } : {})}
      inert={leaving}
      onTransitionEnd={(event) => {
        if (leaving && event.target === event.currentTarget) onLeft(id);
      }}
    >
      {children}
    </div>
  );
}
