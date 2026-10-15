import {
  type RefObject,
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";

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

/**
 * Whether the element `ref` holds is narrower than `width` CSS pixels, padding included, kept
 * current as it resizes. It is measured before the first paint, so a narrow element is never drawn
 * wide first. False until the element is measured, and when rendered outside a browser.
 */
export function useNarrowerThan(ref: RefObject<HTMLElement | null>, width: number): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = () => setNarrow(element.clientWidth < width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, width]);
  return narrow;
}
