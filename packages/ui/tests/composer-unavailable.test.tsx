/** A composer that takes no input yet, such as while its session is still connecting. */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { actionEntries, Composer } from "../composer/composer";

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

  test("disables the send button, though the box holds text", () => {
    expect(tagOf(draw("Connecting to the agent…"), "Send")).toContain('disabled=""');
  });

  test("disables its menu's rows that add files, commands or mentions", () => {
    const offers = { attach: true, commands: true, mentions: true, available: false };
    const noop = () => {};
    const rows = actionEntries(offers, { attach: noop, commands: noop, mentions: noop });
    expect(rows.map((row) => [row.label, row.disabled])).toEqual([
      ["Attach files", true],
      ["Commands", true],
      ["Mention", true],
    ]);
  });
});

describe("a composer given no such reason", () => {
  test("takes input, with its own placeholder", () => {
    const html = draw(undefined);
    for (const label of ["Message", "Send", "Composer menu"])
      expect(tagOf(html, label)).not.toContain("disabled");
    expect(tagOf(html, "Message")).toContain('placeholder="Message the agent');
  });
});
