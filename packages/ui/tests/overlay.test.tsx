/**
 * The overlay building blocks and the composer's typeahead, as logic and as markup. What a
 * browser adds on top (focus moving, the dialog's top layer) is checked in one.
 */

import { describe, expect, test } from "bun:test";
import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { Composer, mentionAt } from "../composer";
import { filterItems, inDrawnOrder, type PickItem, stepIndex } from "../overlay/list";
import { Modal } from "../overlay/modal";
import { PalettePanel } from "../overlay/palette";
import { ToastProvider } from "../overlay/toast";

const item = (label: string, extra: Partial<PickItem> = {}): PickItem => ({
  id: label,
  label,
  ...extra,
});

describe("narrowing a list", () => {
  const items = [
    item("Claude Sonnet 5", { group: "Anthropic" }),
    item("Qwen 3.5", { group: "Local", detail: "mlx-community" }),
    item("Claude Opus 5.5", { group: "Anthropic" }),
    item("Sonnet-alike", { group: "Local" }),
  ];

  test("no query keeps every item in the caller's order", () => {
    expect(filterItems(items, " ").map((i) => i.label)).toEqual(items.map((i) => i.label));
  });

  test("every word must appear somewhere: label, detail or group, in any case", () => {
    expect(filterItems(items, "claude opus").map((i) => i.label)).toEqual(["Claude Opus 5.5"]);
    expect(filterItems(items, "MLX").map((i) => i.label)).toEqual(["Qwen 3.5"]);
    expect(filterItems(items, "local").map((i) => i.label)).toEqual(["Qwen 3.5", "Sonnet-alike"]);
  });

  test("a label that starts with the query comes first", () => {
    expect(filterItems(items, "sonnet").map((i) => i.label)).toEqual([
      "Sonnet-alike",
      "Claude Sonnet 5",
    ]);
  });

  test("drawn order keeps each group together, groups in first-seen order", () => {
    expect(inDrawnOrder(items).map((i) => i.label)).toEqual([
      "Claude Sonnet 5",
      "Claude Opus 5.5",
      "Qwen 3.5",
      "Sonnet-alike",
    ]);
  });

  test("moving past either end wraps; an empty list has nothing active", () => {
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(-1);
  });
});

describe("a palette", () => {
  test("its input drives the list and starts on the current item", () => {
    const html = renderToStaticMarkup(
      <PalettePanel
        title="Model"
        items={[item("A"), item("B", { current: true }), item("C")]}
        onPick={() => {}}
      />,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="true"');
    const active = /aria-activedescendant="([^"]+)"/.exec(html)?.[1];
    expect(html).toContain(`id="${active}" role="option" aria-selected="true"`);
    expect(html).toMatch(/aria-selected="true"[^>]*>(?:(?!<\/div><div).)*>B</);
    expect(html).toContain('<span class="lk-sr-only">current</span>');
  });

  test("with nothing to show it says so", () => {
    const html = renderToStaticMarkup(<PalettePanel title="Model" items={[]} onPick={() => {}} />);
    expect(html).toContain('role="status">Nothing matches');
  });

  test("without search the list itself takes focus and points at the current item", () => {
    const html = renderToStaticMarkup(
      <PalettePanel
        title="Thinking"
        items={[item("Low"), item("High", { current: true })]}
        onPick={() => {}}
        search={false}
      />,
    );
    expect(html).not.toContain("<input");
    expect(html).toMatch(/role="listbox"[^>]*tabindex="0"[^>]*data-autofocus="true"/);
    const active = /aria-activedescendant="([^"]+)"/.exec(html)?.[1];
    expect(html).toContain(`id="${active}" role="option" aria-selected="true"`);
  });
});

describe("a placed modal", () => {
  test("sits where it is put instead of the centre of the window", () => {
    const html = renderToStaticMarkup(
      <Modal
        open
        onClose={() => {}}
        title="Mode"
        place={{ left: 136, bottom: 282, width: 420, maxHeight: 440 }}
      >
        <p>body</p>
      </Modal>,
    );
    expect(html).toContain('class="lk-modal lk-modal-placed"');
    expect(html).toContain("left:136px;bottom:282px;width:420px;max-height:440px");
  });
});

describe("a modal", () => {
  test("is named by its title and can always be closed", () => {
    const html = renderToStaticMarkup(
      <Modal open onClose={() => {}} title="Rename">
        <p>body</p>
      </Modal>,
    );
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(html).toContain(`<h2 id="${labelledBy}">Rename</h2>`);
    expect(html).toContain('aria-label="Close"');
  });

  test("closed, it holds nothing", () => {
    const html = renderToStaticMarkup(
      <Modal open={false} onClose={() => {}} title="Rename">
        <p>body</p>
      </Modal>,
    );
    expect(html).not.toContain("body");
  });
});

describe("toasts", () => {
  test("both live regions are there before any toast is", () => {
    const html = renderToStaticMarkup(<ToastProvider>{null}</ToastProvider>);
    expect(html).toContain('aria-label="Notifications"');
    expect(html).toContain('<ol aria-live="assertive"></ol><ol aria-live="polite"></ol>');
  });
});

describe("the composer", () => {
  const commands: AvailableCommand[] = [
    { name: "review", description: "Review files", input: { hint: "files or focus" } },
    { name: "export", description: "Write the history out" },
  ];
  const mentions = [item("README.md", { group: "Files" }), item("CLM_3", { group: "Records" })];
  const draw = (initialText: string) =>
    renderToStaticMarkup(
      <Composer
        running={false}
        onSend={() => {}}
        commands={commands}
        mentions={mentions}
        initialText={initialText}
      />,
    );

  test("an @ at the start of a word is a mention being typed", () => {
    expect(mentionAt("see @REA", 8)).toEqual({ query: "REA", start: 4 });
    expect(mentionAt("@", 1)).toEqual({ query: "", start: 0 });
    expect(mentionAt("mail a@b", 8)).toBeNull();
    expect(mentionAt("see @REA more", 13)).toBeNull();
  });

  test("a slash offers the commands, and the box points at the active one", () => {
    const html = draw("/");
    expect(html).toContain('role="listbox" aria-label="Commands"');
    expect(html).toContain("/review");
    expect(html).toContain("/export");
    expect(html).toMatch(/aria-activedescendant="[^"]+"/);
  });

  test("an @ offers what can be mentioned, narrowed by what follows it", () => {
    const html = draw("look at @REA");
    expect(html).toContain('role="listbox" aria-label="Mentions"');
    expect(html).toContain("README.md");
    expect(html).not.toContain("CLM_3");
  });

  test("a chosen command says what it expects next", () => {
    expect(draw("/review ")).toContain(
      '<code class="lk-composer-hint-command">/review</code> files or focus',
    );
  });

  test("with nothing written there is nothing to send, and a running turn can be stopped", () => {
    expect(draw("")).toMatch(/<button type="submit" class="lk-send"[^>]*disabled=""/);
    const running = renderToStaticMarkup(
      <Composer running onSend={() => {}} onCancel={() => {}} />,
    );
    expect(running).toContain('aria-label="Stop"');
  });

  test("without mentions there is no @ control", () => {
    const html = renderToStaticMarkup(<Composer running={false} onSend={() => {}} />);
    expect(html).not.toContain('aria-label="Mention"');
    expect(html).not.toContain('aria-label="Commands"');
  });
});
