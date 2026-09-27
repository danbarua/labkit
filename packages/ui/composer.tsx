import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { type KeyboardEvent, useState } from "react";

/** The commands whose name starts what has been typed after a leading slash, before any argument. */
export function commandsMatching(
  text: string,
  commands: readonly AvailableCommand[],
): AvailableCommand[] {
  const typed = /^\/(\S*)$/.exec(text);
  if (typed === null) return [];
  return commands.filter((command) => command.name.startsWith(typed[1] ?? ""));
}

/**
 * The box the person types a prompt in. Enter sends; Shift+Enter adds a line. Typing `/` offers the
 * agent's commands.
 */
export function Composer({
  running,
  commands = [],
  onSend,
  onCancel,
}: {
  running: boolean;
  commands?: readonly AvailableCommand[];
  onSend: (text: string) => void;
  onCancel?: (() => void) | undefined;
}) {
  const [text, setText] = useState("");
  const send = () => {
    const trimmed = text.trim();
    if (trimmed === "" || running) return;
    onSend(trimmed);
    setText("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };
  const offered = commandsMatching(text, commands);
  return (
    <form
      className="lk-composer"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      {offered.length > 0 ? (
        <ul className="lk-commands" aria-label="Commands">
          {offered.map((command) => (
            <li key={command.name}>
              <button type="button" onClick={() => setText(`/${command.name} `)}>
                <code>/{command.name}</code> <span>{command.description}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        name="message"
        aria-label="Message"
        placeholder="Message the session"
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {running ? (
        <button type="button" className="lk-btn danger" onClick={onCancel} disabled={!onCancel}>
          Stop
        </button>
      ) : (
        <button type="submit" className="lk-btn primary" disabled={text.trim() === ""}>
          Send
        </button>
      )}
    </form>
  );
}
