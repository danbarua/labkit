import { XIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useFocusTrap } from "./focus-trap";

/**
 * A modal dialog on the browser's own `<dialog>`: while open the rest of the page cannot be
 * reached, Escape or a click on the backdrop closes it, and focus returns to what opened it.
 *
 * It renders where it is placed rather than in a portal, so it stays inside `.lk-root` and keeps
 * the theme; `showModal` still draws it above everything.
 */
export function Modal({
  open,
  onClose,
  title,
  hideTitle = false,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Names the dialog for assistive technology, and heads it unless `hideTitle`. */
  title: string;
  hideTitle?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useFocusTrap(ref, open);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop click's keyboard twin is Escape, handled by onCancel
    <dialog
      ref={ref}
      className={["lk-modal", className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
      // Escape: the browser would close the dialog behind React's back; the owner decides.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click whose target is the dialog itself landed on the backdrop, not the content.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className="lk-modal-body">
          {hideTitle ? (
            <h2 id={titleId} className="lk-sr-only">
              {title}
            </h2>
          ) : (
            <header className="lk-modal-head">
              <h2 id={titleId}>{title}</h2>
              <button type="button" className="lk-icon-btn" aria-label="Close" onClick={onClose}>
                <XIcon aria-hidden="true" />
              </button>
            </header>
          )}
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
