/**
 * **Which record is this answer about?**
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ReadSurface,
  ResearchSession,
  WriteSurface,
  inMemoryEventLog,
  type Clock,
} from "../src/domain";
import { buildServer } from "../src/mcp/server";
import { sessionRegistry } from "../src/attribution";
import { openScenario, type Scenario } from "./helpers/scenario";
import { claimNamed, claimOf } from "./helpers/claims";
import { ref } from "../src/domain/report";
import { recordAnalysis } from "./helpers/analysis";

/**
 * A handle out of a tool's reply.
 */
const id = (v: unknown): string =>
  // A bare string passes through: `Object.values("COMP_1")[0]` is `"C"`, which
  // reaches the server as a handle and is refused there -- loudly, but two
  // layers from the mistake.
  typeof v === "string" ? v : (Object.values(v as Record<string, unknown>)[0] as string);

let scenario: Scenario;
beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

const clock: Clock = (() => {
  let t = 0;
  return {
    now: () => new Date(Date.UTC(2026, 2, 1) + t++ * 60_000).toISOString(),
  };
})();

const session = async () =>
  new ResearchSession(await scenario.begin(), {
    clock,
    events: inMemoryEventLog(),
  });

/** A client over the real server, for the ambiguities only a consumer can see. */
async function overTheWire() {
  const graph = await scenario.begin();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const events = inMemoryEventLog();
  const session = sessionRegistry();
  session.register("subject-identity", "subject-identity-0");
  await buildServer(
    (work) =>
      work({
        read: new ReadSurface(graph, { events }),
        write: new WriteSurface(graph, { clock, events }),
      }),
    session,
  ).connect(serverSide);
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

describe("1. an enquiry's status was the question's status — FIXED,", () => {
  /**
   * Ana runs the seed sweep, Bruno the ablation, on one question. Ana's is decisive and gets
   * closed. Bruno asks where his is up to.
   */
  test("closing one pursuit no longer reports the other as having produced it", async () => {
    const s = await session();
    try {
      const { question } = await s.pose({ question: "does depth move convergence?" });
      const { enquiry: anasSweep } = await s.pursue({ question, approach: "seed sweep" });
      const { enquiry: brunosAblation } = await s.pursue({ question, approach: "ablation" });

      const { observations: readings } = await s.recordObservations({
        enquiry: anasSweep,
        name: "seed sweep readings",
        finding: "five seeds, consistent",
      });
      const { claims: analysisClaims } = await recordAnalysis(s, {
        enquiry: anasSweep,
        method: "paired comparison",
        from: [readings],
        concludes: [{ proposition: MOVES, finding: "about three steps" }],
      });
      await s.closeEnquiry({
        enquiry: anasSweep,
        answeredBy: claimOf(analysisClaims, MOVES),
      });

      const later = new ResearchSession(await scenario.current(), { clock });
      const ana = await later.enquiryStatus(anasSweep);
      const bruno = await later.enquiryStatus(brunosAblation);

      // Both reports name the same motivating question, but closure belongs to the pursuit.
      expect(ana.question!.question).toBe(bruno.question!.question);
      expect(ana.closure).toBe("answered");
      expect(bruno.closure).toBeNull();
      expect(bruno.open).toBe(true);

      // The closure evidence belongs only to Ana's pursuit. A caller summing findings across
      // pursuits must not count one finding twice.
      const anasFindings = ana.contributed.map((e) => e.evidence);
      const closingEvidence = ana.evidence.map((e) => e.evidence);
      expect(closingEvidence.every((id) => anasFindings.includes(id))).toBe(true);
      expect(anasFindings.length).toBeGreaterThan(closingEvidence.length);

      expect(bruno.contributed).toEqual([]);
      expect(bruno.pursuing).not.toBe(ana.pursuing);

      // Summing findings over every pursuit must not double-count.
      const counted = [ana, bruno].flatMap((st) => st.contributed.map((e) => e.evidence));
      expect(counted.length).toBe(new Set(counted).size);
      await s.closeEnquiry({ enquiry: brunosAblation });
      const afterAna = await later.enquiryStatus(anasSweep);
      const afterBruno = await later.enquiryStatus(brunosAblation);
      expect(afterAna.closure).toBe("answered");
      expect(afterBruno.closure).toBe("abandoned");
    } finally {
      await scenario.end();
    }
  });

  test("question standing and a sibling pursuit remain separately readable", async () => {
    // The untouched pursuit stays open. The survey separately names the answered sibling and
    // keeps the shared question unresolved while either pursuit remains open.
    const s = await session();
    try {
      const { question } = await s.pose({ question: "does width matter?" });
      const { enquiry: worked } = await s.pursue({ question, approach: "width sweep" });
      const { enquiry: untouched } = await s.pursue({
        question,
        approach: "second opinion",
      });

      const { observations: readings } = await s.recordObservations({
        enquiry: worked,
        name: "width readings",
        finding: "it does",
      });
      const { claims: analysisClaims } = await recordAnalysis(s, {
        enquiry: worked,
        method: "sweep",
        from: [readings],
        concludes: [{ proposition: WIDTH, finding: "it does" }],
      });
      await s.closeEnquiry({
        enquiry: worked,
        answeredBy: claimOf(analysisClaims, WIDTH),
      });

      const later = new ResearchSession(await scenario.current(), { clock });
      const status = await later.enquiryStatus(untouched);

      const known = await later.whatIsKnown();
      expect(status.question!.question).toBe(question);
      expect(status.open).toBe(true);
      expect(status.closure).toBeNull();
      expect(status.evidence).toEqual([]);
      expect(known.unresolved.map((q) => q.question)).toContain(question);
      expect(known.closedPursuits).toContainEqual(
        expect.objectContaining({ enquiry: worked, question, closure: "answered" }),
      );

      // This pursuit produced nothing.
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
      const { enquiry } = await s.openEnquiry("does it hold?");
      const { observations } = await s.recordObservations({
        enquiry,
        name: "raw readings",
        finding: "twelve runs",
      });
      const { analysis } = await recordAnalysis(s, {
        enquiry,
        method: "stage one",
        from: [observations],
        concludes: [{ proposition: HOLDS, finding: "it holds" }],
      });

      const later = new ReadSurface(await scenario.current());
      const parts = await later.reproducibilityOf(analysis, []);
      const consumed = [
        ...parts.exact,
        ...parts.differing,
        ...parts.unverifiable,
        ...parts.notRebuilt,
      ];

      // Raw measurement is an artefact.
      expect(observations.startsWith("ART_")).toBe(true);
      // So is what the analysis produced -- same prefix, same space.
      const output = consumed.map((p) => p.part);
      expect(output.every((id) => id.startsWith("ART_"))).toBe(true);

      // So the two are **indistinguishable by handle**, which is the finding.
      // Handles are branded strings, with no separate `kind` field that could
      // disagree with the id -- an id whose prefix is shared with outputs --
      // so the ambiguity is in the open where a scenario can decide it.
      expect(output).toContain(observations);
    } finally {
      await scenario.end();
    }
  });

  test("an analysis ref used as an input means that analysis's output artefact", async () => {
    // Both routes write the same edge. The reference denotes a computation; the
    // verb takes it to mean the artefact the computation produced.
    const s = await session();
    try {
      const { enquiry } = await s.openEnquiry("two stage?");
      const { observations: raw } = await s.recordObservations({
        enquiry,
        name: "raw",
        finding: "f",
      });
      const { analysis: stageOne } = await recordAnalysis(s, {
        enquiry,
        method: "stage one",
        from: [raw],
        concludes: [{ proposition: "p1", finding: "f1" }],
      });
      const { analysis: viaAnalysis } = await recordAnalysis(s, {
        enquiry,
        method: "stage two, by analysis ref",
        from: [stageOne],
        concludes: [{ proposition: "p2a", finding: "f2" }],
      });

      const read = new ReadSurface(await scenario.current());
      const consumedByA = await read.reproducibilityOf(viaAnalysis, []);
      const outputOfStageOne = [...consumedByA.unverifiable, ...consumedByA.notRebuilt][0]?.part;
      expect(outputOfStageOne?.startsWith("ART_")).toBe(true);

      const { analysis: viaArtefact } = await recordAnalysis(s, {
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
   * Every entity here has a natural id, minted in the same round trip that created it. Three
   * reports carry one **beside** the wording, which is the template; the rest emit wording
   * alone and the caller cannot follow it anywhere.
   */
  const looksLikeAnId = (v: string) =>
    /^(Q|LOE|EU|EV|CLM|DEC|CRIT|CEVAL|GATE|REV|ART|COMP|TASK)_\d+$/.test(v);

  async function programme() {
    const s = await session();
    const { question } = await s.pose({ question: "does depth move convergence?" });
    const { enquiry } = await s.pursue({ question, approach: "seed sweep" });
    const { criterion } = await s.stateCriterion("holds at five seeds");
    const { work } = await s.planWork({
      objective: "publish the result",
      acceptance: "the check passes",
    });
    const { gate } = await s.declareGate({
      governedBy: [criterion],
      consequence: "may it be published?",
      protecting: [work],
    });
    const { observations } = await s.recordObservations({
      enquiry,
      name: "sweep readings",
      finding: "five seeds, consistent",
    });
    const { analysis, claims: analysisClaims } = await recordAnalysis(s, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      concludes: [
        {
          proposition: MOVES,
          finding: "about three steps",
          standing: "confirmatory",
        },
      ],
      implementing: work,
      heldTo: [criterion],
    });
    await s.evaluateCriterion({
      criterion,
      gate,
      value: "5/5 seeds",
      outcome: "pass",
      citing: [claimOf(analysisClaims, MOVES)],
    });
    await s.closeEnquiry({
      enquiry,
      answeredBy: claimOf(analysisClaims, MOVES),
    });
    return {
      read: new ReadSurface(await scenario.current()),
      question,
      enquiry,
      gate,
      work,
      analysis,
      analysisClaims,
    };
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
      const inputs = [
        ...parts.exact,
        ...parts.differing,
        ...parts.unverifiable,
        ...parts.notRebuilt,
      ];
      expect(inputs.length).toBeGreaterThan(0);
      expect(inputs.every((p) => looksLikeAnId(p.part))).toBe(true);
      expect(inputs.every((p) => looksLikeAnId(p.name))).toBe(false);
    } finally {
      await scenario.end();
    }
  });

  test("EnquiryStatus identifies its question — FIXED, step 2", async () => {
    try {
      const { read, enquiry, question } = await programme();
      const status = await read.enquiryStatus(enquiry);

      expect(looksLikeAnId(status.enquiry)).toBe(true);
      // The question it pursues, by identity -- and it is the RIGHT question,
      // not merely an id-shaped string.
      expect(status.question!.question).toBe(question);
      expect(looksLikeAnId(status.question!.asks)).toBe(false);

      // Evidence too: identity beside the statement.
      expect(status.evidence.length).toBeGreaterThan(0);
      expect(status.evidence.every((e) => looksLikeAnId(e.evidence))).toBe(true);
      expect(status.evidence.every((e) => looksLikeAnId(e.states))).toBe(false);
    } finally {
      await scenario.end();
    }
  });

  test("whatDependsOn now identifies what is affected — FIXED, step 2", async () => {
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

  test("whySupported identifies the analysis it cites — FIXED, step 2", async () => {
    try {
      const { read } = await programme();
      const why = await read.whySupported(await claimNamed(read, MOVES));

      expect(why.support.length).toBeGreaterThan(0);
      // Was a bare `via` holding the computation's METHOD text, so two runs of
      // one method were indistinguishable -- the same wording-as-identity
      // failure whySupported REFUSES to make when resolving its own argument.
      expect(why.support.every((s) => looksLikeAnId(s.analysis))).toBe(true);
      expect(why.support.every((s) => looksLikeAnId(s.evidence))).toBe(true);
      expect(why.support.every((s) => looksLikeAnId(s.method))).toBe(false);
      expect(why.unmet.every((u) => looksLikeAnId(u.criterion))).toBe(true);
      // The template, in the same report: restingOn carries both.
      expect(why.restingOn.every((p) => looksLikeAnId(p.part))).toBe(true);
      expect(why.restingOn.every((p) => looksLikeAnId(p.name))).toBe(false);
    } finally {
      await scenario.end();
    }
  });

  test("gateStatus identifies the work it gates — FIXED, step 2", async () => {
    try {
      const { read, gate } = await programme();
      const status = await read.gateStatus(gate);

      expect(looksLikeAnId(status.gate)).toBe(true);
      expect(status.gating.length).toBeGreaterThan(0);
      expect(status.gating.every((g) => looksLikeAnId(g.work))).toBe(true);
      expect(status.gating.every((g) => looksLikeAnId(g.objective))).toBe(false);
      expect(status.unmet.every((u) => looksLikeAnId(u.criterion))).toBe(true);
      // The template again, one field over.
      expect(status.checks.every((c) => looksLikeAnId(c.criterion))).toBe(true);
    } finally {
      await scenario.end();
    }
  });

  /**
   * The same question asked of the report as a whole rather than of its rows.
   */
  test("every report names the record it is about — FIXED, step 2", async () => {
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
      expect(looksLikeAnId(byName.subject)).toBe(true);
      expect(await read.whatDependsOn(byName.subject)).toEqual(byName);
    } finally {
      await scenario.end();
    }
  });

  const MOVES = "depth moves convergence";
});

describe("3. a consumer can now repair a two-stage pipeline with its own handles — FIXED", () => {
  /**
   * `record_analysis` takes an analysis id as an input reference; the other two recording verbs
   * take observations alone — while all three write the same `CONSUMES` edge, which does not
   * allow `Computation -> Computation`.
   */
  test("the repair takes the handle the consumer holds, with no detour", async () => {
    // Section 2 showed the two routes equivalent -- measured inside the process,
    // holding an artefact id the domain handed back. A consumer over the wire
    // holds what the tools returned, which for an analysis is a computation id.
    const client = await overTheWire();
    try {
      const enquiry = (await call(client, "open_enquiry", { question: "two stage?" })).body;
      const raw = (
        await call(client, "record_observations", {
          enquiry: id(enquiry),
          name: "raw",
          finding: "f",
        })
      ).body;
      const stageOne = (
        await call(client, "record_analysis", {
          enquiry: id(enquiry),
          method: "stage one",
          from: [id(raw)],
        })
      ).body.analysis as string;
      await call(client, "conclude", {
        analysis: stageOne,
        proposition: "p1",
        finding: "f1",
      });
      const stageTwoResult = (
        await call(client, "record_analysis", {
          enquiry: id(enquiry),
          method: "stage two",
          from: [stageOne],
        })
      ).body;
      const stageTwo = stageTwoResult.analysis as string;
      const concludedTwo = (
        await call(client, "conclude", {
          analysis: stageTwo,
          proposition: "p2",
          finding: "f2",
        })
      ).body;
      const p2 = (concludedTwo.claims as Array<{ claim: string; asserts: string }>).find(
        (c) => c.asserts === "p2",
      )!.claim;
      const review = (
        await call(client, "record_review", {
          of: stageTwo,
          verdict: "stage two mis-specified",
        })
      ).body;

      // Recording stage two on stage one was accepted all along.
      expect(String(stageOne).startsWith("COMP_")).toBe(true);

      // Repairing it is now accepted too, and needs no `from` at all: the
      // successor inherits what its predecessor read, which here is stage one
      // by its COMP_ id.
      const repair = await call(client, "replace_analysis", {
        supersedes: stageTwo,
        because: id(review),
        method: "stage two, corrected",
      });
      expect(repair.failed).toBe(false);
      expect(repair.body.supersedes).toEqual(stageTwo);
      const corrected = await call(client, "conclude", {
        analysis: repair.body.replacement as string,
        replacing: p2,
        finding: "f2 corrected",
      });
      expect(corrected.failed).toBe(false);

      // The detour still works and is no longer the only route. It is what a
      // consumer had to do: ask why a claim was supported in order to learn
      // what a computation read.
      const why = (await call(client, "why_supported", { claim: p2 })).body;
      const restingOn = why.restingOn as Array<{ part: string; name: string }>;
      expect(restingOn.some((p) => p.part.startsWith("ART_"))).toBe(true);
      await client.close();
    } finally {
      await scenario.end();
    }
  });
});

/**
 * **A handle whose id names another record is refused at the moment it is minted.** This is the
 * check that replaced the `kind` field.
 */
test("ref refuses an id whose prefix names a different record", () => {
  expect(() => ref("gate", "CLM_1")).toThrow(/gate handle expected a Gate id/);
  expect(() => ref("claim", "GATE_9")).toThrow(/claim handle expected a Claim id/);

  // The five kinds named for a research concept rather than a label are the
  // ones a mapping by name would get wrong, so they are asserted directly.
  expect(() => ref("analysis", "ART_1")).toThrow(/expected a Computation id/);
  expect(() => ref("observations", "COMP_1")).toThrow(/expected an? Artefact id/);
  expect(() => ref("work", "LOE_1")).toThrow(/expected a Task id/);
  expect(() => ref("enquiry", "TASK_1")).toThrow(/expected a LineOfEnquiry id/);
  expect(() => ref("evaluation", "CRIT_1")).toThrow(/expected a CriterionEvaluation id/);

  // And the matching cases pass through unchanged — the handle *is* the id.
  // Through `String()` because `expect(handle).toBe("GATE_1")` does not
  // compile: a branded handle is not comparable to a raw literal, which is the
  // nominal typing doing its job and worth seeing here rather than working
  // around silently.
  expect(String(ref("gate", "GATE_1"))).toBe("GATE_1");
  expect(String(ref("analysis", "COMP_2"))).toBe("COMP_2");
  expect(String(ref("unit", "EU_3"))).toBe("EU_3");
});
