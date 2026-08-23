/**
 * **Which record is this answer about?**
 *
 * Six regions of this model have had to decide that *identity is never
 * wording* — claims, interpretations, criteria, evaluations, execution inputs
 * and artefacts. All six are the same question asked at one end: *are these two
 * records the same one?*
 *
 * This file is the question asked at the other end. A reference denotes a
 * record; a verb takes the reference and answers something. **Is the answer
 * about the record the reference denotes?** Three places in the domain say no,
 * and they were found within a day of each other by exposing the whole surface
 * over MCP, where every handle is a bare string and nothing can be passed by
 * accident.
 *
 * | reference | the id denotes | what the verb takes it to mean |
 * | --- | --- | --- |
 * | `EnquiryRef` into `enquiryStatus` | a line of enquiry | the **question** it pursues |
 * | `ObservationsRef` | an artefact of either kind | "observations", asserted by `kind` |
 * | `AnalysisRef` as an input | a computation | that computation's **output artefact** |
 *
 * **These tests assert what the model does today, including where that is
 * wrong.** Section 1 pins a confidently incorrect answer on purpose: a line of
 * enquiry nobody worked on reporting itself answered, carrying another line's
 * evidence. When that is fixed this file goes red, which is the intent — a
 * green run here means the ambiguities are still present, not that they are
 * acceptable.
 *
 * One diagnosis does not imply one remedy. CLAUDE.md records four scenarios
 * asking *does the act record what it produced?* that needed four different
 * fixes; this may go the same way. Section 2's dereference is convenient and
 * writes the correct edge, and making it "honest" would mean callers naming
 * artefacts they do not hold.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ReadSurface, ResearchSession, WriteSurface, inMemoryEventLog, type Clock } from "../src/domain";
import { buildServer } from "../src/mcp/server";
import { openScenario, type Scenario } from "./helpers/scenario";

let scenario: Scenario;
beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });

const clock: Clock = (() => {
  let t = 0;
  return { now: () => new Date(Date.UTC(2026, 2, 1) + t++ * 60_000).toISOString() };
})();

const session = async () =>
  new ResearchSession(await scenario.begin(), { clock, events: inMemoryEventLog() });

/** A client over the real server, for the ambiguities only a consumer can see. */
async function overTheWire() {
  const graph = await scenario.begin();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const writes = new WriteSurface(graph);
  await buildServer(new ReadSurface(graph, { events: writes.events }), writes).connect(serverSide);
  const client = new Client({ name: "subject-identity", version: "0" });
  await client.connect(clientSide);
  return client;
}

const call = async (c: Client, name: string, args: Record<string, unknown>) => {
  const result = await c.callTool({ name, arguments: args });
  return {
    failed: result.isError ?? false,
    body: result.structuredContent as Record<string, unknown>,
    message: JSON.stringify(result.content),
  };
};

describe("1. an enquiry's status is the question's status", () => {
  /**
   * Ana runs the seed sweep, Bruno the ablation, on one question. Ana's is
   * decisive and gets closed. Bruno asks where his is up to.
   *
   * S-1's fourth Afterward already establishes the setup — two pursuits of one
   * question stay one question — and stops one step before this.
   */
  test("closing one pursuit reports every pursuit of that question as answered", async () => {
    const s = await session();
    try {
      const question = await s.pose("does depth move convergence?");
      const anasSweep = await s.pursue({ question, approach: "seed sweep" });
      const brunosAblation = await s.pursue({ question, approach: "ablation" });

      const readings = await s.recordObservations({
        enquiry: anasSweep, name: "seed sweep readings", finding: "five seeds, consistent",
      });
      const analysis = await s.recordAnalysis({
        enquiry: anasSweep, method: "paired comparison", from: [readings],
        concludes: [{ proposition: MOVES, finding: "about three steps" }],
      });
      await s.closeEnquiry({ enquiry: anasSweep, answeredBy: { analysis, proposition: MOVES } });

      const later = new ResearchSession(await scenario.current(), { clock });
      const ana = await later.enquiryStatus(anasSweep);
      const bruno = await later.enquiryStatus(brunosAblation);

      // Ana's is right.
      expect(ana.open).toBe(false);
      expect(ana.closure).toBe("answered");

      // **Bruno's is wrong, and this is the demonstration.** Nothing was ever
      // recorded against the ablation. It reports itself answered.
      expect(bruno.open).toBe(false);
      expect(bruno.closure).toBe("answered");

      // Worse than a wrong flag: it offers Ana's evidence as its own.
      expect(bruno.evidence).toEqual(ana.evidence);
      expect(bruno.evidence).not.toEqual([]);

      // The two reports differ in exactly one field -- the id of the thing they
      // claim to be about. Everything else is the question's.
      expect(bruno.enquiry).not.toBe(ana.enquiry);
      expect(bruno.question).toBe(ana.question);
      const { enquiry: _a, ...anaRest } = ana;
      const { enquiry: _b, ...brunoRest } = bruno;
      expect(brunoRest).toEqual(anaRest);
    } finally {
      await scenario.end();
    }
  });

  test("the two facts Bruno needs cannot both be read", async () => {
    // "The question is answered" and "my line has produced nothing" are
    // different facts. One read returns one state, so the second is unavailable
    // -- not wrong, absent. Compare S-1's refusal to collapse `untested` into
    // `unresolved`, which is this distinction one level up.
    const s = await session();
    try {
      const question = await s.pose("does width matter?");
      const worked = await s.pursue({ question, approach: "width sweep" });
      const untouched = await s.pursue({ question, approach: "second opinion" });

      const readings = await s.recordObservations({
        enquiry: worked, name: "width readings", finding: "it does",
      });
      const analysis = await s.recordAnalysis({
        enquiry: worked, method: "sweep", from: [readings],
        concludes: [{ proposition: WIDTH, finding: "it does" }],
      });
      await s.closeEnquiry({ enquiry: worked, answeredBy: { analysis, proposition: WIDTH } });

      const later = new ResearchSession(await scenario.current(), { clock });
      const status = await later.enquiryStatus(untouched);

      // Nothing in the report distinguishes a pursuit that produced the answer
      // from one that produced nothing. Both fields below are the question's.
      expect(Object.keys(status).sort()).toEqual(
        ["answer", "closure", "enquiry", "evidence", "open", "question", "restsOn"].sort(),
      );
      // There is no field that could carry "this pursuit contributed nothing".
      expect(status).not.toHaveProperty("contributed");
    } finally {
      await scenario.end();
    }
  });

  const MOVES = "depth moves convergence";
  const WIDTH = "width matters";
});

describe("2. an artefact id does not say what kind of artefact it is", () => {
  test("observations and an analysis's output share one identity space", async () => {
    const s = await session();
    try {
      const enquiry = await s.openEnquiry("does it hold?");
      const observations = await s.recordObservations({
        enquiry, name: "raw readings", finding: "twelve runs",
      });
      const analysis = await s.recordAnalysis({
        enquiry, method: "stage one", from: [observations],
        concludes: [{ proposition: HOLDS, finding: "it holds" }],
      });

      const later = new ReadSurface(await scenario.current());
      const parts = await later.reproducibilityOf(analysis, []);
      const consumed = [...parts.exact, ...parts.differing, ...parts.unverifiable, ...parts.notRebuilt];

      // Raw measurement is an artefact.
      expect(observations.id.startsWith("ART_")).toBe(true);
      // So is what the analysis produced -- same prefix, same space.
      const output = consumed.map((p) => p.part);
      expect(output.every((id) => id.startsWith("ART_"))).toBe(true);

      // And the ref asserts a kind the id cannot support: `observations.kind`
      // says "observations" about an id whose prefix is shared with outputs.
      expect(observations.kind).toBe("observations");
    } finally {
      await scenario.end();
    }
  });

  test("an analysis ref used as an input means that analysis's output artefact", async () => {
    // Both routes write the same edge. The reference denotes a computation; the
    // verb takes it to mean the artefact the computation produced.
    const s = await session();
    try {
      const enquiry = await s.openEnquiry("two stage?");
      const raw = await s.recordObservations({ enquiry, name: "raw", finding: "f" });
      const stageOne = await s.recordAnalysis({
        enquiry, method: "stage one", from: [raw],
        concludes: [{ proposition: "p1", finding: "f1" }],
      });
      const viaAnalysis = await s.recordAnalysis({
        enquiry, method: "stage two, by analysis ref", from: [stageOne],
        concludes: [{ proposition: "p2a", finding: "f2" }],
      });

      const read = new ReadSurface(await scenario.current());
      const consumedByA = await read.reproducibilityOf(viaAnalysis, []);
      const outputOfStageOne = [...consumedByA.unverifiable, ...consumedByA.notRebuilt][0]?.part;
      expect(outputOfStageOne?.startsWith("ART_")).toBe(true);

      const viaArtefact = await s.recordAnalysis({
        enquiry,
        method: "stage two, by artefact id",
        from: [{ kind: "observations", id: outputOfStageOne! }],
        concludes: [{ proposition: "p2b", finding: "f2" }],
      });
      const consumedByB = await read.reproducibilityOf(viaArtefact, []);

      // Indistinguishable. The `kind` on the second was a lie and cost nothing,
      // which is why this is an ambiguity rather than a defect.
      expect(consumedByB.unverifiable).toEqual(consumedByA.unverifiable);
    } finally {
      await scenario.end();
    }
  });

  const HOLDS = "it holds";
});

describe("3. the ambiguity is only harmless where you hold both handles", () => {
  test("a consumer with only its own handles cannot repair a two-stage pipeline", async () => {
    // Section 2 showed the two routes equivalent -- measured inside the process,
    // holding an artefact id the domain handed back. A consumer over the wire
    // holds what the tools returned, which for an analysis is a computation id.
    const client = await overTheWire();
    try {
      const enquiry = (await call(client, "open_enquiry", { question: "two stage?" })).body;
      const raw = (await call(client, "record_observations", {
        enquiry: enquiry.id, name: "raw", finding: "f",
      })).body;
      const stageOne = (await call(client, "record_analysis", {
        enquiry: enquiry.id, method: "stage one", from: [raw.id],
        concludes: [{ proposition: "p1", finding: "f1" }],
      })).body;
      const stageTwo = (await call(client, "record_analysis", {
        enquiry: enquiry.id, method: "stage two", from: [stageOne.id],
        concludes: [{ proposition: "p2", finding: "f2" }],
      })).body;
      const review = (await call(client, "record_review", {
        of: stageTwo.id, verdict: "stage two mis-specified",
      })).body;

      // Recording stage two on stage one was accepted.
      expect(String(stageOne.id).startsWith("COMP_")).toBe(true);

      // Repairing it, on the same input, is not.
      const repair = await call(client, "replace_analysis", {
        supersedes: stageTwo.id, because: review.id, enquiry: enquiry.id,
        method: "stage two, corrected", from: [stageOne.id],
        concludes: [{ proposition: "p2", finding: "f2 corrected" }],
      });
      expect(repair.failed).toBe(true);
      expect(repair.message).toContain("CONSUMES does not allow Computation -> Computation");

      // The artefact id that would work is reachable, by asking why a claim is
      // supported in order to learn what a computation read.
      const why = (await call(client, "why_supported", { proposition: "p2" })).body;
      const restingOn = why.restingOn as Array<{ part: string; name: string }>;
      expect(restingOn.some((p) => p.part.startsWith("ART_"))).toBe(true);

      const viaTheDetour = await call(client, "replace_analysis", {
        supersedes: stageTwo.id, because: review.id, enquiry: enquiry.id,
        method: "stage two, corrected", from: [restingOn[0]!.part],
        concludes: [{ proposition: "p2", finding: "f2 corrected" }],
      });
      expect(viaTheDetour.failed).toBe(false);
      await client.close();
    } finally {
      await scenario.end();
    }
  });
});
