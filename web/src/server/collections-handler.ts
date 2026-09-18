import { NODE_LABELS, SEARCHABLE_TEXT, type NodeLabel } from "../../../src/db/domain";
import { problem, publicOrigin } from "./graph-handler";
import type { Runtime } from "./runtime";

const COLLECTION_JSON = "application/vnd.collection+json";

// A collection is named for its node type, kebab-cased. These say it better.
const SLUG_OVERRIDES: { readonly [L in NodeLabel]?: string } = {
  LineOfEnquiry: "enquiry",
  CriterionEvaluation: "evaluation",
};

function slugFor(label: NodeLabel): string {
  return SLUG_OVERRIDES[label] ?? label.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

const LABEL_BY_SLUG = new Map<string, NodeLabel>(NODE_LABELS.map((label) => [slugFor(label), label]));

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function pageParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

function collectionJson(collection: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ collection: { version: "1.0", ...collection } }), {
    status: 200,
    headers: { "content-type": COLLECTION_JSON },
  });
}

// `/collections` lists one collection per node type.
function index(origin: string): Response {
  return collectionJson({
    href: `${origin}/collections`,
    items: NODE_LABELS.map((label) => ({
      href: `${origin}/collections/${slugFor(label)}`,
      data: [
        { name: "slug", value: slugFor(label) },
        { name: "type", value: label },
      ],
    })),
  });
}

const HANDLE = /^[A-Za-z0-9]+_[A-Za-z0-9]+$/;
const INTERNAL_PROPS = new Set(["natural_id", "retracted"]);

type Data = { name: string; value: unknown };
type Link = { rel: string; href: string; name: string };

// Outbound relations of the given nodes, by source handle. Handles come from the graph, and are
// checked before they go into the query text.
async function outboundLinks(
  runtime: Runtime,
  label: NodeLabel,
  ids: string[],
  origin: string,
): Promise<Map<string, Link[]>> {
  const links = new Map<string, Link[]>();
  const safe = ids.filter((id) => HANDLE.test(id));
  if (safe.length === 0) return links;
  const list = safe.map((id) => `'${id}'`).join(", ");
  const result = await runtime.connection.db.query(
    `SELECT r.src::text AS src, r.rel::text AS rel, r.dst::text AS dst
     FROM ag_catalog.cypher(
       'labkit_t1'::name,
       $$MATCH (n:${label})-[e]->(m)
         WHERE n.retracted IS NULL AND m.retracted IS NULL AND n.natural_id IN [${list}]
         RETURN n.natural_id, type(e), m.natural_id$$
     ) AS r(src ag_catalog.agtype, rel ag_catalog.agtype, dst ag_catalog.agtype)`,
  );
  for (const row of result.rows as { src: string; rel: string; dst: string }[]) {
    const bucket = links.get(row.src) ?? [];
    bucket.push({ rel: row.rel.toLowerCase(), href: `${origin}/graph/${row.dst}`, name: row.dst });
    links.set(row.src, bucket);
  }
  return links;
}

// `/collections/:slug` lists the live nodes of one type: id, type, what each links to, and, where
// the type has one, its main text as `name`. A type with no text of its own is described by its
// other properties instead.
async function listing(req: Request, runtime: Runtime, label: NodeLabel): Promise<Response> {
  const url = new URL(req.url);
  const origin = publicOrigin(req).origin;
  const limit = pageParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = pageParam(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const nameProp = SEARCHABLE_TEXT[label]?.[0];

  // Label and property come from the domain constants above, never from the request.
  const result = await runtime.connection.db.query(
    `SELECT id, value FROM (
       SELECT r.id::text AS id, r.value::text AS value
       FROM ag_catalog.cypher(
         'labkit_t1'::name,
         $$MATCH (n:${label})
           WHERE n.retracted IS NULL
           RETURN n.natural_id, ${nameProp === undefined ? "properties(n)" : `n.${nameProp}`}$$
       ) AS r(id ag_catalog.agtype, value ag_catalog.agtype)
     ) t
     ORDER BY length(id), id
     LIMIT $1 OFFSET $2`,
    [limit + 1, offset],
  );
  const rows = result.rows as { id: string; value: string | null }[];
  const page = rows.slice(0, limit);
  const links = await outboundLinks(runtime, label, page.map((row) => row.id), origin);

  const self = `${origin}/collections/${slugFor(label)}`;
  const pageHref = (o: number) => `${self}?limit=${limit}&offset=${o}`;
  const paging: { rel: string; href: string }[] = [
    { rel: "index", href: `${origin}/collections` },
  ];
  if (offset > 0) paging.push({ rel: "prev", href: pageHref(Math.max(offset - limit, 0)) });
  if (rows.length > limit) paging.push({ rel: "next", href: pageHref(offset + limit) });

  return collectionJson({
    href: pageHref(offset),
    links: paging,
    items: page.map((row) => {
      const data: Data[] = [
        { name: "id", value: row.id },
        { name: "type", value: label },
      ];
      if (nameProp !== undefined) {
        data.push({ name: "name", value: row.value });
      } else {
        const props = JSON.parse(row.value ?? "{}") as Record<string, unknown>;
        for (const [name, value] of Object.entries(props)) {
          if (!INTERNAL_PROPS.has(name) && (value === null || typeof value !== "object")) {
            data.push({ name, value });
          }
        }
      }
      return { href: `${origin}/graph/${row.id}`, data, links: links.get(row.id) ?? [] };
    }),
  });
}

export async function collectionsHandler(req: Request, runtime: Runtime): Promise<Response> {
  const url = new URL(req.url);
  const slug = url.pathname.replace(/^\/collections\/?/, "").replace(/\/$/, "");
  if (slug === "") return index(publicOrigin(req).origin);

  const label = LABEL_BY_SLUG.get(slug);
  if (label === undefined) return problem(404, "Not Found", `${slug} is not a collection`);
  return listing(req, runtime, label);
}
