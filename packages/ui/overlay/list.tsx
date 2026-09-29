import { CheckIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";

/** One thing a person can pick from a list: a command, a setting's value, something to mention. */
export interface PickItem {
  readonly id: string;
  readonly label: string;
  /** A second, quieter line: what a command does, what a value means. */
  readonly detail?: string;
  /** Items with the same group sit together under that heading, in the order they first appear. */
  readonly group?: string;
  /** The value in force now: marked, and where the list starts. */
  readonly current?: boolean;
  /** More words a query should find this by, never shown. */
  readonly keywords?: string;
  readonly icon?: ReactNode;
}

/**
 * The items every word of `query` appears in, as it was typed or in any case, across the label,
 * detail, group and keywords. Items whose label starts with the query come first; otherwise the
 * order is the caller's, so a list grouped by the caller stays grouped.
 */
export function filterItems(items: readonly PickItem[], query: string): PickItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  const q = query.trim().toLowerCase();
  const matching = items.filter((item) => {
    const hay = [item.label, item.detail, item.group, item.keywords].join(" ").toLowerCase();
    return words.every((word) => hay.includes(word));
  });
  const leading = matching.filter((item) => item.label.toLowerCase().startsWith(q));
  return [...leading, ...matching.filter((item) => !leading.includes(item))];
}

/** Items in the order a list draws them: each group together, groups in first-seen order. */
export function inDrawnOrder(items: readonly PickItem[]): PickItem[] {
  const groups = new Map<string | undefined, PickItem[]>();
  for (const item of items) {
    const group = groups.get(item.group) ?? [];
    group.push(item);
    groups.set(item.group, group);
  }
  return [...groups.values()].flat();
}

/** The index `delta` steps from `current` in a list of `length`, wrapping at both ends. */
export function stepIndex(current: number, delta: number, length: number): number {
  if (length === 0) return -1;
  return (((current + delta) % length) + length) % length;
}

/**
 * Which item is active in a list the keyboard drives while focus stays in an input: arrows move
 * and wrap, Enter (and Tab, when `tabPicks`) picks. `reset` is anything whose change should put
 * the active item back at the start, such as the query. Returns whether it handled the key.
 */
export function useListNavigation<T>(
  items: readonly T[],
  onPick: (item: T) => void,
  reset: unknown,
  options: { tabPicks?: boolean; homeEnd?: boolean; startAt?: number } = {},
) {
  const { tabPicks = false, homeEnd = false, startAt = 0 } = options;
  const [active, setActive] = useState(startAt);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `reset` is the trigger, by design
  useEffect(() => setActive(Math.min(startAt, Math.max(0, items.length - 1))), [reset]);
  const clamped = items.length === 0 ? -1 : Math.min(active, items.length - 1);

  const onKeyDown = (event: KeyboardEvent): boolean => {
    const move = (to: number) => {
      event.preventDefault();
      setActive(to);
      return true;
    };
    switch (event.key) {
      case "ArrowDown":
        return move(stepIndex(clamped, 1, items.length));
      case "ArrowUp":
        return move(stepIndex(clamped, -1, items.length));
      case "Home":
        return homeEnd ? move(0) : false;
      case "End":
        return homeEnd ? move(items.length - 1) : false;
      case "Enter":
      case "Tab": {
        if (event.key === "Tab" && !tabPicks) return false;
        if (event.nativeEvent.isComposing) return false;
        const item = items[clamped];
        if (item === undefined) return false;
        event.preventDefault();
        onPick(item);
        return true;
      }
      default:
        return false;
    }
  };
  return { active: clamped, setActive, onKeyDown };
}

export const optionId = (listId: string, index: number) => `${listId}-${index}`;

/**
 * A listbox drawn for an input that keeps focus: the input points at the active option with
 * `aria-activedescendant`, so pressing and hovering never move focus out of it.
 */
export function OptionList({
  id,
  label,
  items,
  active,
  onPick,
  onHover,
  empty = "Nothing matches",
  onKeyDown,
}: {
  id: string;
  label: string;
  items: readonly PickItem[];
  active: number;
  onPick: (item: PickItem) => void;
  onHover: (index: number) => void;
  empty?: string;
  /**
   * Given when the list holds focus itself, with no search box in front of it: the list takes
   * focus when its overlay opens, and these keys move through it.
   */
  onKeyDown?: (event: KeyboardEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active < 0) return;
    ref.current
      ?.querySelector(`#${CSS.escape(optionId(id, active))}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [id, active]);

  if (items.length === 0) {
    return (
      <div className="lk-options lk-options-empty" role="status">
        {empty}
      </div>
    );
  }

  const groups: [string | undefined, [PickItem, number][]][] = [];
  items.forEach((item, index) => {
    const last = groups.at(-1);
    if (last !== undefined && last[0] === item.group) last[1].push([item, index]);
    else groups.push([item.group, [[item, index]]]);
  });

  const option = ([item, index]: [PickItem, number]) => (
    // biome-ignore lint/a11y/useFocusableInteractive: the input keeps focus; it points here instead
    // biome-ignore lint/a11y/useKeyWithClickEvents: keys reach this option through the input
    <div
      key={item.id}
      id={optionId(id, index)}
      role="option"
      aria-selected={index === active}
      className="lk-option"
      data-active={index === active || undefined}
      // Keep focus in the input: a press on an option must not blur it first.
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={() => index !== active && onHover(index)}
      onClick={() => onPick(item)}
    >
      {item.icon === undefined ? null : <span className="lk-option-icon">{item.icon}</span>}
      <span className="lk-option-text">
        <span className="lk-option-label">{item.label}</span>
        {item.detail === undefined ? null : <span className="lk-option-detail">{item.detail}</span>}
      </span>
      {item.current ? (
        <span className="lk-option-current">
          <CheckIcon aria-hidden="true" />
          <span className="lk-sr-only">current</span>
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      ref={ref}
      id={id}
      role="listbox"
      aria-label={label}
      className="lk-options"
      {...(onKeyDown === undefined
        ? {}
        : {
            tabIndex: 0,
            "data-autofocus": true,
            "aria-activedescendant": active < 0 ? undefined : optionId(id, active),
            onKeyDown,
          })}
    >
      {groups.map(([group, members], g) =>
        group === undefined ? (
          members.map(option)
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: groups are positional
          // biome-ignore lint/a11y/useSemanticElements: a listbox groups its options with role=group; a fieldset groups form controls
          <div key={g} role="group" aria-labelledby={`${id}-g${g}`}>
            <div id={`${id}-g${g}`} className="lk-option-group" role="presentation">
              {group}
            </div>
            {members.map(option)}
          </div>
        ),
      )}
    </div>
  );
}
