/**
 * S-10c — "Which input changed?"
 * docs/project-journal/008_user_story_mining.md §3 row F
 * docs/consumer-contract/035_row_f_verdict_predictions.md
 *
 * Fourth instance of one defect. S-9c found it in `reproducibilityOf()`, S-9d in
 * `whySupported().restingOn`, and this is `reproductionOf().differs` — keyed by
 * `natural_id` internally, reported as a bare `logical_name`.
 *
 * The shape every time: identity is used to decide, and dropped to report.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
let session: ResearchSession;
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});
beforeEach(async () => {
  session = new ResearchSession(await scenario.begin(), {
    clock,
    events: inMemoryEventLog(),
  });
});
afterEach(async () => {
  await scenario.end();
});

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

const NAME = "control series";
const HOLDS = "the effect holds against the control";

/**
 * Researcher: "The original control was lost after the first run. We re-checked
 *  the finding against the regenerated one — same name, different series."
 *
 * A re-verification that swapped one input for another carrying the same name.
 * The two are different artefacts and the record knows it; the question is what
 * the report of the re-run says changed.
 */
async function aReVerificationAgainstTheRegeneratedControl(s: ResearchSession) {
  const enquiry = await s.openEnquiry("does the effect hold against the control?");
  const original = await s.recordObservations({
    enquiry,
    name: NAME,
    finding: "the original series",
    contentHash: "sha256:original",
  });
  const { analysis, claims: analysisClaims } = await s.recordAnalysis({
    enquiry,
    method: "effect-test",
    from: [original],
    concludes: [{ proposition: HOLDS, finding: "effect survives the control" }],
  });

  const regenerated = await s.recordObservations({
    enquiry,
    name: NAME,
    finding: "regenerated from an inferred algorithm",
    contentHash: "sha256:regenerated",
  });
  const { verification } = await s.reverify({
    historical: analysis,
    enquiry,
    method: "effect-test, re-run",
    under: [regenerated],
    concludes: { proposition: HOLDS, finding: "effect survives the control" },
  });
  return {
    enquiry,
    original,
    regenerated,
    analysis,
    analysisClaims,
    verification,
  };
}

describe("S-10c: which input changed?", () => {
  /**
   * The re-run read a different artefact and the record says so. That much has
   * worked since S-10; what changed is that the record no longer *concludes*
   * anything from it — `execution: "not-reproduced"` was a verdict and is gone.
   */
  test("swapping an input for a same-named one is reported as two differences", async () => {
    const { verification } = await aReVerificationAgainstTheRegeneratedControl(session);
    const report = await (await afterwards()).reproductionOf(verification);
    expect(report.differs).toHaveLength(2);
  });

  /**
   * **The fourth bite.** *Which* input changed is unanswerable from the report.
   *
   * `differs` decides by `natural_id` — correctly, which is why there are two
   * entries — and then reports each one's bare `logical_name`. Both say
   * "control series": one `changed`, one `not-used-by-the-re-run`, contradicting
   * each other under a single label, with nothing to distinguish them.
   *
   * A reader asking the question this report exists to answer — *what did the
   * re-run do differently?* — is told that a thing called "control series" was
   * both introduced and dropped.
   *
   * Fixed by carrying identity, as S-9c and S-9d were. The name stays ambiguous;
   * that is the point, and it is why the name was never identity.
   */
  test("the two entries name the same thing and mean different artefacts", async () => {
    const { original, regenerated, verification } =
      await aReVerificationAgainstTheRegeneratedControl(session);

    const report = await (await afterwards()).reproductionOf(verification);

    expect(report.differs.map((d) => d.what.name)).toEqual([NAME, NAME]);
    expect(report.differs.map((d) => d.what.part).sort()).toEqual([original, regenerated].sort());

    // And each is paired with the standing that belongs to it: the regenerated
    // series is what the re-run introduced, the original is what it stopped
    // using.
    const byPart = new Map(report.differs.map((d) => [d.what.part, d.standing]));
    expect(byPart.get(regenerated)).toBe("changed");
    expect(byPart.get(original)).toBe("not-used-by-the-re-run");
  });

  /**
   * The enumeration behind row F's verdict, asserted rather than argued.
   *
   * Every read that touches an artefact either takes a **reference**, or takes a
   * name and **refuses** when it is ambiguous, or now **returns** identity. So
   * no read on this surface needs to know that two artefacts are versions of one
   * thing — the caller already holds the identity, or is told the name will not
   * serve.
   */
  test("a name is never enough, and a reference always is", async () => {
    const { original, regenerated } = await aReVerificationAgainstTheRegeneratedControl(session);
    const reader = await afterwards();

    // Name: refused, with the count that makes the refusal actionable.
    await expect(reader.whatDependsOn(NAME)).rejects.toThrow(/2 artefacts are named/);

    // Reference: answered, separately, for each.
    for (const part of [original, regenerated]) {
      const rests = await reader.whatDependsOn(part);
      expect(rests.claims.map((c) => c.asserts)).toEqual([HOLDS]);
    }
  });
});
