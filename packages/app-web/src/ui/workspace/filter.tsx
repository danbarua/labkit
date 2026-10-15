import { IconButton } from "@labkit/ui";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";

/**
 * A list's filter, hidden until its button shows it. Hiding it empties it, so a hidden filter never
 * narrows the list.
 */
export interface Filter {
  readonly shown: boolean;
  readonly term: string;
  readonly setTerm: (term: string) => void;
  readonly toggle: () => void;
  readonly hide: () => void;
}

export function useFilter(): Filter {
  const [shown, setShown] = useState(false);
  const [term, setTerm] = useState("");
  const hide = () => {
    setShown(false);
    setTerm("");
  };
  return { shown, term, setTerm, toggle: () => (shown ? hide() : setShown(true)), hide };
}

/** The button that shows or hides a list's filter: a search icon, with no border. */
export function FilterButton({
  what,
  filter,
}: {
  /** What the list holds, for the button's name: "Filter the items". */
  what: string;
  filter: Filter;
}) {
  return (
    <IconButton
      className="filter-btn"
      on={filter.shown}
      label={`Filter the ${what}`}
      icon={MagnifyingGlassIcon}
      aria-expanded={filter.shown}
      onClick={filter.toggle}
    />
  );
}

/**
 * The filter's text box, drawn while the filter is shown, which takes focus when it appears. Escape
 * hides it, and so empties it.
 */
export function FilterBox({ what, filter }: { what: string; filter: Filter }) {
  if (!filter.shown) return null;
  return (
    <input
      type="text"
      className="items-filter"
      placeholder={`Filter ${what}…`}
      autoComplete="off"
      aria-label={`Filter the ${what}`}
      // biome-ignore lint/a11y/noAutofocus: the person just asked for this box by pressing its button.
      autoFocus
      value={filter.term}
      onChange={(e) => filter.setTerm(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        filter.hide();
      }}
    />
  );
}
