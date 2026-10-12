import type { Theme } from "@labkit/ui";
import { useCallback, useSyncExternalStore } from "react";

const KEY = "labkit.theme";

// Where storage is closed (a private window) the pick lasts as long as the page.
let current: Theme | undefined;
const listeners = new Set<() => void>();

/** The theme last picked in this browser; "system" when none was saved or storage is closed. */
function savedTheme(): Theme {
  if (current !== undefined) return current;
  try {
    const saved = localStorage.getItem(KEY);
    current = saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    current = "system";
  }
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The page's theme, kept in this browser, so every page and the next visit start with the one
 * last picked. Every component that calls this shares the one theme, so a button in the top bar
 * and the content it themes always agree.
 */
export function useSavedTheme(): readonly [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, savedTheme, () => "system" as const);
  const pick = useCallback((next: Theme) => {
    current = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not kept; this page still shows it.
    }
    for (const listener of listeners) listener();
  }, []);
  return [theme, pick] as const;
}
