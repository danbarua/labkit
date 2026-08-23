/**
 * The write half's commands, held as values.
 *
 * `src/domain/commands.ts` is an extraction: every shape it names is one a
 * verb already declared inline. Structural typing means `tsc` passing proves
 * the shapes are unchanged — so what needs a test is not the shapes but the
 * property the extraction exists for.
 *
 * A caller can now **hold** a command before issuing it: build it, pass it
 * around, issue it later. That was impossible while the shapes were anonymous,
 * and it is exactly what an MCP write tool has to do — receive arguments over a
 * wire, assemble a command, then call. This file does that, and asserts the
 * record afterwards, so it fails if a command type stops being importable or
 * stops matching the verb it names.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  ReadSurface,
  ResearchSession,
  inMemoryEventLog,
  type Clock,
  type RecordObservationsCommand,
  type PursueCommand,
  type PromoteCommand,
  type CloseEnquiryCommand,
} from "../src/domain";
import { openScenario, type Scenario } from "./helpers/scenario";

let scenario: Scenario;
beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });

const clock: Clock = (() => {
  let t = 0;
  return { now: () => new Date(Date.UTC(2026, 2, 1) + t++ * 60_000).toISOString() };
})();

describe("commands are values a caller can hold", () => {
  test("a command built ahead of time issues the same act as an inline argument", async () => {
    const graph = await scenario.begin();
    try {
      const s = new ResearchSession(graph, { clock, events: inMemoryEventLog() });
      const question = await s.pose("does the pruning schedule move convergence?");

      // Built and held, not passed inline. The type annotation is the point:
      // it names a shape that had no name before this commit.
      const pursuing: PursueCommand = { question, approach: "paired sweep" };
      const enquiry = await s.pursue(pursuing);

      const observing: RecordObservationsCommand = {
        enquiry,
        name: "sweep readings",
        finding: "twelve runs at five seeds",
      };
      const observations = await s.recordObservations(observing);

      const analysis = await s.recordAnalysis({
        enquiry,
        method: "paired comparison",
        from: [observations],
        concludes: [{ proposition: PROP, finding: "moves by ~3 steps" }],
      });

      // A command assembled from a previous act's return value -- the shape an
      // adapter is in when it has just answered one call and is making the next.
      const promoting: PromoteCommand = {
        claim: { analysis, proposition: PROP },
        because: "checked against the held-out split",
      };
      await s.promote(promoting);

      const closing: CloseEnquiryCommand = {
        enquiry,
        answeredBy: { analysis, proposition: PROP },
      };
      await s.closeEnquiry(closing);

      const read = new ReadSurface(await scenario.current());
      const why = await read.whySupported(PROP);
      expect(why.supported).toBe(true);
      expect(why.promotedBecause).toBe("checked against the held-out split");

      const known = await read.whatIsKnown();
      expect(known.established.map((q) => q.asks)).toContain(
        "does the pruning schedule move convergence?",
      );
    } finally {
      await scenario.end();
    }
  });

  const PROP = "the pruning schedule moves convergence";
});
