import { EDGE_LABELS, type EdgeLabel, type NodeLabel } from "@labkit/core-db/domain";

export const START_HREF = "/graph/Q_1";

// One hop: the resource and everything directly linked to it.
const DEPTH = 1;

export type Dir = "in" | "out";

export interface Neighbor {
  rel: EdgeLabel;
  dir: Dir;
  id: string;
  type: NodeLabel;
  href: string;
}

export interface Resource {
  id: string;
  type: NodeLabel;
  href: string;
  properties: Record<string, unknown>;
  neighbors: Neighbor[];
}

interface WireNode {
  id: string;
  type: NodeLabel;
  dir?: Dir;
  _links: { self: { href: string } };
  _embedded?: Record<string, WireNode[]>;
  [key: string]: unknown;
}

const RESERVED = new Set(["id", "type", "dir", "depth", "_links", "_embedded"]);

// Links come back absolute, and behind the tunnel the origin can be the wrong scheme.
function toPath(href: string): string {
  return new URL(href, window.location.origin).pathname;
}

// An `_embedded` key is `relation:type` for an outbound neighbor and `type:relation` for an inbound one.
function relationOf(key: string, dir: Dir): EdgeLabel | null {
  const [first, second] = key.split(":");
  const rel = (dir === "out" ? first : second)?.toUpperCase();
  return rel !== undefined && (EDGE_LABELS as readonly string[]).includes(rel)
    ? (rel as EdgeLabel)
    : null;
}

function decode(node: WireNode): Resource {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!RESERVED.has(key)) properties[key] = value;
  }
  const neighbors: Neighbor[] = [];
  for (const [key, items] of Object.entries(node._embedded ?? {})) {
    for (const item of items) {
      const dir = item.dir ?? "out";
      const rel = relationOf(key, dir);
      if (rel === null) continue;
      neighbors.push({
        rel,
        dir,
        id: item.id,
        type: item.type,
        href: toPath(item._links.self.href),
      });
    }
  }
  return {
    id: node.id,
    type: node.type,
    href: toPath(node._links.self.href),
    properties,
    neighbors,
  };
}

export async function fetchResource(href: string): Promise<Resource> {
  const url = `${toPath(href)}?depth=${DEPTH}`;
  const res = await fetch(url, { headers: { Accept: "application/hal+json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.trim() || res.statusText}`);
  const type = res.headers.get("content-type") ?? "";
  if (text.startsWith("<") && !type.includes("json")) {
    throw new Error(`expected JSON from ${url}`);
  }
  try {
    return decode(JSON.parse(text) as WireNode);
  } catch {
    throw new Error(`expected JSON from ${url}`);
  }
}
