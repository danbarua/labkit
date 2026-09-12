/**
 * The consumer vertical slice — four reads, paired worlds, real durable state.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ReadSurface, ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
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
      const { enquiry } = await s.openEnquiry("does the pruning schedule move convergence?");
      const { criterion: seedStability } = await s.stateCriterion("stable across five seeds");
      const { observations } = await s.recordObservations({
        enquiry,
        name: "sweep readings",
        finding: "twelve runs across the schedule",
      });
      const { claims: analysisClaims } = await recordAnalysis(s, {
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
      await s.evaluateCriterion({
        criterion: seedStability,
        value:
          outcome === "pass"
            ? "spread 0.4 steps across five seeds"
            : "spread 11 steps across five seeds",
        outcome,
        citing: [claimOf(analysisClaims, CONVERGES)],
      });
      return s.whySupported(claimOf(analysisClaims, CONVERGES));
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
    const { enquiry } = await s.openEnquiry(asks);
    const { observations } = await s.recordObservations({
      enquiry,
      name: `${proposition} readings`,
      finding: `measurements for ${proposition}`,
    });
    await recordAnalysis(s, {
      enquiry,
      method: "paired-comparison",
      from: [observations],
      concludes: [{ proposition, finding: `result for ${proposition}` }],
    });
    await s.isConfirmed({
      claim: await claimNamed(s, proposition),
      because: "re-run under seed control",
    });
    await s.closeEnquiry({
      enquiry,
      answeredBy: await claimNamed(s, proposition),
    });
  };

  const inOrder = (first: typeof FIRST, second: typeof FIRST) => async (s: ResearchSession) => {
    await settle(s, first.asks, first.prop);
    await settle(s, second.asks, second.prop);
    return (await s.whatIsKnown()).established;
  };

  /**
   * The as-of answer is a separate read, not a timestamp smuggled onto a present-tense row:
   * `whatWasKnown(at)` exists as its own capability (`known --at` on the CLI, exposed on the
   * MCP server too), distinct from scanning a present-tense survey row for a hint.
   */
  test("the as-of answer is a separate read, not a field on a present-tense row", async () => {
    const { a, b } = await inTwoWorlds(inOrder(FIRST, SECOND), inOrder(SECOND, FIRST));

    // Both worlds hold both beliefs. Correct in both -- what is missing is the
    // read itself, not a right answer.
    expect(a.map((q) => q.asks).sort()).toEqual([FIRST.asks, SECOND.asks].sort());
    expect(b.map((q) => q.asks).sort()).toEqual(a.map((q) => q.asks).sort());

    // A survey row carries identity and words, and no time. Adding one here
    // would mean a caller could read an as-of answer off a present-tense
    // result, which is the leak `whatWasKnown()`'s own docstring refuses.
    const temporalFields = Object.keys(a[0]!).filter((k) =>
      /as_?of|believ|assert(ed)?_?at|recorded_?at|effective|when|timestamp|version/i.test(k),
    );
    expect(temporalFields).toEqual([]);
    // `answers` names every answering pursuit, claim and polarity, not time. Still no time
    // on the row -- the assertion above is the one that would catch that.
    expect(Object.keys(a[0]!).sort()).toEqual(["answers", "asks", "question"]);

    // And the other half: the capability exists, as a read of its own.
    expect(typeof ReadSurface.prototype.whatWasKnown).toBe("function");
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

describe("Probe 3 — reconstruction provenance: what was this reconstructing?", () => {
  /**
   * A durable reconstruction attempt whose remembered fields include its historical target --
   * required by the contract's Designer 2.
   */
  test("reproducibility is a read the caller must already know the answer to", async () => {
    const graph = await scenario.begin();
    try {
      const s = new ResearchSession(graph, {
        clock,
        events: inMemoryEventLog(),
      });
      const { enquiry } = await s.openEnquiry("does the encoding beat the historical control?");

      // The historical control, as it survives: recorded, hashed.
      const { observations: historical } = await s.recordObservations({
        enquiry,
        name: "random control",
        finding: "the 2024 control, as archived",
        contentHash: "sha256:1111",
      });
      const { analysis } = await recordAnalysis(s, {
        enquiry,
        method: "paired-comparison",
        from: [historical],
        concludes: [
          {
            proposition: "the encoding beats the control",
            finding: "difference 2.1%",
          },
        ],
      });

      // A regeneration that does NOT match -- coherent, unlike the first draft.
      const report = await s.reproducibilityOf(analysis, [
        { part: historical, hash: "sha256:2222" },
      ]);
      expect(report.differing.map((p) => p.name)).toEqual(["random control"]);
      expect(report.reproducible).toBe(false);

      // The finding, in two parts. One: the caller had to *pass in* the historical part. The
      // direction of the reconstruction is an argument, supplied by someone who already knew
      // it, and nothing is written down as a result -- reproducibilityOf is a read that
      // persists nothing.
      const provenanceFields = Object.keys(report).filter((k) =>
        /target|reconstruct|attempt|of_?artefact|predecessor|derived_?from|lineage/i.test(k),
      );
      expect(provenanceFields).toEqual([]);
    } finally {
      await scenario.end();
    }
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
      const { enquiry } = await s.openEnquiry("is the marginal split difference real?");
      const { observations } = await s.recordObservations({
        enquiry,
        name: "marginal split results",
        // The only place a name can go. It is evidence prose, not attribution.
        finding: `difference 2.1%, CI excludes zero (adjudicated by ${closer})`,
      });
      const { claims: analysisClaims } = await recordAnalysis(s, {
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
      await s.closeEnquiry({
        enquiry,
        answeredBy: claimOf(analysisClaims, "the difference is real"),
      });
      return s.enquiryStatus(enquiry);
    };

    const { a: byAlice, b: byBob } = await inTwoWorlds(build("Alice"), build("Bob"));

    // Both closed, both answered, and the two worlds agree on everything the
    // read surface treats as structure.
    expect(byAlice.closure).toBe("answered");
    expect(byBob.closure).toBe(byAlice.closure);
    expect(byAlice.answer).toBe(byBob.answer);
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
