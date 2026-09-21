/**
 * The explorer page's rendering, which is JSON in and HTML out. A value from the API reaches the
 * page as markup, so what these hold down first is that nothing arrives unescaped.
 */

import { describe, expect, test } from "bun:test";
import {
  esc,
  eventRow,
  itemView,
  labelFor,
  mentionHtml,
  propRows,
  valueHtml,
} from "../public/explorer-render.js";

const asText = (text: string) => esc(text);
const held = { "/w/x/Q_1": { type: "Question" }, "/w/x/NOTE_1": { type: "Note" } };
const bases = ["/w/x/"];

describe("values", () => {
  test("markup in a value is text at every level", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    for (const value of [hostile, [hostile], { k: hostile }, [{ k: [hostile] }]]) {
      const html = valueHtml(value, "k", 0, asText);
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img");
    }
  });

  test("an object's keys and a table's column names are text too", () => {
    const html =
      valueHtml([{ "<b>": 1 }], "k", 0, asText) + valueHtml({ "<i>": 1 }, "k", 0, asText);
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
  });

  test("a scalar is its text, an absent one a dash, and an _at key a date", () => {
    expect(valueHtml(7, "n", 0, asText)).toBe("7");
    expect(valueHtml(null, "n", 0, asText)).toContain("—");
    const date = valueHtml("2026-09-08T19:40:52.905Z", "posed_at", 0, asText);
    expect(date).toContain("2026");
    expect(date).toContain("UTC");
    expect(date).not.toContain("T19:40");
  });

  test("a list of scalars is a chip each", () => {
    const html = valueHtml(["CLM_4", "CLM_5"], "citing", 0, asText);
    expect(html.match(/class="chip"/g)).toHaveLength(2);
    expect(valueHtml([], "citing", 0, asText)).toContain("none");
  });

  test("a list of objects is a table with a numbered row each and a column per key", () => {
    const html = valueHtml([{ id: "A" }, { id: "B", label: "L" }], "changes", 0, asText);
    expect(html).toContain("<th>#</th>");
    expect(html).toContain("<th>id</th>");
    expect(html).toContain("<th>label</th>");
    expect(html.match(/<td class="idx">/g)).toHaveLength(2);
  });

  test("columns that hold nested values come after the plain ones", () => {
    const html = valueHtml([{ props: { a: 1 }, id: "A", change: "c" }], "changes", 0, asText);
    const at = (column: string) => html.indexOf(`<th>${column}</th>`);
    expect(at("id")).toBeLessThan(at("props"));
    expect(at("change")).toBeLessThan(at("props"));
  });

  test("an object is a table of its keys", () => {
    const html = valueHtml({ gate: "GATE_4", outcome: "pass" }, "command", 0, asText);
    expect(html).toContain("<th>gate</th>");
    expect(html).toContain("<th>outcome</th>");
  });

  test("past three levels a value is compact JSON, not another table", () => {
    const html = valueHtml({ a: { b: { c: { d: 1 } } } }, "k", 0, asText);
    expect(html).toContain('class="mono faint"');
    expect(html.match(/<table/g)).toHaveLength(3);
  });
});

describe("handles in prose", () => {
  test("a handle for a held resource is a chip that opens it", () => {
    const html = mentionHtml("see Q_1", held, bases);
    expect(html).toContain('data-nav="/w/x/Q_1"');
  });

  test("a handle whose prefix no resource has is left alone", () => {
    const html = mentionHtml("layer K_1 and A_2", held, bases);
    expect(html).toBe("layer K_1 and A_2");
  });

  test("a handle with a known prefix that is not held is a dashed chip", () => {
    const html = mentionHtml("NOTE_9", held, bases);
    expect(html).toContain("mention unknown");
    expect(html).not.toContain("data-nav");
  });

  test("the text around a handle is escaped", () => {
    const html = mentionHtml("<b>Q_1</b>", held, bases);
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>");
  });

  test("a handle is found beside any of the bases", () => {
    const elsewhere = { "/w/y/Q_1": { type: "Question" } };
    expect(mentionHtml("Q_1", elsewhere, ["/w/x/", "/w/y/"])).toContain('data-nav="/w/y/Q_1"');
  });
});

describe("items and events", () => {
  test("an entity item is its type, its handle and its main text", () => {
    const view = itemView({ id: "Q_1", data: { type: "Question", name: "why" } }, undefined);
    expect(view).toMatchObject({ chipType: "Question", title: "Q_1", sub: "why" });
  });

  test("an act item is its position, in the colour of its subject, what was done, and the date", () => {
    const view = itemView(
      {
        id: "12",
        data: {
          type: "Act",
          operation: "pose",
          subject: "Q_1",
          subject_type: "Question",
          at: "2026-09-08T19:40:52.914Z",
        },
      },
      undefined,
    );
    expect(view).toEqual({
      chipType: "Question",
      chipText: "12",
      title: "pose Q_1",
      sub: "2026-09-08",
    });
  });

  test("a label is the first main text that is text", () => {
    expect(labelFor({ attrs: { name: { a: 1 }, text: "prose" } })).toBe("prose");
    expect(labelFor({ attrs: { text: "prose" }, summary: "skim" })).toBe("skim");
    expect(labelFor({ attrs: {} })).toBe("");
  });

  test("an event names its act and position, and escapes what it carries", () => {
    const html = eventRow({
      seq: 60,
      index: 2,
      operation: "<script>",
      dir: "out",
      change: "EdgeCreated",
      to: "A",
      _links: { parent: { href: "https://h/workspace/w/act/60?depth=1" } },
    });
    expect(html).toContain("#60.2");
    expect(html).toContain('data-nav="https://h/workspace/w/act/60"');
    expect(html).not.toContain("<script>");
  });

  test("properties are listed by name, and none is said so", () => {
    const html = propRows({ b: 1, a: 2 }, asText);
    expect(html.indexOf(">a<")).toBeLessThan(html.indexOf(">b<"));
    expect(propRows({}, asText)).toContain("No additional properties");
  });
});
