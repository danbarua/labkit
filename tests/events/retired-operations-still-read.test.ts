/**
 * A record holding acts no verb writes any more still opens, and every live read answers over it.
 *
 * `fixtures/retired-operations.json` is an event log written by the retired verbs and the acts
 * they built on. Nothing else produces a Review node, a SHARPENS edge, a closed gate, an
 * undecided claim or a retraction, so this is the reads' only coverage of those shapes. The
 * events go through the Postgres event store and the graph projector, as a record on disk does.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ReadSurface, type DomainEvent, type RetiredOperation } from "@labkit/core-domain";
import { pgEventLog } from "@labkit/core-domain/event-store";
import { graphProjector } from "@labkit/core-domain/projection";
import type { ClaimRef } from "@labkit/core-domain/report";
import { TenantGraph } from "@labkit/core-db/graph";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import { PLAIN } from "@labkit/app-cli/palette";
import { renderHappened } from "@labkit/app-cli/views/events";
import { renderWhyDispatch } from "@labkit/app-cli/views/knowledge";
import { setupTestDb, type TestClient, type TestDb } from "../helpers/db";

const fixture = JSON.parse(
  readFileSync("tests/events/fixtures/retired-operations.json", "utf8"),
) as DomainEvent[];

/** Every operation the fixture exercises that no verb writes any more. */
const RETIRED = [
  "sharpen",
  "recordReview",
  "keep",
  "replaceAnalysis",
  "reverify",
  "reinterpret",
  "isUndecided",
  "closeGate",
  "undo",
] as const satisfies readonly RetiredOperation[];

let testDb: TestDb;
let db: TestClient;
let read: ReadSurface;

beforeAll(async () => {
  testDb = await setupTestDb();
  db = await testDb.openClient();
  const ctx = await resolveTenantContext(db, db.tx, "retired-operations");
  const graph = new TenantGraph(ctx, db, db.tx);
  const events = pgEventLog(db, ctx);
  const project = graphProjector(graph);
  for (const { seq: _assignedByTheStore, ...event } of fixture)
    await graph.inTransaction(async () => project.apply(await events.record(event)));
  read = new ReadSurface(graph, { events });
});
afterAll(async () => {
  await testDb.reset();
  await db.close();
  await testDb.close();
});

const why = async (subject: string) => renderWhyDispatch(await read.why({ subject }), PLAIN);

test("the fixture holds one act of every retired operation", () => {
  const operations = new Set(fixture.map((e) => e.operation));
  for (const operation of RETIRED) expect(operations).toContain(operation);
});

test("the log reads back every act, in order, under the operation it was recorded as", async () => {
  const acts = await read.whatHappened({});
  expect(acts.map((e) => [e.seq, e.operation])).toEqual(fixture.map((e) => [e.seq, e.operation]));

  const shown = renderHappened(await read.whatHappenedPage({}), PLAIN);
  for (const operation of RETIRED) expect(shown).toContain(`  ${operation}  `);
  // What the undo took back, which no other read recovers.
  expect(shown).toContain("retracting  Q_22, LOE_22");
  expect(shown).toContain("because opened against the wrong record");
});

test("`now` and every list answer over the record", async () => {
  const standing = await read.now({});
  expect(standing.seq).toBe(fixture.length);
  expect(standing.blocked.gates).toEqual([]);

  expect(await read.gateList({})).toEqual([
    expect.objectContaining({ gate: "GATE_20", state: "closed" }),
  ]);
  expect((await read.workList({})).map((w) => [String(w.work), w.state])).toEqual([
    ["TASK_19", "planned"],
  ]);
  expect((await read.claimList()).map((c) => String(c.claim))).toEqual(
    expect.arrayContaining(["CLM_7", "CLM_15", "CLM_16"]),
  );
  expect((await read.enquiryList()).map((e) => String(e.enquiry))).toEqual(["LOE_3"]);
  expect((await read.analysisList()).map((a) => String(a.analysis))).toEqual(
    expect.arrayContaining(["COMP_5", "COMP_9", "COMP_11", "COMP_14", "COMP_15"]),
  );
  expect((await read.criterionList()).map((c) => String(c.criterion))).toEqual(["CRIT_18"]);
});

describe("`why` explains what each retired act wrote", () => {
  test("sharpen: the narrower question says where it came from", async () => {
    expect(await why("Q_2")).toContain("(DEC_2)  was prompted by the effect was only ever claimed");
  });

  test("recordReview: a review says what it judged and what it was cited by", async () => {
    const shown = await why("REV_8");
    expect(shown).toContain("REV_8 is the mean is pulled by two outlier seeds");
    expect(shown).toContain("(EU_5)  judged one unit of work that was run");
  });

  test("keep: the revision names what it kept", async () => {
    const shown = await why("COMP_9");
    expect(shown).toContain("COMP_9 is a partial revision of COMP_5, 1 of 2 findings");
    expect(shown).toContain("(CLM_7)  the loss curves converge by 10k steps — kept");
  });

  test("replaceAnalysis: the revision names what it superseded", async () => {
    const shown = await why("COMP_14");
    expect(shown).toContain("COMP_14 is a revision of COMP_11");
    expect(shown).toContain("(CLM_12)  the paired difference is positive — superseded");
  });

  test("reverify: the re-run is listed as a re-check of the claim", async () => {
    expect(await why("CLM_7")).toContain("Re-checked by\n  - (COMP_15)  mean over seeds, re-run");
  });

  test("reinterpret: the narrowed claim stands and the reading it replaced says so", async () => {
    expect(await why("CLM_16")).toContain(
      '"annealing lowers the final loss at 10k steps"\n  supported',
    );
    expect(await why("CLM_10")).toContain(
      'replaced by: "annealing lowers the final loss at 10k steps"  (CLM_16)',
    );
  });

  test("isUndecided: the claim reads as settling nothing", async () => {
    expect(await why("CLM_15")).toContain("NOT supported — the finding settles this neither way");
    const support = await read.whySupported({ claim: "CLM_15" as ClaimRef });
    expect(support.verdict).toBe("undecided");
  });

  test("closeGate: the gate is closed, and says why", async () => {
    expect(await why("GATE_20")).toContain(
      "GATE_20 is closed because\n  - (DEC_21)  the long sweep was cancelled",
    );
  });

  test("undo: what it took back is no longer on the record", async () => {
    await expect(read.why({ subject: "LOE_22" })).rejects.toThrow("LOE_22 not found");
    await expect(read.why({ subject: "Q_22" })).rejects.toThrow("Q_22 not found");
  });
});
