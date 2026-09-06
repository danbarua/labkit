/**
 * S-21: the headline that computes nothing new.
 *
 * **Researcher:** Four comparisons are on the record — a lattice control and
 * three stochastic ones — and none of them shows an advantage. The finding I
 * want to report is the four of them together: *no detectable advantage over
 * any of the tested controls*. I did not run anything to reach it.
 *
 * **Agent:** That is a claim resting on the four, not a fifth analysis.
 *
 * From Bonsai's Stage 1D (#146). The workaround before this verb existed was
 * to close the enquiry citing one of the four — the lattice comparison, being
 * the cleanest — so the record named a single control's result as the answer
 * to a question about four.
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
    expect(status.question!.open).toBe(false);
    expect(status.question!.closure).toBe("answered");
    // All four findings are what it rests on. Citing one would name an
    // arbitrary part as the answer to a question about the whole.
    expect(status.question!.evidence).toHaveLength(4);
  });

  /**
   * The bearing half, which is what a negative result looks like.
   *
   * `closeEnquiry` reached a synthesis's parts through `SUPPORTS` alone, so a
   * headline drawn across findings that all *challenge* their propositions —
   * Bonsai's Stage 1D exactly — read as a claim nothing bears on and the
   * closure was refused. AGE has no edge alternation, so naming one bearing is
   * silent: the rows are absent rather than wrong. Shipped in #276 and found
   * by running the transcript, not by review.
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
    expect(status.question!.closure).toBe("answered");
    // Answered "no", and resting on all four — the polarity comes from which
    // way the findings underneath it cut.
    expect(status.question!.answer).toBe("no");
    expect(status.question!.evidence).toHaveLength(4);
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
});
