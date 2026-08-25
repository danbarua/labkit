/**
 * Is `--json` the same document an MCP client gets?
 *
 * It should be, and this is where that stops being an intention. The CLI
 * answers with the domain report unaltered; `src/mcp/schemas.ts` is pinned to
 * `src/domain/report.ts` at compile time. So a report serialised by the CLI
 * must parse against the schema the MCP tool declares for the same verb, and
 * the schemas are `strictObject` — an extra key fails, not just a missing one.
 *
 * **The CLI does not import those schemas.** The dependency lives here, in a
 * test, rather than in `src/cli/`: the claim is about two adapters agreeing,
 * and putting it in one of them would make the other's shape a consequence
 * instead of a check.
 *
 * Two honest exceptions, both MCP's and both recorded with reasons rather than
 * quietly skipped. See {@link ENVELOPES} and {@link RESHAPED}.
 *
 * The commands run against a seeded scenario graph with **no database
 * connection** — `Run` is injected into the program precisely so the command
 * layer can be exercised without `connectDb`, a tenant, or a process to exit.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { z } from "zod";
import { ReadSurface, WriteSurface, inMemoryEventLog } from "../../src/domain";
import type { ClaimRef, EnquiryRef } from "../../src/domain";
import { buildProgram } from "../../src/cli/program";
import type { Answer } from "../../src/cli/output";
import type { Run, Surfaces } from "../../src/cli/session";
import {
  claimsAssertingSchema,
  conflictVerdictSchema,
  criteriaGoverningSchema,
  dependencyReportSchema,
  designHistorySchema,
  enquiryStatusSchema,
  gateStatusSchema,
  interpretationHistorySchema,
  knowledgeSurveySchema,
  historicalSurveySchema,
  originOfSchema,
  pursuitsSchema,
  reproducibilityReportSchema,
  reproductionReportSchema,
  supportExplanationSchema,
  taskContractSchema,
} from "../../src/mcp/schemas";
import { openScenario, type Scenario } from "../helpers/scenario";

/**
 * Tools whose answer MCP wraps in a single-key object, and the key.
 *
 * Not a difference of content. `structuredContent` must be an object, so a tool
 * whose answer is a bare array or a bare handle has to put it under a name. The
 * terminal has no such constraint and prints the array. Reshaping the CLI to
 * match a wire format it does not use would be the tail wagging the dog, so the
 * assertion unwraps instead.
 */
const ENVELOPES: Readonly<Record<string, string>> = {
  claims: "claims",
  pursuits: "enquiries",
  origin: "origin",
  criteria: "criteria",
};

/**
 * Commands whose `--json` is deliberately **not** the MCP document, and why.
 *
 * One, and it is a real divergence rather than an envelope. `what_happened`
 * flattens each event's `attribution` into three sibling keys and defaults an
 * absent `seq` to `0`, which is a wire shape chosen for a tool caller. The CLI
 * prints the `DomainEvent` as the domain holds it, nested attribution and all,
 * because a person reading `--json` is reading the record and an absent `seq`
 * is not a zero.
 *
 * Recorded here rather than skipped silently: the next person to ask "is
 * `--json` the MCP document?" gets *yes, except here, for this reason*.
 */
const RESHAPED: Readonly<Record<string, string>> = {
  happened:
    "the MCP tool flattens attribution and defaults `seq` to 0; the CLI prints the DomainEvent as held",
};

let scenario: Scenario;
let surfaces: Surfaces;
let seeded: {
  enquiry: EnquiryRef;
  claim: ClaimRef;
  observations: string;
  analysis: string;
  gate: string;
  criterion: string;
  work: string;
  question: string;
  review: string;
};

beforeAll(async () => {
  scenario = await openScenario();
  const graph = await scenario.begin();
  const events = inMemoryEventLog();
  surfaces = { read: new ReadSurface(graph, { events }), write: new WriteSurface(graph, { events }) };

  const write = surfaces.write;
  const enquiry = await write.openEnquiry("does the schedule move convergence?");
  const observations = await write.recordObservations({
    enquiry,
    name: "depth-sweep-raw",
    finding: "step counts at depths 4..20",
    contentHash: "sha256:9f2b",
  });
  const work = await write.planWork({
    objective: "sweep depth 4 through 20",
    acceptance: "n>=20 at each depth",
    mayRead: ["depth-sweep-raw"],
  });
  const criterion = await write.stateCriterion("the effect holds at n>=20");
  const gate = await write.declareGate({
    governedBy: [criterion],
    consequence: "the result may not be built on until this holds",
    protecting: [work],
  });
  const recorded = await write.recordAnalysis({
    enquiry,
    method: "paired comparison",
    from: [observations],
    implementing: work,
    heldTo: [criterion],
    concludes: [
      { proposition: "the schedule moves convergence", finding: "~3 steps earlier at every depth" },
    ],
  });
  const claim = recorded.claims[0]!.claim;
  await write.evaluateCriterion({ criterion, gate, value: "n=24", outcome: "pass" });
  await write.promote({ claim, because: "the prespecified check passed" });
  const review = await write.recordReview({ of: recorded.analysis, verdict: "sound" });
  const verification = await write.reverify({
    historical: recorded.analysis,
    enquiry,
    method: "replication at n=24",
    under: [observations],
    concludes: { proposition: "the schedule moves convergence", finding: "holds at n=24" },
  });
  const question = (await surfaces.read.enquiryStatus(enquiry)).question!.question;

  seeded = {
    enquiry,
    claim,
    observations,
    analysis: verification.verification,
    gate,
    criterion,
    work,
    question,
    review,
  };
});

afterAll(async () => {
  await scenario.end();
  await scenario.close();
});

/**
 * Runs one command and returns what it answered with.
 *
 * A fresh program per invocation, because commander accumulates parsed option
 * values on the command objects it builds — reusing one would let an earlier
 * `--at` leak into a later `known`.
 */
async function invoke(argv: string[]): Promise<Answer> {
  let captured: Answer | undefined;
  const run: Run = async (work) => void (captured = await work(surfaces));
  const program = buildProgram(run);
  program.exitOverride();
  await program.parseAsync(argv, { from: "user" });
  if (!captured) throw new Error(`\`${argv.join(" ")}\` answered with nothing`);
  return captured;
}

/** Parses through JSON first, so the assertion sees exactly what a caller sees. */
function serialised(answer: Answer, command: string): unknown {
  const value = JSON.parse(JSON.stringify(answer.value));
  const key = ENVELOPES[command];
  return key === undefined ? value : { [key]: value };
}

test("every read command's --json parses against the MCP schema for the same verb", async () => {
  const cases: Array<[command: string, argv: string[], schema: z.ZodType]> = [
    ["known", ["known"], knowledgeSurveySchema],
    ["known", ["known", "--at", new Date().toISOString()], historicalSurveySchema],
    ["why", ["why", seeded.claim], supportExplanationSchema],
    ["claims", ["claims", "the schedule moves convergence"], claimsAssertingSchema],
    ["conflict", ["conflict", seeded.claim, seeded.claim], conflictVerdictSchema],
    ["pursuits", ["pursuits", seeded.question], pursuitsSchema],
    ["origin", ["origin", seeded.question], originOfSchema],
    ["enquiry", ["enquiry", seeded.enquiry], enquiryStatusSchema],
    ["gate", ["gate", seeded.gate], gateStatusSchema],
    ["criteria", ["criteria", seeded.gate], criteriaGoverningSchema],
    ["design", ["design", seeded.gate], designHistorySchema],
    ["contract", ["contract", seeded.work], taskContractSchema],
    ["interpretation", ["interpretation", seeded.claim], interpretationHistorySchema],
    ["reproduction", ["reproduction", seeded.analysis], reproductionReportSchema],
    ["reproducibility", ["reproducibility", seeded.analysis], reproducibilityReportSchema],
    ["affects", ["affects", "depth-sweep-raw"], dependencyReportSchema],
  ];

  // Guards the table itself: a case list that silently emptied would make this
  // pass by having nothing to check.
  expect(cases.length).toBeGreaterThan(10);

  for (const [command, argv, schema] of cases) {
    const parsed = schema.safeParse(serialised(await invoke(argv), command));
    if (!parsed.success) {
      throw new Error(
        `\`labkit --json ${argv.join(" ")}\` does not match the MCP schema:\n` +
          JSON.stringify(parsed.error.issues, null, 2),
      );
    }
  }
});

test("the one command whose --json is not the MCP document says so", async () => {
  // The exception is asserted, not assumed. If `what_happened` ever stops
  // reshaping, this reddens and the entry in RESHAPED comes out.
  expect(Object.keys(RESHAPED)).toEqual(["happened"]);
  const answered = await invoke(["happened"]);
  const events = JSON.parse(JSON.stringify(answered.value)) as Array<Record<string, unknown>>;
  expect(events.length).toBeGreaterThan(0);
  // Nested, where the MCP tool flattens.
  expect(events[0]!.attribution).toBeDefined();
  expect(events[0]!.attribution_label).toBeUndefined();
});
