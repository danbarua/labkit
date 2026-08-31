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
import { ReadSurface, ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf } from "../helpers/claims";

let scenario: Scenario;

/**
 * A frozen clock for the paired-world probes. Deliberate: if a read can tell two
 * worlds apart only because wall-clock time moved between them, it has not
 * distinguished the research states, it has distinguished the test runs.
 *
 * It is a frozen *value*, not a clock. The probes that need a real one live in
 * `clock_ordering.test.ts`, split out on 2026-08-21 to contain a flake — see
 * that file's header, and `tests/helpers/clock.ts` for why the frozen/wound
 * distinction is load-bearing rather than pedantic.
 */
const clock: Clock = { now: () => "2026-08-20T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

/**
 * Runs two worlds in sequence, each against a genuinely fresh graph, and hands
 * back what the read surface said about each.
 *
 * Sequential rather than side by side because the suite shares one database
 * session (tests/helpers/db.ts) and `end()` truncates, so world B cannot see
 * world A. Two worlds side by side would need two sessions, which is what
 * production has and the harness does not.
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
      const { enquiry } = await s.openEnquiry("does the pruning schedule move convergence?");
      const { criterion: seedStability } = await s.stateCriterion("stable across five seeds");
      const { observations } = await s.recordObservations({
        enquiry,
        name: "sweep readings",
        finding: "twelve runs across the schedule",
      });
      const { claims: analysisClaims } = await s.recordAnalysis({
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
        citing: claimOf(analysisClaims, CONVERGES),
      });
      return s.whySupported(claimOf(analysisClaims, CONVERGES));
    };

    const { a: passed, b: failed } = await inTwoWorlds(build("pass"), build("fail"));

    expect(passed.supported).toBe(true);
    expect(passed.unmet.map((u) => u.requires)).toEqual([]);
    expect(failed.supported).toBe(false);
    expect(failed.unmet.map((u) => u.requires)).toEqual(["stable across five seeds"]);
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
    await s.recordAnalysis({
      enquiry,
      method: "paired-comparison",
      from: [observations],
      concludes: [{ proposition, finding: `result for ${proposition}` }],
    });
    await s.promote({
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
   * **Renamed 2026-08-21. Its old name became false and the test did not
   * notice** — the detector it carried was pointed at the wrong thing.
   *
   * It was called *"no read on the surface takes a time, so the as-of question
   * has no answer"*, and its comment said *"it flips the day row Z closes"*.
   * Row Z closed. `whatWasKnown(at)` exists, the CLI ships `known --at` and the
   * MCP server exposes it — and this went on passing, because it scanned the
   * keys of a survey **row** and the capability arrived as a **method**. A
   * condition recorded where nothing re-reads it is not a mechanism (PJ-025);
   * a condition pointed at the wrong object is not one either, and this is the
   * cleanest instance of it in the repo.
   *
   * What it actually checks is still worth checking, so it keeps the assertion
   * and takes a name that matches: the as-of answer is a separate read, not a
   * timestamp smuggled onto a present-tense row. Those are different designs
   * and only one of them was chosen.
   */
  test("the as-of answer is a separate read, not a field on a present-tense row", async () => {
    const { a, b } = await inTwoWorlds(inOrder(FIRST, SECOND), inOrder(SECOND, FIRST));

    // Both worlds hold both beliefs. Correct in both, which is why the original
    // probe was bar 4 rather than PJ-011 §5.
    expect(a.map((q) => q.asks).sort()).toEqual([FIRST.asks, SECOND.asks].sort());
    expect(b.map((q) => q.asks).sort()).toEqual(a.map((q) => q.asks).sort());

    // A survey row carries identity and words, and no time. Adding one here
    // would mean a caller could read an as-of answer off a present-tense
    // result, which is the leak `whatWasKnown()`'s own docstring refuses.
    const temporalFields = Object.keys(a[0]!).filter((k) =>
      /as_?of|believ|assert(ed)?_?at|recorded_?at|effective|when|timestamp|version/i.test(k),
    );
    expect(temporalFields).toEqual([]);
    expect(Object.keys(a[0]!).sort()).toEqual(["asks", "question"]);

    // And the other half, which is what the old detector was reaching for and
    // could not see: the capability exists, as a read of its own.
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
      const { analysis } = await s.recordAnalysis({
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
      const { enquiry } = await s.openEnquiry("is the marginal split difference real?");
      const { observations } = await s.recordObservations({
        enquiry,
        name: "marginal split results",
        // The only place a name can go. It is evidence prose, not attribution.
        finding: `difference 2.1%, CI excludes zero (adjudicated by ${closer})`,
      });
      const { claims: analysisClaims } = await s.recordAnalysis({
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
    expect(byAlice.question!.closure).toBe("answered");
    expect(byBob.question!.closure).toBe(byAlice.question!.closure);
    expect(byAlice.question!.answer).toBe(byBob.question!.answer);
    expect(byAlice.question!.open).toBe(byBob.question!.open);

    // The difference exists only inside a finding's sentence.
    expect(byAlice.question!.evidence).not.toEqual(byBob.question!.evidence);
    expect(byAlice.question!.evidence.map((e) => e.states).join(" ")).toContain("Alice");

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
