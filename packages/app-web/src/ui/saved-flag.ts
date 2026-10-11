import { useCallback, useState } from "react";

/** The choice saved in this browser under `key`; `initial` when none was saved or storage is closed. */
function savedFlag(key: string, initial: boolean): boolean {
  try {
    const saved = localStorage.getItem(key);
    return saved === "1" ? true : saved === "0" ? false : initial;
  } catch {
    return initial;
  }
}

/**
 * A yes-or-no choice kept in this browser under `key`, such as whether a panel is shown, so the
 * next visit starts as this one left it. Where storage is closed (a private window) the choice
 * lasts as long as the page.
 */
export function useSavedFlag(
  key: string,
  initial: boolean,
): readonly [boolean, (next: boolean) => void] {
  const [flag, setFlag] = useState(() => savedFlag(key, initial));
  const pick = useCallback(
    (next: boolean) => {
      setFlag(next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Not kept; this page still shows it.
      }
    },
    [key],
  );
  return [flag, pick] as const;
}

/**
 * The positive number saved in this browser under `key`; `initial` when none was saved or storage
 * is closed. A saved value that is not a positive number is ignored, with a warning.
 */
function savedNumber(key: string, initial: number): number {
  let saved: string | null;
  try {
    saved = localStorage.getItem(key);
  } catch {
    return initial;
  }
  if (saved === null) return initial;
  const n = Number(saved);
  if (Number.isFinite(n) && n > 0) return n;
  console.warn("saved setting: a value that is not a positive number is ignored", {
    key,
    saved,
    used: initial,
  });
  return initial;
}

/**
 * A positive number kept in this browser under `key`, such as a section's share of the sidebar's
 * height, so the next visit starts as this one left it. Where storage is closed (a private window)
 * the number lasts as long as the page.
 */
export function useSavedNumber(
  key: string,
  initial: number,
): readonly [number, (next: number) => void] {
  const [n, setN] = useState(() => savedNumber(key, initial));
  const pick = useCallback(
    (next: number) => {
      setN(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // Not kept; this page still uses it.
      }
    },
    [key],
  );
  return [n, pick] as const;
}
