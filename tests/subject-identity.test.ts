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
import { claimNamed, claimOf } from "./helpers/claims";

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

describe("1. an enquiry's status was the question's status — FIXED, PJ-030 §6", () => {
  /**
   * Ana runs the seed sweep, Bruno the ablation, on one question. Ana's is
   * decisive and gets closed. Bruno asks where his is up to.
   *
   * S-1's fourth Afterward already establishes the setup — two pursuits of one
   * question stay one question — and stops one step before this.
   */
  test("closing one pursuit no longer reports the other as having produced it", async () => {
    const s = await session();
    try {
      const question = await s.pose("does depth move convergence?");
      const anasSweep = await s.pursue({ question, approach: "seed sweep" });
      const brunosAblation = await s.pursue({ question, approach: "ablation" });

      const readings = await s.recordObservations({
        enquiry: anasSweep, name: "seed sweep readings", finding: "five seeds, consistent",
      });
      const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
        enquiry: anasSweep, method: "paired comparison", from: [readings],
        concludes: [{ proposition: MOVES, finding: "about three steps" }],
      });
      await s.closeEnquiry({ enquiry: anasSweep, answeredBy: claimOf(analysisClaims, MOVES) });

      const later = new ResearchSession(await scenario.current(), { clock });
      const ana = await later.enquiryStatus(anasSweep);
      const bruno = await later.enquiryStatus(brunosAblation);

      // One question, pursued twice. Its state is the same in both reports --
      // correctly, because it is nested under `question` where neither pursuit
      // can be read as owning it.
      expect(ana.question!.question.id).toBe(bruno.question!.question.id);
      expect(ana.question!.closure).toBe("answered");
      expect(bruno.question!.closure).toBe("answered");

      // **The fix.** What each pursuit itself produced -- the thing the two
      // reports must NOT agree on. Before PJ-030 §6 the closing evidence was a
      // top-level field on both, so a caller summing findings across pursuits
      // counted one finding twice.
      // Ana's pursuit produced the observations AND the analysis; the closure
      // cites only the latter. Two different sets, deliberately -- "what this
      // pursuit produced" is not "what the answer rests on".
      const anasFindings = ana.contributed.map((e) => e.evidence.id);
      const closingEvidence = ana.question!.evidence.map((e) => e.evidence.id);
      expect(closingEvidence.every((id) => anasFindings.includes(id))).toBe(true);
      expect(anasFindings.length).toBeGreaterThan(closingEvidence.length);

      expect(bruno.contributed).toEqual([]);
      expect(bruno.pursuing).not.toBe(ana.pursuing);

      // The reader that used to be wrong: sum findings over every pursuit.
      const counted = [ana, bruno].flatMap((st) => st.contributed.map((e) => e.evidence.id));
      expect(counted.length).toBe(new Set(counted).size);
    } finally {
      await scenario.end();
    }
  });

  test("both facts a second pursuit needs are now separately readable", async () => {
    // The scenario's first Afterward bullet: *where is my ablation up to?*
    // Two facts, and one report used to answer only the question's -- under the
    // enquiry's name, which made it look like the enquiry's own.
    const s = await session();
    try {
      const question = await s.pose("does width matter?");
      const worked = await s.pursue({ question, approach: "width sweep" });
      const untouched = await s.pursue({ question, approach: "second opinion" });

      const readings = await s.recordObservations({
        enquiry: worked, name: "width readings", finding: "it does",
      });
      const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
        enquiry: worked, method: "sweep", from: [readings],
        concludes: [{ proposition: WIDTH, finding: "it does" }],
      });
      await s.closeEnquiry({ enquiry: worked, answeredBy: claimOf(analysisClaims, WIDTH) });

      const later = new ResearchSession(await scenario.current(), { clock });
      const status = await later.enquiryStatus(untouched);

      // Fact one: the question is answered, and the report says which question.
      expect(status.question!.question).not.toBeNull();
      expect(status.question!.closure).toBe("answered");
      expect(status.question!.evidence.length).toBeGreaterThan(0);

      // Fact two: this pursuit produced nothing. A real answer, and one the
      // flattened shape could not give -- it had no field that could hold it.
      expect(status.contributed).toEqual([]);
      expect(status.pursuing).toBe("second opinion");
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
      const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
        enquiry, method: "stage one", from: [observations],
        concludes: [{ proposition: HOLDS, finding: "it holds" }],
      });

      const later = new ReadSurface(await scenario.current());
      const parts = await later.reproducibilityOf(analysis, []);
      const consumed = [...parts.exact, ...parts.differing, ...parts.unverifiable, ...parts.notRebuilt];

      // Raw measurement is an artefact.
      expect(observations.id.startsWith("ART_")).toBe(true);
      // So is what the analysis produced -- same prefix, same space.
      const output = consumed.map((p) => p.part.id);
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
      const { analysis: stageOne, claims: stageOneClaims } = await s.recordAnalysis({
        enquiry, method: "stage one", from: [raw],
        concludes: [{ proposition: "p1", finding: "f1" }],
      });
      const { analysis: viaAnalysis, claims: viaAnalysisClaims } = await s.recordAnalysis({
        enquiry, method: "stage two, by analysis ref", from: [stageOne],
        concludes: [{ proposition: "p2a", finding: "f2" }],
      });

      const read = new ReadSurface(await scenario.current());
      const consumedByA = await read.reproducibilityOf(viaAnalysis, []);
      const outputOfStageOne = [...consumedByA.unverifiable, ...consumedByA.notRebuilt][0]?.part;
      expect(outputOfStageOne?.id.startsWith("ART_")).toBe(true);

      const { analysis: viaArtefact, claims: viaArtefactClaims } = await s.recordAnalysis({
        enquiry,
        method: "stage two, by artefact id",
        from: [outputOfStageOne!],
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
    const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
      enquiry, method: "paired comparison", from: [observations],
      concludes: [{ proposition: MOVES, finding: "about three steps", standing: "confirmatory" }],
      implementing: work, heldTo: [criterion],
    });
    await s.evaluateCriterion({
      criterion, gate, value: "5/5 seeds", outcome: "pass",
      citing: claimOf(analysisClaims, MOVES),
    });
    await s.closeEnquiry({ enquiry, answeredBy: claimOf(analysisClaims, MOVES) });
    return { read: new ReadSurface(await scenario.current()), question, enquiry, gate, work, analysis, analysisClaims };
  }

  test("the template: an id beside the wording, in the three reports that do it", async () => {
    try {
      const { read, analysis, analysisClaims } = await programme();

      // whatIsKnown: `question` is the id, `asks` is the text.
      const known = await read.whatIsKnown();
      const standing = [...known.established, ...known.provisional][0]!;
      expect(looksLikeAnId(standing.question.id)).toBe(true);
      expect(looksLikeAnId(standing.asks)).toBe(false);

      // reproducibilityOf: `part` is the id, `name` is the text.
      const parts = await read.reproducibilityOf(analysis, []);
      const inputs = [...parts.exact, ...parts.differing, ...parts.unverifiable, ...parts.notRebuilt];
      expect(inputs.length).toBeGreaterThan(0);
      expect(inputs.every((p) => looksLikeAnId(p.part.id))).toBe(true);
      expect(inputs.every((p) => looksLikeAnId(p.name))).toBe(false);
    } finally {
      await scenario.end();
    }
  });

  test("EnquiryStatus identifies its question — FIXED, PJ-030 §5 step 2", async () => {
    try {
      const { read, enquiry, question } = await programme();
      const status = await read.enquiryStatus(enquiry);

      expect(looksLikeAnId(status.enquiry.id)).toBe(true);
      // The question it pursues, by identity -- and it is the RIGHT question,
      // not merely an id-shaped string.
      expect(status.question!.question.id).toBe(question.id);
      expect(looksLikeAnId(status.question!.asks)).toBe(false);

      // Evidence too, as of PJ-030 §5: identity beside the statement.
      expect(status.question!.evidence.length).toBeGreaterThan(0);
      expect(status.question!.evidence.every((e) => looksLikeAnId(e.evidence.id))).toBe(true);
      expect(status.question!.evidence.every((e) => looksLikeAnId(e.states))).toBe(false);
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
      expect(affected.claims.every((c) => looksLikeAnId(c.claim.id))).toBe(true);
      expect(affected.claims.every((c) => looksLikeAnId(c.asserts))).toBe(false);
      expect(affected.enquiries.every((e) => looksLikeAnId(e.enquiry.id))).toBe(true);
      expect(affected.enquiries.every((e) => looksLikeAnId(e.pursuing))).toBe(false);
    } finally {
      await scenario.end();
    }
  });

  test("whySupported identifies the analysis it cites — FIXED, PJ-030 §5 step 2", async () => {
    try {
      const { read } = await programme();
      const why = await read.whySupported(await claimNamed(read, MOVES));

      expect(why.support.length).toBeGreaterThan(0);
      // Was a bare `via` holding the computation's METHOD text, so two runs of
      // one method were indistinguishable -- the same wording-as-identity
      // failure whySupported REFUSES to make when resolving its own argument.
      expect(why.support.every((s) => looksLikeAnId(s.analysis.id))).toBe(true);
      expect(why.support.every((s) => looksLikeAnId(s.evidence.id))).toBe(true);
      expect(why.support.every((s) => looksLikeAnId(s.method))).toBe(false);
      expect(why.unmet.every((u) => looksLikeAnId(u.criterion.id))).toBe(true);
      // The template, in the same report: restingOn carries both.
      expect(why.restingOn.every((p) => looksLikeAnId(p.part.id))).toBe(true);
      expect(why.restingOn.every((p) => looksLikeAnId(p.name))).toBe(false);
    } finally {
      await scenario.end();
    }
  });

  test("gateStatus identifies the work it gates — FIXED, PJ-030 §5 step 2", async () => {
    try {
      const { read, gate } = await programme();
      const status = await read.gateStatus(gate);

      expect(looksLikeAnId(status.gate.id)).toBe(true);
      expect(status.gating.length).toBeGreaterThan(0);
      expect(status.gating.every((g) => looksLikeAnId(g.work.id))).toBe(true);
      expect(status.gating.every((g) => looksLikeAnId(g.objective))).toBe(false);
      expect(status.unmet.every((u) => looksLikeAnId(u.criterion.id))).toBe(true);
      // The template again, one field over.
      expect(status.checks.every((c) => looksLikeAnId(c.criterion.id))).toBe(true);
    } finally {
      await scenario.end();
    }
  });

  /**
   * The same question asked of the report as a whole rather than of its rows.
   *
   * `enquiryStatus`, `gateStatus`, `designHistory` and `contractFor` all named
   * their subject already. Three did not: they took a handle, answered about
   * it, and gave back only wording — so the answer stopped identifying itself
   * the moment it was stored or sent, which over MCP is exactly what happens
   * to it. The subject is an echo of an argument the verb already holds, which
   * is why the whole remedy is one field each.
   */
  test("every report names the record it is about — FIXED, PJ-030 §5 step 2", async () => {
    try {
      const { read, gate, enquiry } = await programme();
      const claim = await claimNamed(read, MOVES);

      expect((await read.whySupported(claim)).claim).toEqual(claim);
      expect((await read.gateStatus(gate)).gate).toEqual(gate);
      expect((await read.enquiryStatus(enquiry)).enquiry).toEqual(enquiry);
      expect((await read.designHistory(gate)).gate).toEqual(gate);

      // whatDependsOn also accepts a logical NAME, and its echo is the record
      // that name resolved to -- the one thing a caller passing a name cannot
      // otherwise learn about the answer they got back.
      const byName = await read.whatDependsOn("sweep readings");
      expect(looksLikeAnId(byName.subject.id)).toBe(true);
      expect(await read.whatDependsOn(byName.subject)).toEqual(byName);
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
      const stageOne = ((await call(client, "record_analysis", {
        enquiry: enquiry.id, method: "stage one", from: [raw.id],
        concludes: [{ proposition: "p1", finding: "f1" }],
      })).body.analysis) as { kind: string; id: string };
      const stageTwoResult = (await call(client, "record_analysis", {
        enquiry: enquiry.id, method: "stage two", from: [stageOne.id],
        concludes: [{ proposition: "p2", finding: "f2" }],
      })).body;
      const stageTwo = stageTwoResult.analysis as { kind: string; id: string };
      const p2 = (stageTwoResult.claims as Array<{ claim: { id: string }; asserts: string }>)
        .find((c) => c.asserts === "p2")!.claim.id;
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
      // The claim id came back from `record_analysis`; no lookup needed.
      const why = (await call(client, "why_supported", { claim: p2 })).body;
      const restingOn = why.restingOn as Array<{ part: { id: string }; name: string }>;
      expect(restingOn.some((p) => p.part.id.startsWith("ART_"))).toBe(true);

      const viaTheDetour = await call(client, "replace_analysis", {
        supersedes: stageTwo.id, because: review.id, enquiry: enquiry.id,
        method: "stage two, corrected", from: [restingOn[0]!.part.id],
        concludes: [{ proposition: "p2", finding: "f2 corrected" }],
      });
      expect(viaTheDetour.failed).toBe(false);
      await client.close();
    } finally {
      await scenario.end();
    }
  });
});
