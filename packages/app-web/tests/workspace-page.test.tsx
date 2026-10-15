/**
 * The workspace page's reading of HAL documents and its drawing of values. A value from the API
 * reaches the page as text, so what these hold down first is that nothing arrives as markup.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  collectionOf,
  commitsRanAgainst,
  drawnAs,
  edgeLabelOf,
  type HalDocument,
  indexOf,
  itemView,
  labelFor,
  relGroups,
} from "../src/ui/workspace/hal";
import { docOf, HalStore } from "../src/ui/workspace/hal-store";
import { findMathSpans, proseSegments } from "../src/ui/workspace/prose";
import { EventRow, PropRows, Value } from "../src/ui/workspace/values";

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

  test("an edge reads as its ends either side of its label, the open record marked and the other a link", () => {
    const out = renderToStaticMarkup(
      <EventRow
        event={{
          seq: 2,
          index: 2,
          operation: "note",
          change: "EdgeCreated",
          from: "NOTE_1",
          label: "CONCERNS",
          to: "Q_1",
          _links: {
            parent: { href: "https://h/workspace/w/act/2" },
            from: { href: "https://h/workspace/w/NOTE_1", type: "Note" },
            to: { href: "https://h/workspace/w/Q_1", type: "Question" },
          },
        }}
        current="/workspace/w/Q_1"
        onOpen={() => {}}
      />,
    );
    const text = out.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("EdgeCreated NOTE_1 CONCERNS Q_1");
    expect(out).toMatch(/<button[^>]*class="mention"[^>]*>NOTE_1<\/button>/);
    expect(out).toMatch(/<span[^>]*class="mention current"[^>]*>Q_1<\/span>/);
    // Everything the row draws as chips and label is left out of the JSON after it.
    expect(out).not.toContain("{");
  });
});

describe("the commits the acts behind some events ran against", () => {
  const event = (seq: number, commit?: string) => ({
    seq,
    _links: {
      parent: { href: `https://h/workspace/w/act/${seq}` },
      ...(commit === undefined
        ? {}
        : { "ran_against:commit": { href: `https://h/workspace/w/commit/${commit}` } }),
    },
  });

  test("are listed in the order the events name them, each with its acts once, in order", () => {
    const events = [
      event(85, "aaa"),
      event(85, "aaa"),
      event(90, "aaa"),
      event(98),
      event(126, "bbb"),
    ];
    expect(commitsRanAgainst(events, "/workspace/w/GATE_5")).toEqual([
      {
        commit: "/workspace/w/commit/aaa",
        acts: [
          { seq: 85, key: "/workspace/w/act/85" },
          { seq: 90, key: "/workspace/w/act/90" },
        ],
      },
      { commit: "/workspace/w/commit/bbb", acts: [{ seq: 126, key: "/workspace/w/act/126" }] },
    ]);
  });

  test("leave out the open commit, which every one of its own events names", () => {
    expect(commitsRanAgainst([event(1, "aaa")], "/workspace/w/commit/aaa")).toEqual([]);
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

  test("a held document is fetched again only when reloaded, and stays readable meanwhile", async () => {
    let fetched = 0;
    const store = new HalStore(async () => {
      fetched++;
      return node("/w/x/Q_1", "Question", { name: `fetch ${fetched}` });
    });
    store.load("/w/x/Q_1");
    store.load("/w/x/Q_1");
    await Bun.sleep(0);
    expect(fetched).toBe(1);
    store.reload((p) => p === "/w/x/Q_1" || p === "/w/x/never-requested");
    expect(store.entry("/w/x/Q_1")?.status).toBe("loading");
    expect(docOf(store.entry("/w/x/Q_1"))?.name).toBe("fetch 1");
    expect(store.entry("/w/x/never-requested")).toBeUndefined();
    await Bun.sleep(0);
    expect(fetched).toBe(2);
    expect(docOf(store.entry("/w/x/Q_1"))?.name).toBe("fetch 2");
  });

  test("a failed request is held as its error, and fetched again when next asked for", async () => {
    let calls = 0;
    const store = new HalStore(async () => {
      calls++;
      if (calls === 1) throw new Error("HTTP 404 nothing here");
      return node("/w/x/Q_9", "Question");
    });
    store.load("/w/x/Q_9");
    await Bun.sleep(0);
    expect(store.entry("/w/x/Q_9")).toEqual({ status: "failed", error: "HTTP 404 nothing here" });
    store.load("/w/x/Q_9");
    await Bun.sleep(0);
    expect(store.entry("/w/x/Q_9")?.status).toBe("ready");
  });

  test("a document fetched again stays readable until the new one arrives", async () => {
    const later = deferred();
    const answers = [Promise.resolve(node("/w/x/Q_1", "Question", { name: "old" })), later.promise];
    const store = new HalStore(() => answers.shift()!);
    store.load("/w/x/Q_1");
    await Bun.sleep(0);
    store.load("/w/x/Q_1", true);
    expect(docOf(store.entry("/w/x/Q_1"))?.name).toBe("old");
    expect(store.index().get("/w/x/Q_1")?.attrs).toEqual({ name: "old" });
    later.resolve(node("/w/x/Q_1", "Question", { name: "new" }));
    await later.promise;
    expect(store.index().get("/w/x/Q_1")?.attrs).toEqual({ name: "new" });
  });
});

describe("an answer to a request", () => {
  test("is at once the held entry when the request already has its answer", async () => {
    const store = new HalStore(async () => node("/w/x/Q_1", "Question"));
    store.load("/w/x/Q_1");
    await Bun.sleep(0);
    expect((await store.settled("/w/x/Q_1")).status).toBe("ready");
  });

  test("waits for a request that is still on its way, and gives its failure too", async () => {
    let fail: (err: Error) => void = () => {};
    const store = new HalStore(
      () =>
        new Promise<HalDocument>((_, reject) => {
          fail = reject;
        }),
    );
    store.load("/w/x/Q_9");
    const settled = store.settled("/w/x/Q_9");
    let answered = false;
    void settled.then(() => {
      answered = true;
    });
    await Bun.sleep(0);
    expect(answered).toBe(false);
    fail(new Error("HTTP 404 nothing here"));
    expect(await settled).toEqual({ status: "failed", error: "HTTP 404 nothing here" });
  });
});

describe("what the graph draws for an opened resource", () => {
  const act = node("/w/x/act/3", "Act", {
    _links: {
      self: { href: "http://h/w/x/act/3?depth=2" },
      subject: { href: "http://h/w/x/NOTE_6?depth=2", dir: "out" },
      touched: { href: "http://h/w/x/LOE_2?depth=2", dir: "out" },
    },
  });

  test("an act is drawn as its subject, named by its own response or by a document that embeds it", () => {
    expect(drawnAs(indexOf([{ key: "/w/x/act/3", doc: act }]), "/w/x/act/3")).toBe("/w/x/NOTE_6");
    expect(drawnAs(indexOf([]), "/w/x/act/3")).toBe("/w/x/act/3");
    const embeddedOnly = indexOf([{ key: "/w/x/act", doc: { _embedded: { act: [act] } } }]);
    expect(embeddedOnly.get("/w/x/act/3")?.own).toBe(false);
    expect(drawnAs(embeddedOnly, "/w/x/act/3")).toBe("/w/x/NOTE_6");
  });

  test("an act embedded without its subject is not drawn until its subject is known", () => {
    const bare: HalDocument = {
      id: "4",
      type: "Act",
      _links: { self: { href: "http://h/w/x/act/4", type: "Act" } },
    };
    const held = indexOf([{ key: "/w/x/act", doc: { _embedded: { act: [bare] } } }]);
    expect(drawnAs(held, "/w/x/act/4")).toBeUndefined();
  });

  test("any other resource is drawn as itself", () => {
    const q = indexOf([{ key: "/w/x/Q_1", doc: node("/w/x/Q_1", "Question") }]);
    expect(drawnAs(q, "/w/x/Q_1")).toBe("/w/x/Q_1");
  });
});

describe("the sidebar's narrow-window query", () => {
  test("matches the media query of workspace.css's narrow-window rules", async () => {
    const { NARROW } = await import("../src/ui/workspace/WorkspacePage");
    const css = await Bun.file(
      new URL("../src/ui/workspace/workspace.css", import.meta.url),
    ).text();
    expect(css).toContain(`@media ${NARROW} {`);
  });
});

describe("the file and history types", () => {
  test("the page names them as the server serves them", async () => {
    const page = await import("../src/ui/workspace/hal");
    const server = await import("../src/server/collection-paths");
    expect([page.FILE_TYPE, page.DIRECTORY_TYPE, page.COMMIT_TYPE, page.DIFF_TYPE]).toEqual([
      server.FILE_TYPE,
      server.DIRECTORY_TYPE,
      server.COMMIT_TYPE,
      server.DIFF_TYPE,
    ]);
  });
});
