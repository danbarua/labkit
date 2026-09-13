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

export const knownAtQuery = z.object({
  at: z.iso.datetime({ offset: true }),
});
export type KnownAtQuery = z.infer<typeof knownAtQuery>;

export const searchQuery = z.object({
  text: z.string(),
});
export type SearchQuery = z.infer<typeof searchQuery>;

export const claimsAssertingQuery = z.object({
  proposition: z.string(),
});
export type ClaimsAssertingQuery = z.infer<typeof claimsAssertingQuery>;

export const pursuitsOfQuery = z.object({
  question: refString("question"),
});
export type PursuitsOfQuery = z.infer<typeof pursuitsOfQuery>;

export const originOfQuery = z.object({
  question: refString("question"),
});
export type OriginOfQuery = z.infer<typeof originOfQuery>;

export const gateStatusQuery = z.object({
  gate: refString("gate"),
});
export type GateStatusQuery = z.infer<typeof gateStatusQuery>;

export const criteriaGoverningQuery = z.object({
  gate: refString("gate"),
});
export type CriteriaGoverningQuery = z.infer<typeof criteriaGoverningQuery>;

export const designHistoryQuery = z.object({
  gate: refString("gate"),
});
export type DesignHistoryQuery = z.infer<typeof designHistoryQuery>;

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

export const interpretationHistoryQuery = z.object({
  claim: refString("claim"),
});
export type InterpretationHistoryQuery = z.infer<typeof interpretationHistoryQuery>;

export const doTheseConflictQuery = z.object({
  a: refString("claim"),
  b: refString("claim"),
});
export type DoTheseConflictQuery = z.infer<typeof doTheseConflictQuery>;

export const reproductionOfQuery = z.object({
  verification: refString("analysis"),
});
export type ReproductionOfQuery = z.infer<typeof reproductionOfQuery>;

export const analysisRevisionQuery = z.object({
  analysis: refString("analysis"),
});
export type AnalysisRevisionQuery = z.infer<typeof analysisRevisionQuery>;

export const reproducibilityOfQuery = z.object({
  analysis: refString("analysis"),
  rebuilt: z.array(z.object({ part: refString("observations"), hash: z.string() })),
});
export type ReproducibilityOfQuery = z.infer<typeof reproducibilityOfQuery>;

export const criterionStandingQuery = z.object({
  criterion: refString("criterion"),
});
export type CriterionStandingQuery = z.infer<typeof criterionStandingQuery>;

export const whyQuery = z.object({
  subject: z.string(),
});
export type WhyQuery = z.infer<typeof whyQuery>;

export const howQuery = z.object({
  subject: z.string(),
  since: z.number().int().optional(),
});
export type HowQuery = z.infer<typeof howQuery>;


export const whatDependsOnQuery = z.object({
  subject: z.string(),
});
export type WhatDependsOnQuery = z.infer<typeof whatDependsOnQuery>;

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
