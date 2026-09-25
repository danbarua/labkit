/**
 * The HTTP API against a real Postgres, through `handle()`.
 *
 * Each run creates its own database with two workspaces holding different data, and drops it at
 * the end, so nothing here depends on what a developer has loaded. `LABKIT_DB_URL` says which
 * server to create it on; without it the suite is skipped.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: response bodies are read loosely; each test asserts only the part of the shape it is about

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { NODE_LABELS, NODE_TYPES } from "@labkit/core-db/domain";
import { handle } from "../src/server/handler";
import { createRuntime, type Runtime } from "../src/server/runtime";
import { createFixture, defaultBackend, type Fixture } from "./support/fixture";

const PUBLIC = "https://labkit.test";
const TUNNEL = { "x-forwarded-proto": "https" };

// Some behaviour only shows on a real pool of connections, and PGlite has one.
const testOnPostgres = test.skipIf(defaultBackend() !== "postgres");

let runtime: Runtime;
let fixture: Fixture;

beforeAll(async () => {
  fixture = await createFixture();
  runtime = createRuntime(fixture.connections);
}, 60_000);

afterAll(async () => {
  await fixture?.close();
});

async function get(path: string, headers: Record<string, string> = TUNNEL) {
  const res = await handle(new Request(PUBLIC + path, { headers }), runtime);
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: sitemap, markdown
  }
  return { status: res.status, type: res.headers.get("content-type") ?? "", res, body };
}

function hrefs(value: unknown, out: string[] = []): string[] {
  if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (key === "href" && typeof inner === "string") out.push(inner);
      else hrefs(inner, out);
    }
  }
  return out;
}

// A collection's items, whatever the collection is called.
const itemsOf = (body: any): any[] => Object.values(body._embedded).flat() as any[];

describe("entities", () => {
  test("a bare handle returns one hop of neighbours", async () => {
    const r = await get("/graph/LOE_1");
    expect(r.status).toBe(200);
    expect(r.type).toBe("application/hal+json");
    expect(r.body).toMatchObject({ id: "LOE_1", type: "LineOfEnquiry", name: "alpha enquiry" });
    expect(Object.keys(r.body._embedded).sort()).toEqual([
      "evidenceunit:addresses",
      "question:motivates",
    ]);
    expect(r.body._embedded["question:motivates"][0]).toMatchObject({ id: "Q_1", dir: "in" });
  });

  test("depth=0 returns the entity alone", async () => {
    const r = await get("/graph/LOE_1?depth=0");
    expect(r.status).toBe(200);
    expect(r.body._embedded).toBeUndefined();
  });

  test("links repeat the depth that was applied", async () => {
    const bare = await get("/graph/LOE_1");
    expect(bare.body._links.self.href).toBe(`${PUBLIC}/graph/LOE_1?depth=1`);
    const deep = await get("/graph/LOE_1?depth=2");
    expect(deep.body._links.self.href).toBe(`${PUBLIC}/graph/LOE_1?depth=2`);
    expect(hrefs(deep.body).filter((h) => !h.includes("{"))).toEqual(
      expect.arrayContaining([expect.stringContaining("depth=2")]),
    );
    expect(
      hrefs(deep.body)
        .filter((h) => !h.includes("{"))
        .every((h) => h.endsWith("depth=2")),
    ).toBe(true);
  });

  test("links at the boundary are absolute too, not just the embedded ones", async () => {
    const r = await get("/graph/Q_1?depth=1");
    const boundary = r.body._embedded["motivates:lineofenquiry"][0]._links;
    for (const link of Object.values(boundary).flat() as { href: string }[]) {
      expect(link.href.startsWith(`${PUBLIC}/graph/`)).toBe(true);
    }
  });

  test("every relation is in _links, embedded or not, with props when the edge has any", async () => {
    const r = await get("/graph/EU_1?depth=1");
    expect(Object.keys(r.body._embedded).sort()).toEqual([
      "addresses:lineofenquiry",
      "produces:evidence",
    ]);
    // addresses:lineofenquiry is embedded (LOE_1 is within depth) and carries an edge property.
    expect(r.body._links["addresses:lineofenquiry"]).toEqual([
      {
        href: `${PUBLIC}/graph/LOE_1?depth=1`,
        dir: "out",
        type: "LineOfEnquiry",
        props: { weight: 1 },
      },
    ]);
    // produces:evidence is embedded too, with a plain edge, so no props key.
    expect(r.body._links["produces:evidence"]).toEqual([
      { href: `${PUBLIC}/graph/EV_1?depth=1`, dir: "out", type: "Evidence" },
    ]);
  });

  test("a mid-tree resource, not only the boundary layer, gets links for its own relations", async () => {
    const r = await get("/graph/Q_1?depth=2");
    const loe1 = r.body._embedded["motivates:lineofenquiry"][0];
    expect(loe1.depth).toBe(1);
    expect(loe1._links["evidenceunit:addresses"]).toEqual([
      {
        href: `${PUBLIC}/graph/EU_1?depth=2`,
        dir: "in",
        type: "EvidenceUnit",
        props: { weight: 1 },
      },
    ]);
  });

  test("the edge property survives from the other end of the same relation", async () => {
    const r = await get("/graph/LOE_1?depth=0");
    expect(r.body._links["evidenceunit:addresses"]).toEqual([
      {
        href: `${PUBLIC}/graph/EU_1?depth=0`,
        dir: "in",
        type: "EvidenceUnit",
        props: { weight: 1 },
      },
    ]);
  });

  test("index links to the collection the entity is listed in, with the same parameters", async () => {
    const bare = await get("/graph/Q_1");
    expect(bare.body._links.index.href).toBe(`${PUBLIC}/collections/question?depth=1`);
    const inWorkspace = await get("/workspace/alpha/LOE_1?depth=0");
    expect(inWorkspace.body._links.index.href).toBe(`${PUBLIC}/workspace/alpha/enquiry?depth=0`);
  });

  test("expand is a URI template for depth", async () => {
    const r = await get("/graph/Q_1");
    expect(r.body._links.expand).toMatchObject({
      href: `${PUBLIC}/graph/Q_1{?depth}`,
      templated: true,
    });
  });

  test.each(["7", "-1", "x", "1.5"])("depth=%s is a 400", async (depth: string) => {
    const r = await get(`/graph/Q_1?depth=${depth}`);
    expect(r.status).toBe(400);
    expect(r.type).toBe("application/problem+json");
  });

  test("an unknown handle is a 404", async () => {
    expect((await get("/graph/Q_999")).status).toBe(404);
    expect((await get("/graph/NOPE_1")).status).toBe(404);
  });

  test("a retracted node is not served", async () => {
    expect((await get("/graph/Q_3")).status).toBe(404);
  });

  test("bare /graph redirects to the first question", async () => {
    const r = await get("/graph");
    expect(r.status).toBe(302);
    expect(r.res.headers.get("location")).toBe(`${PUBLIC}/graph/Q_1`);
  });
});

describe("workspaces", () => {
  test("the same handle is a different entity in each workspace", async () => {
    const alpha = await get("/workspace/alpha/Q_1");
    const beta = await get("/workspace/beta/Q_1");
    expect(alpha.body.name).toBe("alpha question");
    expect(beta.body.name).toBe("beta question");
  });

  test("the bare path is the default workspace, which is tenant 1", async () => {
    expect((await get("/graph/Q_1")).body.name).toBe("alpha question");
  });

  test("a handle that only exists in another workspace is a 404, not a fallback", async () => {
    expect((await get("/workspace/beta/LOE_1")).status).toBe(404);
    expect((await get("/workspace/beta/enquiry")).body._embedded.enquiry).toEqual([]);
  });

  test("an unknown workspace is a 404", async () => {
    const r = await get("/workspace/nope/Q_1");
    expect(r.status).toBe(404);
    expect(r.type).toBe("application/problem+json");
  });

  test("every link in a workspace response stays in that workspace", async () => {
    const r = await get("/workspace/alpha/LOE_1?depth=2");
    const links = hrefs(r.body);
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) expect(href.startsWith(`${PUBLIC}/workspace/alpha/`)).toBe(true);
    expect(r.body._links.expand.href).toBe(`${PUBLIC}/workspace/alpha/LOE_1{?depth}`);
  });

  test("bare links do not mention workspaces", async () => {
    const r = await get("/graph/LOE_1?depth=2");
    for (const href of hrefs(r.body)) expect(href).not.toContain("/workspace/");
  });

  test("inside a workspace, only its nodes and its collections are routes", async () => {
    expect((await get("/workspace/alpha/sitemap.xml")).status).toBe(404);
    expect((await get("/workspace/alpha/docs/")).status).toBe(404);
    expect((await get("/workspace/alpha/collections")).status).toBe(404);
    expect((await get("/workspace/alpha/question/extra")).status).toBe(404);
  });

  test("a workspace has no /graph segment: neither the old node form nor the entrance resolves", async () => {
    expect((await get("/workspace/alpha/graph/Q_1")).status).toBe(404);
    expect((await get("/workspace/alpha/graph")).status).toBe(404);
  });

  testOnPostgres("interleaved requests to different workspaces never cross", async () => {
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) => get(`/workspace/${i % 2 === 0 ? "alpha" : "beta"}/Q_1`)),
    );
    for (const [i, r] of results.entries()) {
      expect(r.body.name).toBe(i % 2 === 0 ? "alpha question" : "beta question");
    }
  });

  testOnPostgres("more concurrent requests than pool connections all complete", async () => {
    const paths = [
      "/collections/workspace",
      "/workspace/alpha/LOE_1?depth=2",
      "/collections/question",
    ];
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) => get(paths[i % paths.length] as string)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  test("no request leaves tenant state on the connection it used", async () => {
    await get("/workspace/beta/Q_1");
    const session = await runtime.connections.connect();
    try {
      const { rows } = await session.query<{ role: string; tenant: string | null }>(
        `SELECT current_user AS role, current_setting('labkit.tenant_id', true) AS tenant`,
      );
      expect(rows[0]?.role).not.toBe("labkit_app");
      expect(rows[0]?.tenant ?? "").toBe("");
    } finally {
      session.release();
    }
  });
});

describe("collections", () => {
  test("the index has a collection per node type, and workspaces in the default workspace", async () => {
    const r = await get("/collections");
    expect(r.type).toBe("application/hal+json");
    expect(r.body._links.self.href).toBe(`${PUBLIC}/collections`);
    const entries = r.body._embedded.collection;
    expect(entries.map((i: any) => i.slug)).toEqual(
      expect.arrayContaining(["question", "enquiry", "evidence-unit", "evaluation", "workspace"]),
    );
    expect(entries[0]._links.self.href).toBe(`${PUBLIC}/collections/question`);
  });

  test("a workspace's own address is its collections index, and does not list workspaces", async () => {
    const r = await get("/workspace/beta");
    expect(r.status).toBe(200);
    expect(r.type).toBe("application/hal+json");
    expect(r.body._links.self.href).toBe(`${PUBLIC}/workspace/beta`);
    const entries = r.body._embedded.collection;
    const slugs = entries.map((i: any) => i.slug);
    expect(slugs).toContain("question");
    expect(slugs).not.toContain("workspace");
    expect(entries[0]._links.self.href).toBe(`${PUBLIC}/workspace/beta/question`);
    expect((await get("/workspace/beta/workspace")).status).toBe(404);
  });

  test("a trailing slash on a workspace address is the same index", async () => {
    const r = await get("/workspace/beta/");
    expect(r.status).toBe(200);
    expect(r.body._links.self.href).toBe(`${PUBLIC}/workspace/beta`);
  });

  test("an item is the resource the graph gives for it, listed under the collection's slug", async () => {
    const r = await get("/collections/question");
    expect(r.type).toBe("application/hal+json");
    const items = r.body._embedded.question;
    expect(items.map((i: any) => i.id)).toEqual(["Q_1", "Q_2"]);
    expect(items[0]).toMatchObject({ id: "Q_1", type: "Question", name: "alpha question" });
    expect(items[0]._embedded).toBeUndefined();
    expect(items[0]._links.self.href).toBe(`${PUBLIC}/graph/Q_1`);
  });

  test("a collection is named by its slug where the label has an override", async () => {
    const r = await get("/collections/enquiry");
    expect(Object.keys(r.body._embedded)).toEqual(["enquiry"]);
    expect(r.body._links.self.href).toBe(`${PUBLIC}/collections/enquiry?limit=50&offset=0`);
  });

  test("retracted nodes are not listed", async () => {
    const r = await get("/collections/question");
    expect(itemsOf(r.body).map((i: any) => i.id)).not.toContain("Q_3");
  });

  test("an item carries its own properties, and the edge properties on its links", async () => {
    const r = await get("/collections/evidence-unit");
    const [item] = itemsOf(r.body);
    expect(item).toMatchObject({ id: "EU_1", type: "EvidenceUnit", role: "observation" });
    expect(item._links["addresses:lineofenquiry"]).toEqual([
      { href: `${PUBLIC}/graph/LOE_1`, dir: "out", type: "LineOfEnquiry", props: { weight: 1 } },
    ]);
    expect(item._links["produces:evidence"]).toEqual([
      { href: `${PUBLIC}/graph/EV_1`, dir: "out", type: "Evidence" },
    ]);
  });

  test("every item links to what it relates to", async () => {
    const r = await get("/collections/question");
    expect(r.body._embedded.question[0]._links["motivates:lineofenquiry"]).toEqual([
      { href: `${PUBLIC}/graph/LOE_1`, dir: "out", type: "LineOfEnquiry" },
    ]);
  });

  test("depth embeds each item's neighbours, and is a client preference every link carries", async () => {
    const r = await get("/collections/question?depth=1");
    const [q1] = r.body._embedded.question;
    expect(q1._embedded["motivates:lineofenquiry"][0]).toMatchObject({ id: "LOE_1" });
    for (const href of hrefs(r.body)) expect(href).toEndWith("depth=1");
    expect((await get("/collections/question?depth=7")).status).toBe(400);
    expect((await get("/collections/question?depth=x")).status).toBe(400);
  });

  test("paging links appear when there is more, and lead back", async () => {
    const first = await get("/collections/question?limit=1");
    expect(first.body._embedded.question).toHaveLength(1);
    const rels = (b: any) => Object.keys(b._links).sort();
    expect(rels(first.body)).toEqual(["index", "next", "self"]);

    const next = first.body._links.next.href;
    const second = await get(next.replace(PUBLIC, ""));
    expect(second.body._embedded.question[0].id).toBe("Q_2");
    expect(rels(second.body)).toEqual(["index", "prev", "self"]);
  });

  test("parameters the collection does not page by are carried on by every link", async () => {
    const r = await get("/workspace/alpha/question?limit=1&depth=0");
    expect(r.body._links.self.href).toBe(
      `${PUBLIC}/workspace/alpha/question?limit=1&offset=0&depth=0`,
    );
    expect(r.body._links.next.href).toBe(
      `${PUBLIC}/workspace/alpha/question?limit=1&offset=1&depth=0`,
    );
    expect(r.body._links.index.href).toBe(`${PUBLIC}/workspace/alpha?depth=0`);
    const [item] = r.body._embedded.question;
    expect(item._links.self.href).toBe(`${PUBLIC}/workspace/alpha/Q_1?depth=0`);
    for (const href of hrefs(item._links)) expect(href).toEndWith("?depth=0");

    const index = await get("/collections?depth=0");
    for (const href of hrefs(index.body)) expect(href).toEndWith("?depth=0");
  });

  test("limit and offset are clamped rather than rejected", async () => {
    expect((await get("/collections/question?limit=0")).body._embedded.question).toHaveLength(1);
    expect(
      (await get("/collections/question?limit=x&offset=-5")).body._embedded.question,
    ).toHaveLength(2);
  });

  test("an unknown collection is a 404", async () => {
    const r = await get("/collections/nope");
    expect(r.status).toBe(404);
    expect(r.type).toBe("application/problem+json");
  });

  test("workspace lists every workspace, each addressed by its own index", async () => {
    const r = await get("/collections/workspace");
    const items = r.body._embedded.workspace;
    expect(items.map((i: any) => i.slug)).toEqual(["alpha", "beta"]);
    expect(items[1]).toMatchObject({ slug: "beta", name: "beta" });
    expect(items[1]._links).toEqual({ self: { href: `${PUBLIC}/workspace/beta` } });
  });

  test("collection links stay in the workspace", async () => {
    const r = await get("/workspace/beta/question");
    for (const href of hrefs(r.body))
      expect(href.startsWith(`${PUBLIC}/workspace/beta`)).toBe(true);
    expect(r.body._links.self.href).toBe(`${PUBLIC}/workspace/beta/question?limit=50&offset=0`);
    expect(r.body._links.index.href).toBe(`${PUBLIC}/workspace/beta`);
    expect(r.body._embedded.question[0].name).toBe("beta question");
  });
});

describe("acts", () => {
  const link = (body: any, rel: string) => body._links[rel]?.href.replace(PUBLIC, "");

  test("a workspace's acts are a collection of commands, oldest first, each linking to what it affected", async () => {
    const r = await get("/workspace/alpha/act");
    expect(r.type).toBe("application/hal+json");
    const items = r.body._embedded.act;
    expect(items.map((i: any) => i.id)).toEqual(["1", "2", "3"]);
    expect(items[1]).toMatchObject({
      type: "Act",
      name: "note NOTE_1",
      operation: "note",
      subject: "NOTE_1",
      subject_type: "Note",
      changes: 2,
    });
    expect(items[1]._links).toEqual({
      self: { href: `${PUBLIC}/workspace/alpha/act/2`, type: "Act" },
      subject: { href: `${PUBLIC}/workspace/alpha/NOTE_1`, type: "Note", dir: "out" },
      touched: [{ href: `${PUBLIC}/workspace/alpha/Q_1`, type: "Question", dir: "out" }],
    });
  });

  test("since names the last act on a page, and following it gives what came after", async () => {
    const first = await get("/workspace/alpha/act?limit=1");
    expect(link(first.body, "since")).toBe("/workspace/alpha/act?limit=1&since=1");
    const after = await get(link(first.body, "since"));
    expect(after.body._embedded.act.map((i: any) => i.id)).toEqual(["2"]);
    expect(link(after.body, "since")).toBe("/workspace/alpha/act?limit=1&since=2");

    const caughtUp = await get("/workspace/alpha/act?limit=1&since=3");
    expect(caughtUp.body._embedded.act).toEqual([]);
    expect(link(caughtUp.body, "since")).toBe("/workspace/alpha/act?limit=1&since=3");
  });

  test("paging within a since window keeps the window", async () => {
    const r = await get("/workspace/alpha/act?limit=1&since=0");
    expect(r.body._links.self.href).toBe(`${PUBLIC}/workspace/alpha/act?limit=1&offset=0&since=0`);
    expect(link(r.body, "next")).toBe("/workspace/alpha/act?limit=1&offset=1&since=0");
  });

  test("the events of a record are the changes that named it, seen from the record", async () => {
    const r = await get("/workspace/alpha/Q_1/events");
    expect(r.type).toBe("application/hal+json");
    expect(r.body.about).toBe("Q_1");
    expect(r.body._links.self).toBeUndefined();
    expect(r.body._links.about.href).toBe(`${PUBLIC}/workspace/alpha/Q_1`);
    const events = r.body._embedded.events;
    expect(events.map((e: any) => [e.seq, e.index, e.dir, e.change])).toEqual([
      [1, 1, "subject", "NodeCreated"],
      [2, 2, "in", "EdgeCreated"],
    ]);
    expect(events[1]).toMatchObject({
      operation: "note",
      subject: "NOTE_1",
      from: "NOTE_1",
      to: "Q_1",
    });
    expect(events[1]._links.parent).toEqual({
      href: `${PUBLIC}/workspace/alpha/act/2`,
      type: "Act",
    });

    const note = await get("/workspace/alpha/NOTE_1/events");
    expect(note.body._embedded.events.map((e: any) => [e.seq, e.index, e.dir])).toEqual([
      [2, 1, "subject"],
      [2, 2, "out"],
    ]);
    expect((await get("/workspace/alpha/EU_1/events")).body._embedded.events).toEqual([]);
  });

  test("an act about a record that changes something else is not among the record's events", async () => {
    // Act 3 is an undo whose subject is LOE_1 and whose only change is to Q_2.
    expect((await get("/workspace/alpha/LOE_1/events")).body._embedded.events).toEqual([]);
    const q2 = (await get("/workspace/alpha/Q_2/events")).body._embedded.events;
    expect(q2).toHaveLength(1);
    expect(q2[0]).toMatchObject({
      seq: 3,
      index: 1,
      operation: "undo",
      subject: "LOE_1",
      dir: "subject",
      change: "NodePropsChanged",
      id: "Q_2",
    });
  });

  test("the events document groups its events as links: the acts about the record, and edges in and out", async () => {
    const q1 = (await get("/workspace/alpha/Q_1/events")).body._links;
    expect(q1["acts:about"]).toEqual([
      { href: `${PUBLIC}/workspace/alpha/act/1`, type: "Act", title: "pose" },
    ]);
    expect(q1["edgeCreated:in"]).toEqual([
      { href: `${PUBLIC}/workspace/alpha/NOTE_1`, type: "Note", dir: "in", title: "CONCERNS" },
    ]);
    expect(q1["edgeCreated:out"]).toBeUndefined();

    const note = (await get("/workspace/alpha/NOTE_1/events?depth=0")).body._links;
    expect(note["edgeCreated:out"]).toEqual([
      {
        href: `${PUBLIC}/workspace/alpha/Q_1?depth=0`,
        type: "Question",
        dir: "out",
        title: "CONCERNS",
      },
    ]);
    expect(note["acts:about"][0].href).toBe(`${PUBLIC}/workspace/alpha/act/2?depth=0`);
  });

  test("one act carries the command as issued and every change, and links out to what it affected", async () => {
    const r = await get("/workspace/alpha/act/2");
    expect(r.type).toBe("application/hal+json");
    expect(r.body).toMatchObject({
      id: "2",
      type: "Act",
      operation: "note",
      command: { on: "Q_1", text: "worth revisiting" },
    });
    expect(r.body.changes.map((c: any) => c.change)).toEqual(["NodeCreated", "EdgeCreated"]);
    expect(r.body._links.subject).toEqual({
      href: `${PUBLIC}/workspace/alpha/NOTE_1`,
      type: "Note",
      dir: "out",
    });
    expect(r.body._links.touched).toEqual([
      { href: `${PUBLIC}/workspace/alpha/Q_1`, type: "Question", dir: "out" },
    ]);
  });

  test("a record links to its events, and the workspace index lists the acts", async () => {
    const node = await get("/workspace/alpha/Q_1?depth=0");
    expect(node.body._links.events.href).toBe(`${PUBLIC}/workspace/alpha/Q_1/events?depth=0`);
    const index = await get("/workspace/alpha");
    const entry = index.body._embedded.collection.find((i: any) => i.slug === "act");
    expect(entry).toMatchObject({ slug: "act", type: "Act" });
  });

  test("acts are per workspace, and an unknown act is a 404", async () => {
    expect((await get("/workspace/beta/act")).body._embedded.act).toEqual([]);
    expect((await get("/workspace/beta/act/1")).status).toBe(404);
    expect((await get("/workspace/alpha/act/99")).status).toBe(404);
  });

  test("preferences carry on through every link", async () => {
    const r = await get("/workspace/alpha/act?limit=1&depth=0");
    expect(link(r.body, "next")).toBe("/workspace/alpha/act?limit=1&offset=1&depth=0");
    expect(link(r.body, "since")).toBe("/workspace/alpha/act?limit=1&since=1&depth=0");
    const act = await get("/workspace/alpha/act/2?depth=0");
    expect(act.body._links.subject.href).toBe(`${PUBLIC}/workspace/alpha/NOTE_1?depth=0`);
    const events = await get("/workspace/alpha/Q_1/events?depth=0");
    expect(events.body._embedded.events[0]._links.parent.href).toEndWith("/act/1?depth=0");
  });
});

describe("sql functions", () => {
  const labelOf = async (handle: string) => {
    const session = await runtime.connections.connect();
    try {
      const { rows } = await session.query<{ label: string }>(
        `SELECT public.labkit_get_label_for_handle($1) AS label`,
        [handle],
      );
      return rows[0]?.label;
    } finally {
      session.release();
    }
  };

  // The function repeats the domain's prefixes, so a type added there and not here fails here.
  test.each([...NODE_LABELS])(
    "labkit_get_label_for_handle names %s from its prefix",
    async (label) => {
      expect(await labelOf(`${NODE_TYPES[label].prefix}_1`)).toBe(label);
    },
  );

  test("labkit_get_label_for_handle refuses a prefix no node type has", async () => {
    await expect(labelOf("NOPE_1")).rejects.toThrow("Unrecognized natural id prefix");
  });
});

describe("discovery", () => {
  test("the sitemap lists the default workspace only", async () => {
    const r = await get("/sitemap.xml");
    expect(r.type).toBe("application/xml");
    expect(r.body).toContain(`<loc>${PUBLIC}/graph/Q_1</loc>`);
    expect(r.body).toContain(`<loc>${PUBLIC}/docs/</loc>`);
    expect(r.body).not.toContain("/workspace/");
    expect(r.body).not.toContain("Q_3");
    expect(r.body).not.toContain("//graph");
  });

  test("the api catalog is a linkset with the three relations RFC 9727 asks for", async () => {
    const r = await get("/.well-known/api-catalog");
    expect(r.type).toBe("application/linkset+json");
    expect(r.body.linkset.length).toBeGreaterThan(0);
    for (const entry of r.body.linkset) {
      expect(entry.anchor.startsWith(PUBLIC)).toBe(true);
      expect(entry["service-desc"][0].href).toBe(`${PUBLIC}/docs/openapi.json`);
      expect(entry["service-doc"]).toBeDefined();
      expect(entry.status[0].href).toBe(`${PUBLIC}/healthz`);
    }
  });

  test("the documents the catalog points at exist", async () => {
    const spec = await get("/docs/openapi.json");
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toStartWith("3.");
    const docs = await get("/docs/");
    expect(docs.status).toBe(200);
    expect(docs.type).toStartWith("text/markdown");
  });

  test("the docs handler does not leave its directory", async () => {
    expect((await get("/docs/../package.json")).status).not.toBe(200);
    expect((await get("/docs/%2e%2e/package.json")).status).toBe(404);
  });

  test("healthz answers", async () => {
    const r = await get("/healthz");
    expect(r.body.ok).toBe(true);
  });
});

describe("cross-origin access", () => {
  test("a request that came by a public name may be read from any origin", async () => {
    const r = await get("/graph/Q_1");
    expect(r.res.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("a request to the local server may not", async () => {
    const res = await handle(new Request("http://127.0.0.1:8850/graph/Q_1"), runtime);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("a preflight is answered, with the allow header only on a public name", async () => {
    const preflight = (origin: string) =>
      handle(
        new Request(`${origin}/graph/Q_1`, {
          method: "OPTIONS",
          headers: { "access-control-request-headers": "accept" },
        }),
        runtime,
      );
    const publicRes = await preflight(PUBLIC);
    expect(publicRes.status).toBe(204);
    expect(publicRes.headers.get("access-control-allow-origin")).toBe("*");
    expect(publicRes.headers.get("access-control-allow-headers")).toBe("accept");

    const local = await preflight("http://localhost:8850");
    expect(local.status).toBe(204);
    expect(local.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("only GET is served", async () => {
    const res = await handle(new Request(`${PUBLIC}/graph/Q_1`, { method: "POST" }), runtime);
    expect(res.status).toBe(405);
  });
});
