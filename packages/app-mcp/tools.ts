/**
 * The tools, as data — reads in `TOOLS`, writes in `WRITE_TOOLS`, and the one that is neither
 * in `SESSION_TOOLS`.
 */

import { z } from "zod";
import type { ReadGroup, ReadSurface, WriteGroup, WriteSurface } from "@labkit/core-domain";
import type { SessionRegistry } from "@labkit/core-domain/context";
import { searchQuery, whyQuery, workListQuery } from "@labkit/core-domain/queries";
import {
  concludeCommand,
  evaluateCriterionCommand,
  noteCommand,
  recordAnalysisCommand,
  recordObservationsCommand,
} from "@labkit/core-domain/commands";

import {
  evaluatedCriterion,
  noted,
  recordedAnalysis,
  recordedObservations,
  registeredSession,
  search,
  workList,
} from "@labkit/core-domain/reports";

/**
 * One tool. `Shape` is a Zod **raw shape** — `{ at: z.string().optional() }`,
 * not `z.object({...})` — because that is what `registerTool` takes, and
 * wrapping it here would mean unwrapping it there.
 */
export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  readonly name: string;
  readonly title: string;
  /**
   * What a caller is doing when they reach for this — see `READ_GROUPS`.
   */
  readonly group: ReadGroup;
  readonly description: string;
  readonly inputSchema: Shape;
  /**
   * The shape of what the handler returns, owned by `packages/core-domain/reports.ts` and shared with the CLI.
   */
  readonly outputSchema?: z.ZodType;
  handler(read: ReadSurface, args: z.infer<z.ZodObject<Shape>>): Promise<unknown>;
}

/**
 * One write tool. Identical to {@link ToolDefinition} but for the surface its
 * handler is handed — which is the only thing separating the two kinds.
 */
export interface WriteToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  readonly name: string;
  readonly title: string;
  /** What a caller is doing when they reach for this — see `ToolDefinition.group`. */
  readonly group: WriteGroup;
  readonly description: string;
  readonly inputSchema: Shape;
  readonly outputSchema: z.ZodType;
  handler(write: WriteSurface, args: z.infer<z.ZodObject<Shape>>): Promise<unknown>;
}

/** Identity, but it pins `Shape` from `inputSchema` so a handler's `args` is typed. */
function tool<Shape extends z.ZodRawShape>(def: ToolDefinition<Shape>): ToolDefinition<Shape> {
  return def;
}

/** The same, for the write half. */
function writeTool<Shape extends z.ZodRawShape>(
  def: WriteToolDefinition<Shape>,
): WriteToolDefinition<Shape> {
  return def;
}

/**
 * The natural-id prefix an artefact carries.
 */
const ARTEFACT_PREFIX = "ART_";
const ANALYSIS_PREFIX = "COMP_";
const CLAIM_PREFIX = "CLM_";
const ENQUIRY_PREFIX = "LOE_";
const CRITERION_PREFIX = "CRIT_";
const GATE_PREFIX = "GATE_";
const EVIDENCE_PREFIX = "EV_";

export const TOOLS: readonly ToolDefinition<z.ZodRawShape>[] = [
  tool({
    name: "why",
    title: "Why a record is in the state it's in",
    group: "What stands",
    description:
      "Dispatches on the handle's own kind, in one uniform envelope every kind returns: a claim " +
      "(the findings resting under it and bearing against it, the prespecified standard it is " +
      "held to, and its verdict), a task (the line of enquiry and question it exists to " +
      "advance), or a line of enquiry (its status, and where its own question now stands: " +
      "established, provisional, accepted as unresolved, unresolved, untested). Also takes a " +
      "proposition, resolved to every claim asserting that exact sentence. Every other kind " +
      "this record does not explain yet is refused, naming the kinds it does.",
    inputSchema: {
      subject: z.string().describe("a handle of any kind, or a claim's proposition"),
    },
    // No `outputSchema`: the answer is a different report per kind of handle, not one report
    // with an extra field.
    handler: (read, { subject }) => read.why(whyQuery.parse({ subject })),
  }),

  tool({
    name: "search",
    title: "Every record containing this text",
    group: "Finding a handle",
    description:
      "Substring, case-insensitive, across every Prose property in the string taxonomy. " +
      "Returns every match grouped by label rather than picking one.",
    inputSchema: {
      text: z.string().describe("the text to search for"),
    },
    outputSchema: search,
    handler: async (read, { text }) => ({
      groups: await read.search(searchQuery.parse({ text })),
    }),
  }),

  tool({
    name: "work_list",
    title: "List the planned work",
    group: "What is blocked",
    description:
      "Every piece of planned work and where it stands. `planned` is on the books with " +
      "nothing done and nothing in its way — what is ready to start. `waiting` means a gate " +
      "protecting it has conditions nobody has finished checking: not ready, not blocked. " +
      "`blocked` means a gate protecting it has a **failed** condition. `carried-out` means " +
      "an analysis implements it. `abandoned` means somebody recorded that it is not being " +
      "done. Work planned without a gate appears here and nowhere else.",
    inputSchema: {
      state: workListQuery.shape.state.describe("only work in this state (default: all of it)"),
    },
    outputSchema: workList,
    handler: async (read, { state }) => ({
      work: await read.workList(workListQuery.parse({ ...(state === undefined ? {} : { state }) })),
    }),
  }),
] as ReadonlyArray<ToolDefinition<z.ZodRawShape>>;

/**
 * The natural-id prefixes a caller hands back.
 */
// Observations are an `Artefact` -- `recordObservations` returns the artefact's
// id, not the evidence unit's -- so this is `ARTEFACT_PREFIX` and not a second
// constant. Checked against `recordObservations`'s return rather than assumed
// from the ref's name, which says "observations" and would have suggested EU_.
const OBSERVATIONS_PREFIX = ARTEFACT_PREFIX;

export const WRITE_TOOLS: readonly WriteToolDefinition<z.ZodRawShape>[] = [
  writeTool({
    name: "note",
    title: "Put a note on the record",
    group: "Asking",
    description:
      "A dated, attributed record with nothing else required -- the one write with no " +
      "prerequisites. `search` reaches it like anything else with prose on it. " +
      "`on` attaches it to anything already on the record; omitting it costs nothing, since " +
      "attaching is the part this verb exists to make optional. `supersedes` names earlier " +
      "notes this one supersedes: both stay readable. With `note` and `supersedes` and no `text`, " +
      "records that an existing note supersedes another, without writing a new note.",
    inputSchema: {
      text: z.string().optional().describe("the note, in your own words"),
      note: z
        .string()
        .optional()
        .describe("an existing note; with supersedes and no text, no new note is written"),
      on: z
        .string()
        .optional()
        .describe("what this note concerns, if anything -- any handle already on the record"),
      prompted: z
        .string()
        .optional()
        .describe(
          "a question this note is the reason for -- why it was asked, not what it is about. " +
            "For a note written after the question",
        ),
      supersedes: z
        .array(z.string())
        .optional()
        .describe(`ids of notes this one supersedes, e.g. NOTE_18 — both stay readable`),
    },
    outputSchema: noted,
    handler: (write, { text, note, on, prompted, supersedes }) =>
      write.note(
        noteCommand.parse(
          note !== undefined && text === undefined
            ? { note, ...(supersedes === undefined ? {} : { supersedes }) }
            : {
                text,
                ...(on === undefined ? {} : { on }),
                ...(prompted === undefined ? {} : { prompted }),
                ...(supersedes === undefined ? {} : { supersedes }),
              },
        ),
      ),
  }),

  writeTool({
    name: "record_observations",
    title: "Record what was measured",
    group: "Doing the work",
    description:
      "Put measurement on the record without analysing it. This is the cheap act: capture " +
      "first, and analyse later if something ends up resting on it. `content_hash` is what " +
      "makes a later re-run comparable — without it the record cannot say whether two runs " +
      "read the same data.",
    inputSchema: {
      enquiry: z.string().describe(`enquiry id, e.g. ${ENQUIRY_PREFIX}7`),
      name: z.string().describe("what these observations are, in the researcher's words"),
      finding: z.string().describe("what was observed"),
      content_hash: z
        .string()
        .optional()
        .describe("a hash of the underlying data, if there is one"),
    },
    outputSchema: recordedObservations,
    handler: (write, { enquiry, name, finding, content_hash }) =>
      write.recordObservations(
        recordObservationsCommand.parse({
          enquiry: enquiry,
          name,
          finding,
          ...(content_hash === undefined ? {} : { contentHash: content_hash }),
        }),
      ),
  }),

  writeTool({
    name: "record_analysis",
    title: "Record a computation and what it read",
    group: "Doing the work",
    description:
      "Records the run: a computation, what it read, and an artefact to hold its output. Call " +
      "`conclude` for each finding it reached; an analysis with none yet is a valid state. " +
      "`from` takes observation ids or the ids of earlier analyses whose output this one " +
      "read — a two-stage pipeline records the second stage as consuming the first, never by " +
      "re-entering the intermediate as if it were fresh measurement. `held_to` names " +
      "prespecified checks the conclusions must answer to; a check nobody runs still counts " +
      "against the finding, so it is named here and not at evaluation time.",
    inputSchema: {
      enquiry: z.string().describe(`enquiry id, e.g. ${ENQUIRY_PREFIX}7`),
      method: z.string().describe("what was done"),
      from: z
        .array(z.string())
        .describe(`ids this run read — ${OBSERVATIONS_PREFIX}\u2026 or ${ANALYSIS_PREFIX}\u2026`),
      implementing: z.string().optional().describe("id of the planned work this carries out"),
      held_to: z
        .array(z.string())
        .optional()
        .describe("ids of prespecified criteria the conclusions are held to"),
    },
    outputSchema: recordedAnalysis,
    handler: (write, { enquiry, method, from, implementing, held_to }) =>
      write.recordAnalysis(
        recordAnalysisCommand.parse({
          enquiry: enquiry,
          method,
          from: from,
          ...(implementing === undefined ? {} : { implementing: implementing }),
          ...(held_to === undefined
            ? {}
            : {
                heldTo: held_to,
              }),
        }),
      ),
  }),

  writeTool({
    name: "conclude",
    title: "Assert one thing an analysis found",
    group: "Doing the work",
    description:
      "One conclusion per call. `replacing` supersedes exactly one earlier finding, named by " +
      "its claim or evidence id, and inherits its `proposition` and `bearing`; a conclusion " +
      "nothing names goes on standing. `replacing` is accepted only on an analysis recorded " +
      "as superseding the one that concluded the named finding.",
    inputSchema: {
      analysis: z
        .string()
        .describe(`id of the analysis this conclusion belongs to, e.g. ${ANALYSIS_PREFIX}3`),
      finding: z.string().describe("what was found, in this analysis's own words"),
      proposition: z
        .string()
        .optional()
        .describe("the claim, as a sentence; required unless `replacing` is given"),
      replacing: z
        .string()
        .optional()
        .describe(
          `id of the single finding this supersedes — ${CLAIM_PREFIX}\u2026 or ${EVIDENCE_PREFIX}\u2026`,
        ),
      bearing: z
        .enum(["supports", "challenges"])
        .optional()
        .describe("whether the finding supports or challenges the proposition (default: supports)"),
      standing: z
        .enum(["exploratory", "confirmatory"])
        .optional()
        .describe("confirmatory means it was prespecified; exploratory is the default"),
    },
    outputSchema: recordedAnalysis,
    handler: (write, { analysis, finding, proposition, replacing, bearing, standing }) =>
      write.conclude(
        concludeCommand.parse({
          analysis: analysis,
          finding,
          ...(proposition === undefined ? {} : { proposition }),
          // Prefix, never `typeof`: both arms of the union are "string" at
          // runtime, which is the defect `isRefOfKind` exists for.
          ...(replacing === undefined
            ? {}
            : {
                replacing,
              }),
          ...(bearing === undefined ? {} : { bearing: bearing as "supports" | "challenges" }),
          ...(standing === undefined
            ? {}
            : { standing: standing as "exploratory" | "confirmatory" }),
        }),
      ),
  }),

  writeTool({
    name: "evaluate_criterion",
    title: "Record a check's outcome",
    group: "Saying in advance what counts",
    description:
      "Record that a prespecified condition was checked and what it gave. Cite what decided " +
      "it — the claim, the observations, or the finding — and a verdict citing nothing is " +
      "recorded as asserted rather than as resting on something unnamed.",
    inputSchema: {
      criterion: z.string().describe(`criterion id, e.g. ${CRITERION_PREFIX}1`),
      value: z.string().describe("what the check gave, in the checker's words"),
      outcome: evaluateCriterionCommand.shape.outcome.describe("whether the condition was met"),
      gate: z.string().optional().describe(`gate id this evaluation is for, e.g. ${GATE_PREFIX}1`),
      citing: z
        .array(z.string())
        .optional()
        .describe(
          `ids of what decided the verdict: a claim (${CLAIM_PREFIX}4), an observations ` +
            `record (${OBSERVATIONS_PREFIX}7), or a finding (${EVIDENCE_PREFIX}2)`,
        ),
      about: z
        .string()
        .optional()
        .describe(
          `id of the finding this verdict judges, when one criterion is applied to several — ` +
            `e.g. ${CLAIM_PREFIX}12. Omit when the check is evaluated as a whole.`,
        ),
    },
    outputSchema: evaluatedCriterion,
    handler: (write, { criterion, value, outcome, gate, citing, about }) =>
      write.evaluateCriterion(
        evaluateCriterionCommand.parse({
          criterion: criterion,
          value,
          outcome: outcome as "pass" | "fail",
          ...(gate === undefined ? {} : { gate: gate }),
          // Prefix, never `typeof`: all three arms are "string" at runtime.
          ...(about === undefined ? {} : { about: about }),
          ...(citing === undefined
            ? {}
            : {
                citing,
              }),
        }),
      ),
  }),
] as ReadonlyArray<WriteToolDefinition<z.ZodRawShape>>;

/**
 * One session tool. A third kind, and the third kind exists because the other two are defined
 * by the surface their handler is handed — and this handler is handed neither.
 */
export interface SessionToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  readonly name: string;
  readonly title: string;
  /** What a caller is doing when they reach for this — see `ToolDefinition.group`. */
  readonly group: WriteGroup;
  readonly description: string;
  readonly inputSchema: Shape;
  readonly outputSchema: z.ZodType;
  handler(registry: SessionRegistry, args: z.infer<z.ZodObject<Shape>>): Promise<unknown>;
}

/** The same pinning trick as {@link tool}, for the session half. */
function sessionTool<Shape extends z.ZodRawShape>(
  def: SessionToolDefinition<Shape>,
): SessionToolDefinition<Shape> {
  return def;
}

export const SESSION_TOOLS: readonly SessionToolDefinition<z.ZodRawShape>[] = [
  sessionTool({
    name: "register_session",
    title: "Say who you are",
    group: "Before anything",
    description:
      "Call this first: every write tool refuses until you have. It records which agent " +
      "is on the other end of this connection, so every write that follows is stamped " +
      "with it — an entry nobody signed is worse than no entry, because it looks " +
      "attributed and is not. LabKit does not check the id and cannot: " +
      "it records what you tell it. Pass the session id your harness gives you, if it gives " +
      "you one, so the same session is nameable in every tool that logs about it; otherwise " +
      "choose a stable one and keep using it. Registering again replaces the previous answer.",
    inputSchema: {
      id: z
        .string()
        .min(1)
        .describe(
          "stable id, for comparing two events — a cross-harness session id where you have one",
        ),
      label: z
        .string()
        .min(1)
        .optional()
        .describe("human-readable name a person scans in a report (default: the id)"),
      reconstructed_from: z
        .string()
        .min(1)
        .optional()
        .describe(
          "what the writes on this connection were read off — a paper, a document, a commit history. " +
            "For work you did not perform. Not for your own results recorded afterwards: those were " +
            "performed, however long ago, and take nothing here",
        ),
    },
    outputSchema: registeredSession,
    // Returns what it recorded, which is the rule for a verb that mints
    // something: a caller who cannot read back what LabKit understood cannot
    // tell a typo from a success. `replaced` is the previous registration, so
    // registering twice is visible rather than silent.
    handler: async (registry, { id, label, reconstructed_from }) => {
      const was = registry.registered();
      registry.register(label ?? id, id, reconstructed_from);
      const now = registry.registered();
      // Both sides built field by field rather than handed the registry's own
      // object, so a field added to the registration cannot reach a strict
      // output schema that does not declare it.
      const said = (who: NonNullable<typeof was>) => ({
        id: who.id,
        label: who.label,
        reconstructed_from: who.reconstructedFrom,
      });
      return {
        registered: now
          ? said(now)
          : { id, label: label ?? id, reconstructed_from: reconstructed_from ?? null },
        replaced: was ? said(was) : undefined,
      };
    },
  }),
] as ReadonlyArray<SessionToolDefinition<z.ZodRawShape>>;
