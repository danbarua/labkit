/**
 * S-20 — "The re-analysis narrowed it and did not close it."
 *
 * A re-verification produces a finding its own researcher calls genuinely
 * inconclusive: two of three tests agree it is significant, the third does
 * not, and a pre-commitment forbids trying a fourth. The finding is real and
 * it settles the proposition neither way.
 *
 * What it holds the record to: the claim reads as neither supported nor
 * challenged, the finding stays visible under it, and the question it was
 * asked against is not counted as answered.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { recordAnalysis } from "../../fragments";

let scenario: Scenario;
let session: ResearchSession;

const clock: Clock = { now: () => "2026-09-02T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });
});
afterEach(async () => {
  await scenario.end();
});

const REWIRING = "T differs from the rewiring control";

/**
 * The transcriber's own sentence, from `scripts/probe-bonsai-1a.sh`, kept
 * verbatim: it is the record of what the researcher said, and paraphrasing it
 * would make this scenario about wording this repo chose.
 */
const INCONCLUSIVE =
  "NOT resolved: primary (p=0.037) and sign-flip (p=0.041) still say significant, " +
  "median (p=0.084) still says not -- narrowed from v1 but not closed; per pre-commitment, " +
  "no further transformation attempted, reported as genuinely inconclusive at n=10/25 seeds.";

/**
 * Researcher: "Two of three tests still disagree, and the pre-commitment says
 *  stop. I am not going to call it either way."
 */
async function aReVerificationThatSettledNothing() {
  const { enquiry, question } = await session.openEnquiry(
    "does T differ from the rewiring control?",
  );
  const { observations } = await session.recordObservations({
    enquiry,
    name: "per-image results",
    finding: "T and the rewiring control, ten seeds",
  });
  const { analysis, claims } = await recordAnalysis(session, {
    enquiry,
    method: "log-scale re-aggregation",
    from: [observations],
    concludes: [{ proposition: REWIRING, finding: INCONCLUSIVE }],
  });
  // The conclusion itself, not just its handle: `is` names the finding that
  // put the claim in this state, and that handle is on the conclusion.
  const concluded = claims.find((c) => c.asserts === REWIRING);
  if (concluded?.finding === undefined) throw new Error("the analysis concluded nothing here");
  return {
    enquiry,
    question,
    observations,
    analysis,
    claim: concluded.claim,
    finding: concluded.finding,
  };
}

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

describe("S-20 — a finding that settles the proposition neither way", () => {
  test("the claim reads as neither supported nor challenged, and keeps its finding", async () => {
    const w = await aReVerificationThatSettledNothing();

    await session.is({ claim: w.claim, state: "undecided", because: w.finding });

    const why = await (await afterwards()).whySupported(w.claim);

    // The whole of #139: today this reads `supported: true`, because
    // `conclude` defaults the bearing to supports and nothing can say
    // otherwise.
    expect(why.supported).toBe(false);
    expect(why.standing).toBe("undecided");

    // Not supported, and the finding is still there — a blanked report would
    // say the analysis produced nothing, which is the opposite of what
    // happened.
    expect(why.support.map((s) => s.finding)).toEqual([INCONCLUSIVE]);
  });

  test("the question is not counted as answered by a finding that settles nothing", async () => {
    const w = await aReVerificationThatSettledNothing();
    await session.is({ claim: w.claim, state: "undecided", because: w.finding });

    const survey = await (await afterwards()).whatIsKnown();

    // `unresolved` already means "worked on, not settled", which is exactly
    // this. The failure to avoid is `established` or `provisional`: both say
    // the question has an answer.
    expect(survey.unresolved.map((q: { question: unknown }) => q.question)).toContain(w.question);
    expect(survey.established.map((q: { question: unknown }) => q.question)).not.toContain(
      w.question,
    );
    expect(survey.provisional.map((q: { question: unknown }) => q.question)).not.toContain(
      w.question,
    );
    // Something was run against it, so it is not untested either — the
    // distinction the survey's own doc comment insists on.
    expect(survey.untested.map((q: { question: unknown }) => q.question)).not.toContain(w.question);
  });
});
