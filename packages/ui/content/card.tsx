import { CaretRightIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { classNames } from "../base/class-names";

/**
 * A card whose content may be any length, such as a file or a diff: a header that folds it, with
 * `meta` at its right and room for `actions` beside it, and a body. Folded, only the header shows.
 * `open` and `onToggle` make the fold the caller's; without them the card keeps it itself, from
 * `defaultOpen`. `flush` drops the body's padding, for content that draws its own edges. `keep`
 * hides a folded body rather than removing it, for content that keeps state, such as a canvas.
 */
export function ContentCard({
  title,
  meta,
  actions,
  open,
  onToggle,
  defaultOpen = true,
  flush = false,
  keep = false,
  toggleLabel,
  footer,
  className,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
  flush?: boolean;
  keep?: boolean;
  /** The fold button's accessible name, when its title alone does not say what it does. */
  toggleLabel?: string;
  /** Shown under the body, folded or not. */
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [kept, setKept] = useState(defaultOpen);
  const shown = open ?? kept;
  const toggle = onToggle ?? (() => setKept(!kept));
  return (
    <section className={classNames("lk-card", shown && "open", className)}>
      <div className="lk-card-head">
        <button
          type="button"
          className="lk-card-toggle"
          aria-expanded={shown}
          {...(toggleLabel === undefined ? {} : { "aria-label": toggleLabel })}
          onClick={toggle}
        >
          <CaretRightIcon className="lk-card-caret" aria-hidden="true" />
          <span className="lk-card-title">{title}</span>
          {meta === undefined ? null : <span className="lk-card-meta">{meta}</span>}
        </button>
        {actions === undefined ? null : <div className="lk-card-actions">{actions}</div>}
      </div>
      {shown || keep ? (
        <div className={flush ? "lk-card-body flush" : "lk-card-body"} hidden={!shown}>
          {children}
        </div>
      ) : null}
      {footer}
    </section>
  );
}
