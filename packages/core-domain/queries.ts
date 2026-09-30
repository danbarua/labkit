/**
 * The read half's query shapes, named. Zod is the source; the TypeScript type
 * is `z.infer`. Adapters parse with these objects rather than branding handles
 * themselves. Does not import events or reports, so the event log can re-export
 * `EventFilter` without a cycle.
 */

import { z } from "zod";
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

/** How far `resource` embeds neighbours. Six is `labkit_get_entity_as_hal`'s own ceiling. */
export const resourceQuery = z.object({
  handle: z.string(),
  depth: z.number().int().min(0).max(6).default(1),
});
export type ResourceQuery = z.infer<typeof resourceQuery>;

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
