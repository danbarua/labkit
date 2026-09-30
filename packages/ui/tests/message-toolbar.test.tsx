/** The row of buttons under a message. */

import { describe, expect, test } from "bun:test";
import { initialState, reduce, type TranscriptState, type ViewEvent } from "@labkit/view-model";
import { renderToStaticMarkup } from "react-dom/server";
import { Conversation } from "../conversation";

const events: ViewEvent[] = [
  { type: "prompt_started", content: [{ type: "text", text: "Go" }] },
  {
    type: "update",
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Done." } },
  },
  { type: "prompt_ended", stopReason: "end_turn" },
];
const state: TranscriptState = events.reduce(reduce, initialState);

describe("a message's toolbar", () => {
  test("without a handler, a message offers only copying its text", () => {
    const html = renderToStaticMarkup(<Conversation state={state} />);
    expect(html.match(/aria-label="Copy"/g)).toHaveLength(2);
    expect(html).not.toContain("Edit and send again");
    expect(html).not.toContain("Fork the session from here");
  });

  test("with one, a prompt offers edit and fork, and an answer offers answer again and fork", () => {
    const html = renderToStaticMarkup(<Conversation state={state} onMessageAction={() => {}} />);
    expect(html.match(/aria-label="Edit and send again"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Answer again"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Fork the session from here"/g)).toHaveLength(2);
  });

  test("the last message's toolbar is always shown", () => {
    const html = renderToStaticMarkup(<Conversation state={state} />);
    expect(html).toContain('<div class="lk-message assistant" data-last="true">');
  });
});
