/**
 * The HTTP API against a real Postgres, through `handle()`.
 *
 * Each run creates its own database with two workspaces holding different data, and drops it at
 * the end, so nothing here depends on what a developer has loaded. `LABKIT_DB_URL` says which
 * server to create it on; without it the suite is skipped.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: response bodies are read loosely; each test asserts only the part of the shape it is about

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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

const dataOf = (item: any): Record<string, unknown> =>
  Object.fromEntries(item.data.map((d: any) => [d.name, d.value]));

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
    const alpha = await get("/workspace/alpha/graph/Q_1");
    const beta = await get("/workspace/beta/graph/Q_1");
    expect(alpha.body.name).toBe("alpha question");
    expect(beta.body.name).toBe("beta question");
  });

  test("the bare path is the default workspace, which is tenant 1", async () => {
    expect((await get("/graph/Q_1")).body.name).toBe("alpha question");
  });

  test("a handle that only exists in another workspace is a 404, not a fallback", async () => {
    expect((await get("/workspace/beta/graph/LOE_1")).status).toBe(404);
    expect((await get("/workspace/beta/enquiry")).body.collection.items).toEqual([]);
  });

  test("an unknown workspace is a 404", async () => {
    const r = await get("/workspace/nope/graph/Q_1");
    expect(r.status).toBe(404);
    expect(r.type).toBe("application/problem+json");
  });

  test("every link in a workspace response stays in that workspace", async () => {
    const r = await get("/workspace/alpha/graph/LOE_1?depth=2");
    const links = hrefs(r.body);
    expect(links.length).toBeGreaterThan(0);
    for (const href of links)
      expect(href.startsWith(`${PUBLIC}/workspace/alpha/graph/`)).toBe(true);
    expect(r.body._links.expand.href).toBe(`${PUBLIC}/workspace/alpha/graph/LOE_1{?depth}`);
  });

  test("bare links do not mention workspaces", async () => {
    const r = await get("/graph/LOE_1?depth=2");
    for (const href of hrefs(r.body)) expect(href).not.toContain("/workspace/");
  });

  test("a bare /graph inside a workspace redirects inside it", async () => {
    const r = await get("/workspace/beta/graph");
    expect(r.res.headers.get("location")).toBe(`${PUBLIC}/workspace/beta/graph/Q_1`);
  });

  test("inside a workspace, only graph and the collections are routes", async () => {
    expect((await get("/workspace/alpha/sitemap.xml")).status).toBe(404);
    expect((await get("/workspace/alpha/docs/")).status).toBe(404);
    expect((await get("/workspace/alpha/collections")).status).toBe(404);
    expect((await get("/workspace/alpha/question/extra")).status).toBe(404);
  });

  test("no node type is called graph, which would clash with the graph path", async () => {
    const index = await get("/collections");
    const slugs = index.body.collection.items.map((i: any) => dataOf(i).slug);
    expect(slugs).not.toContain("graph");
  });

  testOnPostgres("interleaved requests to different workspaces never cross", async () => {
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        get(`/workspace/${i % 2 === 0 ? "alpha" : "beta"}/graph/Q_1`),
      ),
    );
    for (const [i, r] of results.entries()) {
      expect(r.body.name).toBe(i % 2 === 0 ? "alpha question" : "beta question");
    }
  });

  testOnPostgres("more concurrent requests than pool connections all complete", async () => {
    const paths = [
      "/collections/workspace",
      "/workspace/alpha/graph/LOE_1?depth=2",
      "/collections/question",
    ];
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) => get(paths[i % paths.length] as string)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  test("no request leaves tenant state on the connection it used", async () => {
    await get("/workspace/beta/graph/Q_1");
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
    expect(r.type).toBe("application/vnd.collection+json");
    const slugs = r.body.collection.items.map((i: any) => dataOf(i).slug);
    expect(slugs).toEqual(
      expect.arrayContaining(["question", "enquiry", "evidence-unit", "evaluation", "workspace"]),
    );
    expect(r.body.collection.items[0].href).toBe(`${PUBLIC}/collections/question`);
  });

  test("a workspace's own address is its collections index, and does not list workspaces", async () => {
    const r = await get("/workspace/beta");
    expect(r.status).toBe(200);
    expect(r.type).toBe("application/vnd.collection+json");
    expect(r.body.collection.href).toBe(`${PUBLIC}/workspace/beta`);
    const slugs = r.body.collection.items.map((i: any) => dataOf(i).slug);
    expect(slugs).toContain("question");
    expect(slugs).not.toContain("workspace");
    expect(r.body.collection.items[0].href).toBe(`${PUBLIC}/workspace/beta/question`);
    expect((await get("/workspace/beta/workspace")).status).toBe(404);
  });

  test("a trailing slash on a workspace address is the same index", async () => {
    const r = await get("/workspace/beta/");
    expect(r.status).toBe(200);
    expect(r.body.collection.href).toBe(`${PUBLIC}/workspace/beta`);
  });

  test("an item has id, type and the type's main text as name", async () => {
    const r = await get("/collections/question");
    const items = r.body.collection.items;
    expect(items.map((i: any) => dataOf(i).id)).toEqual(["Q_1", "Q_2"]);
    expect(dataOf(items[0])).toEqual({ id: "Q_1", type: "Question", name: "alpha question" });
    expect(items[0].href).toBe(`${PUBLIC}/graph/Q_1`);
  });

  test("retracted nodes are not listed", async () => {
    const r = await get("/collections/question");
    expect(r.body.collection.items.map((i: any) => dataOf(i).id)).not.toContain("Q_3");
  });

  test("a type with no text of its own carries its properties and links", async () => {
    const r = await get("/collections/evidence-unit");
    const [item] = r.body.collection.items;
    expect(dataOf(item)).toEqual({ id: "EU_1", type: "EvidenceUnit", role: "observation" });
    expect(item.links.map((l: any) => `${l.rel}:${l.name}`).sort()).toEqual([
      "addresses:LOE_1",
      "produces:EV_1",
    ]);
  });

  test("every item lists what it links to", async () => {
    const r = await get("/collections/question");
    expect(r.body.collection.items[0].links).toEqual([
      { rel: "motivates", href: `${PUBLIC}/graph/LOE_1`, name: "LOE_1" },
    ]);
  });

  test("paging links appear when there is more, and lead back", async () => {
    const first = await get("/collections/question?limit=1");
    expect(first.body.collection.items).toHaveLength(1);
    const rels = (b: any) => b.collection.links.map((l: any) => l.rel);
    expect(rels(first.body)).toEqual(["index", "next"]);

    const next = first.body.collection.links.find((l: any) => l.rel === "next").href;
    const second = await get(next.replace(PUBLIC, ""));
    expect(dataOf(second.body.collection.items[0]).id).toBe("Q_2");
    expect(rels(second.body)).toEqual(["index", "prev"]);
  });

  test("limit and offset are clamped rather than rejected", async () => {
    expect((await get("/collections/question?limit=0")).body.collection.items).toHaveLength(1);
    expect(
      (await get("/collections/question?limit=x&offset=-5")).body.collection.items,
    ).toHaveLength(2);
  });

  test("an unknown collection is a 404", async () => {
    const r = await get("/collections/nope");
    expect(r.status).toBe(404);
    expect(r.type).toBe("application/problem+json");
  });

  test("workspace lists every workspace, each addressed by its own index, with a link to its graph", async () => {
    const r = await get("/collections/workspace");
    const items = r.body.collection.items;
    expect(items.map((i: any) => dataOf(i).slug)).toEqual(["alpha", "beta"]);
    expect(items[1].href).toBe(`${PUBLIC}/workspace/beta`);
    expect(items[1].links).toEqual([{ rel: "graph", href: `${PUBLIC}/workspace/beta/graph` }]);
  });

  test("collection links stay in the workspace", async () => {
    const r = await get("/workspace/beta/question");
    for (const href of hrefs(r.body))
      expect(href.startsWith(`${PUBLIC}/workspace/beta`)).toBe(true);
    expect(r.body.collection.href).toBe(`${PUBLIC}/workspace/beta/question?limit=50&offset=0`);
    expect(r.body.collection.links[0]).toEqual({ rel: "index", href: `${PUBLIC}/workspace/beta` });
    expect(dataOf(r.body.collection.items[0]).name).toBe("beta question");
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
