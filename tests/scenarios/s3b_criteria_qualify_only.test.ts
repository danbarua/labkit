/**
 * S-3b — "The same design with nothing downstream."
 * docs/project-journal/008_user_story_mining.md, §3
 *
 * S-3's criteria do two jobs at once: they gate the tertiary analysis, and
 * they decide whether the primary finding can be relied on. Only the first was
 * modelled, and ledger row V recorded the resulting wrong answer —
 * `whySupported()` reporting `supported: true` for a finding two of whose own
 * prespecified checks had failed. S-8 supplied the reverse case (criteria that
 * gate work and qualify nothing) and could only narrow the row.
 *
 * This is S-3's conversation with the tertiary model taken away. Same checks,
 * same significant result, nothing downstream at all — so the qualification
 * job is the only one left, and whatever the model needs here it needs for
 * that job alone.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf, whyOf } from "../helpers/claims";
import { recordAnalysis } from "../../fragments";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

const FIXED_NOW = "2026-08-19T09:00:00.000Z";
const clock: Clock = { now: () => FIXED_NOW };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  session = new ResearchSession(graph, { clock, events });
});
afterEach(async () => {
  await scenario.end();
});

/** A second reader over the same graph — see tests/helpers/scenario.ts. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

const PRIMARY = "Holm-corrected pairwise test is significant";
const MEDIAN = "median aggregation agrees with the mean";
const SEED = "seed-to-seed variation is within tolerance";
const PROPOSITION = "T differs from rewired";

/**
 * The agreed standard, and then the run it was agreed about. The checks are
 * stated first because they are prespecified: agreeing them after seeing the
 * result is the thing this scenario's researcher is protecting against.
 */
async function aFindingHeldToAgreedChecks() {
  const { criterion: primary } = await session.stateCriterion(PRIMARY);
  const { criterion: median } = await session.stateCriterion(MEDIAN);
  const { criterion: seed } = await session.stateCriterion(SEED);

  const { enquiry } = await session.openEnquiry("does T differ from rewired?");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "per-image results",
    finding: "per-image accuracy, 10,000 images",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(session, {
    enquiry,
    method: "holm-pairwise",
    from: [observations],
    concludes: [{ proposition: PROPOSITION, finding: "p = 0.002, Holm-corrected" }],
    heldTo: [primary, median, seed],
  });
  return {
    primary,
    median,
    seed,
    enquiry,
    observations,
    analysis,
    analysisClaims,
  };
}

describe("S-3b: the same design with nothing downstream", () => {
  /**
   * Afterward 1. "Does the finding stand?" — no, and not because evidence is
   * missing.
   *
   * This is the assertion row V has been open on since S-3. Before
   * `QUALIFIES`, criteria reached only a `Gate`, so there was no path from a
   * claim to the conditions it was supposed to satisfy and this returned
   * `supported: true` — "some evidence exists" rather than "the evidence holds
   * up by the standard set for it".
   */
  test("Afterward 1: the finding does not stand, and the numbers are still good", async () => {
    const { primary, median, analysisClaims } = await aFindingHeldToAgreedChecks();
    await session.evaluateCriterion({
      criterion: primary,
      value: "p = 0.002",
      outcome: "pass",
      citing: claimOf(analysisClaims, PROPOSITION),
    });
    await session.evaluateCriterion({
      criterion: median,
      value: "median p = 0.21",
      outcome: "fail",
    });
    // Seed stability is never run at all.

    const why = await session.whySupported(await claimNamed(session, PROPOSITION));
    expect(await whyOf(await afterwards(), PROPOSITION)).toEqual(why);

    expect(why.supported).toBe(false);
    // Not for want of evidence, and not because anything was withdrawn. The
    // finding is still there, still says what it said, and still supports the
    // proposition — S-12's distinction, reached from the other direction.
    expect(why.support.map((s) => ({ finding: s.finding, method: s.method }))).toEqual([
      { finding: "p = 0.002, Holm-corrected", method: "holm-pairwise" },
    ]);
    expect(why.withdrawn).toBe(false);
    expect(why.challenged).toBe(false);
    expect(why.restingOn.map((a) => a.name)).toEqual(["per-image results"]);
  });

  /**
   * Afterward 2. "By what standard?" — S-3's third bullet, asked of the
   * finding instead of the work. A check that disagreed and a check nobody ran
   * are different answers to "why doesn't this stand", and both are unmet.
   */
  test("Afterward 2: the agreed checks are itemised, disagreement apart from never-run", async () => {
    const { primary, median, analysisClaims } = await aFindingHeldToAgreedChecks();
    await session.evaluateCriterion({
      criterion: primary,
      value: "p = 0.002",
      outcome: "pass",
      citing: claimOf(analysisClaims, PROPOSITION),
    });
    await session.evaluateCriterion({
      criterion: median,
      value: "median p = 0.21",
      outcome: "fail",
    });

    const why = await session.whySupported(await claimNamed(session, PROPOSITION));
    expect(await whyOf(await afterwards(), PROPOSITION)).toEqual(why);

    const byName = Object.fromEntries(why.standard.map((c) => [c.proposition, c.state]));
    expect(byName[PRIMARY]).toBe("passed");
    expect(byName[MEDIAN]).toBe("failed");
    expect(byName[SEED]).toBe("never-run");
    expect(new Set(Object.values(byName)).size).toBe(3);
    expect([...why.unmet.map((u) => u.requires)].sort()).toEqual([MEDIAN, SEED].sort());
    // The passing check kept its provenance: it was reached against the
    // finding itself, not asserted. Row W's distinction, on the qualification
    // side of the fence this time.
    const decided = why.standard.find((c) => c.proposition === PRIMARY)?.decidedBy;
    expect(decided?.basis?.map((b) => b.states)).toEqual(["p = 0.002, Holm-corrected"]);
  });

  /**
   * Afterward 3. "What is waiting on those checks?" — nothing, and the record
   * must say nothing rather than name work that does not exist.
   *
   * Before this scenario a standard could only be recorded by declaring a gate
   * for it, so expressing "nothing is waiting on this" required minting a gate
   * that protected nothing — which `gateStatus()` then reported as `blocked`
   * with an empty `gating` list. Both halves are now closed: the gate is
   * refused, and the standard no longer needs one.
   */
  test("Afterward 3: a standard with nothing downstream needs no gate, and cannot fake one", async () => {
    const { primary } = await aFindingHeldToAgreedChecks();
    await expect(
      session.declareGate({
        governedBy: [primary],
        consequence: "the finding stands",
        protecting: [],
      }),
    ).rejects.toThrow(/protecting nothing/);

    // And nothing in the record is gating anything: the only control-plane
    // objects here are the checks themselves.
    const known = await (await afterwards()).whatIsKnown();
    expect(known.unresolved.map((q) => q.asks)).toEqual(["does T differ from rewired?"]);
  });

  /**
   * Afterward 4, the other bearing of "are the numbers still good": meeting
   * the standard is a state of its own, distinct from having been held to none.
   */
  test("Afterward 4: a finding that meets its agreed checks stands", async () => {
    const { primary, median, seed, analysisClaims } = await aFindingHeldToAgreedChecks();
    for (const criterion of [primary, median, seed]) {
      await session.evaluateCriterion({
        criterion,
        value: "agrees",
        outcome: "pass",
        citing: claimOf(analysisClaims, PROPOSITION),
      });
    }

    const why = await session.whySupported(await claimNamed(session, PROPOSITION));
    expect(await whyOf(await afterwards(), PROPOSITION)).toEqual(why);
    expect(why.supported).toBe(true);
    expect(why.unmet.map((u) => u.requires)).toEqual([]);
    expect(why.standard.map((c) => c.state)).toEqual(["passed", "passed", "passed"]);
  });

  /**
   * The state a finding held to nothing is in. `standard: []` is an answer —
   * "held to no agreed standard" — and must not read as "met its standard"
   * nor as "failed it". Every scenario before this one is in this state, which
   * is why they still pass.
   */
  test("a finding held to no agreed standard is neither qualified nor disqualified", async () => {
    const { enquiry } = await session.openEnquiry("does T differ from rewired?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "per-image results",
      finding: "per-image accuracy, 10,000 images",
    });
    await recordAnalysis(session, {
      enquiry,
      method: "holm-pairwise",
      from: [observations],
      concludes: [{ proposition: PROPOSITION, finding: "p = 0.002, Holm-corrected" }],
    });

    const why = await session.whySupported(await claimNamed(session, PROPOSITION));
    expect(await whyOf(await afterwards(), PROPOSITION)).toEqual(why);
    expect(why.supported).toBe(true);
    expect(why.standard).toEqual([]);
    expect(why.unmet.map((u) => u.requires)).toEqual([]);
  });

  /**
   * An evaluation that neither triggers a gate nor bears on a finding held to
   * the criterion is durable nonsense: no reader would ever surface it, so it
   * would sit in the graph looking like a check that had been performed. Same
   * invariant class as evaluating a criterion against a gate it does not
   * govern, and checked before anything is written.
   */
  test("a check that qualifies nothing and gates nothing cannot be evaluated", async () => {
    const { criterion: orphan } = await session.stateCriterion("the pipeline was sane");
    await expect(
      session.evaluateCriterion({
        criterion: orphan,
        value: "looked fine",
        outcome: "pass",
      }),
    ).rejects.toThrow(/qualifies no finding/);
  });

  /**
   * A replaced analysis's checks are as historical as its findings.
   *
   * `whySupported()` already excludes a superseded analysis's inputs from
   * `restingOn`; the standard is read through the same filter, and this is
   * what makes that filter load-bearing rather than tidy. Without it the dead
   * analysis's failed check would disqualify the claim the *replacement*
   * supports — S-11's separation of the observations from the inference,
   * undone from a direction S-11 could not see.
   */
  test("a superseded analysis's failed checks do not disqualify its replacement", async () => {
    const { median, analysis, enquiry, observations } = await aFindingHeldToAgreedChecks();
    await session.evaluateCriterion({
      criterion: median,
      value: "median p = 0.21",
      outcome: "fail",
    });
    expect((await session.whySupported(await claimNamed(session, PROPOSITION))).supported).toBe(
      false,
    );

    const { review } = await session.recordReview({
      of: analysis,
      verdict: "the aggregation was the wrong one",
    });
    const replacement = await session.replaceAnalysis({
      supersedes: analysis,
      because: review,
      enquiry,
      method: "holm-pairwise, mean aggregation",
      from: [observations],
      concludes: [{ proposition: PROPOSITION, finding: "p = 0.003, Holm-corrected" }],
    });

    const why = await (await afterwards()).whySupported(claimOf(replacement.claims, PROPOSITION));
    // The replacement was held to nothing, so it is held to nothing -- not to
    // the checks that failed against the analysis it replaced.
    expect(why.standard).toEqual([]);
    expect(why.unmet.map((u) => u.requires)).toEqual([]);
    expect(why.supported).toBe(true);
  });

  /**
   * Scope, as S-5 left it: two lines of enquiry can assert the same sentence,
   * and a standard agreed in one must not disqualify the other's finding.
   */
  test("a standard belongs to the analysis it was agreed for, not to the wording", async () => {
    const { primary, median, analysisClaims } = await aFindingHeldToAgreedChecks();
    await session.evaluateCriterion({
      criterion: primary,
      value: "p = 0.002",
      outcome: "pass",
      citing: claimOf(analysisClaims, PROPOSITION),
    });
    await session.evaluateCriterion({
      criterion: median,
      value: "median p = 0.21",
      outcome: "fail",
    });

    const { enquiry: other } = await session.openEnquiry(
      "does T differ from rewired on the held-out split?",
    );
    const { observations: otherObservations } = await session.recordObservations({
      enquiry: other,
      name: "held-out results",
      finding: "per-image accuracy, held-out split",
    });
    const { claims: otherAnalysisClaims } = await recordAnalysis(session, {
      enquiry: other,
      method: "holm-pairwise",
      from: [otherObservations],
      concludes: [{ proposition: PROPOSITION, finding: "p = 0.004, Holm-corrected" }],
    });

    const reader = await afterwards();
    const here = await reader.whySupported(claimOf(analysisClaims, PROPOSITION));
    expect(here.supported).toBe(false);
    expect(here.unmet.map((u) => u.requires).sort()).toEqual([MEDIAN, SEED].sort());

    // The same sentence, a different run, held to nothing. The agreed checks
    // do not travel with the wording.
    const there = await reader.whySupported(claimOf(otherAnalysisClaims, PROPOSITION));
    expect(there.supported).toBe(true);
    expect(there.standard).toEqual([]);
  });
});
