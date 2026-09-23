/**
 * S-11g — "The replacement addressed three of four conclusions."
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
/** The same graph, spoken to by the person who reviews rather than the one who ran it. */
let reviewer: ResearchSession;
let events: EventSink;

const clock: Clock = { now: () => "2026-09-01T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events, attribution: as("Researcher") });
  reviewer = new ResearchSession(graph, { clock, events, attribution: as("Reviewer") });
});
afterEach(async () => {
  await scenario.end();
});

/** Two of Bonsai's four comparisons: one the re-analysis revisits, one it excludes. */
const REVISITED = "T differs from the current-random control";
const SURVIVES = "T differs from the lattice control";
const EXCLUDED = "T differs from the lattice control";
const AGGREGATION = "the aggregation is done on the correct scale";

/**
 * Researcher: "One run, four comparisons. Then we found the aggregation was on the wrong scale
 * for the stochastic controls — but not for the lattice one, and that result stands as final."
 */
async function aRunPartlyReAnalysed(holdTo = false) {
  const { enquiry } = await session.writes.openEnquiry("does T differ from its controls?");
  const { observations } = await session.writes.recordObservations({
    enquiry,
    name: "per-image results",
    finding: "T and four controls, twelve images each",
  });
  // **Held to a criterion only when the test is about one.** `heldTo` is per
  // analysis, so a criterion here qualifies BOTH conclusions -- which makes
  // `supported` on the untouched finding an answer about the check rather than
  // about supersession, and the first test would have been asserting the wrong
  // thing while passing for a reason it did not name.
  const criterion = holdTo
    ? (await session.writes.stateCriterion(AGGREGATION)).criterion
    : undefined;
  const { analysis: v1, claims: v1Claims } = await recordAnalysis(session.writes, {
    enquiry,
    method: "raw-scale aggregation",
    from: [observations],
    ...(criterion === undefined ? {} : { heldTo: [criterion] }),
    concludes: [
      { proposition: REVISITED, finding: "p = 0.03 raw" },
      { proposition: EXCLUDED, finding: "p = 0.41 raw" },
    ],
  });
  return {
    enquiry,
    observations,
    criterion,
    v1,
    revisited: claimOf(v1Claims, REVISITED),
    stands: claimOf(v1Claims, EXCLUDED),
  };
}

/** The re-analysis, naming the one finding that survives it and no other. */
async function theLogScaleReAnalysis(w: Awaited<ReturnType<typeof aRunPartlyReAnalysed>>) {
  const { review } = await reviewer.writes.recordReview({
    of: w.v1,
    verdict: "raw-scale aggregation is untrustworthy for the stochastic-control comparisons",
  });
  // The lattice comparison is what survives, matching the re-analysis's own
  // scope: everything else the run concluded is superseded here.
  const report = await session.writes.keep({
    keeping: [w.stands],
    because: review,
    method: "log-scale re-aggregation",
  });
  const { claims } = await session.writes.conclude({
    analysis: report.replacement,
    proposition: REVISITED,
    finding: "p = 0.007 log",
  });
  return { ...report, claims };
}

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

describe("S-11g — a replacement that addresses only some of a run's conclusions", () => {
  /**
   * The finding nothing named. Both halves matter: a fix that cleared
   * `superseded` while leaving `restingOn` empty would read as a whole fix.
   */
  test("a finding the replacement never named still stands, and still rests on its input", async () => {
    const w = await aRunPartlyReAnalysed();
    await theLogScaleReAnalysis(w);

    const why = await (await afterwards()).reads.whySupported({ claim: w.stands });

    // The claim Bonsai's own record calls final.
    expect(why.superseded).toEqual([]);
    expect(why.verdict).toBe("supported");
    expect(why.support.map((s) => s.finding)).toEqual(["p = 0.41 raw"]);

    // "Resting on nothing" was the visible half of the defect, and it is the
    // sharper assertion: the flag question and the supersession question have
    // one answer, so a fix that cleared `superseded` while leaving `restingOn`
    // empty would be half a fix and read as a whole one.
    expect(why.restingOn.map((r) => r.name)).toEqual(["per-image results"]);
    expect(why.restingOn[0]!.invalidated).toBeUndefined();

    await captureConversation(
      {
        id: "S-11g",
        title: "A replacement that addresses only some of a run's conclusions",
        about:
          "One run drew two comparisons and the re-analysis revisits only one of them; the comparison it kept still stands on its original measurements.",
      },
      events,
    );
  });

  /**
   * The other side of the same act, which is what makes the test above a
   * discriminator rather than a fix that switched everything off.
   */
  test("the finding it did name falls, and names the review that caused it", async () => {
    const w = await aRunPartlyReAnalysed();
    await theLogScaleReAnalysis(w);

    const why = await (await afterwards()).reads.whySupported({ claim: w.revisited });
    expect(why.superseded.map((s) => s.finding)).toEqual(["p = 0.03 raw"]);
    expect(why.superseded[0]!.reason).toContain("raw-scale aggregation is untrustworthy");
  });

  /**
   * The read has to be able to say "I cannot tell", or it is guessing.
   */
  test("a superseded finding whose wording matches two is reported unpaired, not guessed", async () => {
    const { enquiry } = await session.writes.openEnquiry("does T differ from its controls?");
    const { observations } = await session.writes.recordObservations({
      enquiry,
      name: "per-image results",
      finding: "two independent batches",
    });
    // One sentence, two findings: the same claim about two batches.
    const { analysis: v1, claims: v1Claims } = await recordAnalysis(session.writes, {
      enquiry,
      method: "raw-scale aggregation",
      from: [observations],
      concludes: [
        { proposition: REVISITED, finding: "p = 0.03 raw, batch one" },
        { proposition: REVISITED, finding: "p = 0.04 raw, batch two" },
      ],
    });
    const { review } = await reviewer.writes.recordReview({ of: v1, verdict: "wrong scale" });

    // Nothing kept — both fall — and one successor finding asserting the same
    // sentence as each of them.
    const report = await session.writes.replaceAnalysis({
      supersedes: v1,
      because: review,
      method: "log-scale re-aggregation",
    });
    await session.writes.conclude({
      analysis: report.replacement,
      proposition: REVISITED,
      finding: "p = 0.007 log",
    });

    const why = await (await afterwards()).reads.why({ subject: report.replacement });
    if (why.kind !== "analysis") throw new Error(`expected an analysis, got ${why.kind}`);
    // The superseded one is reported, and not paired with the successor: the
    // wording matched more than one finding of the revised analysis.
    expect(why.report.unpaired.map((u) => u.claim).sort()).toEqual(
      v1Claims.map((c) => c.claim).sort(),
    );
    expect(why.report.changed).toEqual([]);
  });

  /**
   * The other half of the test above: named, so not a guess.
   */
  test("a successor that names what it replaces is paired on the handle, not the wording", async () => {
    const { enquiry } = await session.writes.openEnquiry("does T differ from its controls?");
    const { observations } = await session.writes.recordObservations({
      enquiry,
      name: "per-image results",
      finding: "two independent batches",
    });
    // One sentence, two findings: the same claim about two batches.
    const { analysis: v1, claims: v1Claims } = await recordAnalysis(session.writes, {
      enquiry,
      method: "raw-scale aggregation",
      from: [observations],
      concludes: [
        { proposition: REVISITED, finding: "p = 0.03 raw, batch one" },
        { proposition: REVISITED, finding: "p = 0.04 raw, batch two" },
      ],
    });
    const batchTwo = v1Claims[1]!.claim;
    const { review } = await reviewer.writes.recordReview({ of: v1, verdict: "wrong scale" });
    const report = await session.writes.replaceAnalysis({
      supersedes: v1,
      because: review,
      method: "log-scale re-aggregation",
    });

    // The successor names which of the two it stands in place of.
    const { claims } = await session.writes.conclude({
      analysis: report.replacement,
      proposition: REVISITED,
      finding: "p = 0.007 log, batch two",
      replacing: batchTwo,
    });

    const why = await (await afterwards()).reads.why({ subject: report.replacement });
    if (why.kind !== "analysis") throw new Error(`expected an analysis, got ${why.kind}`);

    // Paired, and to the one that was named.
    expect(why.report.changed.map((c) => c.was)).toEqual([batchTwo]);
    expect(why.report.changed[0]!.claim).toBe(claims[0]!.claim);
    expect(why.report.changed[0]!.before).toBe("p = 0.04 raw, batch two");
    expect(why.report.changed[0]!.after).toBe("p = 0.007 log, batch two");
    // The one nothing named is still unpaired -- naming one does not pair both.
    expect(why.report.unpaired.map((u) => u.claim)).toEqual([v1Claims[0]!.claim]);
  });

  /**
   * **The pair, on the evaluations.** A verdict falls or stands according to
   * which finding it cited. Both halves are asserted, because a record that
   * withdrew all of them or none would satisfy either alone.
   */
  test("an evaluation citing a superseded finding falls; one citing an untouched finding stands", async () => {
    // Two worlds identical but for which finding the one verdict was reached
    // against. One evaluation each, so the check's state is that verdict's
    // standing and not an aggregate over two.
    const state = async (cites: "revisited" | "stands") => {
      const w = await aRunPartlyReAnalysed(true);
      if (w.criterion === undefined) throw new Error("unreachable: asked for a criterion");
      await session.writes.evaluateCriterion({
        criterion: w.criterion,
        value: "raw scale",
        outcome: "fail",
        citing: [cites === "revisited" ? w.revisited : w.stands],
      });
      await theLogScaleReAnalysis(w);
      const why = await (await afterwards()).reads.whySupported({ claim: w.stands });
      return why.standard.find((c) => c.proposition === AGGREGATION)?.state;
    };

    // The verdict reached against the finding this act superseded falls with
    // it.
    expect(await state("revisited")).toBe("no-standing-verdict");
    await scenario.end();
    const graph = await scenario.begin();
    events = inMemoryEventLog();
    session = new ResearchSession(graph, { clock, events, attribution: as("Researcher") });
    reviewer = new ResearchSession(graph, { clock, events, attribution: as("Reviewer") });

    // The verdict reached against the finding this act never mentioned does
    // not.
    expect(await state("stands")).toBe("failed");
  });

  /**
   * A verdict belongs to the finding it was about. When that finding is replaced, the verdict
   * goes with it and the successor has not been checked: its check is never-run, not failed,
   * and a gate whose other findings passed is incomplete rather than blocked.
   */
  test("a verdict about a superseded finding leaves with it; its successor is unchecked", async () => {
    const w = await aRunPartlyReAnalysed(true);
    if (w.criterion === undefined) throw new Error("unreachable: asked for a criterion");
    const { work } = await session.writes.planWork({
      objective: "report the stochastic-control comparison",
      acceptance: "the aggregation scale is settled first",
    });
    const { gate } = await session.writes.declareGate({
      governedBy: [w.criterion],
      consequence:
        "the stochastic-control comparison is reported only once its aggregation is right",
      protecting: [work],
    });
    await session.writes.evaluateCriterion({
      criterion: w.criterion,
      gate,
      value: "raw scale",
      outcome: "fail",
      about: w.revisited,
    });
    await session.writes.evaluateCriterion({
      criterion: w.criterion,
      gate,
      value: "lattice control aggregated on the log scale",
      outcome: "pass",
      about: w.stands,
    });
    expect((await session.reads.gateStatus({ gate })).state).toBe("blocked");

    const { claims } = await theLogScaleReAnalysis(w);
    const successor = claimOf(claims, REVISITED);
    const later = await afterwards();
    const status = await later.reads.gateStatus({ gate });
    expect(status.state).toBe("incomplete");
    expect(status.checks.map((c) => `${c.about} ${c.state}`).sort()).toEqual(
      [`${w.stands} passed`, `${successor} never-run`].sort(),
    );
  });

  /**
   * **The pairing the act implies is recorded by the act.**
   */
  test("a successor is paired to the finding it replaces, with nothing named", async () => {
    const { enquiry } = await session.writes.openEnquiry("does T differ from its controls?");
    const { observations } = await session.writes.recordObservations({
      enquiry,
      name: "per-image results",
      finding: "one batch",
    });
    const { analysis: v1, claims: v1Claims } = await recordAnalysis(session.writes, {
      enquiry,
      method: "raw-scale aggregation",
      from: [observations],
      concludes: [{ proposition: REVISITED, finding: "p = 0.03 raw" }],
    });
    const { review } = await reviewer.writes.recordReview({ of: v1, verdict: "wrong scale" });
    const report = await session.writes.replaceAnalysis({
      supersedes: v1,
      because: review,
      method: "log-scale re-aggregation",
    });
    const { claims } = await session.writes.conclude({
      analysis: report.replacement,
      proposition: REVISITED,
      finding: "p = 0.007 log",
    });

    const why = await (await afterwards()).reads.why({ subject: report.replacement });
    if (why.kind !== "analysis") throw new Error(`expected an analysis, got ${why.kind}`);
    expect(why.report.unpaired).toEqual([]);
    expect(why.report.changed.map((c) => c.was)).toEqual([v1Claims[0]!.claim]);
    expect(why.report.changed[0]!.claim).toBe(claims[0]!.claim);
    expect(why.report.changed[0]!.before).toBe("p = 0.03 raw");
    expect(why.report.changed[0]!.after).toBe("p = 0.007 log");
  });

  /**
   * **A kept finding still stands, so nothing replaces it.**
   */
  test("a conclusion is never paired to a finding the revision kept", async () => {
    const events = inMemoryEventLog();
    const graph = await scenario.current();
    session = new ResearchSession(graph, { clock, events, attribution: as("Researcher") });
    reviewer = new ResearchSession(graph, { clock, events, attribution: as("Reviewer") });
    const { enquiry } = await session.writes.openEnquiry("does T differ from its controls?");
    const { observations } = await session.writes.recordObservations({
      enquiry,
      name: "per-image results",
      finding: "one batch",
    });
    const { analysis: v1, claims: v1Claims } = await recordAnalysis(session.writes, {
      enquiry,
      method: "raw-scale aggregation",
      from: [observations],
      concludes: [
        { proposition: REVISITED, finding: "p = 0.03 raw" },
        { proposition: SURVIVES, finding: "the lattice comparison, unaffected by scale" },
      ],
    });
    const { review } = await reviewer.writes.recordReview({ of: v1, verdict: "wrong scale" });
    const report = await session.writes.keep({
      keeping: [claimOf(v1Claims, SURVIVES)],
      because: review,
      method: "log-scale re-aggregation",
    });

    // On the proposition that was KEPT, not the one that fell.
    await session.writes.conclude({
      analysis: report.replacement,
      proposition: SURVIVES,
      finding: "the lattice comparison again, on the log scale",
    });

    // **Asserted on what the act wrote, not on a report.** No read shows this:
    // `analysisRevision` iterates the claims the LINEAGE decision superseded, and
    // `withdrawalOf` needs every claim asserting a proposition to have fallen -- the
    // successor's own conclusion keeps it standing.
    const superseding = (await events.all())
      .flatMap((e) => e.changes)
      .filter((c) => c.change === "EdgeCreated" && c.label === "SUPERSEDES")
      .map((c) => (c as { to: string }).to);
    expect(superseding).not.toContain(claimOf(v1Claims, SURVIVES));

    const later = await afterwards();
    const why = await later.reads.why({ subject: report.replacement });
    if (why.kind !== "analysis") throw new Error(`expected an analysis, got ${why.kind}`);
    // What did fall is the other conclusion, and this act did not answer it.
    expect(why.report.unpaired.map((u) => u.claim)).toEqual([claimOf(v1Claims, REVISITED)]);
  });
});
