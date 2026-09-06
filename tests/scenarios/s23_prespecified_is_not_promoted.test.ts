/**
 * S-23: was this prespecified, or did we promote it afterwards?
 *
 * **Researcher:** Two results both read `confirmatory`. One was prespecified —
 * we said before the run that it would count. The other was exploratory until
 * a check passed and we promoted it. Which is which?
 *
 * **Agent:** The one nobody promoted was prespecified.
 *
 * `Claim.kind` says both *this was prespecified* and *this has been promoted*,
 * under one word, for the good reason that both mean "not scratch" (#63). The
 * question was whether a reader can tell them apart. They can, two ways, and
 * neither was asserted anywhere until this file — which is the whole reason
 * the question stayed open: the property held by construction and nothing
 * would have noticed it breaking.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock, type EventSink } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";

let scenario: Scenario;
let session: ResearchSession;
let events: EventSink;

let tick = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 8, 5, 13, tick++)).toISOString(),
};

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  tick = 0;
  events = inMemoryEventLog();
  session = new ResearchSession(await scenario.begin(), { clock, events });
});
afterEach(async () => {
  await scenario.end();
});

const afterwards = async () => new ResearchSession(await scenario.current(), { clock });

const PRESPECIFIED = "the primer holds at 60 days";
const PROMOTED = "the coating slows corrosion";

/** Two confirmatory claims that got there by different routes. */
async function twoRoutesToConfirmatory() {
  const { enquiry } = await session.openEnquiry("does the treatment hold?");
  const { observations } = await session.recordObservations({
    enquiry,
    name: "60-day panel",
    finding: "no failures at 60 days",
  });
  const { claims } = await recordAnalysis(session, {
    enquiry,
    method: "accelerated ageing",
    from: [observations],
    concludes: [
      // Said in advance that it would count.
      { proposition: PRESPECIFIED, finding: "0 of 40 failed", standing: "confirmatory" },
      // Scratch until something promotes it.
      { proposition: PROMOTED, finding: "rate down 22%" },
    ],
  });
  const prespecified = claimOf(claims, PRESPECIFIED);
  const promoted = claimOf(claims, PROMOTED);
  await session.is({
    claim: promoted,
    state: "confirmed",
    because: "the prespecified robustness check passed",
  });
  return { prespecified, promoted };
}

describe("S-23: prespecified is not promoted", () => {
  test("both read confirmatory, which is correct and is the whole difficulty", async () => {
    const { prespecified, promoted } = await twoRoutesToConfirmatory();
    const reader = await afterwards();

    expect((await reader.whySupported(prespecified)).standing).toBe("confirmatory");
    expect((await reader.whySupported(promoted)).standing).toBe("confirmatory");
  });

  test("the promotion names itself, and the prespecified result has none", async () => {
    const { prespecified, promoted } = await twoRoutesToConfirmatory();
    const reader = await afterwards();

    // The act that conferred the standing, when an act conferred it. A claim
    // that was confirmatory from birth has none, and that absence is the
    // distinction rather than a gap in the answer.
    expect((await reader.whySupported(promoted)).promotedBecause).toBe(
      "the prespecified robustness check passed",
    );
    expect((await reader.whySupported(prespecified)).promotedBecause).toBeUndefined();
  });

  test("the stream says which standing each was recorded with", async () => {
    await twoRoutesToConfirmatory();

    // The other route to the same distinction, and the one that survives a
    // claim being promoted, demoted and promoted again: the act that minted
    // the claim recorded the standing it was minted with, and every later
    // change records what it became.
    const born = (await events.select({ operation: "conclude" })).map(
      (e) =>
        e.changes.find((c) => c.change === "NodeCreated" && c.label === "Claim") as {
          props: { kind?: string };
        },
    );
    expect(born.map((c) => c.props.kind)).toEqual(["confirmatory", "exploratory"]);

    const [promotion] = await events.select({ operation: "is" });
    expect(promotion!.changes).toContainEqual(
      expect.objectContaining({ change: "PropsChanged", props: { kind: "confirmatory" } }),
    );
  });
});
