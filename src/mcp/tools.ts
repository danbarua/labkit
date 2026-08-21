/**
 * The seven read tools, as data.
 *
 * Separated from transport deliberately. A tool here is a name, a description,
 * an input shape and a handler taking `(read, args)` — nothing that needs a
 * server to exist. That is what lets `tests/mcp.test.ts` enumerate the set and
 * call a handler without standing anything up, and it keeps the wiring in
 * `server.ts` down to a loop.
 *
 * **Read-only structurally, not by convention.** A handler receives a
 * `ReadSurface`. There is no write verb in scope to reach for, the same
 * property `src/cli.ts` has and for the same reason.
 *
 * Seven rather than fifteen. `docs/consumer-contract/023` set the bar for the
 * CLI's four and it holds here: these are the questions a caller actually
 * asks. The three the CLI does not have — the two histories and the
 * reproduction check — are here because an agent plausibly asks them and a
 * person at a terminal plausibly does not.
 */

import { z } from "zod";
import type { ReadSurface } from "../domain";

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
  handler(read: ReadSurface, args: z.infer<z.ZodObject<Shape>>): Promise<unknown>;
}

/** Identity, but it pins `Shape` from `inputSchema` so a handler's `args` is typed. */
function tool<Shape extends z.ZodRawShape>(def: ToolDefinition<Shape>): ToolDefinition<Shape> {
  return def;
}

/**
 * The natural-id prefix an artefact carries. `whatDependsOn` takes a name or an
 * explicit reference and **refuses** an ambiguous name rather than answering
 * about the union (S-9), so the caller needs a way to hand in the reference —
 * and over a wire the only handle there is is the id itself.
 */
const ARTEFACT_PREFIX = "ART_";

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
    handler: (read, { gate }) => read.designHistory({ kind: "gate", id: gate }),
  }),

  tool({
    name: "interpretation_history",
    title: "How a claim's reading was narrowed",
    description:
      "How a claim's current reading was arrived at: each earlier wording, the decision that " +
      "narrowed it and why. Takes the proposition as currently worded and walks backwards.",
    inputSchema: { proposition: z.string().describe("the claim's current proposition") },
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
    handler: (read, { analysis }) => read.reproductionOf({ kind: "analysis", id: analysis }),
  }),
] as ReadonlyArray<ToolDefinition<z.ZodRawShape>>;
