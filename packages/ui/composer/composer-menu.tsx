import { CaretRightIcon, ListIcon } from "@phosphor-icons/react";
import { Fragment, type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";
import { IconButton } from "../base/icon-button";
import { stepIndex } from "../overlay/list";

/** One row of the composer's menu. */
export interface MenuEntry {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  /** A setting's current value: drawn at the row's end, and read as part of the row's name. */
  readonly value?: string;
  /** Set for a boolean setting: the row is a checkbox, and choosing it flips the setting. */
  readonly checked?: boolean;
  /** Whether choosing the row opens a picker dialog. */
  readonly opensPicker?: boolean;
  /** Whether the row cannot be chosen now. It stays in the menu, where the arrow keys reach it. */
  readonly disabled?: boolean;
  readonly onChoose: () => void;
}

const ROWS = '[role="menuitem"], [role="menuitemcheckbox"]';

/**
 * The menu button at the composer's bottom-left, and the menu it opens upward, after the WAI-ARIA
 * menu button pattern. Down or Up on the button opens the menu on its first or last row. In the
 * menu, Up and Down move and wrap, and Home and End jump. Escape, Tab and a press outside close it;
 * Tab leaves focus on the button rather than moving on. Choosing a row closes the menu with focus
 * on the button, so a picker the row opens hands focus back to the button. The non-empty groups
 * are drawn with a separator between each; with none there is no button.
 */
export function ComposerMenu({
  groups,
  open,
  onOpenChange,
}: {
  groups: readonly (readonly MenuEntry[])[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const triggerId = useId();
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // The row that takes focus when the menu opens: the last when Up opened it.
  const startAt = useRef<"first" | "last">("first");
  // The latest handler, so the effect below runs when the menu opens and closes, not every render.
  const change = useRef(onOpenChange);
  change.current = onOpenChange;
  const shown = groups.filter((group) => group.length > 0);

  const rows = () => [...(menu.current?.querySelectorAll<HTMLElement>(ROWS) ?? [])];
  const close = () => {
    onOpenChange(false);
    trigger.current?.focus();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rows` reads the ref, not render state
  useEffect(() => {
    if (!open) return;
    const all = rows();
    (startAt.current === "last" ? all.at(-1) : all[0])?.focus();
    startAt.current = "first";
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !wrapper.current?.contains(event.target))
        change.current(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (shown.length === 0) return null;

  const choose = (entry: MenuEntry) => {
    if (entry.disabled) return;
    close();
    entry.onChoose();
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = rows();
    const focused = document.activeElement;
    const at = focused instanceof HTMLElement ? all.indexOf(focused) : -1;
    const go = (index: number) => {
      event.preventDefault();
      all[index]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        return go(stepIndex(at, 1, all.length));
      case "ArrowUp":
        return go(stepIndex(Math.max(at, 0), -1, all.length));
      case "Home":
        return go(0);
      case "End":
        return go(all.length - 1);
      case "Escape":
      case "Tab":
        event.preventDefault();
        close();
        return;
    }
  };

  const onTriggerKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    startAt.current = event.key === "ArrowUp" ? "last" : "first";
    onOpenChange(true);
  };

  return (
    <div className="lk-composer-menu" ref={wrapper}>
      <IconButton
        ref={trigger}
        id={triggerId}
        label="Composer menu"
        icon={ListIcon}
        on={open}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : onOpenChange(true))}
        onKeyDown={onTriggerKey}
      />
      {open ? (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className="lk-menu"
          onKeyDown={onMenuKey}
        >
          {shown.map((group, g) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: groups are positional
            <Fragment key={g}>
              {g > 0 ? <hr className="lk-menu-sep" /> : null}
              {group.map((entry) => (
                <MenuRow key={entry.id} entry={entry} onChoose={choose} />
              ))}
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MenuRow({ entry, onChoose }: { entry: MenuEntry; onChoose: (entry: MenuEntry) => void }) {
  return (
    <button
      type="button"
      role={entry.checked === undefined ? "menuitem" : "menuitemcheckbox"}
      {...(entry.checked === undefined ? {} : { "aria-checked": entry.checked })}
      aria-label={entry.value === undefined ? entry.label : `${entry.label}: ${entry.value}`}
      aria-haspopup={entry.opensPicker ? "dialog" : undefined}
      aria-disabled={entry.disabled || undefined}
      tabIndex={-1}
      className="lk-menu-item"
      onClick={() => onChoose(entry)}
    >
      <span className="lk-menu-icon" aria-hidden="true">
        {entry.icon}
      </span>
      <span className="lk-menu-label">{entry.label}</span>
      {entry.value === undefined ? null : <span className="lk-menu-value">{entry.value}</span>}
      {entry.opensPicker ? <CaretRightIcon className="lk-menu-more" aria-hidden="true" /> : null}
    </button>
  );
}
