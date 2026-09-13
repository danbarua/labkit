/**
 * Hypermedia contract for the LabKit overseer.
 *
 * Graph 1:1: a relation is a link or it is absent. No reverse-rel names.
 * `GET /notes/123` → resource id `NOTE_123`.
 *
 * Walk test: BFS from `/questions/1` (`Q_1`) following every `href` in
 * `links.out` and `links.in` until `NOTE_68` (last minted node on overlap_bench).
 */
import { NODE_TYPES, type EdgeLabel, type NodeLabel } from "../../src/db/domain";

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

export interface HypermediaRef {
  href: string;
  id: string;
}

export interface ResourceDocument {
  id: string;
  type: NodeLabel;
  href: string;
  properties: Record<string, unknown>;
  links: {
    out: Partial<Record<EdgeLabel, HypermediaRef[]>>;
    in: Partial<Record<EdgeLabel, HypermediaRef[]>>;
  };
}

export interface CollectionDocument {
  type: NodeLabel;
  href: string;
  items: HypermediaRef[];
}

export interface RootDocument {
  id: "labkit";
  href: "/";
  links: {
    start: HypermediaRef;
    collections: { readonly [S in CollectionSlug]: string };
  };
}

/** First pose on overlap_bench; the walk starts here. */
export const WALK_START_ID = "Q_1";
export const WALK_START_HREF = "/questions/1";

/** Last minted node on overlap_bench (event 215, `note` → NOTE_68 -[:CONCERNS]-> LOE_7). */
export const WALK_END_ID = "NOTE_68";
export const WALK_END_HREF = "/notes/68";

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

export function emptyLinks(): ResourceDocument["links"] {
  return { out: {}, in: {} };
}
