import { labelForNaturalId } from "@labkit/core-db/domain";
import { type RecordedEvent, touchedIn } from "@labkit/core-domain/events";
import { ACT_SLUG, ACT_TYPE, EVENTS_SEGMENT } from "./collection-paths";
import {
  collectionJson,
  DEFAULT_LIMIT,
  extrasOf,
  MAX_LIMIT,
  pageParam,
  pagingLinks,
  withExtras,
} from "./collections-handler";
import { nodePath, problem, publicOrigin } from "./graph-handler";
import type { TenantScope } from "./runtime";

const HAL_JSON = "application/hal+json";
const HANDLE = /^[A-Za-z0-9]+_[A-Za-z0-9]+$/;
const COLUMNS =
  "seq, at, operation, subject, attribution_label, attribution_id, attribution_how, git_hash, reconstructed_from, command, changes";

// What this handler reads itself. Any other parameter is the client's and rides on every link.
const HANDLED = new Set(["limit", "offset", "since"]);

type Row = Omit<RecordedEvent, "seq" | "attribution" | "reconstructedFrom"> & {
  seq: number | string;
  attribution_label: string;
  attribution_id: string;
  attribution_how: RecordedEvent["attribution"]["attribution_how"];
  git_hash: string | null;
  reconstructed_from: string | null;
};

const toEvent = (row: Row): RecordedEvent => ({
  seq: Number(row.seq),
  at: row.at,
  attribution: {
    attribution_label: row.attribution_label,
    attribution_id: row.attribution_id,
    attribution_how: row.attribution_how,
    git_hash: row.git_hash,
  },
  operation: row.operation,
  subject: row.subject,
  changes: row.changes,
  command: row.command,
  reconstructedFrom: row.reconstructed_from,
});

// The type of a handle, or nothing for one this domain does not name.
function typeOf(handle: string): string | undefined {
  try {
    return labelForNaturalId(handle);
  } catch {
    return undefined;
  }
}

interface Page {
  acts: RecordedEvent[];
  hasMore: boolean;
  limit: number;
  offset: number;
  /** Only acts after this position, when the client asked for it. */
  since: number | undefined;
}

// One page of acts, oldest first. With a handle, the acts that made a change naming it: `id` for
// a node created or given properties, `from` or `to` for an edge created or given properties.
// Matched on those fields rather than on the kind of change, and served by the GIN index on
// `changes`. An act that was only about the handle, and changed nothing that names it, is not here.
async function page(req: Request, scope: TenantScope, handle?: string): Promise<Page> {
  const url = new URL(req.url);
  const limit = pageParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = pageParam(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const since = url.searchParams.has("since")
    ? pageParam(url.searchParams.get("since"), 0, 0, Number.MAX_SAFE_INTEGER)
    : undefined;

  const params: unknown[] = [];
  const bind = (value: unknown) => `$${params.push(value)}`;
  const conditions: string[] = [];
  if (handle !== undefined) {
    const named = ["id", "from", "to"].map(
      (field) => `changes @> ${bind(JSON.stringify([{ [field]: handle }]))}::jsonb`,
    );
    conditions.push(`(${named.join(" OR ")})`);
  }
  if (since !== undefined) conditions.push(`seq > ${bind(since)}`);
  const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;

  const { rows } = await scope.query<Row>(
    `SELECT ${COLUMNS} FROM "${scope.graphName}".domain_event ${where}
     ORDER BY seq LIMIT ${bind(limit + 1)} OFFSET ${bind(offset)}`,
    params,
  );
  return {
    acts: rows.slice(0, limit).map(toEvent),
    hasMore: rows.length > limit,
    limit,
    offset,
    since,
  };
}

// Paging, and the cursor: `since` names the last act on this page, so a client that keeps it asks
// for what came after. It is there on the last page too, and then repeats the position it was
// given, so a poll for new acts is one link followed again.
function pageLinks(root: string, self: string, p: Page) {
  const fixed = p.since === undefined ? "" : `&since=${p.since}`;
  const last = p.acts.at(-1)?.seq ?? p.since ?? 0;
  return [
    ...pagingLinks(root, self, p.limit, p.offset, p.hasMore, fixed),
    { rel: "since", href: `${self}?limit=${p.limit}&since=${last}` },
  ];
}

const selfOf = (p: Page, self: string) =>
  `${self}?limit=${p.limit}&offset=${p.offset}${p.since === undefined ? "" : `&since=${p.since}`}`;

function actLinks(origin: string, scope: TenantScope, event: RecordedEvent) {
  const node = (handle: string) => ({
    href: `${origin}${nodePath(scope.prefix, handle)}`,
    name: handle,
  });
  return [
    { rel: "subject", ...node(event.subject) },
    ...touchedIn(event)
      .filter((handle) => handle !== event.subject)
      .map((handle) => ({ rel: "touched", ...node(handle) })),
  ];
}

// One act as a collection item: what was issued, by whom, and links to the records it affected.
// The command's parameters and the changes themselves are on the act's own resource.
function actItem(origin: string, scope: TenantScope, event: RecordedEvent) {
  const { attribution: by } = event;
  return {
    href: `${origin}${scope.prefix}/${ACT_SLUG}/${event.seq}`,
    data: [
      { name: "id", value: String(event.seq) },
      { name: "type", value: ACT_TYPE },
      { name: "name", value: `${event.operation} ${event.subject}` },
      { name: "at", value: event.at },
      { name: "operation", value: event.operation },
      { name: "subject", value: event.subject },
      ...(typeOf(event.subject) === undefined
        ? []
        : [{ name: "subject_type", value: typeOf(event.subject) }]),
      { name: "attribution_label", value: by.attribution_label },
      { name: "attribution_how", value: by.attribution_how },
      { name: "changes", value: event.changes.length },
    ],
    links: actLinks(origin, scope, event),
  };
}

// `/act`: the workspace's whole record of acts, oldest first.
async function acts(req: Request, scope: TenantScope): Promise<Response> {
  const origin = publicOrigin(req).origin;
  const root = `${origin}${scope.prefix}`;
  const self = `${root}/${ACT_SLUG}`;
  const p = await page(req, scope);
  return collectionJson(
    req,
    {
      href: selfOf(p, self),
      links: pageLinks(root, self, p),
      items: p.acts.map((event) => actItem(origin, scope, event)),
    },
    HANDLED,
  );
}

// One act, whole: the command as issued, and every change it made. Its links run out to the
// records it affected.
async function act(req: Request, scope: TenantScope, seq: number): Promise<Response> {
  const origin = publicOrigin(req).origin;
  const { rows } = await scope.query<Row>(
    `SELECT ${COLUMNS} FROM "${scope.graphName}".domain_event WHERE seq = $1`,
    [seq],
  );
  const row = rows[0];
  if (!row) return problem(404, "Not Found", `no act ${seq} in this workspace`);

  const event = toEvent(row);
  const root = `${origin}${scope.prefix}`;
  const link = (handle: string) => ({
    href: `${origin}${nodePath(scope.prefix, handle)}`,
    type: typeOf(handle),
    dir: "out",
  });
  const touched = touchedIn(event).filter((handle) => handle !== event.subject);
  const links = {
    self: { href: `${root}/${ACT_SLUG}/${event.seq}`, type: ACT_TYPE },
    index: { href: `${root}/${ACT_SLUG}` },
    subject: link(event.subject),
    ...(touched.length === 0 ? {} : { touched: touched.map(link) }),
  };
  const extras = extrasOf(req, HANDLED);
  return json({
    id: String(event.seq),
    type: ACT_TYPE,
    seq: event.seq,
    at: event.at,
    operation: event.operation,
    subject: event.subject,
    attribution_label: event.attribution.attribution_label,
    attribution_id: event.attribution.attribution_id,
    attribution_how: event.attribution.attribution_how,
    git_hash: event.attribution.git_hash,
    reconstructed_from: event.reconstructedFrom,
    command: event.command,
    changes: event.changes,
    _links: extras.length === 0 ? links : withExtras(links, extras),
  });
}

type Ends = { id?: string; from?: string; to?: string };

// `/{handle}/events`: what happened to one record, change by change. The changes that name it are
// rolled up out of the acts that made them, so these are changes and not acts. Not a resource of
// its own, so it has no `self`; each event says which act it belongs to. `dir` is the event as seen
// from the record: `in` when an edge ends at it, `out` when one starts at it, and `subject` when
// the change is to the record itself.
async function events(req: Request, scope: TenantScope, handle: string): Promise<Response> {
  const origin = publicOrigin(req).origin;
  const root = `${origin}${scope.prefix}`;
  const self = `${root}/${handle}/${EVENTS_SEGMENT}`;
  const p = await page(req, scope, handle);
  const extras = extrasOf(req, HANDLED);
  const carry = <T>(value: T): T =>
    extras.length === 0 ? value : (withExtras(value, extras) as T);

  // The same events grouped by what they were to the record, as links: the acts that changed
  // it (`acts:about`, to the act), and the edges made into and out of it (`edgeCreated:in` and
  // `edgeCreated:out`, to the record at the other end).
  const groups: Record<string, unknown[]> = {};
  const group = (rel: string, link: unknown) => {
    groups[rel] = [...(groups[rel] ?? []), link];
  };
  const node = (other: string) => ({
    href: `${origin}${nodePath(scope.prefix, other)}`,
    type: typeOf(other),
  });

  const embedded = p.acts.flatMap((event) =>
    event.changes.flatMap((change, i) => {
      const { id, from, to } = change as Ends;
      if (id !== handle && from !== handle && to !== handle) return [];
      const dir = to === handle ? "in" : from === handle ? "out" : "subject";
      const act = `${root}/${ACT_SLUG}/${event.seq}`;
      if (dir === "subject") {
        group("acts:about", { href: act, type: ACT_TYPE, title: event.operation });
      } else if (change.change === "EdgeCreated") {
        group(`edgeCreated:${dir}`, {
          ...node(dir === "in" ? change.from : change.to),
          dir,
          title: change.label,
        });
      }
      return [
        {
          seq: event.seq,
          // Where the change sits in its act: change 7 of act 28 is `changes[6]`.
          index: i + 1,
          operation: event.operation,
          subject: event.subject,
          dir,
          ...change,
          _links: carry({ parent: { href: act, type: ACT_TYPE } }),
        },
      ];
    }),
  );

  const paging = carry([
    ...pageLinks(root, self, p),
    { rel: "about", href: `${origin}${nodePath(scope.prefix, handle)}` },
  ]).reduce(
    (links, { rel, href }) => Object.assign(links, { [rel]: { href } }),
    {} as Record<string, { href: string }>,
  );

  return json({
    about: handle,
    _links: { ...paging, ...carry(groups) },
    _embedded: { events: embedded },
  });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": HAL_JSON },
  });
}

const ACTS = new RegExp(`^/${ACT_SLUG}$`);
const ACT = new RegExp(`^/${ACT_SLUG}/(\\d+)$`);
const EVENTS = new RegExp(`^/([^/]+)/${EVENTS_SEGMENT}$`);

/** Whether `rest`, the path after `/workspace/{slug}`, is one of the routes here. */
export function isEventsPath(rest: string): boolean {
  return ACTS.test(rest) || ACT.test(rest) || EVENTS.test(rest);
}

export async function eventsHandler(
  req: Request,
  scope: TenantScope,
  rest: string,
): Promise<Response> {
  if (ACTS.test(rest)) return acts(req, scope);
  const seq = ACT.exec(rest)?.[1];
  if (seq !== undefined) return act(req, scope, Number(seq));
  const handle = decodeURIComponent(EVENTS.exec(rest)?.[1] ?? "");
  if (!HANDLE.test(handle)) return problem(404, "Not Found", `${handle} is not a handle`);
  return events(req, scope, handle);
}
