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
