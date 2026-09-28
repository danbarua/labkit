import { type RefObject, useEffect } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** What Tab can reach inside `root`, in order. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest("[inert]") && el.getClientRects().length > 0,
  );
}

/**
 * While `active`, keeps keyboard focus inside `ref`: focus moves in when it starts (to the element
 * marked `data-autofocus`, else the first thing Tab reaches), Tab and Shift+Tab wrap at the ends,
 * and when it stops focus goes back to whatever had it before, so a person who opened an overlay
 * from a button lands on that button again.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const root = ref.current;
    if (!active || root === null) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const first =
      root.querySelector<HTMLElement>("[data-autofocus]") ?? focusableIn(root)[0] ?? root;
    if (first === root && !root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
    first.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const reachable = focusableIn(root);
      const head = reachable[0];
      const tail = reachable.at(-1);
      if (head === undefined || tail === undefined) {
        event.preventDefault();
        return;
      }
      const at = document.activeElement;
      if (event.shiftKey && (at === head || !root.contains(at))) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && (at === tail || !root.contains(at))) {
        event.preventDefault();
        head.focus();
      }
    };
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [ref, active]);
}
