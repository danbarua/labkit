/**
 * The tools, as data — reads in `TOOLS`, writes in `WRITE_TOOLS`.
 *
 * Separated from transport deliberately. A tool here is a name, a description,
 * an input shape and a handler taking `(read, args)` — nothing that needs a
 * server to exist. That is what lets `tests/mcp.test.ts` enumerate the set and
 * call a handler without standing anything up, and it keeps the wiring in
 * `server.ts` down to a loop.
 *
 * **The two lists are separate, and that is the whole safety story.** A read
 * handler receives a `ReadSurface` and has no write verb in scope to reach for;
 * a write handler receives a `WriteSurface`. Nothing prevents a server from
 * registering both — this one does — but a tool cannot reach the half it was
 * not handed. `src/cli.ts` keeps the stronger property: it builds only a
 * `ReadSurface`, so it cannot write at all.
 *
 * The MCP server was read-only for one batch of work and is not any more. An
 * agent that can only read a record nothing lets it write is answering
 * questions about an empty graph.
 *
 * Not every verb is exposed. The reads are the questions a caller actually
 * asks; the writes are the loop that makes a programme exist — ask a question,
 * open an enquiry on it, record what was measured, record what was concluded,
 * close it. The other nine commands in `src/domain/commands.ts` follow the same
 * pattern and are a later pass.
 */

import { z } from "zod";
import type { ReadSurface, WriteSurface } from "../domain";
import type { AnalysisRef, ObservationsRef } from "../domain";
import {
  claimsAssertingSchema,
  conflictVerdictSchema,
  criteriaGoverningSchema,
  gateStatusSchema,
  originOfSchema,
  reproducibilityReportSchema,
  taskContractSchema,
  acknowledgementSchema,
  amendmentReportSchema,
  criterionRefSchema,
  gateRefSchema,
  reinterpretationReportSchema,
  replacementReportSchema,
  reviewRefSchema,
  verificationReportSchema,
  workRefSchema,
  analysisRefSchema,
  recordedAnalysisSchema,
  enquiryRefSchema,
  observationsRefSchema,
  pursuitsSchema,
  questionRefSchema,
  dependencyReportSchema,
  designHistorySchema,
  enquiryStatusSchema,
  interpretationHistorySchema,
  reproductionReportSchema,
  supportExplanationSchema,
} from "./schemas";

/**
 * One tool. `Shape` is a Zod **raw shape** — `{ at: z.string().optional() }`,
 * not `z.object({...})` — because that is what `registerTool` takes, and
 * wrapping it here would mean unwrapping it there.
 */
export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Shape;
  /**
   * The shape of what the handler returns, mirrored from `src/domain/report.ts`
   * and held to it at compile time — see `./schemas`. The SDK validates
   * `structuredContent` against this and errors when it does not match, so a
   * schema here is a claim about the handler, not documentation of it.
   *
   * Optional for one tool only, and for a measured reason — see `known`.
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
 * The natural-id prefix an artefact carries. `whatDependsOn` takes a name or an
 * explicit reference and **refuses** an ambiguous name rather than answering
 * about the union (S-9), so the caller needs a way to hand in the reference —
 * and over a wire the only handle there is is the id itself.
 */
const ARTEFACT_PREFIX = "ART_";
const ANALYSIS_PREFIX = "COMP_";
const CLAIM_PREFIX = "CLM_";
const QUESTION_PREFIX = "Q_";
const ENQUIRY_PREFIX = "LOE_";
const CRITERION_PREFIX = "CRIT_";
const GATE_PREFIX = "GATE_";
const WORK_PREFIX = "TASK_";
const REVIEW_PREFIX = "REV_";

export const TOOLS: readonly ToolDefinition<z.ZodRawShape>[] = [
  tool({
    name: "known",
    title: "What the programme knows",
    description:
      "What this research programme currently knows, partitioned by how well each answer is " +
      "held up: established, provisional, accepted as unresolved, unresolved, untested. " +
      "Given `at` (an ISO instant) it answers as of that moment instead, from durable state " +
      "rather than a log — but the historical form cannot split `open` into worked-on and " +
      "untouched, because nothing records when work began.",
    inputSchema: { at: z.string().optional().describe("ISO instant, e.g. 2026-08-21T09:00:00.000Z") },
    // **No `outputSchema`, and this is the one tool without one.** It returns
    // `KnowledgeSurvey | HistoricalSurvey` — genuinely two reports, not one
    // with an extra field: the as-of answer has `open` where the present-day
    // one has `unresolved` and `untested`, and cannot split them (S-1). The SDK
    // cannot carry that: `normalizeObjectSchema` returns **undefined** for a
    // union rather than throwing, so declaring one makes every call to this
    // tool fail validation. Measured against the installed
    // `@modelcontextprotocol/sdk@1.30.0`, not inferred from the spec.
    //
    // The schemas exist either way (`knowledgeSurveySchema`,
    // `historicalSurveySchema`) and `tests/mcp.test.ts` parses this tool's
    // output against them, so the shapes are still checked — just not by the
    // SDK. Splitting this into two tools would give both an `outputSchema`;
    // that is a wire change, so it is not being made on the way past.
    handler: (read, { at }) => (at ? read.whatWasKnown(at) : read.whatIsKnown()),
  }),

  tool({
    name: "why_supported",
    title: "Why a conclusion counts as supported",
    description:
      "Why a proposition counts as supported (or does not): the findings resting under it, " +
      "the findings bearing against it, the prespecified standard it is held to and which " +
      "checks are unmet, what re-checked it, and what has been superseded. Three states " +
      "share `supported: false` and the answer keeps them apart — nothing has examined it, " +
      "evidence bears against it (`challenged`), or the record no longer asserts this " +
      "wording (`withdrawn`, with `replacedBy`). Takes the claim's id, so there is nothing " +
      "to disambiguate: two lines of enquiry asserting the same sentence are two claims and " +
      "this answers about one of them. `record_analysis` hands the id back; `claims_asserting` " +
      "finds one from text.",
    inputSchema: {
      claim: z.string().describe(`the claim's id, e.g. ${CLAIM_PREFIX}4 — from record_analysis`),
    },
    outputSchema: supportExplanationSchema,
    handler: (read, { claim }) => read.whySupported({ kind: "claim", id: claim }),
  }),

  tool({
    name: "what_depends_on",
    title: "What rests on a record",
    description:
      "What would be affected if a record turned out to be wrong: the claims and lines of " +
      "enquiry reached from it, walking the pipeline downstream through every analysis built " +
      "on top of it. Takes an artefact's logical name, or its id when a name identifies more " +
      "than one. The answer is a lower bound and says so: anything connected by a route not " +
      "listed is absent from the lists, not thereby unaffected.",
    inputSchema: { artefact: z.string().describe(`logical name, or an ${ARTEFACT_PREFIX}… id`) },
    outputSchema: dependencyReportSchema,
    handler: (read, { artefact }) =>
      read.whatDependsOn(
        artefact.startsWith(ARTEFACT_PREFIX) ? { kind: "observations", id: artefact } : artefact,
      ),
  }),

  tool({
    name: "enquiry_status",
    title: "Whether a line of enquiry is open",
    description:
      "Whether a line of enquiry is still open, and if not how it closed — answered, " +
      "abandoned, or deliberately left open — with the answer and the evidence behind it.",
    inputSchema: { enquiry: z.string().describe(`enquiry id, e.g. ${ENQUIRY_PREFIX}7`) },
    outputSchema: enquiryStatusSchema,
    handler: (read, { enquiry }) => read.enquiryStatus({ kind: "enquiry", id: enquiry }),
  }),

  tool({
    name: "design_history",
    title: "How a gate's conditions were amended",
    description:
      "How the conditions on a gate reached their current wording: each amendment, its " +
      "reason, and whether it was mechanical or substantive. Ordered from the record itself " +
      "rather than from timestamps. Takes the gate's id — the conditions belong to the gate, " +
      "so that is the handle, not the design's name.",
    inputSchema: { gate: z.string().describe(`gate id, e.g. ${GATE_PREFIX}1`) },
    outputSchema: designHistorySchema,
    handler: (read, { gate }) => read.designHistory({ kind: "gate", id: gate }),
  }),

  tool({
    name: "interpretation_history",
    title: "How a claim's reading was narrowed",
    description:
      "How a claim's current reading was arrived at: the claims each step withdrew, the " +
      "decision that narrowed them and why. Takes the claim's id and walks backwards. One " +
      "step can withdraw several claims — two analyses reaching one reading are withdrawn " +
      "together — so every step names records, not a sentence.",
    inputSchema: { claim: z.string().describe(`the claim's id, e.g. ${CLAIM_PREFIX}4`) },
    outputSchema: interpretationHistorySchema,
    handler: (read, { claim }) => read.interpretationHistory({ kind: "claim", id: claim }),
  }),

  tool({
    name: "reproduction_of",
    title: "Whether a re-run reproduced its original",
    description:
      "What a verifying analysis re-checked and whether it reproduced the original — derived " +
      "from what each run recorded consuming, not from a stored flag, so there is no value " +
      "anyone can set to `reproduced`. Takes the id of the analysis that did the verifying, " +
      "not the one being verified.",
    inputSchema: { analysis: z.string().describe(`id of the verifying analysis, e.g. ${ANALYSIS_PREFIX}5`) },
    outputSchema: reproductionReportSchema,
    handler: (read, { analysis }) => read.reproductionOf({ kind: "analysis", id: analysis }),
  }),

  tool({
    name: "claims_asserting",
    title: "Which claims assert a proposition",
    description:
      "The claims asserting a sentence. **The one place wording is resolved**: every other " +
      "tool takes a claim id, and this is how a caller holding only text finds one. Returns " +
      "all matches rather than picking — two lines of enquiry can assert the same sentence " +
      "about different endpoints, and they are two claims (S-5). `record_analysis` hands back " +
      "claim ids directly, so an agent that recorded the work never needs this.",
    inputSchema: { proposition: z.string().describe("the sentence, as worded") },
    outputSchema: claimsAssertingSchema,
    handler: async (read, { proposition }) => ({
      claims: await read.claimsAsserting(proposition),
    }),
  }),

  tool({
    name: "pursuits_of",
    title: "The lines of enquiry under a question",
    description:
      "Every line of enquiry pursuing a question. This is how a caller that did not open " +
      "an enquiry itself finds one to work in: `known` gives question ids, this gives the " +
      "enquiry ids beneath them, and every recording verb takes an enquiry. An empty list " +
      "means the question is on the books and nothing has been started on it.",
    inputSchema: { question: z.string().describe(`question id, e.g. ${QUESTION_PREFIX}12`) },
    outputSchema: pursuitsSchema,
    handler: async (read, { question }) => ({
      enquiries: await read.pursuitsOf({ kind: "question", id: question }),
    }),
  }),

  tool({
    name: "origin_of",
    title: "Where a question came from",
    description:
      "Where a question came from, when it came from sharpening an earlier one — the " +
      "question it narrowed, why, and **what was known at that moment**, frozen when the " +
      "sharpening was recorded rather than recomputed now. `origin` is null for a question " +
      "somebody simply asked, which is most of them; that is an answer, not a failure.",
    inputSchema: { question: z.string().describe(`question id, e.g. ${QUESTION_PREFIX}12`) },
    outputSchema: originOfSchema,
    handler: async (read, { question }) => ({
      origin: await read.originOf({ kind: "question", id: question }),
    }),
  }),

  tool({
    name: "contract_for",
    title: "What a piece of planned work is for",
    description:
      "A planned piece of work's objective, what would count as meeting it, and what it may " +
      "read. `enforced` is always false and says so: the record states what the work may " +
      "look at, and nothing stops a computation reading elsewhere.",
    inputSchema: { work: z.string().describe(`work id, e.g. ${WORK_PREFIX}1`) },
    outputSchema: taskContractSchema,
    handler: (read, { work }) => read.contractFor({ kind: "work", id: work }),
  }),

  tool({
    name: "criteria_governing",
    title: "Which conditions a gate is bound to",
    description:
      "The prespecified conditions a gate is governed by. Pair it with `gate_status` to get " +
      "their current standing; this answers only which conditions apply.",
    inputSchema: { gate: z.string().describe(`gate id, e.g. ${GATE_PREFIX}1`) },
    outputSchema: criteriaGoverningSchema,
    handler: async (read, { gate }) => ({
      criteria: await read.criteriaGoverning({ kind: "gate", id: gate }),
    }),
  }),

  tool({
    name: "gate_status",
    title: "Whether a gate is satisfied, and on what",
    description:
      "A gate's state, itemised per condition: which checks passed, which failed, which were " +
      "never run, and which have no standing verdict. **Computed, never stored** — there is " +
      "no value anyone can set to `satisfied`, and `everFailed` survives a later pass, so a " +
      "gate that failed and was re-checked does not read as though it never failed.",
    inputSchema: { gate: z.string().describe(`gate id, e.g. ${GATE_PREFIX}1`) },
    outputSchema: gateStatusSchema,
    handler: (read, { gate }) => read.gateStatus({ kind: "gate", id: gate }),
  }),

  tool({
    name: "do_these_conflict",
    title: "Whether two conclusions actually disagree",
    description:
      "Whether two conclusions contradict each other, are about different things " +
      "(`dissociation`), or agree. Two analyses reaching opposite-sounding results are not " +
      "in conflict if they asked about different endpoints, and this is what tells them " +
      "apart. Each side is named by its claim id — two claims can assert the same sentence " +
      "about different endpoints, which is exactly the case this tool exists to report on.",
    inputSchema: {
      a: z.string().describe(`the first claim's id, e.g. ${CLAIM_PREFIX}4`),
      b: z.string().describe(`the second claim's id, e.g. ${CLAIM_PREFIX}7`),
    },
    outputSchema: conflictVerdictSchema,
    handler: (read, { a, b }) =>
      read.doTheseConflict({ kind: "claim", id: a }, { kind: "claim", id: b }),
  }),

  tool({
    name: "reproducibility_of",
    title: "Whether an analysis could be rebuilt from what it read",
    description:
      "Whether an analysis's inputs can be accounted for, given hashes of whatever you have " +
      "rebuilt. Each input lands in one of four buckets: rebuilt and identical, rebuilt and " +
      "different, **unverifiable** (the record kept no hash, so nothing can be said), or not " +
      "rebuilt at all. `unverifiable` is deliberately not a failure — it is the record " +
      "admitting it cannot answer, which is different from answering no.",
    inputSchema: {
      analysis: z.string().describe(`analysis id, e.g. ${ANALYSIS_PREFIX}3`),
      rebuilt: z
        .array(
          z.object({
            part: z.string().describe(`the input's id, ${ARTEFACT_PREFIX}\u2026`),
            hash: z.string().describe("the hash of your rebuilt copy"),
          }),
        )
        .optional()
        .describe("what you rebuilt, and its hash — omit to ask what the record can account for"),
    },
    outputSchema: reproducibilityReportSchema,
    handler: (read, { analysis, rebuilt }) =>
      read.reproducibilityOf(
        { kind: "analysis", id: analysis },
        ((rebuilt ?? []) as Array<{ part: string; hash: string }>).map((r) => ({
          part: { kind: "observations" as const, id: r.part },
          hash: r.hash,
        })),
      ),
  }),
] as ReadonlyArray<ToolDefinition<z.ZodRawShape>>;

/**
 * The natural-id prefixes a caller hands back. `recordAnalysis` takes a mixed
 * list of observation and analysis ids, and the prefix is what says which is
 * which — the same discrimination `TenantGraph.createEdge` makes, from the same
 * table (`NODE_TYPES` in `src/db/domain.ts`).
 */
// Observations are an `Artefact` -- `recordObservations` returns the artefact's
// id, not the evidence unit's -- so this is `ARTEFACT_PREFIX` and not a second
// constant. Checked against `recordObservations`'s return rather than assumed
// from the ref's name, which says "observations" and would have suggested EU_.
const OBSERVATIONS_PREFIX = ARTEFACT_PREFIX;

/** One id from the wire, resolved to the ref kind its prefix names. */
function inputRef(id: string): ObservationsRef | AnalysisRef {
  if (id.startsWith(ANALYSIS_PREFIX)) return { kind: "analysis", id };
  if (id.startsWith(OBSERVATIONS_PREFIX)) return { kind: "observations", id };
  throw new Error(
    `\`${id}\` is neither observations (${OBSERVATIONS_PREFIX}\u2026) nor an analysis (${ANALYSIS_PREFIX}\u2026)`,
  );
}

/** One conclusion, as it crosses the wire. */
const conclusionShape = z.object({
  proposition: z.string().describe("the claim, as a sentence"),
  finding: z.string().describe("what was found, in this analysis's own words"),
  bearing: z
    .enum(["supports", "challenges"])
    .optional()
    .describe("whether the finding supports or challenges the proposition (default: supports)"),
  standing: z
    .enum(["exploratory", "confirmatory"])
    .optional()
    .describe("confirmatory means it was prespecified; exploratory is the default"),
});

export const WRITE_TOOLS: readonly WriteToolDefinition<z.ZodRawShape>[] = [
  writeTool({
    name: "pose",
    title: "Ask a question",
    description:
      "Put a question on the record without starting work on it. It appears in `known` as " +
      "untested — on the books, never pursued, which is not a failure and not an " +
      "inconclusive result. Use `open_enquiry` instead to ask and start in one act.",
    inputSchema: { question: z.string().describe("the question, as asked") },
    outputSchema: questionRefSchema,
    handler: (write, { question }) => write.pose(question),
  }),

  writeTool({
    name: "pursue",
    title: "Open a line of enquiry on an existing question",
    description:
      "Start work on a question already on the record, naming the approach. A question may " +
      "be pursued more than once, by different approaches, and they stay distinct.",
    inputSchema: {
      question: z.string().describe(`question id, e.g. ${QUESTION_PREFIX}12`),
      approach: z.string().describe("how this line of enquiry means to answer it"),
    },
    outputSchema: enquiryRefSchema,
    handler: (write, { question, approach }) =>
      write.pursue({ question: { kind: "question", id: question }, approach }),
  }),

  writeTool({
    name: "open_enquiry",
    title: "Ask a question and start on it",
    description:
      "Ask and pursue in one act — the usual way work begins. Records one event, not two: " +
      "a researcher who opened an enquiry did one thing.",
    inputSchema: { question: z.string().describe("the question, as asked") },
    outputSchema: enquiryRefSchema,
    handler: (write, { question }) => write.openEnquiry(question),
  }),

  writeTool({
    name: "record_observations",
    title: "Record what was measured",
    description:
      "Put measurement on the record without analysing it. This is the cheap act: capture " +
      "first, and promote later if something ends up resting on it. `content_hash` is what " +
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
    outputSchema: observationsRefSchema,
    handler: (write, { enquiry, name, finding, content_hash }) =>
      write.recordObservations({
        enquiry: { kind: "enquiry", id: enquiry },
        name,
        finding,
        ...(content_hash === undefined ? {} : { contentHash: content_hash }),
      }),
  }),

  writeTool({
    name: "record_analysis",
    title: "Record a computation and what it concluded",
    description:
      "The compound act: a computation, what it read, and one claim per conclusion. `from` " +
      "takes observation ids or the ids of earlier analyses whose output this one read — a " +
      "two-stage pipeline records the second stage as consuming the first, never by " +
      "re-entering the intermediate as if it were fresh measurement. `held_to` names " +
      "prespecified checks the conclusions must answer to; a check nobody runs still counts " +
      "against the finding, so it is named here and not at evaluation time.",
    inputSchema: {
      enquiry: z.string().describe(`enquiry id, e.g. ${ENQUIRY_PREFIX}7`),
      method: z.string().describe("what was done"),
      from: z
        .array(z.string())
        .describe(`ids this run read — ${OBSERVATIONS_PREFIX}\u2026 or ${ANALYSIS_PREFIX}\u2026`),
      concludes: z.array(conclusionShape).describe("one entry per conclusion"),
      implementing: z.string().optional().describe("id of the planned work this carries out"),
      held_to: z
        .array(z.string())
        .optional()
        .describe("ids of prespecified criteria the conclusions are held to"),
    },
    outputSchema: recordedAnalysisSchema,
    handler: (write, { enquiry, method, from, concludes, implementing, held_to }) =>
      write.recordAnalysis({
        enquiry: { kind: "enquiry", id: enquiry },
        method,
        from: (from as string[]).map(inputRef),
        concludes: concludes as Array<{
          proposition: string;
          finding: string;
          bearing?: "supports" | "challenges";
          standing?: "exploratory" | "confirmatory";
        }>,
        ...(implementing === undefined ? {} : { implementing: { kind: "work" as const, id: implementing } }),
        ...(held_to === undefined
          ? {}
          : { heldTo: (held_to as string[]).map((id) => ({ kind: "criterion" as const, id })) }),
      }),
  }),

  writeTool({
    name: "close_enquiry",
    title: "Close a line of enquiry",
    description:
      "Close an enquiry, answered or abandoned. Give `answered_by` — the id of the claim " +
      "that answers it — to close it as answered; omit it to abandon. The claim carries the " +
      "polarity, so a question answered *no* closes as answered, not abandoned. Closing an " +
      "already-closed enquiry is refused rather than recorded twice.",
    inputSchema: {
      enquiry: z.string().describe(`enquiry id, e.g. ${ENQUIRY_PREFIX}7`),
      answered_by: z
        .string()
        .optional()
        .describe(`id of the claim that answers it, e.g. ${CLAIM_PREFIX}4 — from record_analysis`),
    },
    outputSchema: acknowledgementSchema,
    handler: async (write, { enquiry, answered_by }) => {
      await write.closeEnquiry({
        enquiry: { kind: "enquiry", id: enquiry },
        ...(answered_by === undefined
          ? {}
          : { answeredBy: { kind: "claim" as const, id: answered_by } }),
      });
      return { ok: true as const, acted: enquiry };
    },
  }),

  writeTool({
    name: "sharpen",
    title: "Narrow a question into a more precise one",
    description:
      "Replace a broad question with a sharper one, recording why. The sharper question is " +
      "new; the original stays on the record, and the act freezes the findings it was taken " +
      "in light of — so asking later what was known at the moment of sharpening gets the " +
      "answer as it stood then, not as it stands now.",
    inputSchema: {
      from: z.string().describe(`id of the question being sharpened, e.g. ${QUESTION_PREFIX}1`),
      into: z.string().describe("the sharper question, as asked"),
      because: z.string().describe("why it was sharpened"),
    },
    outputSchema: questionRefSchema,
    handler: (write, { from, into, because }) =>
      write.sharpen({ from: { kind: "question", id: from }, into, because }),
  }),

  writeTool({
    name: "record_review",
    title: "Record a verdict on an analysis",
    description:
      "Put a review of an analysis on the record. A retraction later rests on the review " +
      "that justified it, so this is what `replace_analysis` cites.",
    inputSchema: {
      of: z.string().describe(`id of the analysis reviewed, e.g. ${ANALYSIS_PREFIX}3`),
      verdict: z.string().describe("what the review found"),
    },
    outputSchema: reviewRefSchema,
    handler: (write, { of, verdict }) =>
      write.recordReview({ of: { kind: "analysis", id: of }, verdict }),
  }),

  writeTool({
    name: "plan_work",
    title: "State an objective and what would count as meeting it",
    description:
      "Record planned work: what it is for, and what acceptance looks like. `may_read` names " +
      "what the work is allowed to look at — a contract, not an enforcement: nothing stops a " +
      "computation reading elsewhere, and the record says so rather than implying otherwise.",
    inputSchema: {
      objective: z.string().describe("what the work is for"),
      acceptance: z.string().describe("what would count as meeting it"),
      may_read: z
        .array(z.string())
        .optional()
        .describe("what this work may look at — recorded, not enforced"),
    },
    outputSchema: workRefSchema,
    handler: (write, { objective, acceptance, may_read }) =>
      write.planWork({
        objective,
        acceptance,
        ...(may_read === undefined ? {} : { mayRead: may_read as string[] }),
      }),
  }),

  writeTool({
    name: "state_criterion",
    title: "State a condition, before anything is run",
    description:
      "Put a prespecified condition on the record. Stating it separately is what makes it " +
      "prespecified: a criterion named at evaluation time cannot express the case that " +
      "matters, which is a check nobody ran still counting against the finding it qualifies.",
    inputSchema: { proposition: z.string().describe("the condition, as a sentence") },
    outputSchema: criterionRefSchema,
    handler: (write, { proposition }) => write.stateCriterion(proposition),
  }),

  writeTool({
    name: "declare_gate",
    title: "Bind conditions to the work they gate",
    description:
      "Declare that some work is gated on some criteria, and say what the gate is for. The " +
      "gate's state is computed from its criteria's evaluations, never stored — there is no " +
      "value anyone can set to `satisfied`.",
    inputSchema: {
      governed_by: z
        .array(z.string())
        .describe(`criterion ids, e.g. ${CRITERION_PREFIX}1`),
      consequence: z.string().describe("what this gate decides"),
      protecting: z.array(z.string()).describe(`work ids, e.g. ${WORK_PREFIX}1`),
    },
    outputSchema: gateRefSchema,
    handler: (write, { governed_by, consequence, protecting }) =>
      write.declareGate({
        governedBy: (governed_by as string[]).map((id) => ({ kind: "criterion" as const, id })),
        consequence,
        protecting: (protecting as string[]).map((id) => ({ kind: "work" as const, id })),
      }),
  }),

  writeTool({
    name: "evaluate_criterion",
    title: "Record a check's outcome",
    description:
      "Record that a prespecified condition was checked and what it gave. Cite the analysis " +
      "and proposition the verdict rests on where there is one; a verdict citing nothing is " +
      "recorded as such rather than as resting on something unnamed.",
    inputSchema: {
      criterion: z.string().describe(`criterion id, e.g. ${CRITERION_PREFIX}1`),
      value: z.string().describe("what the check gave, in the checker's words"),
      outcome: z.enum(["pass", "fail"]).describe("whether the condition was met"),
      gate: z.string().optional().describe(`gate id this evaluation is for, e.g. ${GATE_PREFIX}1`),
      citing: z
        .string()
        .optional()
        .describe(`id of the claim the verdict rests on, e.g. ${CLAIM_PREFIX}4`),
    },
    outputSchema: acknowledgementSchema,
    handler: async (write, { criterion, value, outcome, gate, citing }) => {
      await write.evaluateCriterion({
        criterion: { kind: "criterion", id: criterion },
        value,
        outcome: outcome as "pass" | "fail",
        ...(gate === undefined ? {} : { gate: { kind: "gate" as const, id: gate } }),
        ...(citing === undefined ? {} : { citing: { kind: "claim" as const, id: citing } }),
      });
      return { ok: true as const, acted: criterion };
    },
  }),

  writeTool({
    name: "reverify",
    title: "Re-run a historical analysis under current observations",
    description:
      "Record that an earlier analysis was checked again against observations available now. " +
      "This is **not** reproduction: reproduction asks whether the same inputs give the same " +
      "answer, and this asks whether the finding still holds under different ones. Use " +
      "`reproduction_of` to ask the other question. `under` takes observation ids or the ids " +
      "of earlier analyses whose output was read this time.",
    inputSchema: {
      historical: z.string().describe(`id of the analysis being re-verified, e.g. ${ANALYSIS_PREFIX}1`),
      enquiry: z.string().describe(`enquiry id this re-verification belongs to, e.g. ${ENQUIRY_PREFIX}7`),
      method: z.string().describe("what was done this time"),
      under: z
        .array(z.string())
        .describe(`ids read this time — ${OBSERVATIONS_PREFIX}\u2026 or ${ANALYSIS_PREFIX}\u2026`),
      concludes: conclusionShape.describe("the single conclusion this re-verification reached"),
    },
    outputSchema: verificationReportSchema,
    handler: (write, { historical, enquiry, method, under, concludes }) =>
      write.reverify({
        historical: { kind: "analysis", id: historical },
        enquiry: { kind: "enquiry", id: enquiry },
        method,
        under: (under as string[]).map(inputRef),
        concludes: concludes as {
          proposition: string;
          finding: string;
          bearing?: "supports" | "challenges";
          standing?: "exploratory" | "confirmatory";
        },
      }),
  }),

  writeTool({
    name: "accept_as_unresolved",
    title: "Leave a question open on purpose",
    description:
      "Close a line of enquiry as deliberately unresolved: worked on, not settled, and left " +
      "that way with the condition that would reopen it. Its own state, not an abandonment " +
      "and not a failure — a reader scanning for what still needs doing must not find it " +
      "under unresolved work.",
    inputSchema: {
      enquiry: z.string().describe(`enquiry id, e.g. ${ENQUIRY_PREFIX}7`),
      because: z.string().describe("why it is being left"),
      until: z.string().describe("what would reopen it"),
      in_light_of: z.string().describe(`id of the claim this rests on, e.g. ${CLAIM_PREFIX}4`),
    },
    outputSchema: acknowledgementSchema,
    handler: async (write, { enquiry, because, until, in_light_of }) => {
      await write.acceptAsUnresolved({
        enquiry: { kind: "enquiry", id: enquiry },
        because,
        until,
        inLightOf: { kind: "claim", id: in_light_of },
      });
      return { ok: true as const, acted: enquiry };
    },
  }),

  writeTool({
    name: "promote",
    title: "Make a finding citable",
    description:
      "Move a finding from scratch to citable, recording why it was promoted. Until this " +
      "happens a question answered on that finding reports as `provisional` rather than " +
      "`established` — settled as far as anyone has taken it, but resting on something " +
      "nobody has vouched for. Capture cheaply; promote before citing.",
    inputSchema: {
      claim: z.string().describe(`id of the claim being promoted, e.g. ${CLAIM_PREFIX}4`),
      because: z.string().describe("what justifies promoting it"),
    },
    outputSchema: acknowledgementSchema,
    handler: async (write, { claim, because }) => {
      await write.promote({ claim: { kind: "claim", id: claim }, because });
      return { ok: true as const, acted: claim };
    },
  }),

  writeTool({
    name: "amend_design",
    title: "Change a locked condition, and say what it costs",
    description:
      "Reword a prespecified criterion after work has begun, citing what prompted it. The " +
      "answer says whether the change was **mechanical** (a repair that moves nothing) or " +
      "**scientific** (one that does), and names the confirmatory results affected — the " +
      "difference between a legitimate repair and p-hacking, decided from the record rather " +
      "than from the author's account of it.",
    inputSchema: {
      criterion: z.string().describe(`criterion id, e.g. ${CRITERION_PREFIX}1`),
      now_requires: z.string().describe("the new wording"),
      because: z.string().describe("why it is being amended"),
      citing: z.string().describe(`id of the claim prompting the amendment, e.g. ${CLAIM_PREFIX}4`),
    },
    outputSchema: amendmentReportSchema,
    handler: (write, { criterion, now_requires, because, citing }) =>
      write.amendDesign({
        criterion: { kind: "criterion", id: criterion },
        nowRequires: now_requires,
        because,
        citing: { kind: "claim", id: citing },
      }),
  }),

  writeTool({
    name: "replace_analysis",
    title: "Supersede a defective analysis",
    description:
      "Record a corrected analysis in place of a defective one, citing the review that " +
      "justified the retraction. The superseded output is invalidated and the checks that " +
      "cited it are withdrawn, in one transaction with the replacement — a failure between " +
      "the halves would leave an earlier failure no longer deciding its check and no " +
      "corrected check in existence. The answer says what changed and what did not. `from` " +
      "takes observation ids or the ids of earlier analyses whose output the replacement " +
      "read, exactly as `record_analysis` does.",
    inputSchema: {
      supersedes: z.string().describe(`id of the analysis being replaced, e.g. ${ANALYSIS_PREFIX}2`),
      because: z.string().describe(`id of the review justifying it, e.g. ${REVIEW_PREFIX}1`),
      enquiry: z.string().describe(`enquiry id, e.g. ${ENQUIRY_PREFIX}7`),
      method: z.string().describe("what the replacement did"),
      from: z
        .array(z.string())
        .describe(`ids the replacement read — ${OBSERVATIONS_PREFIX}\u2026 or ${ANALYSIS_PREFIX}\u2026`),
      concludes: z.array(conclusionShape).describe("one entry per conclusion"),
    },
    outputSchema: replacementReportSchema,
    handler: (write, { supersedes, because, enquiry, method, from, concludes }) =>
      write.replaceAnalysis({
        supersedes: { kind: "analysis", id: supersedes },
        because: { kind: "review", id: because },
        enquiry: { kind: "enquiry", id: enquiry },
        method,
        from: (from as string[]).map(inputRef),
        concludes: concludes as Array<{
          proposition: string;
          finding: string;
          bearing?: "supports" | "challenges";
          standing?: "exploratory" | "confirmatory";
        }>,
      }),
  }),

  writeTool({
    name: "reinterpret",
    title: "Narrow what a claim is taken to mean",
    description:
      "Record that a claim's reading has been narrowed — the evidence is unchanged, what it " +
      "is taken to show is not. The answer says whether anything resting on the old reading " +
      "needs recomputing. Takes the claim's id, so there is nothing to disambiguate: two " +
      "lines of enquiry asserting the same sentence are two claims and this names one.",
    inputSchema: {
      claim: z.string().describe(`the claim's id, e.g. ${CLAIM_PREFIX}4 — from record_analysis`),
      as: z.string().describe("the narrower reading"),
      because: z.string().describe("why it is being narrowed"),
    },
    outputSchema: reinterpretationReportSchema,
    handler: (write, { claim, as: narrower, because }) =>
      write.reinterpret({
        of: { kind: "claim", id: claim },
        as: narrower,
        because,
      }),
  }),
] as ReadonlyArray<WriteToolDefinition<z.ZodRawShape>>;
