/**
 * S-11 — "The analysis was wrong; the observations were fine."
 * docs/project-journal/008_user_story_mining.md
 *
 * This is the CONTROL scenario: the one the current model was designed for
 * and the one most likely to pass unchanged. Its value is diagnostic — if
 * S-11 strains, the problem runs deeper than a surface gap.
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
import { claimOf } from "../helpers/claims";
import { recordAnalysis, replaceAnalysis } from "../helpers/analysis";

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
  const { enquiry } = await session.openEnquiry("which graph construction classifies best?");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "per-image classification results",
    finding: "per-image accuracy for all five constructions, 10,000 images",
    contentHash: "sha256:obs",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(session, {
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
    const { enquiry, observations, analysis } = await bootstrapAnalysisAsShipped();

    // Reviewer: your bootstrap is centred on the observed effect. It isn't a null test.
    const { review } = await session.recordReview({
      of: analysis,
      verdict:
        "bootstrap is centred on the observed effect; it does not implement the intended null",
    });

    // Researcher: replace the analysis, mark the prior inference superseded,
    // and propagate whatever claims change.
    const report = await replaceAnalysis(session, {
      supersedes: analysis,
      because: review,
      enquiry,
      method: "sign-flip-permutation",
      from: [observations],
      concludes: SIGN_FLIP_CONCLUSIONS,
    });

    // The act answers with what it minted: the replacement and the decision
    // recording that it revises the earlier analysis.
    expect(report.replacement).not.toEqual(analysis);
    expect(report.supersedes).toEqual(analysis);

    // LabKit: five pairwise conclusions remain strong. One becomes marginal —
    // asked of the record, because six conclusions arrive as six acts and what
    // a revision changed is therefore spread across them rather than held by
    // any one of them.
    const explained = await (await afterwards()).why(report.replacement);
    if (explained.kind !== "analysis")
      throw new Error(`asked about an analysis, got ${explained.kind}`);
    expect(explained.report.supersedes).toEqual(analysis);
    expect(explained.report.because?.review).toEqual(review);
    expect(explained.report.changed).toHaveLength(1);
    expect(explained.report.changed[0]).toMatchObject({
      proposition: "T beats rewired",
      before: "p = 0.002 (bootstrap)",
      after: "p = 0.049 (sign-flip permutation)",
    });
    // Five re-reached unchanged, and none left unmentioned: this replacement
    // restated every conclusion of the analysis it revises.
    expect(explained.report.restated).toHaveLength(5);
    expect(explained.report.kept).toEqual([]);

    // Which records these are about. `restated` and `changed.claim` name the
    // REPLACEMENT's claims; `changed.was` names the superseded one, and the two
    // sets are disjoint even though every sentence appears in both.
    const minted = new Set(report.claims.map((c) => c.claim));
    for (const u of explained.report.restated) expect(minted.has(u.claim)).toBe(true);
    expect(minted.has(explained.report.changed[0]!.claim)).toBe(true);
    expect(minted.has(explained.report.changed[0]!.was)).toBe(false);
  });

  test("Afterward 1: what is affected is enumerable, not 'everything downstream'", async () => {
    const { enquiry, observations, analysis } = await bootstrapAnalysisAsShipped();
    const { review } = await session.recordReview({
      of: analysis,
      verdict: "not a null test",
    });

    const report = await replaceAnalysis(session, {
      supersedes: analysis,
      because: review,
      enquiry,
      method: "sign-flip-permutation",
      from: [observations],
      concludes: SIGN_FLIP_CONCLUSIONS,
    });

    // Every finding the replacement superseded, read from the record. Matched
    // by id, not by sentence: after a replacement both the superseded claim and
    // the one standing in its place assert the same words.
    const revision = await (await afterwards()).why(report.replacement);
    if (revision.kind !== "analysis") throw new Error(`expected an analysis, got ${revision.kind}`);
    const supersededHere = [
      ...revision.report.changed.map((c) => c.was),
      ...revision.report.restated.map((r) => r.claim),
    ];
    expect(supersededHere).toHaveLength(6);

    // ...and the same answer from a different question. `whatDependsOn` walks
    // the artefact; this walks the lineage. They must agree on the count.
    const downstream = await session.whatDependsOn("bootstrap-pairwise output");
    expect(downstream.claims).toHaveLength(supersededHere.length);
  });

  test("Afterward 2: the observations are explicitly not affected, and still underpin the replacement", async () => {
    const { enquiry, observations, analysis } = await bootstrapAnalysisAsShipped();
    const { review } = await session.recordReview({
      of: analysis,
      verdict: "not a null test",
    });

    const report = await replaceAnalysis(session, {
      supersedes: analysis,
      because: review,
      enquiry,
      method: "sign-flip-permutation",
      from: [observations],
      concludes: SIGN_FLIP_CONCLUSIONS,
    });

    // The observations are not superseded by this act: it revises an analysis,
    // and what an analysis read is untouched by its being revised.
    const stillThere = await (await afterwards()).whatDependsOn(observations);
    expect(stillThere.claims.length).toBeGreaterThan(0);

    // Durable check: the replacement conclusion still rests on the same
    // observations, and those observations were never invalidated.
    const why = await session.whySupported(claimOf(report.claims, "T beats rewired"));
    expect(
      await (await afterwards()).whySupported(claimOf(report.claims, "T beats rewired")),
    ).toEqual(why);
    expect(why.restingOn.map((a) => a.name)).toContain("per-image classification results");
  });

  test("Afterward 4: the replacement conclusion is supported via a different inference", async () => {
    const { enquiry, observations, analysis } = await bootstrapAnalysisAsShipped();
    const { review } = await session.recordReview({
      of: analysis,
      verdict: "not a null test",
    });
    const report = await replaceAnalysis(session, {
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
    expect(why.verdict).toBe("supported");
    expect(why.support.map((s) => s.method)).toEqual(["sign-flip-permutation"]);
    expect(why.support[0]!.finding).toBe("p = 0.049 (sign-flip permutation)");
  });

  test("Afterward 5: what the superseded inference claimed is still readable", async () => {
    const { enquiry, observations, analysis } = await bootstrapAnalysisAsShipped();
    const { review } = await session.recordReview({
      of: analysis,
      verdict: "not a null test",
    });
    const report = await replaceAnalysis(session, {
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
   * Without `Computation -[:CONSUMES]-> Artefact`, "what does this claim rest
   * on?" would answer by going out to the enquiry and back, returning every
   * observation the ENQUIRY is associated with -- so one enquiry carrying two
   * analyses over different inputs would return both observation sets for
   * both claims, not just each analysis's own input.
   */
  test("a claim rests only on what its own analysis consumed, not on everything in the enquiry", async () => {
    const { enquiry } = await session.openEnquiry("which construction classifies best?");
    const { observations: mnist } = await session.recordObservations({
      enquiry,
      name: "mnist per-image results",
      finding: "per-image accuracy on MNIST",
    });
    const { observations: fashion } = await session.recordObservations({
      enquiry,
      name: "fashion-mnist per-image results",
      finding: "per-image accuracy on Fashion-MNIST",
    });

    const { claims: mnistClaims } = await recordAnalysis(session, {
      enquiry,
      method: "permutation-mnist",
      from: [mnist],
      concludes: [{ proposition: "T beats lattice on MNIST", finding: "p = 0.001" }],
    });
    const { claims: fashionClaims } = await recordAnalysis(session, {
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
    const { enquiry, observations, analysis } = await bootstrapAnalysisAsShipped();
    const { review } = await session.recordReview({
      of: analysis,
      verdict:
        "bootstrap is centred on the observed effect; it does not implement the intended null",
    });
    const report = await replaceAnalysis(session, {
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
    const { enquiry } = await session.openEnquiry("which construction classifies best?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "obs",
      finding: "raw",
    });

    const { analysis: target, claims: targetClaims } = await recordAnalysis(session, {
      enquiry,
      method: "bootstrap-pairwise",
      from: [observations],
      concludes: [{ proposition: "T beats rewired", finding: "p = 0.002 (bootstrap)" }],
    });
    const { analysis: unrelated } = await recordAnalysis(session, {
      enquiry,
      method: "unrelated-analysis",
      from: [observations],
      concludes: [{ proposition: "something else entirely", finding: "n/a" }],
    });
    const { review: reviewOfUnrelated } = await session.recordReview({
      of: unrelated,
      verdict: "a verdict about other work",
    });

    await expect(
      replaceAnalysis(session, {
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
    expect(why.verdict).toBe("supported");
    expect(why.superseded).toHaveLength(0);
  });

  test("the temporal seam records the invalidation, with its time and what it moved", async () => {
    const { enquiry, observations, analysis } = await bootstrapAnalysisAsShipped();
    const { review } = await session.recordReview({
      of: analysis,
      verdict: "not a null test",
    });
    const _report = await replaceAnalysis(session, {
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
    // Nothing kept: this replacement supersedes every conclusion of the
    // analysis it revises, which is what `replace` means.
    expect(replacement[0]!.command).toMatchObject({ supersedes: analysis, keeping: [] });

    // Every research action left a trace, in order — one per action, not one
    // per write.
    //
    // **The `conclude` entries are actions**: this run drew six conclusions and
    // the record says so six times, as it would had a person typed `labkit
    // conclude` six times. The count is the caller's, not the graph's.
    //
    // Spelled out rather than counted, because the absence is half the claim:
    // there is no second `recordAnalysis` between the review and the
    // replacement. A researcher who replaced an analysis did one thing.
    const concluded = (n: number) => Array.from({ length: n }, () => "conclude" as const);
    expect((await events.all()).map((e) => e.operation)).toEqual([
      "openEnquiry",
      "recordObservations",
      "recordAnalysis",
      ...concluded(SIGN_FLIP_CONCLUSIONS.length),
      "recordReview",
      // The revision first, then its findings: superseding happens when the
      // successor is recorded, and each new conclusion is an act after it.
      "replaceAnalysis",
      ...concluded(SIGN_FLIP_CONCLUSIONS.length),
    ]);
  });
  /**
   * **Researcher:** I superseded that analysis. Then I noticed one more thing
   * in its output and went to record it against it.
   *
   * **Agent:** Refused, naming the analysis that replaced it.
   *
   * A finding recorded on a spent analysis is indistinguishable downstream
   * from one on a live analysis, which is why this is refused rather than
   * flagged. It read `Artefact.invalidated` until 2026-09-06 — a property no
   * verb has ever written — so the refusal never fired and the finding landed.
   */
  test("a superseded analysis takes no further conclusions", async () => {
    const { enquiry, analysis, observations } = await bootstrapAnalysisAsShipped();
    const { review } = await session.recordReview({
      of: analysis,
      verdict: "the bootstrap does not implement the intended null",
    });
    const report = await replaceAnalysis(session, {
      supersedes: analysis,
      because: review,
      enquiry,
      method: "sign-flip-permutation",
      from: [observations],
      concludes: SIGN_FLIP_CONCLUSIONS,
    });

    // Refused, and the message names where the finding belongs instead —
    // a three-part refusal, not a bare no.
    await expect(
      session.conclude({
        analysis,
        proposition: "one more thing the old run showed",
        finding: "noticed afterwards",
      }),
    ).rejects.toThrow(
      new RegExp(`superseded and takes no further conclusions.*${report.replacement}`),
    );

    // The replacement still takes them, which is what makes the refusal about
    // supersession rather than about analyses in general.
    const { claims } = await session.conclude({
      analysis: report.replacement,
      proposition: "one more thing the new run showed",
      finding: "noticed afterwards",
    });
    expect(claims).toHaveLength(1);
  });
});
