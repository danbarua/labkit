/**
 * The write half's command shapes, named. Zod is the source; the TypeScript
 * type is `z.infer`. Adapters parse with these objects rather than branding
 * handles themselves.
 */

import { z } from "zod";
import { anyRefString, issue, refString } from "./brand";
import { ref } from "./ref";

function inputRefString() {
  return z.string().transform((raw, ctx) =>
    issue(ctx, () => {
      const id = raw.toUpperCase();
      if (id.startsWith("COMP_")) return ref("analysis", id);
      if (id.startsWith("ART_")) return ref("observations", id);
      throw new Error(`\`${raw}\` is neither observations (ART_…) nor an analysis (COMP_…)`);
    }),
  );
}

function supersededRefString() {
  return z.string().transform((raw, ctx) =>
    issue(ctx, () => {
      const id = raw.toUpperCase();
      if (id.startsWith("CLM_")) return ref("claim", id);
      if (id.startsWith("EV_")) return ref("evidence", id);
      throw new Error(`\`${raw}\` is neither a claim (CLM_…) nor a finding (EV_…)`);
    }),
  );
}

function citedBasisString() {
  return z.string().transform((raw, ctx) =>
    issue(ctx, () => {
      const id = raw.toUpperCase();
      if (id.startsWith("CLM_")) return ref("claim", id);
      if (id.startsWith("ART_")) return ref("observations", id);
      if (id.startsWith("EV_")) return ref("evidence", id);
      throw new Error(
        `\`${raw}\` is not a claim (CLM_…), an observations record (ART_…) or a finding (EV_…)`,
      );
    }),
  );
}

const bearing = z.enum(["supports", "challenges"]);
const standing = z.enum(["exploratory", "confirmatory"]);

/**
 * `synthesise` — one finding drawn across others, running nothing new.
 */
export const synthesiseCommand = z.object({
  proposition: z.string(),
  restingOn: z.array(refString("claim")),
});
export type SynthesiseCommand = z.infer<typeof synthesiseCommand>;

/** `pose` — put a question on the record, unpursued. */
export const poseCommand = z.object({
  question: z.string(),
  from: refString("note").optional(),
});
export type PoseCommand = z.infer<typeof poseCommand>;

/** `openEnquiry` — pose a question and pursue it, as one act. */
export const openEnquiryCommand = z.object({
  question: z.string(),
  from: refString("note").optional(),
});
export type OpenEnquiryCommand = z.infer<typeof openEnquiryCommand>;

/** `stateCriterion` — state a condition a result will be held to. */
export const stateCriterionCommand = z.object({
  proposition: z.string(),
});
export type StateCriterionCommand = z.infer<typeof stateCriterionCommand>;

/** `pursue` — open a line of enquiry against a question already on the record. */
export const pursueCommand = z.object({
  question: refString("question"),
  approach: z.string(),
});
export type PursueCommand = z.infer<typeof pursueCommand>;

/**
 * `note` — mint a dated, attributed record, or record that an existing note supersedes another.
 */
export const noteMintCommand = z.object({
  text: z.string(),
  on: anyRefString().optional(),
  prompted: refString("question").optional(),
  supersedes: z.array(refString("note")).optional(),
});
export const noteSupersedesCommand = z.object({
  note: refString("note"),
  supersedes: z.array(refString("note")).min(1),
});
export const noteCommand = z.union([noteSupersedesCommand, noteMintCommand]);
export type NoteCommand = z.infer<typeof noteCommand>;

/** `recordObservations` — put measurement on the record, without analysing it. */
export const recordObservationsCommand = z.object({
  enquiry: refString("enquiry"),
  name: z.string(),
  finding: z.string(),
  contentHash: z.string().optional(),
});
export type RecordObservationsCommand = z.infer<typeof recordObservationsCommand>;

/**
 * `recordAnalysis` — a computation, its evidence unit, and its output artefact.
 */
export const recordAnalysisCommand = z.object({
  enquiry: refString("enquiry"),
  method: z.string(),
  from: z.array(inputRefString()),
  implementing: refString("work").optional(),
  heldTo: z.array(refString("criterion")).optional(),
});
export type RecordAnalysisCommand = z.infer<typeof recordAnalysisCommand>;

/** `closeEnquiry` — answered, or abandoned when `answeredBy` is absent. */
export const closeEnquiryCommand = z.object({
  enquiry: refString("enquiry"),
  answeredBy: refString("claim").optional(),
});
export type CloseEnquiryCommand = z.infer<typeof closeEnquiryCommand>;

/** Planned work somebody decided not to do. */
export const stopWorkCommand = z.object({
  work: refString("work"),
  because: z.string(),
});
export type StopWorkCommand = z.infer<typeof stopWorkCommand>;

/** `planWork` — state an objective and what would count as meeting it. */
export const planWorkCommand = z.object({
  objective: z.string(),
  acceptance: z.string(),
  mayRead: z.array(z.string()).optional(),
  addressing: refString("enquiry").optional(),
  /** Work this waits on: it is not ready to start until each has a result. */
  after: z.array(refString("work")).optional(),
});
export type PlanWorkCommand = z.infer<typeof planWorkCommand>;

/** `declareGate` — bind criteria to the work they gate. */
export const declareGateCommand = z.object({
  governedBy: z.array(refString("criterion")),
  consequence: z.string(),
  protecting: z.array(refString("work")),
});
export type DeclareGateCommand = z.infer<typeof declareGateCommand>;

/**
 * A route to the evidence a verdict rests on.
 */
export const citedBasis = citedBasisString();
export type CitedBasis = z.infer<typeof citedBasis>;

/** `evaluateCriterion` — record a check's outcome, optionally citing what decided it. */
export const evaluateCriterionCommand = z.object({
  criterion: refString("criterion"),
  gate: refString("gate").optional(),
  value: z.string(),
  outcome: z.enum(["pass", "fail"]),
  citing: z.array(citedBasis).optional(),
  about: refString("claim").optional(),
});
export type EvaluateCriterionCommand = z.infer<typeof evaluateCriterionCommand>;

/** `acceptAsUnresolved` — leave a question open on purpose, with the condition that reopens it (S-14). */
export const acceptAsUnresolvedCommand = z.object({
  enquiry: refString("enquiry"),
  because: z.string(),
  until: z.string(),
  inLightOf: refString("claim"),
});
export type AcceptAsUnresolvedCommand = z.infer<typeof acceptAsUnresolvedCommand>;

/** `amendDesign` — change a locked criterion's wording, and report whether the change was mechanical or scientific. */
export const amendDesignCommand = z.object({
  criterion: refString("criterion"),
  nowRequires: z.string(),
  because: z.string(),
  citing: refString("claim").optional(),
});
export type AmendDesignCommand = z.infer<typeof amendDesignCommand>;

/**
 * `conclude` — assert one thing an analysis found.
 */
export const concludeCommand = z.object({
  analysis: refString("analysis"),
  finding: z.string(),
  proposition: z.string().optional(),
  bearing: bearing.optional(),
  standing: standing.optional(),
  replacing: supersededRefString().optional(),
});
export type ConcludeCommand = z.infer<typeof concludeCommand>;

/** `promote` — move a finding from scratch to citable (S-18). */
export const promoteCommand = z.object({
  claim: refString("claim"),
  because: z.string(),
});
export type PromoteCommand = z.infer<typeof promoteCommand>;

/**
 * `isConfirmed` — a finding others may build on.
 */
export const claimIsConfirmedCommand = z.object({
  claim: refString("claim"),
  because: z.string(),
});
export type ClaimIsConfirmedCommand = z.infer<typeof claimIsConfirmedCommand>;

/** Every command the write surface takes. What an act was asked to do. */
export type Command =
  | AcceptAsUnresolvedCommand
  | AmendDesignCommand
  | CloseEnquiryCommand
  | ConcludeCommand
  | DeclareGateCommand
  | EvaluateCriterionCommand
  | ClaimIsConfirmedCommand
  | NoteCommand
  | OpenEnquiryCommand
  | PlanWorkCommand
  | PoseCommand
  | PromoteCommand
  | PursueCommand
  | RecordAnalysisCommand
  | RecordObservationsCommand
  | StopWorkCommand
  | StateCriterionCommand
  | SynthesiseCommand;
