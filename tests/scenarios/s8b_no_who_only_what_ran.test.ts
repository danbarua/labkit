/**
 * S-8b — "There is no who."
 * docs/project-journal/008_user_story_mining.md §3 row S
 *
 * Row S has been open since S-8, where its Afterward asked *"who approved the
 * scale-up, and on what projected cost?"* and the answer was recorded as out of
 * scope: identity is cross-cutting infrastructure, not domain. Three cold
 * designers then independently required persistent attribution, in four
 * unanimous clusters, and `docs/consumer-contract/021` scored it the strongest
 * consumer finding of the exercise.
 *
 * **The designers were wrong about the domain, and the reason is not that
 * attribution is hard.** They were designing for a population of actors this
 * system does not have. Substitute the real one — analyses run by agents, not by
 * people with names, tenure and accountability — and *who* has no referent. An
 * agent invocation is not a person: it does not persist between runs, accrues no
 * standing, and cannot be held to anything. Asking it to sign work imports a
 * governance model from human organisations into a record of computations.
 *
 * What the question was actually reaching for survives, and it is provenance:
 * **what ran, on what inputs, under what configuration.** That is what this
 * scenario checks, and the answer is that the model already carries it — the
 * configuration is an input artefact like any other, which is row L's
 * `CONSUMES` lineage doing exactly the job S-11 earned it for.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";

let scenario: Scenario;
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });

async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), { clock, events: inMemoryEventLog() });
}

async function inOneWorld<T>(build: (s: ResearchSession) => Promise<T>): Promise<T> {
  const graph = await scenario.begin();
  try {
    return await build(new ResearchSession(graph, { clock, events: inMemoryEventLog() }));
  } finally {
    await scenario.end();
  }
}

const MOVES = "the pruning schedule shifts the convergence point";
const CONFIG = "agent configuration";

describe("S-8b: there is no who, only what ran", () => {
  /**
   * Researcher: "Two analyses reached the same conclusion. One was run by an
   *  agent on last month's configuration and one on this month's. Which was
   *  which, and does the difference matter?"
   *
   * The question a human-organisation model would phrase as *who ran it*. Here
   * the configuration is the answer, and it is recorded as what it is: an input
   * with a content hash.
   */
  test("what produced an analysis is recoverable, and two configurations are distinguishable", async () => {
    const result = await inOneWorld(async (s) => {
      const enquiry = await s.openEnquiry("does the pruning schedule move convergence?");
      const readings = await s.recordObservations({
        enquiry, name: "sweep readings", finding: "twelve runs across the schedule",
        contentHash: "sha256:sweep",
      });
      const older = await s.recordObservations({
        enquiry, name: CONFIG, finding: "opus-5, temperature 0, prompt v3",
        contentHash: "sha256:cfg-v3",
      });
      const first = await s.recordAnalysis({
        enquiry, method: "convergence-fit", from: [readings, older],
        concludes: [{ proposition: MOVES, finding: "convergence moves by ~3 steps" }],
      });

      const newer = await s.recordObservations({
        enquiry, name: CONFIG, finding: "opus-5, temperature 0.7, prompt v4",
        contentHash: "sha256:cfg-v4",
      });
      await s.recordAnalysis({
        enquiry, method: "convergence-fit", from: [readings, newer],
        concludes: [{ proposition: MOVES, finding: "convergence moves by ~3 steps" }],
      });

      const reader = await afterwards();
      return {
        // Offering the older configuration against the older analysis matches.
        matched: await reader.reproducibilityOf(first, [
          { part: readings, hash: "sha256:sweep" },
          { part: older, hash: "sha256:cfg-v3" },
        ]),
        // Offering the newer one against it does not. "Which configuration
        // produced this" is answered by comparison, not by a signature.
        mismatched: await reader.reproducibilityOf(first, [
          { part: readings, hash: "sha256:sweep" },
          { part: older, hash: "sha256:cfg-v4" },
        ]),
        // And the configuration carries its dependants like any other input,
        // so "what rests on this configuration" is the ordinary propagation
        // question rather than a new kind of query.
        rests: await reader.whatDependsOn(older),
      };
    });

    expect(result.matched.exact.sort()).toEqual([CONFIG, "sweep readings"]);
    expect(result.matched.reproducible).toBe(true);
    expect(result.mismatched.differing).toEqual([CONFIG]);
    expect(result.mismatched.reproducible).toBe(false);
    expect(result.rests.claims).toEqual([MOVES]);
  });

  /**
   * The other half of S-8's Afterward, which was never the hard half:
   * *"and on what projected cost?"*
   *
   * A cost projection is a finding with provenance like any other, and an
   * approval is a decision taken on evidence against a stated condition. Both
   * were already expressible when S-8 ran. Asserted here so the claim that
   * "who approved it" dissolves into things the model has is checked rather
   * than argued — the decision names its reason, cites the finding it rests on,
   * and the criterion it was held to is recoverable.
   */
  test("approval is a decision on evidence against a condition, with no signer", async () => {
    const answer = await inOneWorld(async (s) => {
      const enquiry = await s.openEnquiry("should the run be scaled up?");
      const budget = await s.stateCriterion("projected cost under 40 GPU-hours");
      const readings = await s.recordObservations({
        enquiry, name: "cost projection", finding: "projected 31 GPU-hours at target scale",
      });
      const analysis = await s.recordAnalysis({
        enquiry, method: "cost-projection", from: [readings],
        concludes: [{ proposition: "the scale-up fits the budget", finding: "31 GPU-hours projected" }],
        heldTo: [budget],
      });
      await s.evaluateCriterion({
        criterion: budget, value: "31 GPU-hours", outcome: "pass",
        citing: { analysis, proposition: "the scale-up fits the budget" },
      });
      await s.closeEnquiry({
        enquiry,
        answeredBy: { analysis, proposition: "the scale-up fits the budget" },
      });
      return (await afterwards()).whySupported("the scale-up fits the budget");
    });

    // The approval is fully accounted for without anyone signing it: what was
    // concluded, on what evidence, against which prespecified condition, and
    // whether that condition was met.
    expect(answer.supported).toBe(true);
    expect(answer.standard.map((c) => c.proposition)).toEqual([
      "projected cost under 40 GPU-hours",
    ]);
    expect(answer.unmet).toEqual([]);
    expect(answer.support.map((x) => x.finding)).toEqual(["31 GPU-hours projected"]);
  });
});
