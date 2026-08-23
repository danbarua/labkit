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

  test("Bruno can now reach the question, and the wrong answer is still there", async () => {
    // **Half fixed, and the half that moved is the one PJ-030 §5 step 4
    // predicted.** Carrying a QuestionRef makes the question *reachable*: Bruno
    // now holds an id he can ask about separately. It does not stop
    // enquiryStatus answering about the question under his enquiry's name, so
    // the wrong answer stands until the closure semantics are decided.
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

      // Reachable now: an id, not the question's text.
      expect(status.question).not.toBeNull();
      expect(status.question).not.toBe(status.asks);

      // Still nothing distinguishing a pursuit that produced the answer from
      // one that produced nothing. `closure`, `answer` and `evidence` are all
      // the question's, under this enquiry's name.
      expect(status.closure).toBe("answered");
      expect(status.evidence.length).toBeGreaterThan(0);
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

describe("4. the read models drop identifiers the graph already minted", () => {
  /**
   * PJ-030 §4. Every entity here has a natural id, minted in the same round
   * trip that created it. Three reports carry one **beside** the wording, which
   * is the template; the rest emit wording alone and the caller cannot follow
   * it anywhere.
   *
   * This is the demonstration step of that plan. It asserts the defect, so it
   * goes **red** as each report is fixed — which is the point. When a row here
   * fails, delete the row.
   */
  const looksLikeAnId = (v: string) =>
    /^(Q|LOE|EU|EV|CLM|DEC|CRIT|CEVAL|GATE|REV|ART|COMP|TASK)_\d+$/.test(v);

  async function programme() {
    const s = await session();
    const question = await s.pose("does depth move convergence?");
    const enquiry = await s.pursue({ question, approach: "seed sweep" });
    const criterion = await s.stateCriterion("holds at five seeds");
    const work = await s.planWork({ objective: "publish the result", acceptance: "the check passes" });
    const gate = await s.declareGate({
      governedBy: [criterion], consequence: "may it be published?", protecting: [work],
    });
    const observations = await s.recordObservations({
      enquiry, name: "sweep readings", finding: "five seeds, consistent",
    });
    const analysis = await s.recordAnalysis({
      enquiry, method: "paired comparison", from: [observations],
      concludes: [{ proposition: MOVES, finding: "about three steps", standing: "confirmatory" }],
      implementing: work, heldTo: [criterion],
    });
    await s.evaluateCriterion({
      criterion, gate, value: "5/5 seeds", outcome: "pass",
      citing: { analysis, proposition: MOVES },
    });
    await s.closeEnquiry({ enquiry, answeredBy: { analysis, proposition: MOVES } });
    return { read: new ReadSurface(await scenario.current()), question, enquiry, gate, work, analysis };
  }

  test("the template: an id beside the wording, in the three reports that do it", async () => {
    try {
      const { read, analysis } = await programme();

      // whatIsKnown: `question` is the id, `asks` is the text.
      const known = await read.whatIsKnown();
      const standing = [...known.established, ...known.provisional][0]!;
      expect(looksLikeAnId(standing.question)).toBe(true);
      expect(looksLikeAnId(standing.asks)).toBe(false);

      // reproducibilityOf: `part` is the id, `name` is the text.
      const parts = await read.reproducibilityOf(analysis, []);
      const inputs = [...parts.exact, ...parts.differing, ...parts.unverifiable, ...parts.notRebuilt];
      expect(inputs.length).toBeGreaterThan(0);
      expect(inputs.every((p) => looksLikeAnId(p.part))).toBe(true);
      expect(inputs.every((p) => looksLikeAnId(p.name))).toBe(false);
    } finally {
      await scenario.end();
    }
  });

  test("EnquiryStatus identifies its question — FIXED, PJ-030 §5 step 2", async () => {
    try {
      const { read, enquiry, question } = await programme();
      const status = await read.enquiryStatus(enquiry);

      expect(looksLikeAnId(status.enquiry)).toBe(true);
      // The question it pursues, by identity -- and it is the RIGHT question,
      // not merely an id-shaped string.
      expect(status.question).toBe(question.id);
      expect(looksLikeAnId(status.asks!)).toBe(false);

      // Still outstanding: the evidence a closure rests on is statements, not
      // references. PJ-030 §4, EnquiryStatus.evidence[].
      expect(status.evidence.length).toBeGreaterThan(0);
      expect(status.evidence.every(looksLikeAnId)).toBe(false);
    } finally {
      await scenario.end();
    }
  });

  test("whatDependsOn now identifies what is affected — FIXED, PJ-030 §5 step 2", async () => {
    // Was: claims:["depth moves convergence"], enquiries:["seed sweep"] -- prose
    // no follow-up verb accepts. Now both, in the shape the other reports use.
    try {
      const { read } = await programme();
      const affected = await read.whatDependsOn("sweep readings");

      expect(affected.claims.length + affected.enquiries.length).toBeGreaterThan(0);
      expect(affected.claims.every((c) => looksLikeAnId(c.claim))).toBe(true);
      expect(affected.claims.every((c) => looksLikeAnId(c.asserts))).toBe(false);
      expect(affected.enquiries.every((e) => looksLikeAnId(e.enquiry))).toBe(true);
      expect(affected.enquiries.every((e) => looksLikeAnId(e.pursuing))).toBe(false);
    } finally {
      await scenario.end();
    }
  });

  test("whySupported cites the computation by method name, not by id", async () => {
    try {
      const { read } = await programme();
      const why = await read.whySupported(MOVES);

      expect(why.support.length).toBeGreaterThan(0);
      // `via` is the computation's method text. Two runs of one method are
      // indistinguishable here, which is the same wording-as-identity failure
      // whySupported itself REFUSES to make when resolving its argument.
      expect(why.support.every((s) => looksLikeAnId(s.via))).toBe(false);
      // The template, in the same report: restingOn carries both.
      expect(why.restingOn.every((p) => looksLikeAnId(p.part))).toBe(true);
      expect(why.restingOn.every((p) => looksLikeAnId(p.name))).toBe(false);
    } finally {
      await scenario.end();
    }
  });

  test("gateStatus names the work it gates by objective, not by id", async () => {
    try {
      const { read, gate } = await programme();
      const status = await read.gateStatus(gate);

      expect(looksLikeAnId(status.gate)).toBe(true);
      expect(status.gating.length).toBeGreaterThan(0);
      expect(status.gating.every(looksLikeAnId)).toBe(false);
      // The template again, one field over.
      expect(status.checks.every((c) => looksLikeAnId(c.criterion))).toBe(true);
    } finally {
      await scenario.end();
    }
  });

  const MOVES = "depth moves convergence";
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
