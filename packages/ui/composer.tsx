import type { AvailableCommand, SessionConfigOption } from "@agentclientprotocol/sdk";
import { ArrowUpIcon, AtIcon, PaperclipIcon, StopIcon } from "@phosphor-icons/react";
import { type AttachLimits, AttachmentChips, useAttachments } from "./attachments";
import { Loader, type LoaderMood } from "./loader";
import { type KeyboardEvent, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  filterItems,
  inDrawnOrder,
  OptionList,
  optionId,
  type PickItem,
  useListNavigation,
} from "./overlay/list";
import type { Place } from "./overlay/modal";
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
  /** The text, and any files attached to go with it. */
  onSend: (text: string, files: readonly File[]) => void;
  onCancel?: (() => void) | undefined;
  commands?: readonly AvailableCommand[];
  configOptions?: readonly SessionConfigOption[];
  /** Called when a setting is picked. Without it the settings are shown and cannot be changed. */
  onSetConfig?: ((configId: string, value: string | boolean) => void) | undefined;
  /** What `@` can name. Without it there is no `@`. */
  mentions?: readonly PickItem[] | undefined;
  /** What the box holds when it first appears. */
  initialText?: string;
  /** The files it takes, pasted, dropped or chosen. Without this it takes none. */
  attach?: AttachLimits | undefined;
  /** What the agent is doing, shown by the loader just above the box's top-right corner. */
  loader?: LoaderMood | undefined;
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
  attach,
  loader,
}: ComposerProps) {
  const attachments = useAttachments(attach);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialText);
  const [caret, setCaret] = useState(initialText.length);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Place | undefined>(undefined);
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
    if ((trimmed === "" && attachments.files.length === 0) || running) return;
    onSend(trimmed, attachments.files);
    setText("");
    setCaret(0);
    attachments.clear();
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
    // Backspace in an empty box takes back the last file attached.
    if (event.key === "Backspace" && text === "" && attachments.files.length > 0) {
      event.preventDefault();
      attachments.remove(attachments.files.length - 1);
    }
  };
  const hasFiles = (types: readonly string[]) => attach !== undefined && types.includes("Files");

  // The box grows with what is written, up to the cap its style sets, then scrolls. Once the text
  // first goes past one line, the height it had then is its least until it is emptied, so deleting
  // back to one line does not make it jump between one line and two at the wrap.
  const emptyHeight = useRef(0);
  const wrappedHeight = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the text changes
  useLayoutEffect(() => {
    const el = box.current;
    if (el === null) return;
    el.style.height = "auto";
    const needed = el.scrollHeight;
    if (text === "") {
      emptyHeight.current = needed;
      wrappedHeight.current = 0;
    } else if (
      wrappedHeight.current === 0 &&
      emptyHeight.current > 0 &&
      needed > emptyHeight.current
    ) {
      wrappedHeight.current = needed;
    }
    el.style.height = `${Math.max(needed, wrappedHeight.current)}px`;
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
        search: true,
        span: "box" as const,
        items: commands.map(commandItem),
        onPick: (item: PickItem) => place(splice(text, 0, 0, `${item.label} `)),
      };
    }
    if (overlay === "mentions") {
      return {
        title: "Mention",
        placeholder: "Search what to mention",
        search: true,
        span: "box" as const,
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
        search: true,
        span: "left" as const,
        items: rest.flatMap((option) => settingItems(option, true)),
        onPick: setting,
      };
    }
    if (overlay !== null) {
      const option = configOptions.find((o) => o.id === overlay.optionId);
      if (option !== undefined) {
        const items = settingItems(option, false);
        return {
          title: option.name,
          placeholder: `Search ${option.name.toLowerCase()}`,
          items,
          onPick: setting,
          // Worth searching: models, or any list too long to take in at a glance. Not two modes.
          search: option.category === "model" || items.length > 8,
          span: "left" as const,
        };
      }
    }
    return undefined;
  })();

  // A picker opens on the composer box, above it: full width for what goes into the message (a
  // command, a mention), narrower and left-aligned for a setting.
  const span = paletteProps?.span;
  useLayoutEffect(() => {
    const box = shell.current;
    if (span === undefined || box === null) {
      setPlaced(undefined);
      return;
    }
    const measure = () => {
      const rect = box.getBoundingClientRect();
      setPlaced({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 8,
        width: span === "box" ? rect.width : Math.min(420, rect.width),
        maxHeight: Math.max(160, rect.top - 16),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [span]);

  return (
    <form
      className="lk-composer"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      onDragOver={(event) => {
        if (!hasFiles(event.dataTransfer.types)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event.dataTransfer.types)) return;
        event.preventDefault();
        setDragging(false);
        attachments.add([...event.dataTransfer.files]);
      }}
    >
      <div className="lk-composer-box" ref={shell} data-dragging={dragging || undefined}>
        {loader === undefined ? null : (
          <span className="lk-composer-loader">
            <Loader mood={loader} />
          </span>
        )}
        <AttachmentChips
          files={attachments.files}
          refused={attachments.refused}
          onRemove={attachments.remove}
        />
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
          onPaste={(event) => {
            if (attach === undefined || event.clipboardData.files.length === 0) return;
            event.preventDefault();
            attachments.add([...event.clipboardData.files]);
          }}
        />
        <div id={statusId} className="lk-sr-only" aria-live="polite">
          {listOpen
            ? `${items.length} ${suggestion.kind === "commands" ? "commands" : "suggestions"}. Arrow keys to move, Enter to pick, Escape to close.`
            : ""}
        </div>
        <div className="lk-composer-bar">
          {attach === undefined ? null : (
            <>
              <button
                type="button"
                className="lk-icon-btn"
                aria-label="Attach files"
                title="Attach files"
                onClick={() => picker.current?.click()}
              >
                <PaperclipIcon aria-hidden="true" />
              </button>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                {...(attach.accept ? { accept: attach.accept.join(",") } : {})}
                onChange={(event) => {
                  attachments.add([...(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
            </>
          )}
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
                disabled={text.trim() === "" && attachments.files.length === 0}
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
        search={paletteProps?.search ?? true}
        place={placed}
      />
    </form>
  );
}
