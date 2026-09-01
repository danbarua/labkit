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
import type { z } from "zod";
import { ReadSurface, WriteSurface, inMemoryEventLog } from "../../src/domain";
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
  explanationSchema,
  taskContractSchema,
  openedEnquirySchema,
  recordedObservationsSchema,
  plannedWorkSchema,
  statedCriterionSchema,
  declaredGateSchema,
  recordedAnalysisSchema,
  recordedReviewSchema,
  verificationReportSchema,
  evaluatedCriterionSchema,
  promotedSchema,
  closedEnquirySchema,
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

/** Every write command's answer, by command name, captured while seeding. */
const written = new Map<string, Answer>();

/** Handles the read cases need. Named fields, so `noUncheckedIndexedAccess`
 *  does not make every one of them `string | undefined`. */
let seeded: {
  enquiry: string;
  claim: string;
  observations: string;
  analysis: string;
  gate: string;
  criterion: string;
  work: string;
  question: string;
  review: string;
};

/**
 * Seeds by driving the **write commands**, not the surfaces.
 *
 * Two things at once, deliberately. The read cases below need a graph with
 * something in it, and the write commands need exercising against the same
 * schemas — so the seed *is* the write-command test rather than a fixture
 * beside it. A seed built through `surfaces.write` would leave every write
 * command unrun while the file claimed to check the CLI's JSON.
 */
beforeAll(async () => {
  scenario = await openScenario();
  const graph = await scenario.begin();
  const events = inMemoryEventLog();
  surfaces = {
    read: new ReadSurface(graph, { events }),
    write: new WriteSurface(graph, { events }),
  };

  const out = async (argv: string[]): Promise<Record<string, unknown>> => {
    const answered = await invoke(argv);
    written.set(argv[0]!, answered);
    return JSON.parse(JSON.stringify(answered.value)) as Record<string, unknown>;
  };
  const id = (v: Record<string, unknown>, key: string) => v[key] as string;

  const enquiry = id(await out(["open", "does the schedule move convergence?"]), "enquiry");
  const observations = id(
    await out([
      "observe",
      enquiry,
      "--name",
      "depth-sweep-raw",
      "--finding",
      "step counts at depths 4..20",
      "--hash",
      "sha256:9f2b",
    ]),
    "observations",
  );
  const work = id(
    await out([
      "plan",
      "--objective",
      "sweep depth 4 through 20",
      "--acceptance",
      "n>=20 at each depth",
      "--may-read",
      "depth-sweep-raw",
    ]),
    "work",
  );
  const criterion = id(await out(["criterion", "the effect holds at n>=20"]), "criterion");
  const gate = id(
    await out([
      "declare",
      "--governed-by",
      criterion,
      "--consequence",
      "the result may not be built on until this holds",
      "--protecting",
      work,
    ]),
    "gate",
  );
  const recorded = await out([
    "analyse",
    enquiry,
    "--method",
    "paired comparison",
    "--from",
    observations,
    "--implementing",
    work,
    "--held-to",
    criterion,
  ]);
  const analysis = recorded.analysis as string;
  // A second call: `analyse` records the run, `conclude` records a finding.
  const concluded = await out([
    "conclude",
    analysis,
    "--proposition",
    "the schedule moves convergence",
    "--finding",
    "~3 steps earlier at every depth",
  ]);
  const claim = (concluded.claims as Array<{ claim: string }>)[0]!.claim;

  await out(["evaluate", criterion, "--gate", gate, "--value", "n=24", "--outcome", "pass"]);
  await out(["promote", claim, "--because", "the prespecified check passed"]);
  const review = id(await out(["review", analysis, "--verdict", "sound"]), "review");
  const verified = await out([
    "reverify",
    analysis,
    "--enquiry",
    enquiry,
    "--method",
    "replication at n=24",
    "--under",
    observations,
    "--proposition",
    "the schedule moves convergence",
    "--finding",
    "holds at n=24",
  ]);
  const question = (await surfaces.read.enquiryStatus(enquiry as never)).question!.question;
  await out(["close", enquiry, "--answered-by", claim]);

  seeded = {
    enquiry,
    claim,
    observations,
    analysis: verified.verification as string,
    gate,
    criterion,
    work,
    question,
    review,
  };
});

/**
 * Drops this file's graph before the next file runs.
 *
 * `end()` is what resets — `close()` alone only closes the connection. Leaving
 * it out is invisible here and fails somewhere else: this file's tenant graph
 * survived into `tests/scenarios/s18`, whose reader then found a question this
 * file had established and asserted `established` was empty. Nothing in this
 * file went red, and no check looks for a missing teardown.
 */
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
  const run: Run = async (work) => {
    captured = await work(surfaces);
  };
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
    ["why", ["why", seeded.claim], explanationSchema],
    ["why", ["why", seeded.work], explanationSchema],
    ["why", ["why", seeded.enquiry], explanationSchema],
    ["why", ["why", seeded.gate], explanationSchema],
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

test("every write command's --json parses against the MCP schema for the same verb", () => {
  // Captured while seeding, above — the seed drives the write commands rather
  // than the surfaces, so these are the real answers and not a fixture.
  const cases: Array<[command: string, schema: z.ZodType]> = [
    ["open", openedEnquirySchema],
    ["observe", recordedObservationsSchema],
    ["plan", plannedWorkSchema],
    ["criterion", statedCriterionSchema],
    ["declare", declaredGateSchema],
    ["analyse", recordedAnalysisSchema],
    ["review", recordedReviewSchema],
    ["reverify", verificationReportSchema],
    ["evaluate", evaluatedCriterionSchema],
    ["promote", promotedSchema],
    ["close", closedEnquirySchema],
  ];

  expect(cases.length).toBeGreaterThan(8);
  expect(written.size).toBeGreaterThanOrEqual(cases.length);

  for (const [command, schema] of cases) {
    const answered = written.get(command);
    if (!answered) throw new Error(`\`${command}\` was never run while seeding`);
    const parsed = schema.safeParse(JSON.parse(JSON.stringify(answered.value)));
    if (!parsed.success) {
      throw new Error(
        `\`labkit --json ${command} …\` does not match the MCP schema:\n` +
          JSON.stringify(parsed.error.issues, null, 2),
      );
    }
  }
});
