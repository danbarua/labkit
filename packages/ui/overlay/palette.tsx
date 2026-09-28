import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";
import {
  filterItems,
  inDrawnOrder,
  OptionList,
  optionId,
  type PickItem,
  useListNavigation,
} from "./list";
import { Modal } from "./modal";

export interface PaletteProps {
  /** Names the palette; also the input's label. */
  title: string;
  items: readonly PickItem[];
  onPick: (item: PickItem) => void;
  placeholder?: string;
  empty?: string;
}

/**
 * A search box over a list: type to narrow, arrows to move, Enter to pick. The list starts on the
 * current item, if one is marked, so opening a setting's picker and pressing Enter changes nothing.
 * This is the palette's content without the dialog around it, so it can also be drawn in place.
 */
export function PalettePanel({ title, items, onPick, placeholder, empty }: PaletteProps) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const shown = useMemo(() => inDrawnOrder(filterItems(items, query)), [items, query]);
  const current =
    query === ""
      ? Math.max(
          0,
          shown.findIndex((item) => item.current),
        )
      : 0;
  const { active, setActive, onKeyDown } = useListNavigation(shown, onPick, query, {
    homeEnd: true,
    startAt: current,
  });

  return (
    <div className="lk-palette">
      <label className="lk-palette-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <span className="lk-sr-only">{title}</span>
        <input
          data-autofocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active < 0 ? undefined : optionId(listId, active)}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder ?? "Search"}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </label>
      <OptionList
        id={listId}
        label={title}
        items={shown}
        active={active}
        onPick={onPick}
        onHover={setActive}
        {...(empty === undefined ? {} : { empty })}
      />
    </div>
  );
}

/**
 * A palette in a modal dialog: the overlay the small controls open, and the one a keyboard user
 * reaches everything through. Picking closes it; what the pick does is the caller's.
 */
export function CommandPalette({
  open,
  onClose,
  ...panel
}: PaletteProps & { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={panel.title} hideTitle className="lk-palette-modal">
      <PalettePanel
        {...panel}
        onPick={(item) => {
          onClose();
          panel.onPick(item);
        }}
      />
    </Modal>
  );
}
