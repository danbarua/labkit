/**
 * S-11 — "The analysis was wrong; the observations were fine."
 * docs/project-journal/008_user_story_mining.md
 *
 * PJ-008 promotes this as the CONTROL scenario: the one the current model was
 * designed for and the one most likely to pass unchanged. Its value is
 * diagnostic — if S-11 strains, the problem is deeper than PJ-008's §3 gaps.
 *
 * Two rules this file exists to enforce, not just to describe:
 *
 *  1. It imports only `src/domain` — never `src/db`. If a scenario cannot be
 *     written without reaching into the persistence layer, the domain service
 *     has failed its purpose. (tests/helpers/db.ts is exempt: it is harness,
 *     not caller.)
 *  2. Every "Afterward" answer is asserted twice — once from the report the
 *     operation returned, and once from a query issued afterwards. "Afterward"
 *     means reconstructible from durable state, not merely present in a return
 *     value the caller happened to keep.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf, whyOf } from "../helpers/claims";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

/** Fixed so the temporal seam can be asserted exactly rather than raced. */
const FIXED_NOW = "2026-08-18T12:00:00.000Z";
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

/** A second reader over the same graph — see tests/helpers/scenario.ts on what this proves. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

/**
 * The state before the reviewer speaks: per-image observations, and a
 * bootstrap analysis drawing six pairwise conclusions from them.
 */
async function bootstrapAnalysisAsShipped() {
  const enquiry = await session.openEnquiry("which graph construction classifies best?");
  const observations = await session.recordObservations({
    enquiry,
    name: "per-image classification results",
    finding: "per-image accuracy for all five constructions, 10,000 images",
    contentHash: "sha256:obs",
  });
  const { analysis: analysis, claims: analysisClaims } = await session.recordAnalysis({
    enquiry,
    method: "bootstrap-pairwise",
    from: [observations],
    concludes: [
      { proposition: "T beats lattice", finding: "p = 0.001 (bootstrap)" },
      { proposition: "T beats rewired", finding: "p = 0.002 (bootstrap)" },
      {
        proposition: "T beats curr_random",
        finding: "p = 0.003 (bootstrap)",
      },
      {
        proposition: "lattice beats curr_random",
        finding: "p = 0.004 (bootstrap)",
      },
      {
        proposition: "rewired beats curr_random",
        finding: "p = 0.005 (bootstrap)",
      },
      { proposition: "T beats static", finding: "p = 0.006 (bootstrap)" },
    ],
  });
  return { enquiry, observations, analysis, analysisClaims };
}

/** The replacement: same observations, correct null test, one conclusion weakens. */
const SIGN_FLIP_CONCLUSIONS = [
  { proposition: "T beats lattice", finding: "p = 0.001 (bootstrap)" },
  {
    proposition: "T beats rewired",
    finding: "p = 0.049 (sign-flip permutation)",
  },
  { proposition: "T beats curr_random", finding: "p = 0.003 (bootstrap)" },
  {
    proposition: "lattice beats curr_random",
    finding: "p = 0.004 (bootstrap)",
  },
  {
    proposition: "rewired beats curr_random",
    finding: "p = 0.005 (bootstrap)",
  },
  { proposition: "T beats static", finding: "p = 0.006 (bootstrap)" },
];

describe("S-11: the analysis was wrong; the observations were fine", () => {
  test("the conversation runs end to end through research verbs alone", async () => {
    const { enquiry, observations, analysis, analysisClaims } = await bootstrapAnalysisAsShipped();

    // Reviewer: your bootstrap is centred on the observed effect. It isn't a null test.
    const review = await session.recordReview({
      of: analysis,
      verdict:
        "bootstrap is centred on the observed effect; it does not implement the intended null",
    });

    // Researcher: replace the analysis, mark the prior inference superseded,
    // and propagate whatever claims change.
    const report = await session.replaceAnalysis({
      supersedes: analysis,
      because: review,
      enquiry,
      method: "sign-flip-permutation",
      from: [observations],
      concludes: SIGN_FLIP_CONCLUSIONS,
    });

    // LabKit: five pairwise conclusions remain strong. One becomes marginal.
    expect(report.unchanged).toHaveLength(5);
    expect(report.changed).toHaveLength(1);
    expect(report.changed[0]).toMatchObject({
      proposition: "T beats rewired",
      before: "p = 0.002 (bootstrap)",
      after: "p = 0.049 (sign-flip permutation)",
    });

    // Which records these are about. `unchanged` and `changed.claim` name the
    // REPLACEMENT's claims -- everything in `affected` was withdrawn by this
    // act, so reporting those as unchanged would call a withdrawn record
    // current. `changed.was` names the superseded one, and the two sets are
    // disjoint even though every sentence appears in both.
    const minted = new Set(report.claims.map((c) => c.claim));
    const superseded = new Set(report.affected.map((a) => a.claim));
    for (const u of report.unchanged) expect(minted.has(u.claim)).toBe(true);
    expect(minted.has(report.changed[0]!.claim)).toBe(true);
    expect(superseded.has(report.changed[0]!.was)).toBe(true);
    expect([...minted].some((id) => superseded.has(id))).toBe(false);
  });

  test("Afterward 1: what is affected is enumerable, not 'everything downstream'", async () => {
    const { enquiry, observations, analysis, analysisClaims } = await bootstrapAnalysisAsShipped();
    const review = await session.recordReview({
      of: analysis,
      verdict: "not a null test",
    });

    const report = await session.replaceAnalysis({
      supersedes: analysis,
      because: review,
      enquiry,
      method: "sign-flip-permutation",
      from: [observations],
      concludes: SIGN_FLIP_CONCLUSIONS,
    });

    expect(report.affected.map((a) => a.asserts).sort()).toEqual(
      [
        "T beats lattice",
        "T beats rewired",
        "T beats curr_random",
        "lattice beats curr_random",
        "rewired beats curr_random",
        "T beats static",
      ].sort(),
    );

    // ...and the same answer from a fresh query, not just from the report --
    // matched by id now that both sides carry one. By sentence this passed
    // even if the query had returned the replacement's claims instead of the
    // superseded ones, which after a replacement assert every one of these.
    const downstream = await session.whatDependsOn("bootstrap-pairwise output");
    expect(downstream.claims.map((c) => c.claim).sort()).toEqual(
      report.affected.map((a) => a.claim).sort(),
    );
  });

  test("Afterward 2: the observations are explicitly not affected, and still underpin the replacement", async () => {
    const { enquiry, observations, analysis, analysisClaims } = await bootstrapAnalysisAsShipped();
    const review = await session.recordReview({
      of: analysis,
      verdict: "not a null test",
    });

    const report = await session.replaceAnalysis({
      supersedes: analysis,
      because: review,
      enquiry,
      method: "sign-flip-permutation",
      from: [observations],
      concludes: SIGN_FLIP_CONCLUSIONS,
    });

    expect(report.unaffected.map((u) => u.what)).toContain(observations);

    // Durable check: the replacement conclusion still rests on the same
    // observations, and those observations were never invalidated.
    const why = await session.whySupported(claimOf(report.claims, "T beats rewired"));
    expect(
      await (await afterwards()).whySupported(claimOf(report.claims, "T beats rewired")),
    ).toEqual(why);
    expect(why.restingOn.map((a) => a.name)).toContain("per-image classification results");
  });

  test("Afterward 4: the replacement conclusion is supported via a different inference", async () => {
    const { enquiry, observations, analysis, analysisClaims } = await bootstrapAnalysisAsShipped();
    const review = await session.recordReview({
      of: analysis,
      verdict: "not a null test",
    });
    const report = await session.replaceAnalysis({
      supersedes: analysis,
      because: review,
      enquiry,
      method: "sign-flip-permutation",
      from: [observations],
      concludes: SIGN_FLIP_CONCLUSIONS,
    });

    const why = await session.whySupported(claimOf(report.claims, "T beats rewired"));
    expect(
      await (await afterwards()).whySupported(claimOf(report.claims, "T beats rewired")),
    ).toEqual(why);
    expect(why.supported).toBe(true);
    expect(why.support.map((s) => s.method)).toEqual(["sign-flip-permutation"]);
    expect(why.support[0]!.finding).toBe("p = 0.049 (sign-flip permutation)");
  });

  test("Afterward 5: what the superseded inference claimed is still readable", async () => {
    const { enquiry, observations, analysis, analysisClaims } = await bootstrapAnalysisAsShipped();
    const review = await session.recordReview({
      of: analysis,
      verdict: "not a null test",
    });
    const report = await session.replaceAnalysis({
      supersedes: analysis,
      because: review,
      enquiry,
      method: "sign-flip-permutation",
      from: [observations],
      concludes: SIGN_FLIP_CONCLUSIONS,
    });

    const why = await session.whySupported(claimOf(report.claims, "T beats rewired"));
    expect(
      await (await afterwards()).whySupported(claimOf(report.claims, "T beats rewired")),
    ).toEqual(why);
    expect(why.superseded).toHaveLength(1);
    expect(why.superseded[0]).toMatchObject({
      finding: "p = 0.002 (bootstrap)",
      method: "bootstrap-pairwise",
    });
  });

  /**
   * The regression test for the relationship S-11 earned.
   *
   * Before `Computation -[:CONSUMES]-> Artefact` existed, "what does this
   * claim rest on?" was answered by going out to the enquiry and back, which
   * returns every observation the ENQUIRY is associated with. One enquiry
   * carrying two analyses over different inputs is where that stops being the
   * same question -- and it returned both observation sets for both claims.
   */
  test("a claim rests only on what its own analysis consumed, not on everything in the enquiry", async () => {
    const enquiry = await session.openEnquiry("which construction classifies best?");
    const mnist = await session.recordObservations({
      enquiry,
      name: "mnist per-image results",
      finding: "per-image accuracy on MNIST",
    });
    const fashion = await session.recordObservations({
      enquiry,
      name: "fashion-mnist per-image results",
      finding: "per-image accuracy on Fashion-MNIST",
    });

    const { claims: mnistClaims } = await session.recordAnalysis({
      enquiry,
      method: "permutation-mnist",
      from: [mnist],
      concludes: [{ proposition: "T beats lattice on MNIST", finding: "p = 0.001" }],
    });
    const { claims: fashionClaims } = await session.recordAnalysis({
      enquiry,
      method: "permutation-fashion",
      from: [fashion],
      concludes: [{ proposition: "T beats lattice on Fashion", finding: "p = 0.02" }],
    });

    const onMnist = await session.whySupported(claimOf(mnistClaims, "T beats lattice on MNIST"));
    expect(onMnist.restingOn.map((a) => a.name)).toEqual(["mnist per-image results"]);

    const onFashion = await session.whySupported(
      claimOf(fashionClaims, "T beats lattice on Fashion"),
    );
    expect(onFashion.restingOn.map((a) => a.name)).toEqual(["fashion-mnist per-image results"]);
  });

  test("why support was withdrawn is answerable from the graph, not just the event log", async () => {
    const { enquiry, observations, analysis, analysisClaims } = await bootstrapAnalysisAsShipped();
    const review = await session.recordReview({
      of: analysis,
      verdict:
        "bootstrap is centred on the observed effect; it does not implement the intended null",
    });
    const report = await session.replaceAnalysis({
      supersedes: analysis,
      because: review,
      enquiry,
      method: "sign-flip-permutation",
      from: [observations],
      concludes: SIGN_FLIP_CONCLUSIONS,
    });

    // A fresh session over the same graph -- nothing carried in memory.
    const reader = new ResearchSession(await scenario.current(), { clock });
    const why = await reader.whySupported(claimOf(report.claims, "T beats rewired"));
    expect(why.superseded[0]!.reason).toBe(
      "bootstrap is centred on the observed effect; it does not implement the intended null",
    );
  });

  /**
   * The review relationship constrains a research action, not just an
   * explanatory query: a replacement has to be justified by a review OF the
   * analysis being replaced. Without this, any verdict could retire any
   * analysis and whySupported() would report a withdrawal reason that never
   * referred to the withdrawn work.
   */
  test("a replacement cannot cite a review of some other analysis", async () => {
    const enquiry = await session.openEnquiry("which construction classifies best?");
    const observations = await session.recordObservations({
      enquiry,
      name: "obs",
      finding: "raw",
    });

    const { analysis: target, claims: targetClaims } = await session.recordAnalysis({
      enquiry,
      method: "bootstrap-pairwise",
      from: [observations],
      concludes: [{ proposition: "T beats rewired", finding: "p = 0.002 (bootstrap)" }],
    });
    const { analysis: unrelated, claims: unrelatedClaims } = await session.recordAnalysis({
      enquiry,
      method: "unrelated-analysis",
      from: [observations],
      concludes: [{ proposition: "something else entirely", finding: "n/a" }],
    });
    const reviewOfUnrelated = await session.recordReview({
      of: unrelated,
      verdict: "a verdict about other work",
    });

    await expect(
      session.replaceAnalysis({
        supersedes: target,
        because: reviewOfUnrelated,
        enquiry,
        method: "sign-flip-permutation",
        from: [observations],
        concludes: [{ proposition: "T beats rewired", finding: "p = 0.049" }],
      }),
    ).rejects.toThrow(/does not review analysis/);

    // ...and nothing was invalidated on the way to failing.
    // The replacement was refused, so the original claim is the only one.
    const why = await session.whySupported(claimOf(targetClaims, "T beats rewired"));
    expect(
      await (await afterwards()).whySupported(claimOf(targetClaims, "T beats rewired")),
    ).toEqual(why);
    expect(why.supported).toBe(true);
    expect(why.superseded).toHaveLength(0);
  });

  test("the temporal seam records the invalidation, with its time and what it moved", async () => {
    const { enquiry, observations, analysis, analysisClaims } = await bootstrapAnalysisAsShipped();
    const review = await session.recordReview({
      of: analysis,
      verdict: "not a null test",
    });
    const report = await session.replaceAnalysis({
      supersedes: analysis,
      because: review,
      enquiry,
      method: "sign-flip-permutation",
      from: [observations],
      concludes: SIGN_FLIP_CONCLUSIONS,
    });

    const replacement = (await events.all()).filter((e) => e.operation === "replaceAnalysis");
    expect(replacement).toHaveLength(1);
    expect(replacement[0]!.at).toBe(FIXED_NOW);
    expect(replacement[0]!.detail).toMatchObject({
      supersedes: analysis,
      changed: ["T beats rewired"],
    });

    // Every research action left a trace, in order — one per action, not one
    // per write. This list used to carry a second `recordAnalysis` between the
    // review and the replacement, because `replaceAnalysis()` called the
    // public analysis verb and so emitted its event too. That is the same
    // defect `openEnquiry` was fixed for (PJ-014), and this assertion had
    // quietly encoded it; external review of S-10 found it in `reverify()` and
    // it was here as well. A researcher who replaced an analysis did one
    // thing, and a log that also records the analysis underneath describes the
    // implementation.
    expect((await events.all()).map((e) => e.operation)).toEqual([
      "openEnquiry",
      "recordObservations",
      "recordAnalysis",
      "recordReview",
      "replaceAnalysis",
    ]);
  });
});
