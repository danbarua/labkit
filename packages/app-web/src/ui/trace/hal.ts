/**
 * The Trace Console's reading of the API's HAL documents: pure functions from the documents the
 * page has received to what it draws. Nothing here fetches or reads the page.
 */

export interface HalLink {
  href: string;
  type?: string;
  dir?: string;
  templated?: boolean;
}

export type HalLinks = Record<string, HalLink | HalLink[] | undefined>;

/** A HAL document, or a resource embedded in one. A document with a `type` is a resource. */
export interface HalDocument {
  type?: string;
  id?: string;
  _links?: HalLinks;
  _embedded?: Record<string, unknown>;
  [property: string]: unknown;
}

/** A relation a resource states about itself: the API's rel name, the related key, and its `dir`. */
export interface Rel {
  rel: string;
  key: string;
  dir: string;
}

/**
 * What the page knows of one resource, from every document it has received. `own` is set once the
 * resource's own response has arrived: only that response lists all of its relations, since a
 * resource embedded in another one carries only the links that the embedding reached.
 */
export interface Held {
  key: string;
  type: string | undefined;
  /** Its properties, or undefined while it is known only from a link to it. */
  attrs: Record<string, unknown> | undefined;
  own: boolean;
  rels: Rel[];
  eventsHref: string | undefined;
}

export type HeldIndex = ReadonlyMap<string, Held>;

/** The members of `_links` and `_embedded` that are not relations to another resource. */
const NOT_A_PROPERTY = new Set(["id", "type", "dir", "depth", "_links", "_embedded"]);

/** The path of an API address, without its query: the key the page holds a resource under. */
export function keyOf(href: string): string {
  return new URL(href, "http://labkit.invalid").pathname;
}

/** The last segment of a key: a handle (`Q_1`) or a collection's slug. */
export function shortId(key: string): string {
  return key.split("/").pop() ?? key;
}

export function humanRel(rel: string): string {
  return rel.replace(/_/g, " ");
}

/** A record type's colour: the custom property `--c-<type>`, or the faint text colour for a type with none. */
export function typeColour(type: string | undefined): string {
  const name = (type ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  return name === "" ? "var(--text-faint)" : `var(--c-${name}, var(--text-faint))`;
}

export const TYPE_ABBR: Record<string, string> = {
  Question: "Q",
  LineOfEnquiry: "LoE",
  Decision: "D",
  Evidence: "Ev",
  EvidenceUnit: "EU",
  Claim: "Cl",
  Computation: "Cp",
  Artefact: "Ar",
  Criterion: "Cr",
  CriterionEvaluation: "CE",
  Gate: "Ga",
  Task: "Tk",
  Review: "Rv",
  Note: "No",
  Workspace: "Ws",
};

export function abbreviation(type: string): string {
  return TYPE_ABBR[type] ?? type.slice(0, 2);
}

export function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** The property names whose value is the resource's text, in the order they are looked for. */
const LABEL_KEYS = [
  "name",
  "statement",
  "text",
  "reason",
  "verdict",
  "value",
  "proposition",
  "method",
  "logical_name",
  "objective",
  "consequence",
];

/** The first of a resource's text properties that is a non-empty string, or "". */
export function labelFor(attrs: Record<string, unknown> | undefined): string {
  for (const key of LABEL_KEYS) {
    const value = attrs?.[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

export function isDateKey(key: string): boolean {
  return /_at$/.test(key);
}

/** An ISO date as a day and minute in UTC, or the text as it is when it does not parse. */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  };
  return `${d.toLocaleString("en-GB", opts)} UTC`;
}

function linksOf(node: HalDocument, rel: string): HalLink[] {
  const value = node._links?.[rel];
  return value === undefined ? [] : [value].flat();
}

function children(node: HalDocument): HalDocument[] {
  return Object.values(node._embedded ?? {})
    .flat()
    .filter((child): child is HalDocument => typeof child === "object" && child !== null);
}

function selfKey(node: HalDocument): string | undefined {
  const href = linksOf(node, "self")[0]?.href;
  return href === undefined ? undefined : keyOf(href);
}

/** The relations a resource states about itself: its `_links`, then its direct `_embedded` children. */
export function relsOf(node: HalDocument): Rel[] {
  const rels: Rel[] = [];
  const seen = new Set<string>();
  const add = (rel: string, href: string | undefined, dir: string | undefined) => {
    if (href === undefined || dir === undefined) return;
    const key = keyOf(href);
    if (seen.has(`${rel}|${key}`)) return;
    seen.add(`${rel}|${key}`);
    rels.push({ rel, key, dir });
  };
  for (const rel of Object.keys(node._links ?? {})) {
    if (rel === "self" || rel === "start") continue;
    for (const link of linksOf(node, rel)) if (!link.templated) add(rel, link.href, link.dir);
  }
  for (const [rel, value] of Object.entries(node._embedded ?? {})) {
    for (const child of [value].flat() as HalDocument[]) {
      const href = child?._links?.self;
      add(rel, Array.isArray(href) ? href[0]?.href : href?.href, child?.dir as string | undefined);
    }
  }
  return rels;
}

function propertiesOf(node: HalDocument): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) if (!NOT_A_PROPERTY.has(key)) attrs[key] = value;
  return attrs;
}

/**
 * Every resource the documents name, by key. A document's own resource is taken from that
 * document. A resource seen only embedded takes its properties from the most recent document that
 * embeds it. A resource seen only as a link target is known by its key and type alone.
 */
export function indexOf(documents: Iterable<{ key: string; doc: HalDocument }>): HeldIndex {
  const index = new Map<string, Held>();
  const known = (key: string, type: string | undefined): Held => {
    let held = index.get(key);
    if (held === undefined) {
      held = { key, type, attrs: undefined, own: false, rels: [], eventsHref: undefined };
      index.set(key, held);
    }
    if (held.type === undefined) held.type = type;
    return held;
  };
  const seen = (node: HalDocument, own: boolean) => {
    const key = selfKey(node);
    if (key === undefined || typeof node.type !== "string") return;
    const held = known(key, node.type);
    if (own || !held.own) held.attrs = propertiesOf(node);
    if (own) {
      held.own = true;
      held.rels = relsOf(node);
      held.eventsHref = linksOf(node, "events")[0]?.href;
    }
    for (const rel of Object.keys(node._links ?? {})) {
      if (rel === "self" || rel === "start") continue;
      for (const link of linksOf(node, rel)) {
        if (!link.templated && link.dir !== undefined) known(keyOf(link.href), link.type);
      }
    }
  };
  // A resource has an id, a type and links. A collection's entry for another collection has a type
  // and a link but no id.
  const walk = (node: HalDocument, ownKey: string | undefined) => {
    if (typeof node.type === "string" && typeof node.id === "string" && node._links !== undefined) {
      seen(node, selfKey(node) === ownKey);
      for (const child of children(node)) walk(child, undefined);
      return;
    }
    for (const child of children(node)) walk(child, undefined);
  };
  for (const { key, doc } of documents) walk(doc, key);
  return index;
}

/** One thing a collection lists. An item with an `id` is a resource; any other is a collection. */
export interface CollectionItem {
  key: string;
  href: string;
  id: string | undefined;
  data: Record<string, unknown>;
}

export interface Collection {
  key: string;
  /** The collection this one is listed in. */
  index: string | undefined;
  next: string | undefined;
  items: CollectionItem[];
}

/** A collection is a HAL document that is not itself a resource; its `_embedded` children are its items. */
export function collectionOf(key: string, doc: HalDocument): Collection {
  const href = (rel: string) => {
    const link = doc._links?.[rel];
    return link === undefined || Array.isArray(link) ? undefined : link.href;
  };
  const items: CollectionItem[] = [];
  for (const child of children(doc)) {
    const self = linksOf(child, "self")[0]?.href;
    if (self === undefined) continue;
    const data = propertiesOf(child);
    if (child.type !== undefined) data.type = child.type;
    items.push({
      key: keyOf(self),
      href: self,
      id: typeof child.id === "string" ? child.id : undefined,
      data,
    });
  }
  const index = href("index");
  const next = href("next");
  return { key, index: index && keyOf(index), next, items };
}

/** How an item in a list is drawn: the chip's type and text, a title, and a line under it. */
export interface ItemView {
  chipType: string;
  chipText: string;
  title: string;
  sub: string;
}

/**
 * Most items are graph resources: the type's chip, the handle, and the resource's text. An act is
 * a record of something done to a resource, so its chip is its position, in the colour of what it
 * was done to, and its title is what was done.
 */
export function itemView(item: CollectionItem, held: Held | undefined): ItemView {
  const d = item.data;
  if (d.type === "Act") {
    const subjectType = typeof d.subject_type === "string" ? d.subject_type : "Act";
    return {
      chipType: subjectType,
      chipText: String(item.id),
      title: `${String(d.operation)} ${String(d.subject)}`,
      sub: String(d.at ?? "").slice(0, 10),
    };
  }
  const type = typeof d.type === "string" ? d.type : "?";
  const text = [d.name, d.value].find((v) => typeof v === "string" && v) as string | undefined;
  return {
    chipType: type,
    chipText: abbreviation(type),
    title: String(item.id),
    sub: truncate(text ?? labelFor(held?.attrs) ?? "", 160) || "—",
  };
}

/** What an act created that playback can open. */
export type Created =
  | { kind: "open"; key: string }
  /** The act created no resource. */
  | { kind: "none" }
  /** The act created resources, and none of them is named by its `subject` or `touched` links. */
  | { kind: "unlinked"; handles: string[] };

/**
 * The resource an act created, from its own document: its subject when the act created the
 * subject, otherwise the first resource it created. A `NodeCreated` change names a handle; the
 * resource's address is the act's `subject` or `touched` link whose last segment is that handle.
 */
export function createdBy(act: Held): Created {
  const changes = act.attrs?.changes;
  const handles = (Array.isArray(changes) ? changes : []).flatMap((c: unknown) => {
    const change = c as { change?: unknown; id?: unknown } | null;
    return change?.change === "NodeCreated" && typeof change.id === "string" ? [change.id] : [];
  });
  if (handles.length === 0) return { kind: "none" };
  const named = act.rels.filter((r) => r.rel === "subject" || r.rel === "touched");
  const subject = named.find((r) => r.rel === "subject");
  if (subject !== undefined && handles.includes(shortId(subject.key)))
    return { kind: "open", key: subject.key };
  for (const handle of handles) {
    const rel = named.find((r) => shortId(r.key) === handle);
    if (rel !== undefined) return { kind: "open", key: rel.key };
  }
  return { kind: "unlinked", handles };
}

/** The relations of `held` in one direction, grouped by rel name, in rel-name order. */
export function relGroups(held: Held, dir: "in" | "out"): { rel: string; keys: string[] }[] {
  const byRel = new Map<string, string[]>();
  for (const r of held.rels) {
    if (r.dir !== dir) continue;
    byRel.set(r.rel, [...(byRel.get(r.rel) ?? []), r.key]);
  }
  return [...byRel.keys()].sort().map((rel) => ({ rel, keys: byRel.get(rel) ?? [] }));
}

/**
 * The relation a rel name stands for, as an edge label. The API names an outbound relation
 * `relation:type` and an inbound one `type:relation`. A rel name with no `:` is the relation itself.
 */
export function edgeLabelOf(rel: string, dir: string): string {
  const [first = rel, second] = rel.split(":");
  return (dir === "in" && second !== undefined ? second : first).toUpperCase();
}
