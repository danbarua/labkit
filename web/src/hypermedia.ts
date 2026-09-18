/**
 * Hypermedia contract for labkit-web.
 *
 * Graph 1:1: a relation is a HAL link or it is absent. Rel names are EdgeLabel
 * (`MOTIVATES`, not `in`/`out`). Direction is a link attribute (`dir`) and
 * on the embedded neighbor, never the rel key.
 *
 * `GET /notes/123` → HAL document id `NOTE_123`, media type application/hal+json.
 *
 * UI walk: `/questions/1` (`Q_1`) to `NOTE_68`.
 * API walk: `Q_1` to last non-Note (`CLM_27`) without Notes or CONCERNS.
 */
import { EDGE_LABELS, NODE_TYPES, type EdgeLabel, type NodeLabel } from "../../src/db/domain";

export type CollectionSlug =
  | "questions"
  | "enquiries"
  | "evidence-units"
  | "evidence"
  | "claims"
  | "decisions"
  | "criteria"
  | "evaluations"
  | "gates"
  | "reviews"
  | "artefacts"
  | "computations"
  | "tasks"
  | "notes";

export const COLLECTION_BY_LABEL: { readonly [L in NodeLabel]: CollectionSlug } = {
  Question: "questions",
  LineOfEnquiry: "enquiries",
  EvidenceUnit: "evidence-units",
  Evidence: "evidence",
  Claim: "claims",
  Decision: "decisions",
  Criterion: "criteria",
  CriterionEvaluation: "evaluations",
  Gate: "gates",
  Review: "reviews",
  Artefact: "artefacts",
  Computation: "computations",
  Task: "tasks",
  Note: "notes",
};

export const LABEL_BY_COLLECTION: { readonly [S in CollectionSlug]: NodeLabel } = {
  questions: "Question",
  enquiries: "LineOfEnquiry",
  "evidence-units": "EvidenceUnit",
  evidence: "Evidence",
  claims: "Claim",
  decisions: "Decision",
  criteria: "Criterion",
  evaluations: "CriterionEvaluation",
  gates: "Gate",
  reviews: "Review",
  artefacts: "Artefact",
  computations: "Computation",
  tasks: "Task",
  notes: "Note",
};

export const HAL_JSON = "application/hal+json";

export type HalDir = "in" | "out";

/** draft-kelly-json-hal link object, plus `dir` for inbound vs outbound. */
export interface HalLink {
  href: string;
  name?: string;
  title?: string;
  dir?: HalDir;
}

/**
 * Neighbor as it appears in `_embedded`. Same identity as the GET of its
 * `self` href; no nested `_embedded` (one hop).
 */
export interface HalResource {
  id: string;
  type: NodeLabel;
  dir?: HalDir;
  properties?: Record<string, unknown>;
  _links: HalLinks;
  _embedded?: Partial<Record<EdgeLabel, HalResource | HalResource[]>>;
}

export type HalLinks = {
  self: HalLink;
} & Partial<Record<EdgeLabel, HalLink | HalLink[]>>;

/** Resource viewmodel. `id`/`type`/`properties` sit beside HAL reserved keys. */
export type ResourceDocument = HalResource;

export interface CollectionDocument {
  type: NodeLabel;
  _links: {
    self: HalLink;
    item?: HalLink | HalLink[];
  };
  _embedded?: {
    item?: HalResource | HalResource[];
  };
}

export type RootDocument = {
  id: "labkit";
  _links: { self: HalLink; start: HalLink } & { readonly [S in CollectionSlug]: HalLink };
};

export function isEdgeLabel(rel: string): rel is EdgeLabel {
  return (EDGE_LABELS as readonly string[]).includes(rel);
}

export function asLinkArray(value: HalLink | HalLink[] | undefined): HalLink[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function asResourceArray(value: HalResource | HalResource[] | undefined): HalResource[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** First pose on overlap_bench; the walk starts here. */
export const WALK_START_ID = "Q_1";
export const WALK_START_HREF = "/questions/1";

/** Last minted node on overlap_bench (event 215, `note` → NOTE_68). */
export const WALK_END_ID = "NOTE_68";
export const WALK_END_HREF = "/notes/68";

/** Last non-Note NodeCreated (seq 209, reverify COMP_11). Notes after that are labels. */
export const WALK_END_NON_NOTE_ID = "CLM_27";
export const WALK_END_NON_NOTE_HREF = "/claims/27";

export function numericId(naturalId: string): string {
  const sep = naturalId.lastIndexOf("_");
  if (sep === -1) throw new Error(`natural id "${naturalId}" has no numeric suffix`);
  return naturalId.slice(sep + 1);
}

export function hrefFor(naturalId: string, label: NodeLabel = labelFromId(naturalId)): string {
  return `/${COLLECTION_BY_LABEL[label]}/${numericId(naturalId)}`;
}

export function naturalIdFrom(collection: CollectionSlug, n: string): string {
  const label = LABEL_BY_COLLECTION[collection];
  return `${NODE_TYPES[label].prefix}_${n}`;
}

function labelFromId(naturalId: string): NodeLabel {
  const sep = naturalId.indexOf("_");
  const prefix = sep === -1 ? naturalId : naturalId.slice(0, sep);
  const entry = (Object.entries(NODE_TYPES) as [NodeLabel, { prefix: string }][]).find(
    ([, t]) => t.prefix === prefix,
  );
  if (!entry) throw new Error(`unrecognized natural id prefix in "${naturalId}"`);
  return entry[0];
}
