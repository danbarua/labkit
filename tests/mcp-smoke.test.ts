/**
 * **Every tool, called once, over the wire.**
 *
 * `tests/mcp.test.ts` asserts every public verb is *exposed*. That is not the
 * same as it working: eleven of the thirty-three tools had never been called
 * by any test at all, and three tool descriptions told a caller to pass
 * arguments that do not exist — `why_supported`'s said "pass `analysis`",
 * `do_these_conflict`'s said each side is "named by its analysis and
 * proposition", and `close_enquiry`'s described `answered_by` as "the analysis
 * and the proposition it concluded". All three were true of an earlier
 * signature and had been left behind by the one that replaced it.
 *
 * The description is the only thing an agent has to go on, and nothing
 * executes it. What can be executed is the tool, so this file does that, and
 * the last test refuses to pass while any tool is unexercised. A new tool
 * either gets a call here or fails the run.
 *
 * It is deliberately three ordinary sessions rather than a synthetic loop over
 * the tool list: arguments have to come from earlier answers, which is the
 * property that matters and the one a generated call cannot check.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ReadSurface, WriteSurface } from "../src/domain";
import type { TenantGraph } from "../src/db/graph";
import { buildServer } from "../src/mcp/server";
import { TOOLS, WRITE_TOOLS } from "../src/mcp/tools";
import { openScenario, type Scenario } from "./helpers/scenario";

let scenario: Scenario;
beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });

/** Every tool this file has actually called, accumulated across the sessions below. */
const called = new Set<string>();

async function connectServer(graph: TenantGraph, transport: Parameters<ReturnType<typeof buildServer>["connect"]>[0]) {
  const writes = new WriteSurface(graph);
  return buildServer(new ReadSurface(graph, { events: writes.events }), writes).connect(transport);
}

async function client(): Promise<Client> {
  const graph = await scenario.begin();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await connectServer(graph, serverSide);
  const c = new Client({ name: "smoke", version: "0" });
  await c.connect(clientSide);
  return c;
}

type Json = Record<string, unknown>;

/** One call, recorded. A failure names the tool and says why — see tests/mcp.test.ts. */
async function call(c: Client, name: string, args: Json): Promise<Json> {
  called.add(name);
  const result = await c.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
  return result.structuredContent as Json;
}

const id = (v: unknown) => (v as { id: string }).id;
const claimIn = (r: Json, asserts: string) =>
  (r.claims as Array<{ claim: { id: string }; asserts: string }>).find((c) => c.asserts === asserts)!.claim.id;

describe("every tool answers when an agent actually calls it", () => {
  test("ask, sharpen, plan, gate, measure, conclude", async () => {
    const c = await client();
    try {
      const broad = await call(c, "pose", { question: "is the solver faster?" });
      const sharp = await call(c, "sharpen", {
        from: id(broad),
        into: "is the solver faster on sparse instances?",
        because: "faster overall hides which instances moved",
      });
      const origin = await call(c, "origin_of", { question: id(sharp) });
      expect((origin.origin as Json | null)).not.toBeNull();

      const enquiry = await call(c, "pursue", { question: id(sharp), approach: "paired timing runs" });
      const pursuits = await call(c, "pursuits_of", { question: id(sharp) });
      expect((pursuits.enquiries as unknown[])).toHaveLength(1);

      const work = await call(c, "plan_work", {
        objective: "time the solver on the sparse set",
        acceptance: "every instance timed three times",
        may_read: ["the sparse instance set"],
      });
      const contract = await call(c, "contract_for", { work: id(work) });
      expect(contract.enforced).toBe(false);

      const criterion = await call(c, "state_criterion", {
        proposition: "median speedup above 1.2x",
      });
      const gate = await call(c, "declare_gate", {
        governed_by: [id(criterion)],
        consequence: "the speedup claim is not made",
        protecting: [id(work)],
      });
      const governing = await call(c, "criteria_governing", { gate: id(gate) });
      expect((governing.criteria as unknown[])).toHaveLength(1);

      const observations = await call(c, "record_observations", {
        enquiry: id(enquiry), name: "sparse timings", finding: "three runs per instance",
        content_hash: "sha256:sparse",
      });
      const analysis = await call(c, "record_analysis", {
        enquiry: id(enquiry), method: "paired timing", from: [id(observations)],
        concludes: [{ proposition: SPARSE, finding: "median speedup 1.4x" }],
        implementing: id(work), held_to: [id(criterion)],
      });
      const claim = claimIn(analysis, SPARSE);

      await call(c, "evaluate_criterion", {
        criterion: id(criterion), value: "1.4", outcome: "pass",
        gate: id(gate), citing: claim,
      });
      const status = await call(c, "gate_status", { gate: id(gate) });
      expect(status.state).toBe("satisfied");

      await call(c, "promote", { claim, because: "re-timed on a quiet machine" });
      // `known` partitions by how well a question is *answered*, so the
      // enquiry has to be closed before the question can be established.
      await call(c, "close_enquiry", { enquiry: id(enquiry), answered_by: claim });
      const survey = await call(c, "known", {});
      expect((survey.established as Array<{ asks: string }>).map((q) => q.asks))
        .toContain("is the solver faster on sparse instances?");

      const why = await call(c, "why_supported", { claim });
      expect(why.supported).toBe(true);
      const depends = await call(c, "what_depends_on", { artefact: "sparse timings" });
      expect((depends.claims as unknown[]).length).toBeGreaterThan(0);
      const rebuilt = await call(c, "reproducibility_of", {
        analysis: id(analysis.analysis as Json), rebuilt: [{ part: id(observations), hash: "sha256:sparse" }],
      });
      expect(rebuilt.reproducible).toBe(true);

      const amendment = await call(c, "amend_design", {
        criterion: id(criterion), now_requires: "median speedup above 1.2x on sparse instances",
        because: "the condition never said which set", citing: claim,
      });
      // `scientific`, not `mechanical`: the finding was promoted to
      // confirmatory two calls ago, so rewording the condition it answers to
      // moves something. That distinction is the whole point of the verb, and
      // it names what it moved.
      expect(amendment.nature).toBe("scientific");
      expect((amendment.confirmatoryAffected as unknown[]).length).toBeGreaterThan(0);
      const history = await call(c, "design_history", { gate: id(gate) });
      expect((history.amendments as unknown[])).toHaveLength(1);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("review, replace, re-verify, reinterpret, close", async () => {
    const c = await client();
    try {
      const enquiry = await call(c, "open_enquiry", { question: "does the coating slow corrosion?" });
      const observations = await call(c, "record_observations", {
        enquiry: id(enquiry), name: "immersion series", finding: "mass loss at six intervals",
      });
      const first = await call(c, "record_analysis", {
        enquiry: id(enquiry), method: "linear fit", from: [id(observations)],
        concludes: [{ proposition: COATING, finding: "rate down 40%" }],
      });
      const review = await call(c, "record_review", {
        of: id(first.analysis as Json), verdict: "the fit ignores the induction period",
      });
      const replacement = await call(c, "replace_analysis", {
        supersedes: id(first.analysis as Json), because: id(review), enquiry: id(enquiry),
        method: "segmented fit", from: [id(observations)],
        concludes: [{ proposition: COATING, finding: "rate down 25% after induction" }],
      });
      expect((replacement.changed as unknown[])).toHaveLength(1);

      const verification = await call(c, "reverify", {
        historical: id(replacement.replacement as Json), enquiry: id(enquiry),
        method: "segmented fit, second batch", under: [id(observations)],
        concludes: { proposition: COATING, finding: "rate down 27% after induction" },
      });
      const reproduction = await call(c, "reproduction_of", {
        analysis: id(verification.verification as Json),
      });
      expect(reproduction.conclusion).toBe("agrees");

      const narrowed = await call(c, "reinterpret", {
        claim: claimIn(replacement, COATING), as: NARROWER,
        because: "the reduction is in the post-induction rate, not overall",
      });
      const narrowedClaim = id((narrowed.nowClaims as Json).claim);
      const revisions = await call(c, "interpretation_history", { claim: narrowedClaim });
      expect((revisions.revisions as unknown[])).toHaveLength(1);
      const found = await call(c, "claims_asserting", { proposition: NARROWER });
      expect((found.claims as Array<{ claim: { id: string } }>).map((x) => x.claim.id)).toEqual([narrowedClaim]);

      await call(c, "close_enquiry", { enquiry: id(enquiry), answered_by: narrowedClaim });
      const closed = await call(c, "enquiry_status", { enquiry: id(enquiry) });
      expect((closed.question as Json).closure).toBe("answered");
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("two enquiries asserting one sentence, and one left deliberately open", async () => {
    const c = await client();
    try {
      const sparse = await call(c, "open_enquiry", { question: "does it hold on sparse instances?" });
      const dense = await call(c, "open_enquiry", { question: "does it hold on dense instances?" });

      const sparseObs = await call(c, "record_observations", {
        enquiry: id(sparse), name: "sparse runs", finding: "forty instances",
      });
      const sparseAnalysis = await call(c, "record_analysis", {
        enquiry: id(sparse), method: "paired timing", from: [id(sparseObs)],
        concludes: [{ proposition: HOLDS, finding: "speedup 1.4x" }],
      });
      const denseObs = await call(c, "record_observations", {
        enquiry: id(dense), name: "dense runs", finding: "forty instances",
      });
      const denseAnalysis = await call(c, "record_analysis", {
        enquiry: id(dense), method: "paired timing", from: [id(denseObs)],
        concludes: [{ proposition: HOLDS, finding: "speedup 0.98x", bearing: "challenges" }],
      });

      // The same sentence, two enquiries, opposite bearing — and not a
      // contradiction, because they asked about different instance sets.
      const verdict = await call(c, "do_these_conflict", {
        a: claimIn(sparseAnalysis, HOLDS), b: claimIn(denseAnalysis, HOLDS),
      });
      expect(verdict.conflict).toBe(false);
      expect(verdict.relation).toBe("dissociation");

      await call(c, "accept_as_unresolved", {
        enquiry: id(dense),
        because: "the dense set needs an instance generator nobody has written",
        until: "a dense generator exists",
        in_light_of: claimIn(denseAnalysis, HOLDS),
      });
      const left = await call(c, "enquiry_status", { enquiry: id(dense) });
      expect((left.question as Json).closure).toBe("accepted-as-unresolved");
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  /**
   * The gate. It runs last because it reads what the tests above recorded.
   *
   * A tool with no call here is a tool nobody has ever driven, which is how
   * three descriptions came to describe signatures that no longer existed.
   */
  test("no tool goes unexercised", () => {
    const all = [...TOOLS, ...WRITE_TOOLS].map((t) => t.name).sort();
    expect([...called].sort()).toEqual(all);
  });

  const SPARSE = "the solver is faster on sparse instances";
  const COATING = "the coating slows corrosion";
  const NARROWER = "the coating slows the post-induction corrosion rate";
  const HOLDS = "the speedup holds";
});
