import { IconButton } from "@labkit/ui";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";

/**
 * A list's filter, hidden until its button shows it. Hiding it empties it, so a hidden filter never
 * narrows the list.
 */
export function useFilter(): {
  shown: boolean;
  term: string;
  setTerm: (term: string) => void;
  toggle: () => void;
  hide: () => void;
} {
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
  shown,
  onToggle,
}: {
  /** What the list holds, for the button's name: "Filter the items". */
  what: string;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <IconButton
      className="filter-btn"
      on={shown}
      label={`Filter the ${what}`}
      icon={MagnifyingGlassIcon}
      aria-expanded={shown}
      onClick={onToggle}
    />
  );
}

/** The filter's text box, which takes focus when shown. Escape hides it, and so empties it. */
export function FilterBox({
  what,
  term,
  setTerm,
  onHide,
}: {
  what: string;
  term: string;
  setTerm: (term: string) => void;
  onHide: () => void;
}) {
  return (
    <input
      type="text"
      className="items-filter"
      placeholder={`Filter ${what}…`}
      autoComplete="off"
      aria-label={`Filter the ${what}`}
      // biome-ignore lint/a11y/noAutofocus: the person just asked for this box by pressing its button.
      autoFocus
      value={term}
      onChange={(e) => setTerm(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onHide();
      }}
    />
  );
}
