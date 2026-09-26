import { type KeyboardEvent, useState } from "react";

/** The box the person types a prompt in. Enter sends; Shift+Enter adds a line. */
export function Composer({
  running,
  onSend,
  onCancel,
}: {
  running: boolean;
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
  return (
    <form
      className="lk-composer"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
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
