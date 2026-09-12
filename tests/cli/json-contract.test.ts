/**
 * Is `--json` the same document an MCP client gets?
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
  restatedSchema,
  closedEnquirySchema,
} from "../../src/mcp/schemas";
import { openScenario, type Scenario } from "../helpers/scenario";

/**
 * Tools whose answer MCP wraps in a single-key object, and the key.
 */
const ENVELOPES: Readonly<Record<string, string>> = {
  claims: "claims",
  pursuits: "enquiries",
  origin: "origin",
  criteria: "criteria",
};

/**
 * Commands whose `--json` is deliberately **not** the MCP document, and why.
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
  heldTo: string[];
  work: string;
  question: string;
  review: string;
};

/**
 * Seeds by driving the **write commands**, not the surfaces.
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
  const secondCriterion = id(await out(["criterion", "the effect holds at n>=20"]), "criterion");
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
    "--held-to",
    secondCriterion,
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
  await out(["is", "confirmed", claim, "--because", "the prespecified check passed"]);
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
  await out(["close", "enquiry", enquiry, "--answered-by", claim]);

  seeded = {
    enquiry,
    claim,
    observations,
    analysis: verified.verification as string,
    gate,
    criterion,
    heldTo: [criterion, secondCriterion],
    work,
    question,
    review,
  };
});

/**
 * Drops this file's graph before the next file runs.
 */
afterAll(async () => {
  await scenario.end();
  await scenario.close();
});

/**
 * Runs one command and returns what it answered with.
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
  const page = JSON.parse(JSON.stringify(answered.value)) as {
    acts: Array<Record<string, unknown>>;
    more: boolean;
  };
  // A page, not a bare array. `--limit` defaults to 50, so a caller filtering
  // the list has to be able to tell a full page from the whole answer.
  expect(page.more).toBe(false);
  expect(page.acts.length).toBeGreaterThan(0);
  // Nested, where the MCP tool flattens.
  expect(page.acts[0]!.attribution).toBeDefined();
  expect(page.acts[0]!.attribution_label).toBeUndefined();
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
    ["is", restatedSchema],
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
test("analyse JSON reports the exact criteria bound to its run", () => {
  const value = JSON.parse(JSON.stringify(written.get("analyse")!.value)) as {
    heldTo: string[];
  };
  expect(value.heldTo).toEqual(seeded.heldTo);
});
