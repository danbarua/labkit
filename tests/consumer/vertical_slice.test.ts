/**
 * The consumer vertical slice — four reads, paired worlds, real durable state.
 *
 * docs/consumer-contract/023_post_review_standing.md §"Next".
 *
 * The Bonsai corpus is exhausted and fifteen scenarios never moved the noun
 * inventory. Three cold designers then derived a read contract without seeing
 * the ontology, and three of their requirements survived a representation test
 * on paper. This file is the same test against **running code**.
 *
 * The method, and why it is not the scenario method:
 *
 *   1. build two durable research worlds the contract must tell apart;
 *   2. ask the public read surface;
 *   3. if it returns the same answer, that is a demonstrated failure rather
 *      than an absence.
 *
 * PJ-011 §5 refuses to let a missing feature earn anything, because an empty
 * result is unanswerable rather than wrong. A paired world is the way past
 * that: the two states genuinely differ, the contract genuinely requires them
 * apart, and the record genuinely cannot say which one it holds. Nothing is
 * fixed here — this file only establishes which failures are real.
 *
 * Imports only src/domain, never src/db (enforced — see .dependency-cruiser.cjs).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;

/**
 * A fixed clock. Deliberate: if a read can tell two worlds apart only because
 * wall-clock time moved between them, it has not distinguished the research
 * states, it has distinguished the test runs.
 */
const clock: Clock = { now: () => "2026-08-20T09:00:00.000Z" };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });

/**
 * Runs two worlds in sequence, each against a genuinely fresh graph, and hands
 * back what the read surface said about each.
 *
 * Sequential rather than side by side because one connection per test is this
 * repo's containment strategy for a live pglite-socket bug (tests/helpers/db.ts).
 * `end()` truncates, so world B cannot see world A.
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
   * The control, and it must pass. If a probe designed to find gaps finds
   * nothing but gaps, it is measuring its own construction. This is the
   * question LabKit was built for, so it should answer it.
   *
   * The worlds differ in one respect a researcher cares about: whether a
   * prespecified robustness condition held. Story 3's "formally significant
   * computation that remains insufficient evidence" is exactly this.
   */
  test("a finding whose prespecified check failed reads differently from one whose check passed", async () => {
    const build = (outcome: "pass" | "fail") => async (s: ResearchSession) => {
      const enquiry = await s.openEnquiry("does the pruning schedule move convergence?");
      const seedStability = await s.stateCriterion("stable across five seeds");
      const observations = await s.recordObservations({
        enquiry, name: "sweep readings", finding: "twelve runs across the schedule",
      });
      const analysis = await s.recordAnalysis({
        enquiry, method: "convergence-fit", from: [observations],
        concludes: [{ proposition: CONVERGES, finding: "convergence moves by ~3 steps" }],
        heldTo: [seedStability],
      });
      await s.evaluateCriterion({
        criterion: seedStability,
        value: outcome === "pass" ? "spread 0.4 steps across five seeds" : "spread 11 steps across five seeds",
        outcome,
        citing: { analysis, proposition: CONVERGES },
      });
      return s.whySupported({ analysis, proposition: CONVERGES });
    };

    const { a: passed, b: failed } = await inTwoWorlds(build("pass"), build("fail"));

    expect(passed.supported).toBe(true);
    expect(passed.unmet).toEqual([]);
    expect(failed.supported).toBe(false);
    expect(failed.unmet).toEqual(["stable across five seeds"]);
  });
});

// ---------------------------------------------------------------------------

describe("Probe 2 — historical survey: what did the record hold at time T?", () => {
  /**
   * DEMONSTRATED GAP — ledger row Z, and cluster 21 of the blinded synthesis,
   * where all three designers required it in three different vocabularies.
   *
   * Two programmes settle the same two questions in opposite orders. A reader
   * asking "what did we hold once the first question was answered, but before
   * the second?" needs them apart. `whatIsKnown()` is the only survey read and
   * takes no time argument, so both worlds return the same thing.
   *
   * This is not "the feature is missing". The two research histories genuinely
   * differ, a researcher genuinely asks this, and the durable record cannot
   * say which history produced it.
   */
  test("two opposite orderings of belief are one indistinguishable answer", async () => {
    const settle = async (s: ResearchSession, asks: string, proposition: string) => {
      const enquiry = await s.openEnquiry(asks);
      const observations = await s.recordObservations({
        enquiry, name: `${proposition} readings`, finding: `measurements for ${proposition}`,
      });
      const analysis = await s.recordAnalysis({
        enquiry, method: "paired-comparison", from: [observations],
        concludes: [{ proposition, finding: `result for ${proposition}` }],
      });
      await s.promote({ claim: { analysis, proposition }, because: "re-run under seed control" });
      await s.closeEnquiry({ enquiry, answeredBy: { analysis, proposition } });
    };

    const FIRST = { asks: "does pruning move convergence?", prop: "pruning moves convergence" };
    const SECOND = { asks: "does depth move convergence?", prop: "depth moves convergence" };

    const survey = async (s: ResearchSession) => {
      const known = await s.whatIsKnown();
      return known.established.map((q) => q.asks).sort();
    };

    const { a, b } = await inTwoWorlds(
      async (s) => { await settle(s, FIRST.asks, FIRST.prop); await settle(s, SECOND.asks, SECOND.prop); return survey(s); },
      async (s) => { await settle(s, SECOND.asks, SECOND.prop); await settle(s, FIRST.asks, FIRST.prop); return survey(s); },
    );

    // Both worlds hold both beliefs, which is right and is not the finding.
    expect(a).toEqual([SECOND.asks, FIRST.asks].sort());
    // The finding: the orders are gone. Nothing distinguishes a programme that
    // believed FIRST while SECOND was still open from one that believed SECOND
    // while FIRST was still open, and those are different scientific histories.
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------

describe("Probe 3 — reconstruction provenance: what was this reconstructing?", () => {
  /**
   * DEMONSTRATED GAP — ledger row F, required by Designer 2, which named a
   * durable "Reconstruction attempt" whose remembered fields include its
   * historical target.
   *
   * PJ-021 stated this gap in almost these words and correctly refused to let
   * it earn anything, because an unanswerable question is not a wrong answer.
   * The paired world is what changes that: one artefact reconstructs a lost
   * historical control, the other is fresh work that happens to share its name,
   * and every read returns the same thing about both.
   */
  test("a reconstruction and unrelated fresh work are the same durable state", async () => {
    const build = (finding: string) => async (s: ResearchSession) => {
      const enquiry = await s.openEnquiry("does the encoding beat the historical control?");
      const rebuilt = await s.recordObservations({
        enquiry, name: "random control", finding, contentHash: "sha256:aaaa",
      });
      const analysis = await s.recordAnalysis({
        enquiry, method: "paired-comparison", from: [rebuilt],
        concludes: [{ proposition: "the encoding beats the control", finding: "difference 2.1%" }],
      });
      const why = await s.whySupported({ analysis, proposition: "the encoding beats the control" });
      return { restingOn: why.restingOn, support: why.support };
    };

    const { a: reconstruction, b: freshWork } = await inTwoWorlds(
      // A: regenerated from an inferred algorithm, standing in for a lost original.
      build("regenerated control, algorithm inferred from the 2024 write-up"),
      // B: a control generated for this study, owing nothing to any predecessor.
      build("control generated for this study under the recorded procedure"),
    );

    // Both name the same artefact, which is correct -- S-9 settled that two
    // artefacts may legitimately share a logical name.
    expect(reconstruction.restingOn).toEqual(["random control"]);
    expect(freshWork.restingOn).toEqual(reconstruction.restingOn);

    // The finding: what a reader can recover is identical in structure. The
    // only trace that one of these reconstructs something is a sentence a human
    // wrote in a finding -- which is identity by wording, the error this project
    // has now fixed in six regions, reappearing as the *only* available answer.
    expect(Object.keys(reconstruction)).toEqual(Object.keys(freshWork));
    expect(reconstruction.support.map((x) => x.via)).toEqual(freshWork.support.map((x) => x.via));
  });
});

// ---------------------------------------------------------------------------

describe("Probe 4 — attribution: who made or authorised the consequential act?", () => {
  /**
   * DEMONSTRATED GAP, and the strongest of the four — ledger row S, required by
   * all three designers across four unanimous clusters of the blinded synthesis.
   *
   * It is stronger than probes 2 and 3 for a reason worth stating precisely:
   * those two worlds *can* be built and then cannot be read apart. Here the two
   * worlds **cannot be built at all**. `closeEnquiry` takes
   * `{ enquiry, answeredBy? }` and no verb on the surface accepts an actor, so
   * a researcher who wants the record to say who closed a question has exactly
   * one route -- write the name into a finding's prose.
   *
   * That is not a workaround, it is the failure. The project has spent six
   * regions establishing that identity is never wording; attribution is
   * currently *only* wording, and it cannot be queried as attribution because
   * nothing knows it is there.
   */
  test("who closed the question survives only as prose, and cannot be asked for", async () => {
    const build = (closer: string) => async (s: ResearchSession) => {
      const enquiry = await s.openEnquiry("is the marginal split difference real?");
      const observations = await s.recordObservations({
        enquiry, name: "marginal split results",
        // The only place a name can go. It is evidence prose, not attribution.
        finding: `difference 2.1%, CI excludes zero (adjudicated by ${closer})`,
      });
      const analysis = await s.recordAnalysis({
        enquiry, method: "paired-comparison", from: [observations],
        concludes: [{ proposition: "the difference is real", finding: `difference 2.1% (${closer})` }],
      });
      // No actor may be supplied here. That is the whole finding.
      await s.closeEnquiry({ enquiry, answeredBy: { analysis, proposition: "the difference is real" } });
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
    expect(byAlice.evidence.join(" ")).toContain("Alice");

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
