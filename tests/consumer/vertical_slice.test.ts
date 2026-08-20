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
 * **Two bars are in play and they must not be conflated.** PJ-011 §5 needs a
 * *confidently incorrect* answer before the model changes; an empty or absent
 * one is unanswerable, not wrong. `023`'s bar 4 needs only that losing the
 * distinction "materially prevent or corrupt a read the frozen contract
 * requires", and *prevent* covers absence.
 *
 * **None of the probes below clears §5.** Every read they call returns a
 * correct answer in both worlds. What they clear is bar 4. That is a real
 * result and it earns investigation — it does not license a model change, and
 * it does not engage CLAUDE.md's one-wrong-answer-at-a-time rule, which keys
 * off §5. Nothing is fixed here.
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
   * The control, and it does more than guard against a self-fulfilling result.
   * It proves the harness **can** return unequal answers for two worlds, which
   * is what stops the equalities in probes 2, 3 and 4 being artefacts of
   * `inTwoWorlds` rather than facts about the read surface. Without it those
   * equalities would be uninterpretable.
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
   * BAR 4 — ledger row Z. Required by all three designers (cluster 21) in three
   * different vocabularies, which is semantic convergence despite lexical
   * disagreement.
   *
   * **Not a §5 wrong answer.** `whatIsKnown()` is *correct* in both worlds:
   * both programmes really do hold both beliefs. There is no incorrect answer
   * and not even an empty one. What is missing is the read — no operation on
   * the surface accepts a time — and that is prevention, not corruption.
   *
   * The first draft of this probe compared `asks` and asserted the two worlds
   * were indistinguishable. That was **false**, and the way it was false is the
   * finding: sorting by natural id recovers creation order exactly, so the
   * durable record *does* carry the ordering. It carries it in a generator
   * artefact CLAUDE.md forbids reading meaning into — which is a different and
   * more precise claim than "the record cannot say".
   */
  const FIRST = { asks: "does pruning move convergence?", prop: "pruning moves convergence" };
  const SECOND = { asks: "does depth move convergence?", prop: "depth moves convergence" };

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

  const inOrder = (first: typeof FIRST, second: typeof FIRST) => async (s: ResearchSession) => {
    await settle(s, first.asks, first.prop);
    await settle(s, second.asks, second.prop);
    return (await s.whatIsKnown()).established;
  };

  test("no read on the surface takes a time, so the as-of question has no answer", async () => {
    const { a, b } = await inTwoWorlds(inOrder(FIRST, SECOND), inOrder(SECOND, FIRST));

    // Both worlds hold both beliefs. Correct in both, which is why this is bar
    // 4 rather than PJ-011 §5.
    expect(a.map((q) => q.asks).sort()).toEqual([FIRST.asks, SECOND.asks].sort());
    expect(b.map((q) => q.asks).sort()).toEqual(a.map((q) => q.asks).sort());

    // The detector, and it flips the day row Z closes: nothing a survey row
    // carries is temporal, so a caller has nowhere to read an as-of answer from.
    // If someone adds one, this fails and must be updated deliberately.
    const temporalFields = Object.keys(a[0]!).filter((k) =>
      /as_?of|believ|assert(ed)?_?at|recorded_?at|effective|when|timestamp|version/i.test(k),
    );
    expect(temporalFields).toEqual([]);
    expect(Object.keys(a[0]!).sort()).toEqual(["asks", "question"]);
  });

  test("the ordering survives only as a natural-id artefact, which is not a modelled read", async () => {
    const { a, b } = await inTwoWorlds(inOrder(FIRST, SECOND), inOrder(SECOND, FIRST));
    const bySequence = (rows: typeof a) =>
      [...rows].sort((x, y) => Number(x.question.slice(2)) - Number(y.question.slice(2))).map((q) => q.asks);

    // The two histories ARE recoverable -- from id order, which tracks
    // allocation. Recorded because the earlier claim that they were not was
    // wrong, and because this is the channel a probe could cheat through.
    expect(bySequence(a)).toEqual([FIRST.asks, SECOND.asks]);
    expect(bySequence(b)).toEqual([SECOND.asks, FIRST.asks]);

    // And it must not be relied on. CLAUDE.md forbids reading meaning into
    // natural-id values; the sequence is global, shared across entity types,
    // and not reset between tests. A consumer keying on it would be reading a
    // generator artefact as scientific chronology.
  });
});

// ---------------------------------------------------------------------------

describe("Probe 3 — reconstruction provenance: what was this reconstructing?", () => {
  /**
   * BAR 4 — ledger row F. Required by Designer 2, which named a durable
   * reconstruction attempt whose remembered fields include its historical
   * target.
   *
   * The first draft of this probe was **incoherent and tautological**, and both
   * faults are worth keeping visible because they are the ones this project
   * keeps making.
   *
   * *Incoherent:* both worlds passed the same `contentHash`. Under S-9 the
   * content hash **is** artefact identity — `reproducibilityOf()` compares
   * exactly that field to decide `exact` versus `differing` — so a
   * byte-identical "regeneration" is a successful reproduction, not a distinct
   * artefact. World A contradicted the rule the probe's own comment cited.
   *
   * *Tautological:* the two worlds were one builder differing in a free-text
   * argument, so asserting that non-text-derived outputs matched was asserting
   * that the same code returns the same result. PJ-021 removed a row F boundary
   * test for exactly this and it was rebuilt here.
   *
   * The finding is not a comparison at all. It is a **single-world fact about
   * the write surface**, in probe 4's category: no verb records that one
   * artefact was an attempt to reconstruct another, so the question has nowhere
   * to be answered from.
   */
  test("reproducibility is a read the caller must already know the answer to", async () => {
    const graph = await scenario.begin();
    try {
      const s = new ResearchSession(graph, { clock, events: inMemoryEventLog() });
      const enquiry = await s.openEnquiry("does the encoding beat the historical control?");

      // The historical control, as it survives: recorded, hashed.
      const historical = await s.recordObservations({
        enquiry, name: "random control", finding: "the 2024 control, as archived",
        contentHash: "sha256:1111",
      });
      const analysis = await s.recordAnalysis({
        enquiry, method: "paired-comparison", from: [historical],
        concludes: [{ proposition: "the encoding beats the control", finding: "difference 2.1%" }],
      });

      // A regeneration that does NOT match -- coherent, unlike the first draft.
      const report = await s.reproducibilityOf(analysis, [
        { part: historical, hash: "sha256:2222" },
      ]);
      expect(report.differing).toEqual(["random control"]);
      expect(report.reproducible).toBe(false);

      // The finding, in two parts.
      //
      // One: the caller had to *pass in* the historical part. The direction of
      // the reconstruction is an argument, supplied by someone who already knew
      // it, and nothing is written down as a result -- reproducibilityOf is a
      // read that persists nothing.
      //
      // Two: no field of the report, and no other read, names what a rebuilt
      // artefact was an attempt to reconstruct. This detector flips the day row
      // F closes.
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
   * DEMONSTRATED GAP, and the strongest of the four — ledger row S, required by
   * all three designers across four unanimous clusters of the blinded synthesis.
   *
   * It is the most severe of the three, and the severity comes from the
   * **write** surface rather than from any comparison. `closeEnquiry` takes
   * `{ enquiry, answeredBy? }` and no verb accepts an actor, so a researcher
   * who wants the record to say who closed a question has exactly one route --
   * write the name into a finding's prose.
   *
   * The paired world below contributes nothing to that argument and is kept
   * only as illustration: `closure`, `answer` and `open` match because both
   * worlds ran the same code. The load-bearing assertion is the last one, a
   * single-world fact that flips the day an attribution field appears.
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
