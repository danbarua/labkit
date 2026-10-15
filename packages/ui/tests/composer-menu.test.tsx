/**
 * The composer's menu: which rows it holds, and its markup. Opening it, the keys that move through
 * it and where focus goes are checked in a browser, on the gallery's composer.
 */

import { describe, expect, test } from "bun:test";
import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { actionEntries, Composer } from "../composer/composer";
import { ComposerMenu, type MenuEntry } from "../composer/composer-menu";
import { settingEntries } from "../composer/session-controls";

const noop = () => {};
const choose = { attach: noop, commands: noop, mentions: noop };
const offers = { attach: true, commands: true, mentions: true, available: true };
const labels = (rows: MenuEntry[]) => rows.map((row) => row.label);

const mode: SessionConfigOption = {
  id: "mode",
  name: "Mode",
  category: "mode",
  type: "select",
  currentValue: "ask",
  options: [
    { value: "ask", name: "Ask" },
    { value: "code", name: "Code" },
  ],
};
const stream: SessionConfigOption = {
  id: "stream",
  name: "Stream",
  category: "thought_level",
  type: "boolean",
  currentValue: true,
};
const budget: SessionConfigOption = {
  id: "budget",
  name: "Budget",
  type: "select",
  currentValue: "low",
  options: [{ value: "low", name: "Low" }],
};

describe("the menu's actions", () => {
  test("are the ones the composer offers, in order", () => {
    expect(labels(actionEntries(offers, choose))).toEqual(["Attach files", "Commands", "Mention"]);
    expect(labels(actionEntries({ ...offers, attach: false, mentions: false }, choose))).toEqual([
      "Commands",
    ]);
    expect(
      actionEntries({ ...offers, attach: false, commands: false, mentions: false }, choose),
    ).toEqual([]);
  });

  test("are disabled while the composer takes no input, and enabled otherwise", () => {
    expect(actionEntries({ ...offers, available: false }, choose).map((r) => r.disabled)).toEqual([
      true,
      true,
      true,
    ]);
    expect(actionEntries(offers, choose).map((r) => r.disabled)).toEqual([false, false, false]);
  });

  test("open a picker for commands and mentions, and the file chooser for files", () => {
    expect(actionEntries(offers, choose).map((r) => r.opensPicker ?? false)).toEqual([
      false,
      true,
      true,
    ]);
  });
});

describe("the menu's settings", () => {
  const onOpen = noop;

  test("in a wide composer, only the options without a chip, behind one row", () => {
    expect(labels(settingEntries([mode, budget], false, { onOpen }))).toEqual(["Session settings"]);
    expect(settingEntries([mode], false, { onOpen })).toEqual([]);
  });

  test("in a narrow composer, each featured option is a row showing its value", () => {
    const rows = settingEntries([mode, stream, budget], true, { onOpen });
    expect(rows.map((r) => [r.label, r.value, r.opensPicker ?? false, r.checked])).toEqual([
      ["Mode", "Ask", true, undefined],
      ["Stream", "On", false, true],
      ["Session settings", undefined, true, undefined],
    ]);
  });

  test("that cannot be changed are rows shown disabled, with no settings row", () => {
    const rows = settingEntries([mode, budget], true, {});
    expect(rows.map((r) => [r.label, r.value, r.disabled])).toEqual([["Mode", "Ask", true]]);
    expect(settingEntries([mode, budget], false, {})).toEqual([]);
  });
});

describe("the menu's markup", () => {
  const actions = actionEntries({ ...offers, available: false }, choose);
  const settings = settingEntries([mode, stream, budget], true, { onOpen: noop });
  const draw = (open: boolean, groups: MenuEntry[][] = [actions, settings]) =>
    renderToStaticMarkup(<ComposerMenu groups={groups} open={open} onOpenChange={noop} />);

  test("closed, it is a button that says it opens a menu", () => {
    const html = draw(false);
    expect(html).toMatch(/aria-label="Composer menu"[^>]*aria-haspopup="menu"/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });

  test("open, its rows are menu items, separated by group", () => {
    const html = draw(true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toMatch(/role="menu" aria-labelledby="[^"]+"/);
    expect(html.match(/role="menuitem"/g)).toHaveLength(5);
    expect(html.match(/<hr/g)).toHaveLength(1);
  });

  test("a row that opens a picker says so; a disabled row says so; a boolean is a checkbox", () => {
    const html = draw(true);
    expect(html).toMatch(/aria-label="Commands" aria-haspopup="dialog" aria-disabled="true"/);
    expect(html).toMatch(/role="menuitemcheckbox" aria-checked="true" aria-label="Stream: On"/);
    expect(html).toMatch(/aria-label="Mode: Ask" aria-haspopup="dialog" tabindex="-1"/);
  });

  test("with one group there is no separator, and with no rows there is no button", () => {
    expect(draw(true, [actions, []])).not.toContain("<hr");
    expect(draw(false, [[], []])).toBe("");
  });
});

describe("the composer's bar", () => {
  test("holds the menu button, the featured options' chips and the file chooser", () => {
    const html = renderToStaticMarkup(
      <Composer
        running={false}
        onSend={noop}
        configOptions={[mode, budget]}
        onSetConfig={noop}
        attach={{ accept: ["image/*"], maxFiles: 3 }}
      />,
    );
    expect(html).toContain('aria-label="Composer menu"');
    expect(html).toContain('aria-label="Mode: Ask"');
    expect(html).toMatch(/<input type="file" multiple="" hidden="" accept="image\/\*"/);
  });
});
