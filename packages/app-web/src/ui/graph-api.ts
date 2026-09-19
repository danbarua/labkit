import { EDGE_LABELS, type EdgeLabel, type NodeLabel } from "@labkit/core-db/domain";

export type Dir = "in" | "out";

export interface Neighbor {
  rel: EdgeLabel;
  dir: Dir;
  id: string;
  type: NodeLabel;
}

export interface Resource {
  id: string;
  type: NodeLabel;
  properties: Record<string, unknown>;
  neighbors: Neighbor[];
}

interface WireNode {
  id: string;
  type: NodeLabel;
  dir?: Dir;
  _embedded?: Record<string, WireNode[]>;
  [key: string]: unknown;
}

const RESERVED = new Set(["id", "type", "dir", "depth", "_links", "_embedded"]);

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
      neighbors.push({ rel, dir, id: item.id, type: item.type });
    }
  }
  return { id: node.id, type: node.type, properties, neighbors };
}

/** The API's path for a workspace: the default workspace is addressed by its slug like any other. */
export function workspacePath(workspace: string): string {
  return `/workspace/${encodeURIComponent(workspace)}`;
}

export function graphPath(workspace: string, id: string): string {
  return `${workspacePath(workspace)}/graph/${encodeURIComponent(id)}`;
}

/** GETs JSON, and says what went wrong in words a person can act on. */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.trim() || res.statusText}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`expected JSON from ${url}`);
  }
}

export async function fetchResource(
  workspace: string,
  id: string,
  depth: number,
  signal?: AbortSignal,
): Promise<Resource> {
  return decode(await getJson<WireNode>(`${graphPath(workspace, id)}?depth=${depth}`, signal));
}
