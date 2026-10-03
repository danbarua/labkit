import type { Theme } from "@labkit/ui";
import { useCallback, useState } from "react";

const KEY = "labkit.theme";

/** The theme last picked in this browser; "system" when none was saved or storage is closed. */
function savedTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/**
 * The page's theme, kept in this browser, so every page and the next visit start with the one
 * last picked. Where storage is closed (a private window) the pick lasts as long as the page.
 */
export function useSavedTheme(): readonly [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const pick = useCallback((next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not kept; this page still shows it.
    }
  }, []);
  return [theme, pick] as const;
}
