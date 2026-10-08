/** A composer that takes no input yet, such as while its session is still connecting. */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Composer } from "../composer";

const COMMANDS = [{ name: "compact", description: "Compact the conversation" }];

const draw = (unavailable: string | undefined) =>
  renderToStaticMarkup(
    <Composer
      running={false}
      onSend={() => {}}
      commands={COMMANDS}
      mentions={[]}
      attach={{ maxFiles: 4 }}
      initialText="hello"
      unavailable={unavailable}
    />,
  );

/** The opening tag of the element whose `aria-label` is `label`. */
const tagOf = (html: string, label: string): string =>
  html.match(new RegExp(`<[a-z]+[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

describe("a composer given a reason it takes no input", () => {
  test("shows the reason as the box's placeholder, and disables the box", () => {
    const box = tagOf(draw("Connecting to the agent…"), "Message");
    expect(box).toContain('placeholder="Connecting to the agent…"');
    expect(box).toContain('disabled=""');
  });

  test("disables the send button, though the box holds text, and the buttons that add files, commands or mentions", () => {
    const html = draw("Connecting to the agent…");
    for (const label of ["Send", "Attach files", "Commands", "Mention"])
      expect(tagOf(html, label)).toContain('disabled=""');
  });
});

describe("a composer given no such reason", () => {
  test("takes input, with its own placeholder", () => {
    const html = draw(undefined);
    for (const label of ["Message", "Send", "Attach files", "Commands", "Mention"])
      expect(tagOf(html, label)).not.toContain("disabled");
    expect(tagOf(html, "Message")).toContain('placeholder="Message the agent');
  });
});
