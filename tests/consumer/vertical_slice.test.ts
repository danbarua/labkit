/**
 * The consumer vertical slice — three reads, paired worlds, real durable state.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;

/**
 * A frozen clock for the paired-world probes. Deliberate: if a read can tell two worlds apart
 * only because wall-clock time moved between them, it has not distinguished the research
 * states, it has distinguished the test runs.
 */
const clock: Clock = { now: () => "2026-08-20T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

/**
 * Runs two worlds in sequence, each against a genuinely fresh graph, and hands back what the
 * read surface said about each.
 */
async function inTwoWorlds<T>(
  worldA: (s: ResearchSession) => Promise<T>,
  worldB: (s: ResearchSession) => Promise<T>,
): Promise<{ a: T; b: T }> {
  const run = async (build: (s: ResearchSession) => Promise<T>): Promise<T> => {
    const graph = await scenario.begin();
    try {
      return await build(new ResearchSession(graph, { clock, events: inMemoryEventLog() }));
    } finally {
      await scenario.end();
    }
  };
  return { a: await run(worldA), b: await run(worldB) };
}

const CONVERGES = "the pruning schedule shifts the convergence point";

// ---------------------------------------------------------------------------

describe("Probe 1 — orientation: where does this stand, and why?", () => {
  /**
   * The control, and it does more than guard against a self-fulfilling result.
   */
  test("a finding whose prespecified check failed reads differently from one whose check passed", async () => {
    const build = (outcome: "pass" | "fail") => async (s: ResearchSession) => {
      const { enquiry } = await s.writes.openEnquiry("does the pruning schedule move convergence?");
      const { criterion: seedStability } = await s.writes.stateCriterion(
        "stable across five seeds",
      );
      const { observations } = await s.writes.recordObservations({
        enquiry,
        name: "sweep readings",
        finding: "twelve runs across the schedule",
      });
      const { claims: analysisClaims } = await recordAnalysis(s.writes, {
        enquiry,
        method: "convergence-fit",
        from: [observations],
        concludes: [
          {
            proposition: CONVERGES,
            finding: "convergence moves by ~3 steps",
          },
        ],
        heldTo: [seedStability],
      });
      await s.writes.evaluateCriterion({
        criterion: seedStability,
        value:
          outcome === "pass"
            ? "spread 0.4 steps across five seeds"
            : "spread 11 steps across five seeds",
        outcome,
        citing: [claimOf(analysisClaims, CONVERGES)],
      });
      return s.reads.whySupported({ claim: claimOf(analysisClaims, CONVERGES) });
    };

    const { a: passed, b: failed } = await inTwoWorlds(build("pass"), build("fail"));

    expect(passed.verdict).toBe("supported");
    expect(passed.unmet.map((u) => u.requires)).toEqual([]);
    expect(failed.verdict).toBe("standard-unmet");
    expect(failed.unmet.map((u) => u.requires)).toEqual(["stable across five seeds"]);
  });
});

// ---------------------------------------------------------------------------

describe("Probe 2 — historical survey: what did the record hold at time T?", () => {
  /**
   * BAR 4 — ledger row Z. Required by all three designers (cluster 21) in three different
   * vocabularies, which is semantic convergence despite lexical disagreement.
   */
  const FIRST = {
    asks: "does pruning move convergence?",
    prop: "pruning moves convergence",
  };
  const SECOND = {
    asks: "does depth move convergence?",
    prop: "depth moves convergence",
  };

  const settle = async (s: ResearchSession, asks: string, proposition: string) => {
    const { enquiry } = await s.writes.openEnquiry(asks);
    const { observations } = await s.writes.recordObservations({
      enquiry,
      name: `${proposition} readings`,
      finding: `measurements for ${proposition}`,
    });
    await recordAnalysis(s.writes, {
      enquiry,
      method: "paired-comparison",
      from: [observations],
      concludes: [{ proposition, finding: `result for ${proposition}` }],
    });
    await s.writes.isConfirmed({
      claim: await claimNamed(s.reads, proposition),
      because: "re-run under seed control",
    });
    await s.writes.closeEnquiry({
      enquiry,
      answeredBy: await claimNamed(s.reads, proposition),
    });
  };

  const inOrder = (first: typeof FIRST, second: typeof FIRST) => async (s: ResearchSession) => {
    await settle(s, first.asks, first.prop);
    await settle(s, second.asks, second.prop);
    return (await s.reads.whatIsKnown()).established;
  };

  /** A present-tense survey row carries no timestamp a caller could read an as-of answer off. */
  test("a present-tense survey row carries no time", async () => {
    const { a, b } = await inTwoWorlds(inOrder(FIRST, SECOND), inOrder(SECOND, FIRST));

    // Both worlds hold both beliefs. Correct in both -- what is missing is the
    // read itself, not a right answer.
    expect(a.map((q) => q.asks).sort()).toEqual([FIRST.asks, SECOND.asks].sort());
    expect(b.map((q) => q.asks).sort()).toEqual(a.map((q) => q.asks).sort());

    // A survey row carries identity and words, and no time. Adding one here
    // would mean a caller could read an as-of answer off a present-tense result.
    const temporalFields = Object.keys(a[0]!).filter((k) =>
      /as_?of|believ|assert(ed)?_?at|recorded_?at|effective|when|timestamp|version/i.test(k),
    );
    expect(temporalFields).toEqual([]);
    // `answers` names every answering pursuit, claim and polarity, not time. Still no time
    // on the row -- the assertion above is the one that would catch that.
    expect(Object.keys(a[0]!).sort()).toEqual(["answers", "asks", "question"]);
  });

  test("the ordering survives only as a natural-id artefact, which is not a modelled read", async () => {
    const { a, b } = await inTwoWorlds(inOrder(FIRST, SECOND), inOrder(SECOND, FIRST));
    const bySequence = (rows: typeof a) =>
      [...rows]
        .sort((x, y) => Number(x.question.slice(2)) - Number(y.question.slice(2)))
        .map((q) => q.asks);

    // The two histories ARE recoverable -- from id order, which tracks
    // allocation. Recorded because the earlier claim that they were not was
    // wrong, and because this is the channel a probe could cheat through.
    expect(bySequence(a)).toEqual([FIRST.asks, SECOND.asks]);
    expect(bySequence(b)).toEqual([SECOND.asks, FIRST.asks]);

    // And it must not be relied on: the sequence is global, shared across
    // entity types, and not reset between tests. A consumer keying on it
    // would be reading a generator artefact as scientific chronology.
  });
});

// ---------------------------------------------------------------------------

describe("Probe 4 — attribution: who made or authorised the consequential act?", () => {
  /**
   * DEMONSTRATED GAP, and the strongest of the four — ledger row S, required by all three
   * designers across four unanimous clusters of the blinded synthesis.
   */
  test("who closed the question survives only as prose, and cannot be asked for", async () => {
    const build = (closer: string) => async (s: ResearchSession) => {
      const { enquiry } = await s.writes.openEnquiry("is the marginal split difference real?");
      const { observations } = await s.writes.recordObservations({
        enquiry,
        name: "marginal split results",
        // The only place a name can go. It is evidence prose, not attribution.
        finding: `difference 2.1%, CI excludes zero (adjudicated by ${closer})`,
      });
      const { claims: analysisClaims } = await recordAnalysis(s.writes, {
        enquiry,
        method: "paired-comparison",
        from: [observations],
        concludes: [
          {
            proposition: "the difference is real",
            finding: `difference 2.1% (${closer})`,
          },
        ],
      });
      // No actor may be supplied here. That is the whole finding.
      await s.writes.closeEnquiry({
        enquiry,
        answeredBy: claimOf(analysisClaims, "the difference is real"),
      });
      return s.reads.enquiryStatus({ enquiry });
    };

    const { a: byAlice, b: byBob } = await inTwoWorlds(build("Alice"), build("Bob"));

    // Both closed, both answered, and the two worlds agree on everything the
    // read surface treats as structure.
    expect(byAlice.closure).toBe("answered");
    expect(byBob.closure).toBe(byAlice.closure);
    expect(byAlice.bearing).toBe(byBob.bearing);
    expect(byAlice.open).toBe(byBob.open);

    // The difference exists only inside a finding's sentence.
    expect(byAlice.evidence).not.toEqual(byBob.evidence);
    expect(byAlice.evidence.map((e) => e.states).join(" ")).toContain("Alice");

    // And it is not reachable as attribution: no field on the status carries a
    // person, so a caller can only recover the name by parsing evidence prose
    // and guessing which parenthetical is a person. That is the shape of every
    // identity-by-wording defect this project has fixed.
    const attributionFields = Object.keys(byAlice).filter((k) =>
      /author|actor|by$|who|person|approv|decid.*by/i.test(k),
    );
    expect(attributionFields).toEqual([]);
  });
});
