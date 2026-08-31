/**
 * S-9b — "Was this a rebuild, or new work?"
 * docs/project-journal/008_user_story_mining.md §3 row F
 * docs/consumer-contract/027_row_f_predictions.md
 *
 * **Rung 1.** Built to be shown insufficient before anything is added, the way
 * row Z's was. Nothing in `src/` changes on this commit.
 *
 * Where the story comes from matters more than usual here. Row F is the oldest
 * unowned row in the ledger and a scenario written to satisfy it would
 * manufacture its own result (PJ-011 §5). This one is not: Designer 2 — cold,
 * with no access to S-9, row F or this repository — independently required a
 * durable reconstruction attempt whose remembered fields include its historical
 * target. `023` recorded that as the external pressure the scenario method was
 * waiting for and could not produce from inside itself.
 *
 * S-9 left row F half-settled. It settled **identity**: two artefacts may share
 * a `logical_name`, and refusing the ambiguous name stops the regenerated one
 * inheriting the historical one's dependants. What it did not settle is
 * **direction** — a reader holding only the rebuilt artefact cannot say what it
 * was rebuilding, because the rebuild is written by an ordinary
 * `recordObservations()` naming nothing historical.
 *
 * Imports only src/domain — never src/db (enforced).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ResearchSession, inMemoryEventLog, type Clock } from "../../src/domain";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimOf } from "../helpers/claims";

let scenario: Scenario;

/**
 * Frozen, not merely fixed. Two worlds that a read could separate only because
 * wall-clock time moved between them would have been separated as test runs,
 * not as research states — `tests/helpers/clock.ts` on why that distinction is
 * load-bearing.
 */
const clock: Clock = { now: () => "2026-08-21T09:00:00.000Z" };

beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

/** A second reader over the same graph — see tests/helpers/scenario.ts. */
async function afterwards(): Promise<ResearchSession> {
  return new ResearchSession(await scenario.current(), {
    clock,
    events: inMemoryEventLog(),
  });
}

/**
 * One world, begun and torn down inside the test.
 *
 * `beforeEach`/`afterEach` cannot own the lifecycle here, because the
 * paired-world tests below open and close two graphs of their own within a
 * single test; the two managers raced and closed the connection twice.
 */
async function inOneWorld<T>(build: (s: ResearchSession) => Promise<T>): Promise<T> {
  const graph = await scenario.begin();
  try {
    return await build(new ResearchSession(graph, { clock, events: inMemoryEventLog() }));
  } finally {
    await scenario.end();
  }
}

const CONTROL = "historical random control";
const MATCHES = "the accelerated path matches the reference";

/**
 * Two worlds, each built from scratch on its own graph, then compared.
 *
 * The clock is reset per world and never wound, so the two cannot be told
 * apart by wall-clock time — a read that separated them only because time
 * passed would have distinguished the test runs, not the research states.
 */
async function inTwoWorlds<T>(
  worldA: (s: ResearchSession) => Promise<T>,
  worldB: (s: ResearchSession) => Promise<T>,
): Promise<{ a: T; b: T }> {
  return { a: await inOneWorld(worldA), b: await inOneWorld(worldB) };
}

/**
 * Researcher: "There's a cached construction from the old study. The control
 *  that went into it has no recorded provenance — nobody wrote down what
 *  generated it."
 *
 * S-9's opening situation, kept deliberately identical so that what this
 * scenario adds is visible against it.
 */
async function theCachedConstruction(s: ResearchSession) {
  const { enquiry } = await s.openEnquiry("does the accelerated path match the reference?");
  const { observations: control } = await s.recordObservations({
    enquiry,
    name: CONTROL,
    finding: "randomised control series",
  });
  const { analysis, claims: analysisClaims } = await s.recordAnalysis({
    enquiry,
    method: "stage2-construction",
    from: [control],
    concludes: [{ proposition: MATCHES, finding: "agreement within 1e-6" }],
  });
  return { enquiry, control, analysis, analysisClaims };
}

/** Replaces every natural-id counter with `N`, so two worlds compare on structure. */
function normaliseIds<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replace(
      /"(Q|LOE|EU|EV|CLM|DEC|CRIT|CEVAL|GATE|REV|ART|COMP|TASK)_\d+"/g,
      '"$1_N"',
    ),
  ) as T;
}

describe("S-9b: was this a rebuild, or new work?", () => {
  /**
   * The control, and it is doing the same job probe 1 does in the consumer
   * slice: it proves the harness **can** return unequal answers for two
   * worlds. Without it, every equality below would be uninterpretable — it
   * could be a fact about `inTwoWorlds` rather than about the read surface.
   *
   * The worlds differ in something a researcher plainly cares about: whether
   * the second control agrees with the first.
   */
  test("two worlds that differ in what the record says are told apart", async () => {
    const build = (recorded: string) => async (s: ResearchSession) => {
      const { enquiry } = await theCachedConstruction(s);
      const { observations: second } = await s.recordObservations({
        enquiry,
        name: "second control",
        finding: "control series, second pass",
        contentHash: recorded,
      });
      const { analysis: rebuilt } = await s.recordAnalysis({
        enquiry,
        method: "stage2-construction, second control",
        from: [second],
        concludes: [
          {
            proposition: "the second control agrees",
            finding: "agreement within 1e-6",
          },
        ],
      });
      // The same rebuild offered in both worlds; only what the record holds
      // differs.
      return (await afterwards()).reproducibilityOf(rebuilt, [
        { part: second, hash: "sha256:one" },
      ]);
    };
    const { a, b } = await inTwoWorlds(build("sha256:one"), build("sha256:two"));

    expect(a.exact.map((p) => p.name)).toEqual(["second control"]);
    expect(a.reproducible).toBe(true);
    expect(b.differing.map((p) => p.name)).toEqual(["second control"]);
    expect(b.reproducible).toBe(false);
  });

  /**
   * Rung 1, and the finding. Two research situations that mean different
   * things produce **the same durable record**.
   *
   * World A: the second researcher infers the old algorithm and regenerates
   * the control. It is a reconstruction of the historical one.
   *
   * World B: the second researcher generates a control for a new stage,
   * independently, from a method they wrote themselves. It reconstructs
   * nothing. It carries the same name because that is what such a series is
   * called.
   *
   * A consumer asking Designer 2's question — *is this original work or an
   * attempt to rebuild something, and if so, of what?* — has the same bytes to
   * work from in both worlds.
   */
  test("a reconstruction and independent fresh work leave the same durable record", async () => {
    const build = (finding: string) => async (s: ResearchSession) => {
      const { enquiry } = await theCachedConstruction(s);
      const { observations: second } = await s.recordObservations({
        enquiry,
        name: CONTROL,
        finding,
        contentHash: "sha256:second",
      });
      const { analysis: rebuilt, claims: rebuiltClaims } = await s.recordAnalysis({
        enquiry,
        method: "stage2-construction, second control",
        from: [second],
        concludes: [{ proposition: MATCHES, finding: "agreement within 1e-6" }],
      });
      const reader = await afterwards();
      return {
        why: await reader.whySupported(claimOf(rebuiltClaims, MATCHES)),
        known: (await reader.whatIsKnown()).provisional.map((q) => q.asks).sort(),
        // Identity normalised, the way `rebuilt` below already is. Natural ids
        // are global sequences, so two paired worlds legitimately draw
        // different ones -- comparing them raw would report a difference that
        // is only the counter moving. What the comparison is for is whether
        // anything *else* differs.
        depends: normaliseIds(await reader.whatDependsOn(second)),
        rebuilt: rebuilt.replace(/\d+/, "N"),
      };
    };

    const { a, b } = await inTwoWorlds(
      build("randomised control series, regenerated from an inferred algorithm"),
      build("randomised control series for stage 3, generated afresh"),
    );

    // Everything a reader can ask is identical except the sentence the
    // researcher happened to type. Attribution of a rebuild is currently
    // **only wording**, which is the seventh region in which identity has had
    // to be separated from what something says.
    expect(a.why.support.length).toBe(b.why.support.length);
    expect(a.why.reverifiedBy).toEqual(b.why.reverifiedBy);
    expect(a.known).toEqual(b.known);
    expect(a.depends).toEqual(b.depends);
    expect(a.rebuilt).toEqual(b.rebuilt);
  });

  /**
   * And here is the part that decides whether row F clears PJ-011 §5 or stays
   * an absence: **what does the record actually claim** in the world where the
   * second control is a rebuild?
   *
   * If `whySupported()` reports the proposition resting on two independent
   * findings, that is the S-10 wrong answer at the artefact level — a claim
   * established once reporting itself corroborated twice — and it is
   * demonstrated, not argued.
   */
  test("what the record claims when the second control is a rebuild", async () => {
    const why = await inOneWorld(async (s) => {
      const { enquiry } = await theCachedConstruction(s);
      const { observations: regenerated } = await s.recordObservations({
        enquiry,
        name: CONTROL,
        contentHash: "sha256:second",
        finding: "randomised control series, regenerated from an inferred algorithm",
      });
      const { claims: secondClaims } = await s.recordAnalysis({
        enquiry,
        method: "stage2-construction, rebuilt",
        from: [regenerated],
        concludes: [{ proposition: MATCHES, finding: "agreement within 1e-6" }],
      });
      return (await afterwards()).whySupported(claimOf(secondClaims, MATCHES));
    });
    // Recorded, not asserted-as-correct. Whether two entries here is a wrong
    // answer or an accurate report of what the researcher recorded is the
    // question this scenario exists to settle; the number is written down so
    // the answer is a fact rather than a recollection.
    expect(why.support.length).toBe(2);
    expect(why.reverifiedBy).toEqual([]);
  });

  /**
   * Rung 2, tested rather than argued: does a verb that already exists record
   * the rebuild as an act with a target?
   *
   * `reverify()` is the closest thing on the surface — it writes
   * `Evidence -REVERIFIES-> Evidence` and `whySupported()` reads it back as
   * "re-checked, not independently corroborated". If the rebuild can be
   * recorded through it, the double count above is preventable with no model
   * change at all, and row F does not get to claim it.
   */
  test("the rebuild recorded through the verb that already exists", async () => {
    const why = await inOneWorld(async (s) => {
      const { enquiry, analysis } = await theCachedConstruction(s);
      const { observations: regenerated } = await s.recordObservations({
        enquiry,
        name: CONTROL,
        contentHash: "sha256:second",
        finding: "randomised control series, regenerated from an inferred algorithm",
      });
      const verified = await s.reverify({
        historical: analysis,
        enquiry,
        method: "stage2-construction, rebuilt",
        under: [regenerated],
        concludes: { proposition: MATCHES, finding: "agreement within 1e-6" },
      });
      return (await afterwards()).whySupported(claimOf(verified.claims, MATCHES));
    });
    expect(why.support.length).toBe(1);
    expect(why.reverifiedBy.map((r) => r.method)).toEqual(["stage2-construction, rebuilt"]);
  });

  /**
   * **Row AD, and this test has been inverted rather than deleted.**
   *
   * It shipped asserting the wrong answer on purpose, with the assertion it
   * *should* make sitting in a comment beside it, and those are now the two
   * live lines. Nothing about the scenario changed — only what the record says
   * about it.
   *
   * A researcher opens the question of what generated the historical control
   * and works on it: three candidate algorithms tried, none reproduces the
   * recorded series. That is real, recorded, durable work, and a negative
   * result is a result. `whatIsKnown()` used to report the question
   * **`untested`** — *"one nothing has ever been run against"*, in the survey's
   * own words — because `recordObservations()` created `Evidence` with no
   * producing `EvidenceUnit`, which PJ-001 defines as impossible, and the
   * survey's `worked` test walks `EvidenceUnit -ADDRESSES-> LineOfEnquiry`.
   * Work recorded as observations was invisible to it; work recorded as an
   * analysis was not. The sibling question below reads `unresolved` and always
   * did, which is what isolated the cause rather than alleging it.
   *
   * Three cold reviewers flagged the missing unit independently and three
   * scenarios were pointed at it without finding harm beyond a reader's. This
   * was the fourth and the first to produce a wrong answer, which is what
   * PJ-011 §5 asks for and what made the fix mandatory rather than optional.
   *
   * The sibling assertion is kept for the same reason it was useful as a
   * diagnosis: if a future change makes `unresolved` unreachable, this test
   * must fail for that too, not quietly agree with itself.
   */
  test("a reconstruction attempt that fails is not a question nobody has looked at", async () => {
    const { untested, unresolved } = await inOneWorld(async (s) => {
      const { enquiry } = await theCachedConstruction(s);
      const { enquiry: provenance } = await s.openEnquiry(
        "what generated the historical random control?",
      );

      // The attempt, recorded against the question it is an attempt to answer.
      await s.recordObservations({
        enquiry: provenance,
        name: "regeneration attempt",
        finding: "three candidate algorithms tried; none reproduces the recorded series",
      });
      // And an unrelated regeneration on the original enquiry, so the two
      // enquiries are not trivially distinguishable by having any work at all.
      await s.recordObservations({
        enquiry,
        name: CONTROL,
        contentHash: "sha256:second",
        finding: "randomised control series, regenerated from an inferred algorithm",
      });

      const known = await (await afterwards()).whatIsKnown();
      return {
        untested: known.untested.map((q) => q.asks),
        unresolved: known.unresolved.map((q) => q.asks),
      };
    });

    expect(unresolved).toContain("what generated the historical random control?");
    expect(untested).not.toContain("what generated the historical random control?");

    // The sibling, unchanged by the fix and unchanged before it: a question
    // worked on through recordAnalysis(), which always minted a unit.
    expect(unresolved).toContain("does the accelerated path match the reference?");
  });

  /**
   * Where rung 2 stops, stated precisely rather than gestured at.
   *
   * `reverify()` re-checks a **conclusion**: it looks up the finding by which
   * the historical analysis concluded a proposition, and refuses when there is
   * none. Designer 2's case is a researcher who rebuilt an *input* and drew no
   * conclusion at all — the control was regenerated so that later work could
   * proceed, not to re-check anything. There is no proposition to name, so the
   * verb that would have recorded the act declines, correctly.
   *
   * This is the boundary, and it is worth being exact about: rung 2 covers a
   * rebuild that concludes something, which is the case that could otherwise
   * produce a wrong answer. It does not cover a rebuild that concludes nothing,
   * which produces no answer at all.
   */
  test("a rebuild that concludes nothing has no act to be recorded as", async () => {
    await inOneWorld(async (s) => {
      const { enquiry, analysis } = await theCachedConstruction(s);
      const { observations: regenerated } = await s.recordObservations({
        enquiry,
        name: CONTROL,
        contentHash: "sha256:second",
        finding: "randomised control series, regenerated from an inferred algorithm",
      });

      // The researcher has rebuilt the control and concluded nothing from it.
      // The only verb on the surface that records an act with a historical
      // target insists on a conclusion to re-check.
      await expect(
        s.reverify({
          historical: analysis,
          enquiry,
          method: "control regeneration",
          under: [regenerated],
          concludes: {
            proposition: "the control was regenerated from an inferred algorithm",
            finding: "series regenerated",
          },
        }),
      ).rejects.toThrow(/concluded nothing about/);
    });
  });

  /**
   * What `reverify()` still does not answer, stated on its own so the
   * remaining gap is not overstated or lost.
   *
   * It records that a *finding* was re-checked. Designer 2 asked about an
   * *artefact*: what was this thing an attempt to rebuild? A reader holding
   * the regenerated control has no route from it to the control it replaces.
   */
  test("what was this artefact rebuilding — still nothing answers", async () => {
    await inOneWorld(async (s) => {
      const { enquiry, analysis } = await theCachedConstruction(s);
      const { observations: regenerated } = await s.recordObservations({
        enquiry,
        name: CONTROL,
        contentHash: "sha256:second",
        finding: "randomised control series, regenerated from an inferred algorithm",
      });
      await s.reverify({
        historical: analysis,
        enquiry,
        method: "stage2-construction, rebuilt",
        under: [regenerated],
        concludes: { proposition: MATCHES, finding: "agreement within 1e-6" },
      });

      const reader = await afterwards();
      // Asking by name is refused, which is S-9's answer and is correct.
      await expect(reader.whatDependsOn(CONTROL)).rejects.toThrow(/2 artefacts are named/);

      // Asking by reference answers about that artefact only. The assertion is
      // on the report's **shape**, not on its values, and that is deliberate:
      // a test that only checked `claims` would stay green after row F was
      // closed, which is the defect external review found in the first draft
      // of consumer probe 3. Give any read on this path a field naming what
      // was rebuilt and this line fails.
      //
      // It has now fired twice, correctly, on changes that had nothing to do
      // with row F: S-11c added `routesWalked` and `complete`, and PJ-030
      // added `subject` -- the handle of the artefact ASKED ABOUT, which is
      // not the artefact it was an attempt to rebuild. The detector cannot
      // tell which field arrived, only that the shape moved, which is what it
      // is for and why the list is updated rather than loosened.
      const exact = await reader.whatDependsOn(regenerated);
      expect(Object.keys(exact).sort()).toEqual([
        "claims",
        "complete",
        "enquiries",
        "routesWalked",
        "subject",
      ]);
      // And the echo is of the record asked about, not merely of its wording.
      expect(exact.subject).toEqual(regenerated);
      expect(exact.claims.map((c) => c.asserts)).toEqual([MATCHES]);

      // Same detector on the other read a consumer would reach for. The
      // reproducibility report is offered per part and says which parts match;
      // no field of it says what any part was an attempt to rebuild.
      const report = await reader.reproducibilityOf(analysis, [
        { part: regenerated, hash: "sha256:second" },
      ]);
      // `analysis` here is likewise the construction handed in, not an answer
      // to what any part was rebuilding.
      expect(Object.keys(report).sort()).toEqual([
        "analysis",
        "differing",
        "exact",
        "notRebuilt",
        "reproducible",
        "unverifiable",
      ]);
      expect(report.analysis).toEqual(analysis);
    });
  });
});
