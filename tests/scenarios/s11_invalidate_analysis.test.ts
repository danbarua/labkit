/**
 * S-11 — "The analysis was wrong; the observations were fine."
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "@labkit/core-domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { reanalyse, recordAnalysis } from "../helpers/analysis";
import { as, captureConversation } from "../helpers/conversation";

let scenario: Scenario;
let session: ResearchSession;
/** The same graph, spoken to by the person who reviews rather than the one who ran it. */
let reviewer: ResearchSession;
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
  session = new ResearchSession(graph, { clock, events, attribution: as("Researcher") });
  reviewer = new ResearchSession(graph, { clock, events, attribution: as("Reviewer") });
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
  const { enquiry } = await session.writes.openEnquiry("which graph construction classifies best?");
  const { observations } = await session.writes.recordObservations({
    enquiry,
    name: "per-image classification results",
    finding: "per-image accuracy for all five constructions, 10,000 images",
    contentHash: "sha256:obs",
  });
  const { analysis, claims: analysisClaims } = await recordAnalysis(session.writes, {
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

/**
 * The reviewer's objection, recorded against the analysis it is about, then the replacement
 * run: each of its conclusions names the finding it stands in place of.
 */
async function replacedWithASignFlipTest() {
  const shipped = await bootstrapAnalysisAsShipped();
  await reviewer.writes.conclude({
    analysis: shipped.analysis,
    proposition: "the bootstrap implements the intended null",
    finding: "bootstrap is centred on the observed effect; it does not implement the intended null",
    bearing: "challenges",
  });
  const report = await reanalyse(session.writes, {
    enquiry: shipped.enquiry,
    method: "sign-flip-permutation",
    from: [shipped.observations],
    concludes: SIGN_FLIP_CONCLUSIONS.map((c) => ({
      ...c,
      replacing: claimOf(shipped.analysisClaims, c.proposition),
    })),
  });
  return { ...shipped, report };
}

describe("S-11: the analysis was wrong; the observations were fine", () => {
  test("the conversation runs end to end through research verbs alone", async () => {
    const { analysis, analysisClaims, report } = await replacedWithASignFlipTest();
    expect(report.replacement).not.toEqual(analysis);

    // The conclusion that moved reads the new finding, and still shows the one it replaced.
    const why = await (await afterwards()).reads.whySupported({
      claim: claimOf(report.claims, "T beats rewired"),
    });
    expect(why.verdict).toBe("supported");
    expect(why.support.map((s) => s.finding)).toEqual(["p = 0.049 (sign-flip permutation)"]);
    expect(why.superseded.map((s) => s.finding)).toEqual(["p = 0.002 (bootstrap)"]);

    // Every original conclusion was replaced, so none of them stands.
    for (const { claim } of analysisClaims) {
      const old = await (await afterwards()).reads.whySupported({ claim });
      expect(old.verdict).toBe("withdrawn");
    }

    await captureConversation(
      {
        id: "S-11",
        title: "The analysis was wrong; the observations were fine",
        about:
          "A reviewer finds the analysis does not implement the null it claims. The observations stand; the analysis is run again correctly, and each new conclusion names the one it replaces.",
      },
      events,
      why,
    );
  });

  test("the observations are not affected, and still underpin the replacement", async () => {
    const { report } = await replacedWithASignFlipTest();

    const why = await session.reads.whySupported({
      claim: claimOf(report.claims, "T beats rewired"),
    });
    expect(
      await (await afterwards()).reads.whySupported({
        claim: claimOf(report.claims, "T beats rewired"),
      }),
    ).toEqual(why);
    expect(why.restingOn.map((a) => a.name)).toContain("per-image classification results");
  });

  test("the replacement conclusion is supported via a different inference", async () => {
    const { report } = await replacedWithASignFlipTest();

    const why = await session.reads.whySupported({
      claim: claimOf(report.claims, "T beats rewired"),
    });
    expect(why.verdict).toBe("supported");
    expect(why.support.map((s) => s.method)).toEqual(["sign-flip-permutation"]);
    expect(why.support[0]!.finding).toBe("p = 0.049 (sign-flip permutation)");
  });

  test("what the superseded inference claimed is still readable", async () => {
    const { report } = await replacedWithASignFlipTest();

    const why = await session.reads.whySupported({
      claim: claimOf(report.claims, "T beats rewired"),
    });
    expect(why.superseded).toHaveLength(1);
    expect(why.superseded[0]).toMatchObject({
      finding: "p = 0.002 (bootstrap)",
      method: "bootstrap-pairwise",
    });
  });

  /**
   * The regression test for the relationship S-11 earned.
   */
  test("a claim rests only on what its own analysis consumed, not on everything in the enquiry", async () => {
    const { enquiry } = await session.writes.openEnquiry("which construction classifies best?");
    const { observations: mnist } = await session.writes.recordObservations({
      enquiry,
      name: "mnist per-image results",
      finding: "per-image accuracy on MNIST",
    });
    const { observations: fashion } = await session.writes.recordObservations({
      enquiry,
      name: "fashion-mnist per-image results",
      finding: "per-image accuracy on Fashion-MNIST",
    });

    const { claims: mnistClaims } = await recordAnalysis(session.writes, {
      enquiry,
      method: "permutation-mnist",
      from: [mnist],
      concludes: [{ proposition: "T beats lattice on MNIST", finding: "p = 0.001" }],
    });
    const { claims: fashionClaims } = await recordAnalysis(session.writes, {
      enquiry,
      method: "permutation-fashion",
      from: [fashion],
      concludes: [{ proposition: "T beats lattice on Fashion", finding: "p = 0.02" }],
    });

    const onMnist = await session.reads.whySupported({
      claim: claimOf(mnistClaims, "T beats lattice on MNIST"),
    });
    expect(onMnist.restingOn.map((a) => a.name)).toEqual(["mnist per-image results"]);

    const onFashion = await session.reads.whySupported({
      claim: claimOf(fashionClaims, "T beats lattice on Fashion"),
    });
    expect(onFashion.restingOn.map((a) => a.name)).toEqual(["fashion-mnist per-image results"]);
  });
});
