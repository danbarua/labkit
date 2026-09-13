import { expect, test } from "bun:test";
import {
  WALK_END_NON_NOTE_ID,
  WALK_START_ID,
  asLinkArray,
  isEdgeLabel,
  type ResourceDocument,
  type RootDocument,
} from "../src/hypermedia";

const origin = `http://127.0.0.1:${process.env.LABKIT_PORT_EXPLORER ?? "8850"}`;

function isNoteHref(href: string, name?: string): boolean {
  return href.startsWith("/notes/") || (name != null && name.startsWith("NOTE_"));
}

async function getHal(href: string): Promise<{ status: number; type: string; body: unknown }> {
  const res = await fetch(new URL(href, origin), {
    headers: { Accept: "application/hal+json" },
  });
  return {
    status: res.status,
    type: res.headers.get("content-type") ?? "",
    body: await res.json(),
  };
}

test("HAL walk Q_1 to last non-note without Notes or CONCERNS", async () => {
  const rootRes = await getHal("/api");
  expect(rootRes.status).toBe(200);
  expect(rootRes.type).toBe("application/hal+json");
  const root = rootRes.body as RootDocument;
  const startHref = root._links.start.href;
  expect(root._links.start.name).toBe(WALK_START_ID);

  const seen = new Set<string>([startHref]);
  const queue = [startHref];
  const cameFrom = new Map<string, string>();
  const idOf = new Map<string, string>();

  while (queue.length > 0) {
    const href = queue.shift()!;
    expect(isNoteHref(href)).toBe(false);

    const got = await getHal(href);
    expect(got.status).toBe(200);
    expect(got.type).toBe("application/hal+json");
    const doc = got.body as ResourceDocument;
    expect(doc.type === "Note" || doc.id.startsWith("NOTE_")).toBe(false);
    idOf.set(href, doc.id);

    if (doc.id === WALK_END_NON_NOTE_ID) {
      const trail: string[] = [];
      let cursor: string | undefined = href;
      while (cursor) {
        trail.unshift(idOf.get(cursor) ?? cursor);
        cursor = cameFrom.get(cursor);
      }
      const steps = trail.length - 1;
      console.log(trail.join(" → "));
      console.log(`${trail.length} entities, ${steps} steps`);
      expect(trail[0]).toBe(WALK_START_ID);
      expect(trail.at(-1)).toBe(WALK_END_NON_NOTE_ID);
      expect(trail.some((id) => id.startsWith("NOTE_"))).toBe(false);
      expect(steps).toBeGreaterThan(0);
      return;
    }

    for (const [rel, value] of Object.entries(doc._links)) {
      if (rel === "self" || rel === "CONCERNS") continue;
      if (!isEdgeLabel(rel)) continue;
      for (const link of asLinkArray(value)) {
        if (isNoteHref(link.href, link.name)) continue;
        if (seen.has(link.href)) continue;
        seen.add(link.href);
        cameFrom.set(link.href, href);
        queue.push(link.href);
      }
    }
  }

  throw new Error(`did not reach ${WALK_END_NON_NOTE_ID} via HAL _links`);
}, 60_000);
