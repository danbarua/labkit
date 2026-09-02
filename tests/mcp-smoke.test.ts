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
import { ReadSurface, WriteSurface, inMemoryEventLog, type EventSink } from "../src/domain";
import {
  commandContext,
  mockGitContext,
  mockSessionContext,
  sessionRegistry,
} from "../src/attribution";
import type { TenantGraph } from "../src/db/graph";
import { buildServer } from "../src/mcp/server";
import { SESSION_TOOLS, TOOLS, WRITE_TOOLS } from "../src/mcp/tools";
import { openScenario, type Scenario } from "./helpers/scenario";

let scenario: Scenario;
beforeAll(async () => {
  scenario = await openScenario();
});
afterAll(async () => {
  await scenario.close();
});

/** Every tool this file has actually called, accumulated across the sessions below. */
const called = new Set<string>();

/**
 * The composition `src/mcp/server.ts` uses: one graph and one sink owned here,
 * handed to a **scope** the server enters per tool call. The sink must be
 * constructed at this level rather than taken from a surface — a per-call
 * surface defaulting to its own log would fragment the stream and leave the two
 * halves of one call holding different ones. The server's own scope opens and
 * closes a database connection as well; a test has a graph already.
 */
async function connectServer(
  graph: TenantGraph,
  transport: Parameters<ReturnType<typeof buildServer>["connect"]>[0],
): Promise<EventSink> {
  const events = inMemoryEventLog();
  // Deliberately *not* pre-registered. Each session below calls
  // `register_session` over the wire, which is what an agent actually does —
  // and it means the write gate is exercised implicitly by every write in this
  // file rather than only by the one test that names it.
  const session = sessionRegistry();
  await buildServer(
    (work) =>
      work({
        read: new ReadSurface(graph, { events }),
        write: new WriteSurface(graph, {
          ...commandContext(mockGitContext, mockSessionContext),
          events,
        }),
      }),
    session,
  ).connect(transport);
  return events;
}

/**
 * A client, and the sink its server writes through.
 *
 * The sink is returned because attribution is only observable there — it rides
 * on the event, not on any tool's reply — so the one test that checks it
 * survives the full MCP path needs a handle on the log the server is filling.
 */
async function client(): Promise<{ client: Client; events: EventSink }> {
  const graph = await scenario.begin();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const events = await connectServer(graph, serverSide);
  const c = new Client({ name: "smoke", version: "0" });
  await c.connect(clientSide);
  // The first thing an agent does, and the first thing this file does. Every
  // write below would be refused without it, so a broken handshake fails these
  // tests loudly rather than leaving one assertion red somewhere else.
  await call(c, "register_session", { id: "smoke-agent-0", label: "smoke agent" });
  return { client: c, events };
}

type Json = Record<string, unknown>;

/** One call, recorded. A failure names the tool and says why — see tests/mcp.test.ts. */
async function call(c: Client, name: string, args: Json): Promise<Json> {
  called.add(name);
  const result = await c.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
  return result.structuredContent as Json;
}

/**
 * A handle out of a tool's reply.
 *
 * It was `(v as { id: string }).id` while a handle was `{kind, id}` on the
 * wire. It is the id itself now, and a tool whose whole answer is one handle
 * returns it under a field named for what it is — `{"question": "Q_1"}` — so
 * this takes the sole value of that object.
 */
const id = (v: unknown): string =>
  // A bare string passes through: `Object.values("COMP_1")[0]` is `"C"`, which
  // reaches the server as a handle and is refused there -- loudly, but two
  // layers from the mistake.
  typeof v === "string" ? v : (Object.values(v as Record<string, unknown>)[0] as string);
const claimIn = (r: Json, asserts: string) =>
  (r.claims as Array<{ claim: string; asserts: string }>).find((c) => c.asserts === asserts)!.claim;

describe("every tool answers when an agent actually calls it", () => {
  test("ask, sharpen, plan, gate, measure, conclude", async () => {
    const { client: c, events } = await client();
    try {
      const broad = await call(c, "pose", {
        question: "is the solver faster?",
      });
      const sharp = await call(c, "sharpen", {
        from: id(broad),
        into: "is the solver faster on sparse instances?",
        because: "faster overall hides which instances moved",
      });
      const origin = await call(c, "origin_of", { question: id(sharp) });
      expect(origin.origin as Json | null).not.toBeNull();

      await call(c, "note", {
        text: "worth checking the sparse generator is deterministic before trusting a paired run",
        on: id(sharp),
      });

      const enquiry = await call(c, "pursue", {
        question: id(sharp),
        approach: "paired timing runs",
      });
      const pursuits = await call(c, "pursuits_of", { question: id(sharp) });
      expect(pursuits.enquiries as unknown[]).toHaveLength(1);

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
      expect(governing.criteria as unknown[]).toHaveLength(1);

      const observations = await call(c, "record_observations", {
        enquiry: id(enquiry),
        name: "sparse timings",
        finding: "three runs per instance",
        content_hash: "sha256:sparse",
      });
      const analysis = await call(c, "record_analysis", {
        enquiry: id(enquiry),
        method: "paired timing",
        from: [id(observations)],
        implementing: id(work),
        held_to: [id(criterion)],
      });
      // The run, then the finding: two acts, two calls.
      const concluded = await call(c, "conclude", {
        analysis: id(analysis.analysis as Json),
        proposition: SPARSE,
        finding: "median speedup 1.4x",
      });
      const claim = claimIn(concluded, SPARSE);

      await call(c, "evaluate_criterion", {
        criterion: id(criterion),
        value: "1.4",
        outcome: "pass",
        gate: id(gate),
        citing: claim,
      });
      const status = await call(c, "gate_status", { gate: id(gate) });
      expect(status.state).toBe("satisfied");

      // The `Gate` case of `why`. Every check passed, so the cause cites the
      // one condition that did, not an absence.
      const gateWhy = await call(c, "why", { subject: id(gate) });
      expect(gateWhy.kind).toBe("gate");
      expect(gateWhy.is).toBe("satisfied");
      expect(gateWhy.because as unknown[]).toHaveLength(1);

      // The two enumeration tools, driven the way an agent without a handle
      // would: no arguments, then filtered. `gate_list` must agree with
      // `gate_status` above about this very gate -- they compute the state
      // through the same function and a disagreement here is the defect the
      // shared helper exists to prevent.
      const gates = await call(c, "gate_list", {});
      const listedGate = (gates.gates as Array<{ gate: string; state: string }>).find(
        (g) => g.gate === id(gate),
      );
      expect(listedGate?.state).toBe("satisfied");

      const workRows = await call(c, "work_list", { state: "carried-out" });
      // The task above was implemented by the analysis, and its gate is
      // satisfied, so nothing is blocking it.
      expect((workRows.work as Array<{ work: string }>).map((w) => w.work)).toContain(id(work));

      // `why` dispatches on the handle's own kind. This task was planned
      // with no enquiry (line 149), so its `Work` case names that honestly
      // rather than an empty `because`.
      const taskWhy = await call(c, "why", { subject: id(work) });
      expect(taskWhy.kind).toBe("work");
      expect(taskWhy.is as string).toContain("no question named");
      expect(taskWhy.because as unknown[]).toHaveLength(0);

      await call(c, "promote", {
        claim,
        because: "re-timed on a quiet machine",
      });
      // `known` partitions by how well a question is *answered*, so the
      // enquiry has to be closed before the question can be established.
      await call(c, "close_enquiry", {
        enquiry: id(enquiry),
        answered_by: claim,
      });
      const survey = await call(c, "known", {});
      expect((survey.established as Array<{ asks: string }>).map((q) => q.asks)).toContain(
        "is the solver faster on sparse instances?",
      );

      // #55: the morning briefing. No cursor -- the full standing, and
      // `known` agrees with the call above since it's the same report.
      const standing = await call(c, "now", {});
      expect((standing.known as Json).established as unknown[]).toEqual(
        survey.established as unknown[],
      );
      const seq = standing.seq as number;

      // Asked again from the seq it just returned, with nothing having
      // happened since: every section is empty and the cursor is unchanged
      // -- there is nothing to move it, not an error.
      const sinceNothing = await call(c, "now", { since: seq });
      expect(sinceNothing.seq).toBe(seq);
      expect((sinceNothing.blocked as Json).gates).toEqual([]);
      expect((sinceNothing.known as Json).established).toEqual([]);

      const why = await call(c, "why_supported", { claim });
      expect(why.supported).toBe(true);
      const depends = await call(c, "what_depends_on", {
        artefact: "sparse timings",
      });
      expect((depends.claims as unknown[]).length).toBeGreaterThan(0);
      const rebuilt = await call(c, "reproducibility_of", {
        analysis: id(analysis.analysis as Json),
        rebuilt: [{ part: id(observations), hash: "sha256:sparse" }],
      });
      expect(rebuilt.reproducible).toBe(true);

      const amendment = await call(c, "amend_design", {
        criterion: id(criterion),
        now_requires: "median speedup above 1.2x on sparse instances",
        because: "the condition never said which set",
        citing: claim,
      });
      // `scientific`, not `mechanical`: the finding was promoted to
      // confirmatory two calls ago, so rewording the condition it answers to
      // moves something. That distinction is the whole point of the verb, and
      // it names what it moved.
      expect(amendment.nature).toBe("scientific");
      expect((amendment.confirmatoryAffected as unknown[]).length).toBeGreaterThan(0);
      const history = await call(c, "design_history", { gate: id(gate) });
      expect(history.amendments as unknown[]).toHaveLength(1);

      // Attribution over the full MCP path, not just a direct surface call.
      // The server builds a fresh `WriteSurface` per tool call, so this also
      // checks the sink survived that: every write in this session landed in
      // one log, each stamped by the mock providers. Asserted against
      // `commandContext` rather than literals -- a test restating the mock's
      // constants would agree with itself and notice nothing.
      // `what_happened` over the wire, which is also what keeps this file's
      // last test honest: a tool nothing calls fails it.
      const happened = await call(c, "what_happened", { limit: 5 });
      expect((happened.events as unknown[]).length).toBeGreaterThan(0);

      const expected = commandContext(mockGitContext, mockSessionContext).attribution;
      const written = await events.all();
      expect(written.length).toBeGreaterThan(1);
      expect(written.map((e) => e.attribution)).toEqual(written.map(() => expected));

      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("review, replace, re-verify, reinterpret, close", async () => {
    const { client: c } = await client();
    try {
      const enquiry = await call(c, "open_enquiry", {
        question: "does the coating slow corrosion?",
      });
      const observations = await call(c, "record_observations", {
        enquiry: id(enquiry),
        name: "immersion series",
        finding: "mass loss at six intervals",
      });
      const first = await call(c, "record_analysis", {
        enquiry: id(enquiry),
        method: "linear fit",
        from: [id(observations)],
      });
      const firstClaim = claimIn(
        await call(c, "conclude", {
          analysis: id(first.analysis as Json),
          proposition: COATING,
          finding: "rate down 40%",
        }),
        COATING,
      );
      const review = await call(c, "record_review", {
        of: id(first.analysis as Json),
        verdict: "the fit ignores the induction period",
      });
      const replacement = await call(c, "replace_analysis", {
        supersedes: id(first.analysis as Json),
        because: id(review),
        method: "segmented fit",
      });
      // `replacing` names the one finding this supersedes, so a replacement
      // that revisits some of a run's conclusions leaves the rest standing.
      const restated = await call(c, "conclude", {
        analysis: id(replacement.replacement as Json),
        replacing: firstClaim,
        finding: "rate down 25% after induction",
      });

      const verification = await call(c, "reverify", {
        historical: id(replacement.replacement as Json),
        enquiry: id(enquiry),
        method: "segmented fit, second batch",
        under: [id(observations)],
        proposition: COATING,
        finding: "rate down 27% after induction",
      });
      const reproduction = await call(c, "reproduction_of", {
        analysis: id(verification.verification as Json),
      });
      expect(reproduction.conclusion).toBe("agrees");

      const narrowed = await call(c, "reinterpret", {
        claim: claimIn(restated, COATING),
        as: NARROWER,
        because: "the reduction is in the post-induction rate, not overall",
      });
      const narrowedClaim = id((narrowed.nowClaims as Json).claim);
      const revisions = await call(c, "interpretation_history", {
        claim: narrowedClaim,
      });
      expect(revisions.revisions as unknown[]).toHaveLength(1);
      const found = await call(c, "claims_asserting", {
        proposition: NARROWER,
      });
      expect((found.claims as Array<{ claim: string }>).map((x) => x.claim)).toEqual([
        narrowedClaim,
      ]);

      const searched = await call(c, "search", { text: "induction period" });
      const reviewGroup = (
        searched.groups as Array<{ label: string; matches: Array<{ handle: string }> }>
      ).find((g) => g.label === "Review");
      expect(reviewGroup?.matches.map((m) => m.handle)).toEqual([id(review)]);

      await call(c, "close_enquiry", {
        enquiry: id(enquiry),
        answered_by: narrowedClaim,
      });
      const closed = await call(c, "enquiry_status", { enquiry: id(enquiry) });
      expect((closed.question as Json).closure).toBe("answered");

      // `why`'s `LineOfEnquiry` case reports where this enquiry's own
      // question sits in the overall survey, one bucket rather than the
      // whole survey. Answered on `narrowedClaim`, which nothing here ever
      // promoted, so it lands in `provisional` -- "answered, but not
      // something to build on yet".
      const enquiryWhy = await call(c, "why", { subject: id(enquiry) });
      expect(enquiryWhy.kind).toBe("enquiry");
      expect((enquiryWhy.report as Json).enquiry).toEqual(closed);
      expect(enquiryWhy.because as unknown[]).toHaveLength(1);
      expect((enquiryWhy.because as Json[])[0]!.wording as string).toContain("provisional");

      // The refusal case: `why` does not yet explain a review (Gate is
      // done, Review is not). Names what it explains instead rather than
      // going quiet or guessing.
      await expect(call(c, "why", { subject: id(review) })).rejects.toThrow(
        /claim, work, enquiry, gate/,
      );
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("two enquiries asserting one sentence, and one left deliberately open", async () => {
    const { client: c } = await client();
    try {
      const sparse = await call(c, "open_enquiry", {
        question: "does it hold on sparse instances?",
      });
      const dense = await call(c, "open_enquiry", {
        question: "does it hold on dense instances?",
      });

      const sparseObs = await call(c, "record_observations", {
        enquiry: id(sparse),
        name: "sparse runs",
        finding: "forty instances",
      });
      const sparseAnalysis = await call(c, "record_analysis", {
        enquiry: id(sparse),
        method: "paired timing",
        from: [id(sparseObs)],
      });
      const sparseConcl = await call(c, "conclude", {
        analysis: id(sparseAnalysis.analysis as Json),
        proposition: HOLDS,
        finding: "speedup 1.4x",
      });
      const denseObs = await call(c, "record_observations", {
        enquiry: id(dense),
        name: "dense runs",
        finding: "forty instances",
      });
      const denseAnalysis = await call(c, "record_analysis", {
        enquiry: id(dense),
        method: "paired timing",
        from: [id(denseObs)],
      });
      const denseConcl = await call(c, "conclude", {
        analysis: id(denseAnalysis.analysis as Json),
        proposition: HOLDS,
        finding: "speedup 0.98x",
        bearing: "challenges",
      });

      // The same sentence, two enquiries, opposite bearing — and not a
      // contradiction, because they asked about different instance sets.
      const verdict = await call(c, "do_these_conflict", {
        a: claimIn(sparseConcl, HOLDS),
        b: claimIn(denseConcl, HOLDS),
      });
      expect(verdict.conflict).toBe(false);
      expect(verdict.relation).toBe("dissociation");

      // `keep` — the other half of the same act: name what survives, and
      // everything else the analysis concluded falls with it.
      const twoFindings = await call(c, "record_analysis", {
        enquiry: id(sparse),
        method: "paired timing, two arms",
        from: [id(sparseObs)],
      });
      const armOne = await call(c, "conclude", {
        analysis: id(twoFindings.analysis as Json),
        proposition: "arm one is faster",
        finding: "1.4x",
      });
      await call(c, "conclude", {
        analysis: id(twoFindings.analysis as Json),
        proposition: "arm two is faster",
        finding: "1.1x",
      });
      const kept = await call(c, "keep", {
        keeping: [claimIn(armOne, "arm one is faster")],
        because: id(
          await call(c, "record_review", {
            of: id(twoFindings.analysis as Json),
            verdict: "arm two used the wrong baseline",
          }),
        ),
        method: "paired timing, corrected baseline",
      });
      expect(kept.kept as string[]).toHaveLength(1);
      expect((kept.superseded as Array<{ asserts: string }>)[0]!.asserts).toBe("arm two is faster");

      await call(c, "accept_as_unresolved", {
        enquiry: id(dense),
        because: "the dense set needs an instance generator nobody has written",
        until: "a dense generator exists",
        in_light_of: claimIn(denseConcl, HOLDS),
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
    const all = [...TOOLS, ...WRITE_TOOLS, ...SESSION_TOOLS].map((t) => t.name).sort();
    expect([...called].sort()).toEqual(all);
  });

  const SPARSE = "the solver is faster on sparse instances";
  const COATING = "the coating slows corrosion";
  const NARROWER = "the coating slows the post-induction corrosion rate";
  const HOLDS = "the speedup holds";
});
