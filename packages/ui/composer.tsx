import type { AvailableCommand, SessionConfigOption } from "@agentclientprotocol/sdk";
import { ArrowUpIcon, AtIcon, StopIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  filterItems,
  inDrawnOrder,
  OptionList,
  optionId,
  type PickItem,
  useListNavigation,
} from "./overlay/list";
import { CommandPalette } from "./overlay/palette";
import { arrange, pickedSetting, SessionControls, settingItems } from "./session-controls";

/** The commands whose name starts what has been typed after a leading slash, before any argument. */
export function commandsMatching(
  text: string,
  commands: readonly AvailableCommand[],
): AvailableCommand[] {
  const typed = /^\/(\S*)$/.exec(text);
  if (typed === null) return [];
  return commands.filter((command) => command.name.startsWith(typed[1] ?? ""));
}

/** An `@` being typed at `caret`: the word after it so far, and where the `@` is. */
export function mentionAt(text: string, caret: number): { query: string; start: number } | null {
  const typed = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  if (typed === null) return null;
  return { query: typed[2] ?? "", start: caret - (typed[2] ?? "").length - 1 };
}

/** `text` with `[start, end)` replaced by `insert`, and where the caret goes after it. */
function splice(text: string, start: number, end: number, insert: string) {
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length };
}

const commandItem = (command: AvailableCommand): PickItem => ({
  id: command.name,
  label: `/${command.name}`,
  detail: command.description,
});

type Overlay = { optionId: string } | "settings" | "commands" | "mentions" | null;

export interface ComposerProps {
  running: boolean;
  onSend: (text: string) => void;
  onCancel?: (() => void) | undefined;
  commands?: readonly AvailableCommand[];
  configOptions?: readonly SessionConfigOption[];
  /** Called when a setting is picked. Without it the settings are shown and cannot be changed. */
  onSetConfig?: ((configId: string, value: string | boolean) => void) | undefined;
  /** What `@` can name. Without it there is no `@`. */
  mentions?: readonly PickItem[] | undefined;
  /** What the box holds when it first appears. */
  initialText?: string;
}

/**
 * Where a person writes to the agent. Enter sends and Shift+Enter starts a new line. A `/` at the
 * start offers the agent's commands and an `@` offers what can be mentioned, each in a list the
 * arrows move through and Enter or Tab picks from. Below the box, small controls show the model,
 * mode and thinking level and open a picker for each; the same pickers are reachable from buttons
 * for anyone not typing the trigger characters.
 */
export function Composer({
  running,
  onSend,
  onCancel,
  commands = [],
  configOptions = [],
  onSetConfig,
  mentions,
  initialText = "",
}: ComposerProps) {
  const [text, setText] = useState(initialText);
  const [caret, setCaret] = useState(initialText.length);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const statusId = useId();

  // The list under the caret: commands while the whole text is one slash word, else mentions.
  const suggestion = useMemo(() => {
    if (dismissed === text) return null;
    const slash = commandsMatching(text, commands);
    if (slash.length > 0 || /^\/\S*$/.test(text)) {
      return commands.length === 0
        ? null
        : { kind: "commands" as const, items: slash.map(commandItem), start: 0 };
    }
    if (mentions === undefined) return null;
    const at = mentionAt(text, caret);
    if (at === null) return null;
    return {
      kind: "mentions" as const,
      items: inDrawnOrder(filterItems(mentions, at.query)),
      start: at.start,
    };
  }, [text, caret, commands, mentions, dismissed]);

  const place = (next: { text: string; caret: number }) => {
    setText(next.text);
    setCaret(next.caret);
    // After React has written the value; and after any overlay has handed focus back.
    setTimeout(() => {
      box.current?.focus();
      box.current?.setSelectionRange(next.caret, next.caret);
    }, 0);
  };

  const pickSuggestion = (item: PickItem) => {
    if (suggestion?.kind === "commands") place(splice(text, 0, text.length, `${item.label} `));
    else if (suggestion?.kind === "mentions")
      place(splice(text, suggestion.start, caret, `@${item.label} `));
  };

  const items = suggestion?.items ?? [];
  const nav = useListNavigation(items, pickSuggestion, `${suggestion?.kind}:${text}`, {
    tabPicks: true,
  });
  const listOpen = suggestion !== null;

  const send = () => {
    const trimmed = text.trim();
    if (trimmed === "" || running) return;
    onSend(trimmed);
    setText("");
    setCaret(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (listOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(text);
        return;
      }
      if (nav.onKeyDown(event)) return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  // The box grows with what is written, up to the cap its style sets, then scrolls.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the text changes
  useLayoutEffect(() => {
    const el = box.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // Once a command is chosen, what it expects next, until something is written after it.
  const chosen = /^\/(\S+)\s*$/.exec(text)?.[1];
  const hint = commands.find((c) => c.name === chosen)?.input?.hint;

  const { rest } = arrange(configOptions);
  const paletteProps = (() => {
    if (overlay === "commands") {
      return {
        title: "Commands",
        placeholder: "Search commands",
        items: commands.map(commandItem),
        onPick: (item: PickItem) => place(splice(text, 0, 0, `${item.label} `)),
      };
    }
    if (overlay === "mentions") {
      return {
        title: "Mention",
        placeholder: "Search what to mention",
        items: mentions ?? [],
        onPick: (item: PickItem) => {
          const lead = caret > 0 && !/\s/.test(text[caret - 1] ?? "") ? " " : "";
          place(splice(text, caret, caret, `${lead}@${item.label} `));
        },
      };
    }
    const setting = (item: PickItem) => onSetConfig?.(...pickedSetting(item));
    if (overlay === "settings") {
      return {
        title: "Session settings",
        placeholder: "Search settings",
        items: rest.flatMap((option) => settingItems(option, true)),
        onPick: setting,
      };
    }
    if (overlay !== null) {
      const option = configOptions.find((o) => o.id === overlay.optionId);
      if (option !== undefined) {
        return {
          title: option.name,
          placeholder: `Search ${option.name.toLowerCase()}`,
          items: settingItems(option, false),
          onPick: setting,
        };
      }
    }
    return undefined;
  })();

  return (
    <form
      className="lk-composer"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="lk-composer-box">
        {listOpen ? (
          <div className="lk-suggest">
            <OptionList
              id={listId}
              label={suggestion.kind === "commands" ? "Commands" : "Mentions"}
              items={items}
              active={nav.active}
              onPick={pickSuggestion}
              onHover={nav.setActive}
              empty={suggestion.kind === "commands" ? "No such command" : "Nothing to mention"}
            />
          </div>
        ) : null}
        {hint ? (
          <div className="lk-composer-hint">
            <code className="lk-composer-hint-command">/{chosen}</code> {hint}
          </div>
        ) : null}
        <textarea
          ref={box}
          name="message"
          aria-label="Message"
          aria-describedby={statusId}
          aria-autocomplete="list"
          aria-controls={listOpen ? listId : undefined}
          aria-activedescendant={
            listOpen && nav.active >= 0 ? optionId(listId, nav.active) : undefined
          }
          placeholder={
            mentions === undefined
              ? "Message the agent · / for commands"
              : "Message the agent · / for commands · @ to mention"
          }
          rows={1}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setCaret(event.target.selectionStart);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
        />
        <div id={statusId} className="lk-sr-only" aria-live="polite">
          {listOpen
            ? `${items.length} ${suggestion.kind === "commands" ? "commands" : "suggestions"}. Arrow keys to move, Enter to pick, Escape to close.`
            : ""}
        </div>
        <div className="lk-composer-bar">
          {commands.length === 0 ? null : (
            <button
              type="button"
              className="lk-icon-btn lk-glyph"
              aria-haspopup="dialog"
              aria-label="Commands"
              title="Commands"
              onClick={() => setOverlay("commands")}
            >
              /
            </button>
          )}
          {mentions === undefined ? null : (
            <button
              type="button"
              className="lk-icon-btn"
              aria-haspopup="dialog"
              aria-label="Mention"
              title="Mention"
              onClick={() => setOverlay("mentions")}
            >
              <AtIcon aria-hidden="true" />
            </button>
          )}
          <SessionControls
            options={configOptions}
            onOpen={onSetConfig && setOverlay}
            onToggle={onSetConfig}
          />
          <span className="lk-composer-end">
            {running ? (
              <button
                type="button"
                className="lk-send stop"
                aria-label="Stop"
                title="Stop"
                onClick={onCancel}
                disabled={!onCancel}
              >
                <StopIcon size={16} weight="fill" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                className="lk-send"
                aria-label="Send"
                title="Send (Enter)"
                disabled={text.trim() === ""}
              >
                <ArrowUpIcon size={16} weight="bold" aria-hidden="true" />
              </button>
            )}
          </span>
        </div>
      </div>
      <CommandPalette
        open={paletteProps !== undefined}
        onClose={() => setOverlay(null)}
        title={paletteProps?.title ?? ""}
        items={paletteProps?.items ?? []}
        onPick={paletteProps?.onPick ?? (() => {})}
        {...(paletteProps?.placeholder ? { placeholder: paletteProps.placeholder } : {})}
      />
    </form>
  );
}
