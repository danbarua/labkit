import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

/** How long the open row's box takes to slide from one row to another, in milliseconds. */
const SLIDE_MS = 220;

/**
 * The box around a sidebar list's current row: the open resource in the Items pane or in File
 * Explorer, or the listed collection in the Collections pane. When another row becomes current,
 * the box loses its fill, slides to that row, and fills again on arrival. When the current row
 * moves because rows above it changed, the box moves with it at once. When the row is out of the
 * list's view, the list scrolls to show it at the top, a page at a time rather than a row at a time.
 */
export function ActiveBox({
  list,
  activeKey,
  rows = "",
}: {
  /** The list, which holds the box and the rows, each row with its key in `data-key`. */
  list: RefObject<HTMLDivElement | null>;
  activeKey: string;
  /** Changes whenever the rows drawn change without the list changing height, such as a filter. */
  rows?: string;
}) {
  const [box, setBox] = useState<{ top: number; height: number; slide: boolean }>();
  const [filled, setFilled] = useState(true);
  // Counts the list's changes of size, which move the rows: a page or a directory loaded above.
  const [resized, setResized] = useState(0);
  const last = useRef<{ key: string; top: number } | undefined>(undefined);
  // The row the list has yet to scroll to: set when another row opens, cleared once it is shown,
  // so rows added below by Load more do not pull the list back to the open row.
  const scrollTo = useRef<string | undefined>(activeKey);
  const shownKey = useRef<string | undefined>(undefined);
  if (shownKey.current !== activeKey) {
    shownKey.current = activeKey;
    scrollTo.current = activeKey;
  }
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setResized((n) => n + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, [list]);
  useLayoutEffect(() => {
    const row = list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(activeKey)}"]`);
    if (!row) {
      last.current = undefined;
      setBox(undefined);
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = row.offsetTop;
    const was = last.current;
    const slide = was !== undefined && was.key !== activeKey && was.top !== top && !reduced;
    last.current = { key: activeKey, top };
    setBox({ top, height: row.offsetHeight, slide });
    if (slide) setFilled(false);
    if (scrollTo.current !== activeKey) return;
    scrollTo.current = undefined;
    const scroller = row.closest<HTMLElement>(".sidebar-section, .explorer-body");
    if (!scroller) return;
    const view = scroller.getBoundingClientRect();
    const at = row.getBoundingClientRect();
    if (at.top >= view.top && at.bottom <= view.bottom) return;
    scroller.scrollTo({
      top: scroller.scrollTop + (at.top - view.top) - 4,
      behavior: reduced ? "auto" : "smooth",
    });
  }, [list, activeKey, rows, resized]);
  useEffect(() => {
    if (filled) return;
    const timer = setTimeout(() => setFilled(true), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [filled]);
  if (box === undefined) return null;
  // Two layers: the fill under the rows, so it does not tint their text, and the outline over
  // them, so the hover background of the row it slides to does not hide it.
  const style = { transform: `translateY(${box.top}px)`, height: box.height };
  const state = [box.slide ? "" : "placed", filled ? "filled" : ""].join(" ");
  return (
    <>
      <div className={`active-box fill ${state}`} style={style} aria-hidden="true" />
      <div className={`active-box outline ${state}`} style={style} aria-hidden="true" />
    </>
  );
}
