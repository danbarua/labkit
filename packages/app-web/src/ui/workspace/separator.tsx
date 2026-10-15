import { classNames } from "@labkit/ui";
import { type PointerEvent, useRef, useState } from "react";

/**
 * A border between two regions that a drag or the window splitter pattern's keys move (ARIA's
 * focusable `separator`). A drag starts from what `begin` returns when the pointer is pressed and
 * reports how many pixels the pointer has moved since then, down or right. `onKey` handles a key
 * and returns whether it did; a double-click calls `onReset`. While dragged, the border has the
 * `dragging` class.
 */
export function Separator<From>({
  orientation,
  label,
  min,
  max,
  now,
  className,
  begin,
  onDrag,
  onKey,
  onReset,
  onDragging,
}: {
  /** "horizontal" for a border between regions above and below it, which moves up and down. */
  orientation: "horizontal" | "vertical";
  label: string;
  min: number;
  max: number;
  now: number;
  className: string;
  begin: () => From;
  onDrag: (from: From, pixels: number) => void;
  onKey: (key: string) => boolean;
  onReset: () => void;
  onDragging?: (dragging: boolean) => void;
}) {
  const drag = useRef<{ at: number; from: From } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const along = (e: PointerEvent) => (orientation === "horizontal" ? e.clientY : e.clientX);
  const show = (on: boolean) => {
    setDragging(on);
    onDragging?.(on);
  };
  const stop = () => {
    drag.current = undefined;
    show(false);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> takes no focus or drag; this is the ARIA window splitter pattern.
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={now}
      tabIndex={0}
      className={classNames(className, dragging && "dragging")}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { at: along(e), from: begin() };
        show(true);
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (start !== undefined) onDrag(start.from, along(e) - start.at);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (onKey(e.key)) e.preventDefault();
      }}
    />
  );
}
