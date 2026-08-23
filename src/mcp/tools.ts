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
  acknowledgementSchema,
  analysisRefSchema,
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
const QUESTION_PREFIX = "Q_";
const ENQUIRY_PREFIX = "LOE_";

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
      "wording (`withdrawn`, with `replacedBy`). Refuses when the same sentence is asserted " +
      "in more than one line of enquiry: pass `analysis` to say which one, rather than " +
      "retrying the bare proposition. A claim is identified by its proposition within an " +
      "enquiry, never by wording alone.",
    inputSchema: {
      proposition: z.string().describe("the claim's proposition, as worded"),
      analysis: z
        .string()
        .optional()
        .describe("id of the analysis that concluded it — needed only when the wording is ambiguous"),
    },
    outputSchema: supportExplanationSchema,
    handler: (read, { proposition, analysis }) =>
      read.whySupported(
        analysis ? { analysis: { kind: "analysis", id: analysis }, proposition } : proposition,
      ),
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
    inputSchema: { enquiry: z.string().describe("enquiry id") },
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
    inputSchema: { gate: z.string().describe("gate id") },
    outputSchema: designHistorySchema,
    handler: (read, { gate }) => read.designHistory({ kind: "gate", id: gate }),
  }),

  tool({
    name: "interpretation_history",
    title: "How a claim's reading was narrowed",
    description:
      "How a claim's current reading was arrived at: each earlier wording, the decision that " +
      "narrowed it and why. Takes the proposition as currently worded and walks backwards.",
    inputSchema: { proposition: z.string().describe("the claim's current proposition") },
    outputSchema: interpretationHistorySchema,
    handler: (read, { proposition }) => read.interpretationHistory(proposition),
  }),

  tool({
    name: "reproduction_of",
    title: "Whether a re-run reproduced its original",
    description:
      "What a verifying analysis re-checked and whether it reproduced the original — derived " +
      "from what each run recorded consuming, not from a stored flag, so there is no value " +
      "anyone can set to `reproduced`. Takes the id of the analysis that did the verifying, " +
      "not the one being verified.",
    inputSchema: { analysis: z.string().describe("id of the verifying analysis") },
    outputSchema: reproductionReportSchema,
    handler: (read, { analysis }) => read.reproductionOf({ kind: "analysis", id: analysis }),
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
const ANALYSIS_PREFIX = "COMP_";

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
    outputSchema: analysisRefSchema,
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
      "Close an enquiry, answered or abandoned. Give `answered_by` — the analysis and the " +
      "proposition it concluded — to close it as answered; omit it to abandon. Closing an " +
      "already-closed enquiry is refused rather than recorded twice.",
    inputSchema: {
      enquiry: z.string().describe(`enquiry id, e.g. ${ENQUIRY_PREFIX}7`),
      answered_by_analysis: z
        .string()
        .optional()
        .describe(`id of the analysis that answered it, e.g. ${ANALYSIS_PREFIX}3`),
      answered_by_proposition: z
        .string()
        .optional()
        .describe("the proposition that analysis concluded"),
    },
    outputSchema: acknowledgementSchema,
    handler: async (write, { enquiry, answered_by_analysis, answered_by_proposition }) => {
      if ((answered_by_analysis === undefined) !== (answered_by_proposition === undefined)) {
        throw new Error(
          "answered_by_analysis and answered_by_proposition go together: give both to close as answered, or neither to abandon",
        );
      }
      await write.closeEnquiry({
        enquiry: { kind: "enquiry", id: enquiry },
        ...(answered_by_analysis === undefined || answered_by_proposition === undefined
          ? {}
          : {
              answeredBy: {
                analysis: { kind: "analysis", id: answered_by_analysis },
                proposition: answered_by_proposition,
              },
            }),
      });
      return { ok: true as const, acted: enquiry };
    },
  }),
] as ReadonlyArray<WriteToolDefinition<z.ZodRawShape>>;
