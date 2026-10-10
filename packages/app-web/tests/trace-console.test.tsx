/**
 * The Trace Console's reading of HAL documents and its drawing of values. A value from the API
 * reaches the page as text, so what these hold down first is that nothing arrives as markup.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  collectionOf,
  edgeLabelOf,
  type HalDocument,
  indexOf,
  itemView,
  labelFor,
  relGroups,
} from "../src/ui/trace/hal";
import { HalStore } from "../src/ui/trace/hal-store";
import { findMathSpans, proseSegments } from "../src/ui/trace/prose";
import { EventRow, JsonView, PropRows, Value } from "../src/ui/trace/values";

const asText = (text: string) => text;
const html = (v: unknown, k = "k") =>
  renderToStaticMarkup(<Value v={v} k={k} depth={0} prose={asText} />);

/** A resource as the API embeds it: its properties, its type, and a `self` link. */
const node = (key: string, type: string, rest: Partial<HalDocument> = {}): HalDocument => ({
  id: key.split("/").pop(),
  type,
  _links: { self: { href: `http://h${key}?depth=2` } },
  ...rest,
});

describe("values", () => {
  test("markup in a value is text at every level", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    for (const value of [hostile, [hostile], { k: hostile }, [{ k: [hostile] }]]) {
      const out = html(value);
      expect(out).not.toContain("<img");
      expect(out).toContain("&lt;img");
    }
  });

  test("an object's keys and a table's column names are text too", () => {
    const out = html([{ "<b>": 1 }]) + html({ "<i>": 1 });
    expect(out).not.toContain("<b>");
    expect(out).not.toContain("<i>");
  });

  test("a scalar is its text, an absent one a dash, and an _at key a date", () => {
    expect(html(7, "n")).toBe("7");
    expect(html(null, "n")).toContain("—");
    const date = html("2026-09-08T19:40:52.905Z", "posed_at");
    expect(date).toContain("2026");
    expect(date).toContain("UTC");
    expect(date).not.toContain("T19:40");
  });

  test("a list of scalars is a chip each", () => {
    expect(html(["CLM_4", "CLM_5"]).match(/class="chip"/g)).toHaveLength(2);
    expect(html([])).toContain("none");
  });

  test("a list of objects is a table with a numbered row each and a column per key", () => {
    const out = html([{ id: "A" }, { id: "B", label: "L" }]);
    expect(out).toContain("<th>#</th>");
    expect(out).toContain("<th>id</th>");
    expect(out).toContain("<th>label</th>");
    expect(out.match(/<td class="idx">/g)).toHaveLength(2);
  });

  test("columns that hold nested values come after the plain ones", () => {
    const out = html([{ props: { a: 1 }, id: "A", change: "c" }]);
    const at = (column: string) => out.indexOf(`<th>${column}</th>`);
    expect(at("id")).toBeLessThan(at("props"));
    expect(at("change")).toBeLessThan(at("props"));
  });

  test("an object is a table of its keys", () => {
    const out = html({ gate: "GATE_4", outcome: "pass" });
    expect(out).toContain("<th>gate</th>");
    expect(out).toContain("<th>outcome</th>");
  });

  test("past three levels a value is compact JSON, not another table", () => {
    const out = html({ a: { b: { c: { d: 1 } } } });
    expect(out).toContain('class="mono faint"');
    expect(out.match(/<table/g)).toHaveLength(3);
  });

  test("properties are listed by name, and an empty set says so", () => {
    const out = renderToStaticMarkup(<PropRows attrs={{ b: 1, a: 2 }} prose={asText} />);
    expect(out.indexOf(">a<")).toBeLessThan(out.indexOf(">b<"));
    expect(renderToStaticMarkup(<PropRows attrs={{}} prose={asText} />)).toContain(
      "No additional properties",
    );
  });

  test("JSON is coloured by keys, strings and numbers, and stays text", () => {
    const out = renderToStaticMarkup(<JsonView value={{ "<k>": "<s>", n: 2 }} />);
    expect(out).toContain('<span class="k">&quot;&lt;k&gt;&quot;</span>');
    expect(out).toContain('<span class="s">&quot;&lt;s&gt;&quot;</span>');
    expect(out).toContain('<span class="n">2</span>');
  });
});

describe("handles in prose", () => {
  const held = indexOf([
    { key: "/w/x/Q_1", doc: node("/w/x/Q_1", "Question") },
    { key: "/w/x/NOTE_1", doc: node("/w/x/NOTE_1", "Note") },
  ]);
  const bases = ["/w/x/"];
  const kinds = (text: string, b = bases, h = held) =>
    proseSegments(text, h, b).map((s) => `${s.kind}:${s.text}`);

  test("a handle for a held resource names its key and type", () => {
    expect(proseSegments("see Q_1", held, bases)).toEqual([
      { kind: "text", text: "see " },
      { kind: "mention", text: "Q_1", key: "/w/x/Q_1", type: "Question" },
    ]);
  });

  test("a handle whose prefix no resource has is left as text", () => {
    expect(kinds("layer K_1 and A_2").every((k) => k.startsWith("text:"))).toBe(true);
  });

  test("a handle with a known prefix that is not held is unknown", () => {
    expect(kinds("NOTE_9")).toEqual(["unknown:NOTE_9"]);
  });

  test("a handle is found beside any of the bases", () => {
    const elsewhere = indexOf([{ key: "/w/y/Q_1", doc: node("/w/y/Q_1", "Question") }]);
    const [first] = proseSegments("Q_1", elsewhere, ["/w/x/", "/w/y/"]);
    expect(first).toMatchObject({ kind: "mention", key: "/w/y/Q_1" });
  });

  test("a sentence with maths and a handle keeps both", () => {
    expect(kinds("z_o = mean_{i in o} on Q_1")).toEqual([
      "math:z_o = mean_{i in o}",
      "text: on ",
      "mention:Q_1",
    ]);
  });
});

describe("maths in prose", () => {
  const found = (text: string) => findMathSpans(text).map(([s, e]) => text.slice(s, e));

  test("notation joined by an operator is one span", () => {
    expect(found("where z_o = mean_{i in o} of x")).toEqual(["z_o = mean_{i in o}"]);
    expect(found("the slope d(loss)/d(K_2) is small")).toEqual(["d(loss)/d(K_2)"]);
  });

  test("a single atom is not maths", () => {
    expect(found("the value z_o here")).toEqual([]);
  });

  test("a handle is never an atom", () => {
    expect(found("Q_1 = NOTE_20")).toEqual([]);
  });

  test("a snake_case word made of English is prose, not a variable", () => {
    expect(found("window_size = manual_seed")).toEqual([]);
  });
});

describe("what the page holds", () => {
  const inbound = { dir: "in", href: "http://h/w/x/NOTE_1?depth=2", type: "Note" };

  test("a resource's own response lists its relations; an embedded copy's links do not replace them", () => {
    const own = node("/w/x/Q_1", "Question", {
      name: "own",
      _links: { self: { href: "http://h/w/x/Q_1?depth=2" }, "note:concerns": [inbound] },
    });
    const embedding = node("/w/x/NOTE_1", "Note", {
      _embedded: {
        "concerns:question": [node("/w/x/Q_1", "Question", { name: "copy", dir: "out" })],
      },
    });
    const held = indexOf([
      { key: "/w/x/Q_1", doc: own },
      { key: "/w/x/NOTE_1", doc: embedding },
    ]);
    const q = held.get("/w/x/Q_1");
    expect(q?.own).toBe(true);
    expect(q?.attrs).toEqual({ name: "own" });
    expect(q?.rels).toEqual([{ rel: "note:concerns", key: "/w/x/NOTE_1", dir: "in" }]);
    expect(relGroups(q!, "in")).toEqual([{ rel: "note:concerns", keys: ["/w/x/NOTE_1"] }]);
  });

  test("a resource seen only embedded takes the properties of the newest document embedding it", () => {
    const embeds = (name: string) =>
      node("/w/x/LOE_1", "LineOfEnquiry", {
        _embedded: { "note:concerns": [node("/w/x/NOTE_1", "Note", { text: name, dir: "in" })] },
      });
    const held = indexOf([
      { key: "/w/x/LOE_1", doc: embeds("older") },
      { key: "/w/x/LOE_2", doc: embeds("newer") },
    ]);
    expect(held.get("/w/x/NOTE_1")?.attrs).toEqual({ text: "newer" });
    expect(held.get("/w/x/NOTE_1")?.own).toBe(false);
  });

  test("a resource seen only as a link is known by its type, with no properties", () => {
    const held = indexOf([
      {
        key: "/w/x/Q_1",
        doc: node("/w/x/Q_1", "Question", {
          _links: { self: { href: "http://h/w/x/Q_1" }, "note:concerns": [inbound] },
        }),
      },
    ]);
    expect(held.get("/w/x/NOTE_1")).toMatchObject({ type: "Note", attrs: undefined });
  });

  test("a collection's entry for another collection is not a resource", () => {
    const doc: HalDocument = {
      _links: { self: { href: "http://h/w/x" } },
      _embedded: {
        collection: [
          {
            slug: "question",
            type: "Question",
            _links: { self: { href: "http://h/w/x/question" } },
          },
        ],
      },
    };
    expect(indexOf([{ key: "/w/x", doc }]).size).toBe(0);
    const c = collectionOf("/w/x", doc);
    expect(c.items).toEqual([
      {
        key: "/w/x/question",
        href: "http://h/w/x/question",
        id: undefined,
        data: { slug: "question", type: "Question" },
      },
    ]);
    expect(c.index).toBeUndefined();
  });

  test("a collection names the collection it is listed in and its next page", () => {
    const c = collectionOf("/w/x/question", {
      _links: {
        self: { href: "http://h/w/x/question?limit=25&offset=0" },
        index: { href: "http://h/w/x" },
        next: { href: "http://h/w/x/question?limit=25&offset=25" },
      },
      _embedded: {},
    });
    expect(c.index).toBe("/w/x");
    expect(c.next).toBe("http://h/w/x/question?limit=25&offset=25");
  });

  test("a relation's edge label is its relation part, outbound first and inbound second", () => {
    expect(edgeLabelOf("motivates:lineofenquiry", "out")).toBe("MOTIVATES");
    expect(edgeLabelOf("note:concerns", "in")).toBe("CONCERNS");
    expect(edgeLabelOf("recorded_in:artefact", "out")).toBe("RECORDED_IN");
  });
});

describe("items and events", () => {
  test("a resource item is its type, its handle and its main text", () => {
    const view = itemView(
      { key: "/w/x/Q_1", href: "", id: "Q_1", data: { type: "Question", name: "why" } },
      undefined,
    );
    expect(view).toEqual({ chipType: "Question", chipText: "Q", title: "Q_1", sub: "why" });
  });

  test("an act item is its position, in the colour of its subject, what was done, and the date", () => {
    const data = {
      type: "Act",
      operation: "pose",
      subject: "Q_1",
      subject_type: "Question",
      at: "2026-09-08T19:40:52.914Z",
    };
    expect(itemView({ key: "/w/x/act/12", href: "", id: "12", data }, undefined)).toEqual({
      chipType: "Question",
      chipText: "12",
      title: "pose Q_1",
      sub: "2026-09-08",
    });
  });

  test("a label is the first main text that is text", () => {
    expect(labelFor({ name: { a: 1 }, text: "prose" })).toBe("prose");
    expect(labelFor({})).toBe("");
    expect(labelFor(undefined)).toBe("");
  });

  test("an event names its position and act, and what it carries is text", () => {
    const out = renderToStaticMarkup(
      <EventRow
        event={{
          seq: 60,
          index: 2,
          operation: "<script>",
          dir: "out",
          change: "EdgeCreated",
          to: "A",
          _links: { parent: { href: "https://h/workspace/w/act/60?depth=1" } },
        }}
        onOpen={() => {}}
      />,
    );
    expect(out).toContain("#60.2");
    expect(out).toContain('title="Open the act"');
    expect(out).not.toContain("<script>");
  });
});

describe("the documents fetched", () => {
  const deferred = () => {
    let resolve: (doc: HalDocument) => void = () => {};
    const promise = new Promise<HalDocument>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  test("a response to a request that was made again is dropped", async () => {
    const first = deferred();
    const second = deferred();
    const answers = [first, second];
    const store = new HalStore(() => answers.shift()!.promise);
    store.load("/w/x/Q_1");
    store.load("/w/x/Q_1", true);
    second.resolve(node("/w/x/Q_1", "Question", { name: "second" }));
    await second.promise;
    first.resolve(node("/w/x/Q_1", "Question", { name: "first" }));
    await first.promise;
    expect(store.index().get("/w/x/Q_1")?.attrs).toEqual({ name: "second" });
  });

  test("a held document is not fetched again until it is forgotten", async () => {
    let fetched = 0;
    const store = new HalStore(async () => {
      fetched++;
      return node("/w/x/Q_1", "Question");
    });
    store.load("/w/x/Q_1");
    store.load("/w/x/Q_1");
    expect(fetched).toBe(1);
    store.forget((p) => p === "/w/x/Q_1");
    store.load("/w/x/Q_1");
    expect(fetched).toBe(2);
  });

  test("a failed request is held as its error", async () => {
    const store = new HalStore(async () => {
      throw new Error("HTTP 404 nothing here");
    });
    store.load("/w/x/Q_9");
    await Bun.sleep(0);
    expect(store.entry("/w/x/Q_9")).toEqual({ status: "failed", error: "HTTP 404 nothing here" });
  });
});
