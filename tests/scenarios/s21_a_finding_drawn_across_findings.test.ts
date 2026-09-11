/**
 * S-21: the headline that computes nothing new.
 */

import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, test } from "bun:test";
import { ResearchSession, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { ref } from "../../src/domain/report";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;

let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 8, 5, 10, tick++)).toISOString(),
};

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  tick = 0;
  session = new ResearchSession(await scenario.begin(), { clock });
});
afterEach(async () => {
  await scenario.end();
});

const afterwards = async () => new ResearchSession(await scenario.current(), { clock });

const CONTROLS = [
  ["lattice", "T shows no advantage over the lattice control"],
  ["stochastic-A", "T shows no advantage over stochastic control A"],
  ["stochastic-B", "T shows no advantage over stochastic control B"],
  ["stochastic-C", "T shows no advantage over stochastic control C"],
] as const;

const HEADLINE = "T shows no detectable advantage over any tested control";

/** Four comparisons, each its own analysis with its own finding. */
async function fourComparisons() {
  const { enquiry } = await session.openEnquiry("does T beat the controls?");
  const claims = [];
  for (const [name, proposition] of CONTROLS) {
    const { observations } = await session.recordObservations({
      enquiry,
      name: `${name} run`,
      finding: `paired scores, ${name}`,
    });
    const { claims: drawn } = await recordAnalysis(session, {
      enquiry,
      method: `paired comparison, ${name}`,
      from: [observations],
      concludes: [{ proposition, finding: `difference within noise, ${name}` }],
    });
    claims.push(claimOf(drawn, proposition));
  }
  return { enquiry, claims };
}

describe("S-21: a finding drawn across findings", () => {
  test("the synthesis names what it rests on, and no run it did not do", async () => {
    const { claims } = await fourComparisons();

    const { claim } = await session.synthesise({
      proposition: HEADLINE,
      restingOn: claims,
    });

    const why = await (await afterwards()).whySupported(claim);
    expect(why.proposition).toBe(HEADLINE);
    expect(why.drawnAcross.map((r) => r.claim).sort()).toEqual([...claims].sort());
    // No evidence of its own, and that is the point: a synthesis measures
    // nothing. Reporting the four underneath as `support` would claim four
    // measurements bearing on this sentence, when what exists is four
    // measurements bearing on four other sentences.
    expect(why.support).toEqual([]);
  });

  /**
   * The second reader, which `why` answers over MCP.
   */
  test("the synthesis reads the same way whichever reader is asked", async () => {
    const { claims } = await fourComparisons();
    const { claim } = await session.synthesise({ proposition: HEADLINE, restingOn: claims });

    const explained = await (await afterwards()).why(claim);
    expect(explained.is).not.toMatch(/nothing has examined/);
    expect(explained.because.map((c) => c.handle).sort()).toEqual([...claims].sort());
  });

  test("a synthesis can answer the question its parts were pursued under", async () => {
    const { enquiry, claims } = await fourComparisons();
    const { claim } = await session.synthesise({
      proposition: HEADLINE,
      restingOn: claims,
    });

    await session.closeEnquiry({ enquiry, answeredBy: claim });

    // Afterward: the question is answered, and answered on the headline —
    // not on whichever of the four was cited to stand in for it.
    const status = await (await afterwards()).enquiryStatus(enquiry);
    expect(status.open).toBe(false);
    expect(status.closure).toBe("answered");
    // All four findings are what it rests on. Citing one would name an
    // arbitrary part as the answer to a question about the whole.
    expect(status.evidence).toHaveLength(4);
  });

  /**
   * The bearing half, which is what a negative result looks like.
   */
  test("a synthesis over challenging findings can close its enquiry too", async () => {
    const { enquiry } = await session.openEnquiry("does T beat the controls?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "paired runs",
      finding: "matched scores",
    });
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      concludes: CONTROLS.map(([name, proposition]) => ({
        proposition,
        finding: `difference within noise, ${name}`,
        // Every one of them cuts against its proposition.
        bearing: "challenges" as const,
      })),
    });
    const { claim } = await session.synthesise({
      proposition: HEADLINE,
      restingOn: CONTROLS.map(([, proposition]) => claimOf(claims, proposition)),
    });

    await session.closeEnquiry({ enquiry, answeredBy: claim });

    const status = await (await afterwards()).enquiryStatus(enquiry);
    expect(status.closure).toBe("answered");
    // Answered "no", and resting on all four — the polarity comes from which
    // way the findings underneath it cut.
    expect(status.answer).toBe("no");
    expect(status.evidence).toHaveLength(4);
  });

  test("resting on a claim nobody has concluded is refused, and nothing is written", async () => {
    await fourComparisons();

    await expect(
      session.synthesise({ proposition: HEADLINE, restingOn: [ref("claim", "CLM_999")] }),
    ).rejects.toThrow(/no claim CLM_999 to rest on/);

    const found = await (await afterwards()).claimsAsserting(HEADLINE);
    expect(found).toEqual([]);
  });

  test("a synthesis resting on nothing is refused: that is an analysis's conclusion", async () => {
    await fourComparisons();

    await expect(session.synthesise({ proposition: HEADLINE, restingOn: [] })).rejects.toThrow(
      /at least one finding to rest on/,
    );
  });
  test("reinterpret narrows exactly the named synthesis and preserves its parts", async () => {
    const { claims } = await fourComparisons();
    const restingOn = [claims[0]!, claims[1]!, claims[0]!];
    const { claim: synthesis } = await session.synthesise({
      proposition: HEADLINE,
      restingOn,
    });

    const report = await session.reinterpret({
      of: synthesis,
      as: "T shows no advantage in the measured controls",
      because: "the headline overstates what the comparisons establish",
    });
    const edges = report.events[0]!.changes.filter(
      (change): change is import("../../src/domain").EdgeCreated => change.change === "EdgeCreated",
    );
    const expectedParts = [...new Set(restingOn)].sort();

    expect(report.previously).toEqual([{ claim: synthesis, asserts: HEADLINE }]);
    expect(edges.filter((edge) => edge.label === "CHANGES").map((edge) => edge.to)).toEqual([
      synthesis,
    ]);
    expect(edges.filter((edge) => edge.label === "MOTIVATES").map((edge) => edge.to)).toEqual([
      report.nowClaims.claim,
    ]);
    expect(
      edges
        .filter((edge) => edge.label === "RESTS_ON")
        .map((edge) => edge.to)
        .sort(),
    ).toEqual(expectedParts);
    expect(
      edges.filter((edge) => edge.label === "SUPPORTS" || edge.label === "CHALLENGES"),
    ).toEqual([]);

    const narrowed = await (await afterwards()).whySupported(report.nowClaims.claim);
    expect(narrowed.drawnAcross.map((part) => part.claim).sort()).toEqual(expectedParts);
    expect(narrowed.support).toEqual([]);

    await expect(
      session.reinterpret({
        of: synthesis,
        as: "T has no measured advantage",
        because: "trying to reinterpret the superseded synthesis",
      }),
    ).rejects.toThrow(new RegExp(`no longer stands.*${report.nowClaims.claim}`, "s"));
  });

  test("accepting a synthesis keeps its identity and cites every component finding", async () => {
    const { enquiry } = await session.openEnquiry("does the measured effect hold?");
    const { observations } = await session.recordObservations({
      enquiry,
      name: "paired measurements",
      finding: "paired measurements",
    });
    const { claims } = await recordAnalysis(session, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      concludes: [
        { proposition: "the effect is present", finding: "effect estimate is positive" },
        {
          proposition: "the effect is absent",
          finding: "confidence interval spans zero",
          bearing: "challenges",
        },
      ],
    });
    const parts = [claims[0]!.claim, claims[1]!.claim, claims[0]!.claim];
    const { claim: synthesis } = await session.synthesise({
      proposition: "the effect is unresolved across both comparisons",
      restingOn: parts,
    });
    const accepted = await session.acceptAsUnresolved({
      enquiry,
      because: "the available comparisons do not settle the question",
      until: "a new independent comparison is available",
      inLightOf: synthesis,
    });
    const edges = accepted.events[0]!.changes.filter(
      (change): change is import("../../src/domain").EdgeCreated => change.change === "EdgeCreated",
    );
    const expectedEvidence = [
      ...(await session.whySupported(claims[0]!.claim)).support,
      ...(await session.whySupported(claims[1]!.claim)).against,
    ]
      .map((finding) => finding.evidence)
      .sort();

    expect(edges.filter((edge) => edge.label === "IN_LIGHT_OF").map((edge) => edge.to)).toEqual([
      synthesis,
    ]);
    expect(
      edges
        .filter((edge) => edge.label === "BASED_ON")
        .map((edge) => edge.to)
        .sort(),
    ).toEqual(expectedEvidence);
    const explained = await (await afterwards()).why(accepted.decision);
    expect(explained.because).toContainEqual(
      expect.objectContaining({
        handle: synthesis,
        wording: expect.stringContaining("in light of"),
      }),
    );
  });
});
