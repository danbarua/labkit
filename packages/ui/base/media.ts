import { useCallback, useSyncExternalStore } from "react";

/** The media query a reader's request for reduced motion matches. */
export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Whether the reader asks for reduced motion. Outside a browser, where nothing moves, true. */
export function prefersReducedMotion(): boolean {
  return typeof window === "undefined" || window.matchMedia(REDUCED_MOTION).matches;
}

/** Whether the window matches the media query `query`, kept current as the window changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
