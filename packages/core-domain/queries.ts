/**
 * The read half's query shapes, named. Zod is the source; the TypeScript type
 * is `z.infer`. Adapters parse with these objects rather than branding handles
 * themselves. Does not import events or reports, so the event log can re-export
 * `EventFilter` without a cycle.
 */

import { z } from "zod";
import { NODE_LABELS } from "@labkit/core-db/domain";
import { anyRefString, refString } from "./brand";
import { GATE_STATES, WORK_STATES } from "./vocab";

export const eventFilter = z.object({
  since: z.number().int().optional(),
  by: z.string().optional(),
  operation: z.string().optional(),
  touching: anyRefString().optional(),
  reconstructed: z.boolean().optional(),
  limit: z.number().int().optional(),
});
export type EventFilter = z.infer<typeof eventFilter>;

export const nowQuery = z.object({
  since: z.number().int().optional(),
});
export type NowQuery = z.infer<typeof nowQuery>;

export const notesQuery = z.object({
  concerning: anyRefString().optional(),
});
export type NotesQuery = z.infer<typeof notesQuery>;

export const gateListQuery = z.object({
  state: z.enum(GATE_STATES).optional(),
});
export type GateListQuery = z.infer<typeof gateListQuery>;

export const workListQuery = z.object({
  state: z.enum(WORK_STATES).optional(),
});
export type WorkListQuery = z.infer<typeof workListQuery>;

export const searchQuery = z.object({
  text: z.string(),
});
export type SearchQuery = z.infer<typeof searchQuery>;

export const claimsAssertingQuery = z.object({
  proposition: z.string(),
});
export type ClaimsAssertingQuery = z.infer<typeof claimsAssertingQuery>;

export const gateStatusQuery = z.object({
  gate: refString("gate"),
});
export type GateStatusQuery = z.infer<typeof gateStatusQuery>;

export const contractForQuery = z.object({
  work: refString("work"),
});
export type ContractForQuery = z.infer<typeof contractForQuery>;

export const stoppedWorkQuery = z.object({
  work: refString("work"),
});
export type StoppedWorkQuery = z.infer<typeof stoppedWorkQuery>;

export const enquiryStatusQuery = z.object({
  enquiry: refString("enquiry"),
});
export type EnquiryStatusQuery = z.infer<typeof enquiryStatusQuery>;

export const enquiryInContextQuery = z.object({
  enquiry: refString("enquiry"),
});
export type EnquiryInContextQuery = z.infer<typeof enquiryInContextQuery>;

export const whySupportedQuery = z.object({
  claim: refString("claim"),
});
export type WhySupportedQuery = z.infer<typeof whySupportedQuery>;

export const analysisRevisionQuery = z.object({
  analysis: refString("analysis"),
});
export type AnalysisRevisionQuery = z.infer<typeof analysisRevisionQuery>;

export const criterionStandingQuery = z.object({
  criterion: refString("criterion"),
});
export type CriterionStandingQuery = z.infer<typeof criterionStandingQuery>;

export const whyQuery = z.object({
  subject: z.string(),
});
export type WhyQuery = z.infer<typeof whyQuery>;

/** How many hops of neighbours `resource` and `collection` embed when not told. */
export const DEFAULT_DEPTH = 2;

/** `labkit_get_entity_as_hal`'s own ceiling. */
export const MAX_DEPTH = 6;

const depth = z.number().int().min(0).max(MAX_DEPTH).default(DEFAULT_DEPTH);

export const resourceQuery = z.object({
  handle: z.string(),
  depth,
});
export type ResourceQuery = z.infer<typeof resourceQuery>;

/** How many nodes one page of `collection` holds when not told. */
export const DEFAULT_PAGE = 25;

/** `labkit_get_collection_as_hal`'s own ceiling. */
export const MAX_PAGE = 200;

/**
 * One page of the live nodes of a type. The bounds on `limit` and `depth` are
 * `labkit_get_collection_as_hal`'s own.
 */
export const collectionQuery = z.object({
  type: z.enum(NODE_LABELS, {
    error: (issue) =>
      `no node type \`${String(issue.input)}\`; the types are ${NODE_LABELS.join(", ")}`,
  }),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(MAX_PAGE).default(DEFAULT_PAGE),
  depth,
});
export type CollectionQuery = z.infer<typeof collectionQuery>;

export const neighboursOfQuery = z.object({
  subject: anyRefString(),
});
export type NeighboursOfQuery = z.infer<typeof neighboursOfQuery>;

export const proseForQuery = z.object({
  subject: anyRefString(),
});
export type ProseForQuery = z.infer<typeof proseForQuery>;

export const reachableQuery = z.object({
  subject: anyRefString(),
});
export type ReachableQuery = z.infer<typeof reachableQuery>;
