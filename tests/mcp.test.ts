/**
 * The MCP server, driven as a client drives it.
 *
 * `tests/cli.test.ts` checks the CLI's source text for write verbs, which is
 * worth having and is not behaviour. This file stands the real server up over
 * `InMemoryTransport` and issues real `tools/list` and `tools/call` requests
 * against a real seeded graph, in-process — the SDK's own transport pair, so
 * nothing about the protocol is faked.
 *
 * Two properties, and they are different:
 *
 *   - **structural**: every public verb on either surface is exposed as a tool
 *     or listed in `NOT_EXPOSED` with a reason, and each tool's `readOnlyHint`
 *     matches the list it came from. Derived from both surfaces the server
 *     holds, never restated — see tests/helpers/surface-coverage.ts.
 *   - **behavioural**: specific answers, over the wire, matching what the read
 *     surface answers directly.
 *
 * `tests/mcp-smoke.test.ts` is the third property and a different one again:
 * every tool is *called* at least once. Exposed is not the same as working,
 * and this file only ever exercised the tools its own scenarios needed.
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
import type { TenantGraph } from "../src/db/graph";
import { buildServer } from "../src/mcp/server";
import { TOOLS, WRITE_TOOLS } from "../src/mcp/tools";
import { historicalSurveySchema, knowledgeSurveySchema } from "../src/mcp/schemas";
import { DOCS_FILE, DOCS_URI, renderToolDocs } from "../src/mcp/docs";
import { z } from "zod";
import { openScenario, type Scenario } from "./helpers/scenario";
import { ref } from "../src/domain/report";
import { NOT_EXPOSED, publicVerbsOf, verbsReachedIn } from "./helpers/surface-coverage";
import { readFileSync } from "node:fs";
import { claimNamed, claimOf } from "./helpers/claims";

/**
 * A handle out of a tool's reply.
 *
 * A tool whose whole answer is one handle returns it under a field named for
 * what it is — `{"question": "Q_1"}` — because MCP's `structuredContent` must
 * be an object and a handle is a bare string now. This takes that sole value.
 */
const id = (v: unknown): string =>
  // A bare string passes through: `Object.values("COMP_1")[0]` is `"C"`, which
  // reaches the server as a handle and is refused there -- loudly, but two
  // layers from the mistake.
  typeof v === "string" ? v : (Object.values(v as Record<string, unknown>)[0] as string);

/**
 * The composition `src/mcp/server.ts` uses: one graph, one sink owned here, and
 * a **factory** for the write half so each tool call gets its own surface. The
 * sink must be constructed at this level rather than taken from a surface — a
 * per-call surface defaulting to its own log would fragment the stream and
 * leave the read half holding an empty one.
 */
async function connectServer(
  graph: TenantGraph,
  transport: Parameters<ReturnType<typeof buildServer>["connect"]>[0],
) {
  const events = inMemoryEventLog();
  return buildServer(
    new ReadSurface(graph, { events }),
    () => new WriteSurface(graph, { events }),
  ).connect(transport);
}

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

describe("structure", () => {
  /**
   * **This block used to forbid writing.** Three tests asserted that no write
   * verb name appeared under `src/mcp/` and that every tool declared
   * `readOnlyHint`. They were right for the batch of work they were written
   * for, and wrong as a design position: a record nothing can write to has
   * nothing in it. They were deleted with the commit that added write tools,
   * not worked around.
   *
   * `tests/cli.test.ts` keeps the same checks, because the CLI *is* read-only
   * by design — it builds a `ReadSurface` and never a `WriteSurface`.
   */
  test("every public domain verb is exposed, or excluded with a reason", () => {
    // The check that would have caught six reads shipping unreachable. Both
    // lists are derived: the verbs from the surface declarations, the reached
    // set from the adapter's source. Nothing here names a tool.
    const toolSource = readFileSync("src/mcp/tools.ts", "utf8");
    const reads = publicVerbsOf("src/domain/read.ts");
    const writes = publicVerbsOf("src/domain/write.ts");

    // Guard the derivation itself: a regex that stopped matching would make
    // this test pass by having nothing to check.
    expect(reads.length).toBeGreaterThan(10);
    expect(writes.length).toBeGreaterThan(10);
    expect(reads).toContain("gateStatus");
    expect(writes).toContain("recordAnalysis");

    const unreachable = [
      ...reads.filter((v) => verbsReachedIn(toolSource, "read", [v]).length === 0),
      ...writes.filter((v) => verbsReachedIn(toolSource, "write", [v]).length === 0),
    ].filter((v) => !(v in NOT_EXPOSED));

    expect(unreachable).toEqual([]);
  });

  test("every declared tool is registered, and only the reads claim to be read-only", async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const graph = await scenario.begin();
    try {
      await connectServer(graph, serverSide);
      const client = new Client({ name: "test", version: "0" });
      await client.connect(clientSide);

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(
        [...TOOLS, ...WRITE_TOOLS].map((t) => t.name).sort(),
      );

      // Derived from which list a tool is in, not from a list of names here.
      const readNames = new Set(TOOLS.map((t) => t.name));
      for (const t of tools) {
        expect(t.annotations?.readOnlyHint ?? false).toBe(readNames.has(t.name));
      }
      await client.close();
    } finally {
      await scenario.end();
    }
  });
});

describe("an agent can track work through the tools alone", () => {
  /**
   * The sentence this file exists to assert: **an agent with nothing but this
   * server can put a piece of research on the record and then ask about it.**
   * Every act below goes over the wire through `callTool` — no `ResearchSession`
   * is constructed, no verb is called directly, and the reads at the end see
   * only what the writes put there.
   *
   * It is deliberately the shortest whole loop rather than a tour: ask, start,
   * measure, conclude, close. If the write half were removed, every read at the
   * end would answer about an empty graph and the test would fail on the first
   * of them.
   */
  async function client() {
    const graph = await scenario.begin();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await connectServer(graph, serverSide);
    const c = new Client({ name: "test", version: "0" });
    await c.connect(clientSide);
    return c;
  }

  /** The one place a test resolves wording, through the tool that exists for it. */
  const claimIdFor = async (c: Client, proposition: string) => {
    const found = (await call(c, "claims_asserting", { proposition })).claims as Array<{
      claim: string;
    }>;
    return found[0]!.claim;
  };

  const call = async (c: Client, name: string, args: Record<string, unknown>) => {
    const result = await c.callTool({ name, arguments: args });
    // The message, not just `true`. `expect(isError).toBe(false)` reported
    // "Expected: false / Received: true" and nothing about which tool or why,
    // which is a failing test that cannot name its own failure.
    if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
    return result.structuredContent as Record<string, unknown>;
  };

  test("open, record, conclude, close — then the reads answer about it", async () => {
    const c = await client();
    try {
      const enquiry = await call(c, "open_enquiry", {
        question: "does the pruning schedule move convergence?",
      });
      expect(String(id(enquiry)).startsWith("LOE_")).toBe(true);

      const observations = await call(c, "record_observations", {
        enquiry: id(enquiry),
        name: "sweep readings",
        finding: "twelve runs at five seeds",
        content_hash: "sha256:abc",
      });

      const analysis = await call(c, "record_analysis", {
        enquiry: id(enquiry),
        method: "paired comparison",
        from: [id(observations)],
        concludes: [{ proposition: PROP, finding: "moves by ~3 steps" }],
      });

      const claimId = (analysis.claims as Array<{ claim: string; asserts: string }>).find(
        (x) => x.asserts === PROP,
      )!.claim;
      await call(c, "close_enquiry", {
        enquiry: id(enquiry),
        answered_by: claimId,
      });

      // Now the reads, which had nothing to say before any of the above.
      const status = await call(c, "enquiry_status", { enquiry: id(enquiry) });
      expect((status.question as { open: boolean }).open).toBe(false);
      expect((status.question as { closure: string }).closure).toBe("answered");

      const why = await call(c, "why_supported", {
        claim: await claimIdFor(c, PROP),
      });
      expect(why.supported).toBe(true);

      // **`provisional` before promotion, `established` after** — the whole of
      // capture-cheaply-then-promote, asserted on both sides of the one act
      // that moves it. A question answered on a finding nobody vouched for is
      // settled as far as anyone has taken it and no further, so reading the
      // survey for "what do we actually know" cannot silently include a
      // lunchtime sweep.
      const asks = (bucket: unknown) => (bucket as Array<{ asks: string }>).map((q) => q.asks);
      const before = await call(c, "known", {});
      expect(asks(before.provisional)).toContain("does the pruning schedule move convergence?");
      expect(asks(before.established)).toEqual([]);

      await call(c, "promote", {
        claim: claimId,
        because: "checked against the held-out split",
      });

      const after = await call(c, "known", {});
      expect(asks(after.established)).toContain("does the pruning schedule move convergence?");
      expect(asks(after.provisional)).toEqual([]);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("pose then pursue, and pursuits_of finds the enquiry a later caller did not open", async () => {
    // The discovery hole this closes: an agent reconnecting has question ids
    // from `known` and no way to reach the enquiries beneath them.
    const c = await client();
    try {
      const question = await call(c, "pose", {
        question: "does depth move convergence?",
      });
      const before = await call(c, "pursuits_of", { question: id(question) });
      expect(before.enquiries).toEqual([]);

      const enquiry = await call(c, "pursue", {
        question: id(question),
        approach: "depth sweep at fixed width",
      });
      const after = await call(c, "pursuits_of", { question: id(question) });
      expect(after.enquiries).toEqual([id(enquiry)]);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("a gate is computed from its checks, not set", async () => {
    // The second loop worth having end to end: state a condition before running
    // anything, gate work on it, record an analysis held to it, then evaluate.
    // Nothing anywhere sets a gate to `satisfied` -- the read computes it.
    const c = await client();
    try {
      const criterion = await call(c, "state_criterion", {
        proposition: "the effect holds at five seeds",
      });
      const work = await call(c, "plan_work", {
        objective: "publish the convergence result",
        acceptance: "the prespecified check passes",
      });
      const gate = await call(c, "declare_gate", {
        governed_by: [id(criterion)],
        consequence: "whether the result may be published",
        protecting: [id(work)],
      });

      const enquiry = await call(c, "open_enquiry", {
        question: "does it hold at five seeds?",
      });
      const observations = await call(c, "record_observations", {
        enquiry: id(enquiry),
        name: "seed sweep",
        finding: "five seeds, consistent",
      });
      await call(c, "record_analysis", {
        enquiry: id(enquiry),
        method: "seed sweep",
        from: [id(observations)],
        concludes: [
          {
            proposition: HOLDS,
            finding: "holds at all five",
            standing: "confirmatory",
          },
        ],
        implementing: id(work),
        held_to: [id(criterion)],
      });

      // Unmet before the check is run -- an unrun check counts against the
      // finding it qualifies, which is why the criterion is stated up front.
      const beforeCheck = await call(c, "why_supported", {
        claim: await claimIdFor(c, HOLDS),
      });
      expect(beforeCheck.unmet).not.toEqual([]);

      await call(c, "evaluate_criterion", {
        criterion: id(criterion),
        gate: id(gate),
        value: "5/5 seeds",
        outcome: "pass",
      });

      const afterCheck = await call(c, "why_supported", {
        claim: await claimIdFor(c, HOLDS),
      });
      expect(afterCheck.unmet).toEqual([]);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("a claim's reading can be narrowed, and the history says so", async () => {
    const c = await client();
    try {
      const enquiry = await call(c, "open_enquiry", {
        question: "is the gain general?",
      });
      const observations = await call(c, "record_observations", {
        enquiry: id(enquiry),
        name: "benchmark run",
        finding: "faster on the suite",
      });
      const analysis = await call(c, "record_analysis", {
        enquiry: id(enquiry),
        method: "benchmark",
        from: [id(observations)],
        concludes: [{ proposition: GENERAL, finding: "12% faster overall" }],
      });
      expect(analysis.analysis as string).toMatch(/^COMP_/);

      const report = await call(c, "reinterpret", {
        claim: await claimIdFor(c, GENERAL),
        as: "the method is faster on this benchmark suite",
        because: "the suite is not representative of the general case",
      });
      // Over the wire the pairs survive as objects, not sentences -- the
      // schema mirror in src/mcp/schemas.ts is held to the report interface at
      // compile time, and this checks the same thing at run time.
      const previously = report.previously as Array<{
        claim: string;
        asserts: string;
      }>;
      const nowClaims = report.nowClaims as { claim: string; asserts: string };
      expect(previously.map((c) => c.asserts)).toEqual([GENERAL]);
      expect(nowClaims.asserts).toBe("the method is faster on this benchmark suite");
      expect(nowClaims.claim.startsWith("CLM_")).toBe(true);

      // Asked with the handle `reinterpret` just returned, not by looking the
      // sentence back up.
      const history = await call(c, "interpretation_history", {
        claim: nowClaims.claim,
      });
      expect((history.originally as Array<{ asserts: string }>).map((c) => c.asserts)).toEqual([
        GENERAL,
      ]);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  /**
   * The demonstrated consumer failure, from the other side.
   *
   * `replace_analysis(supersedes=A2, from=[A1])` used to come back
   * `CONSUMES does not allow Computation -> Computation`. `record_analysis`
   * accepted an analysis id and the other two recording verbs did not, so an
   * agent that had recorded stage two held its `COMP_` id and never the `ART_`
   * id underneath it. The reachable workaround was to call `why_supported` in
   * order to learn what a computation had read, which is a database search to
   * use a command.
   */
  test("a replacement can read an earlier analysis's output, by that analysis's id", async () => {
    const c = await client();
    try {
      const enquiry = await call(c, "open_enquiry", {
        question: "does the calibration hold?",
      });
      const raw = await call(c, "record_observations", {
        enquiry: id(enquiry),
        name: "raw series",
        finding: "uncalibrated instrument output",
      });
      const calibration = await call(c, "record_analysis", {
        enquiry: id(enquiry),
        method: "calibrate",
        from: [id(raw)],
        concludes: [
          {
            proposition: "the series is calibrated",
            finding: "offset removed",
          },
        ],
      });
      const trend = await call(c, "record_analysis", {
        enquiry: id(enquiry),
        method: "trend",
        from: [calibration.analysis as string],
        concludes: [{ proposition: TRENDS, finding: "slope 0.4" }],
      });
      const review = await call(c, "record_review", {
        of: trend.analysis as string,
        verdict: "the slope test was one-sided",
      });

      const stageOne = calibration.analysis as string;
      const report = await call(c, "replace_analysis", {
        supersedes: trend.analysis as string,
        because: id(review),
        enquiry: id(enquiry),
        method: "trend, two-sided",
        from: [stageOne],
        concludes: [{ proposition: TRENDS, finding: "slope 0.4, two-sided" }],
      });

      // The handle comes back as the caller named it -- an analysis, not an
      // artefact relabelled "observations" -- and `named` is the output's own
      // name, which needed the same dereference the CONSUMES edge needs.
      const unaffected = report.unaffected as Array<{
        what: string;
        named: string;
        why: string;
      }>;
      expect(unaffected).toHaveLength(1);
      expect(unaffected[0]!.what).toEqual(stageOne);
      expect(unaffected[0]!.named).toBe("calibrate output");

      // The observations branch of the same field, which had never been
      // asserted either and was returning its id too.
      const other = await call(c, "replace_analysis", {
        supersedes: calibration.analysis as string,
        because: id(
          await call(c, "record_review", {
            of: calibration.analysis as string,
            verdict: "offset table was stale",
          }),
        ),
        enquiry: id(enquiry),
        method: "calibrate, current offsets",
        from: [id(raw)],
        concludes: [
          {
            proposition: "the series is calibrated",
            finding: "offset removed, current table",
          },
        ],
      });
      expect((other.unaffected as Array<{ named: string }>)[0]!.named).toBe("raw series");

      // And the same id is accepted by the third verb, which also took
      // observations alone.
      const verified = await call(c, "reverify", {
        historical: trend.analysis as string,
        enquiry: id(enquiry),
        method: "trend, held-out split",
        under: [stageOne],
        concludes: {
          proposition: TRENDS,
          finding: "slope 0.38 on the held-out split",
        },
      });
      expect(String(verified.verification as string).startsWith("COMP_")).toBe(true);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("closing an enquiry twice is refused, not recorded twice", async () => {
    const c = await client();
    try {
      const enquiry = await call(c, "open_enquiry", {
        question: "does width matter?",
      });
      await call(c, "close_enquiry", { enquiry: id(enquiry) });

      const again = await c.callTool({
        name: "close_enquiry",
        arguments: { enquiry: id(enquiry) },
      });
      expect(again.isError).toBe(true);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  const PROP = "the pruning schedule moves convergence";
  const HOLDS = "the effect holds at five seeds";
  const GENERAL = "the method is faster";
  const TRENDS = "the response trends upward with dose";
});

describe("the tool documentation resource", () => {
  /**
   * The property worth testing is not that the markdown looks right -- it is
   * that it is *derived*. Nothing below names a tool or a field: every
   * expectation is computed from TOOLS, so a tool added without documentation,
   * or a field renamed in a report type, fails here rather than shipping a
   * document that quietly describes last week's server.
   *
   * Demonstrated by breaking the generator and watching this fail: dropping a
   * tool's description fails it, and so does refusing to render nested fields.
   * The second only became true after the test was fixed -- the first version
   * read `properties` at the top level only, and passed with every nested name
   * missing from the document. A derived test can still check the wrong thing.
   */
  /** Every property name in a JSON Schema, at any depth. */
  function leafNames(schema: unknown, depth = 0): string[] {
    const s = schema as {
      properties?: Record<string, unknown>;
      items?: unknown;
      anyOf?: unknown[];
    };
    if (!s || depth > 4) return [];
    const here = Object.keys(s.properties ?? {});
    const nested = [
      ...Object.values(s.properties ?? {}),
      ...(s.items ? [s.items] : []),
      ...(s.anyOf ?? []),
    ].flatMap((child) => leafNames(child, depth + 1));
    return [...here, ...nested];
  }

  /** The one content block, narrowed to the text variant a markdown resource returns. */
  const markdown = (contents: ReadonlyArray<{ mimeType?: string } & Record<string, unknown>>) => {
    const first = contents[0];
    if (!first || typeof first.text !== "string") throw new Error("resource returned no text");
    return { mimeType: first.mimeType, text: first.text };
  };

  async function connected() {
    const graph = await scenario.begin();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await connectServer(graph, serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    return client;
  }

  test("the resource is listed and serves markdown", async () => {
    const client = await connected();
    try {
      const { resources } = await client.listResources();
      expect(resources.map((r) => r.uri)).toContain(DOCS_URI);

      const { contents } = await client.readResource({ uri: DOCS_URI });
      expect(contents).toHaveLength(1);
      expect(markdown(contents).mimeType).toBe("text/markdown");
      expect(markdown(contents).text.startsWith("# LabKit")).toBe(true);
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("every tool, and every field of every declared output, is documented", async () => {
    const client = await connected();
    try {
      const { contents } = await client.readResource({ uri: DOCS_URI });
      const doc = markdown(contents).text;

      for (const tool of [...TOOLS, ...WRITE_TOOLS]) {
        expect(doc).toContain(`## ${tool.name}`);
        expect(doc).toContain(tool.description);
        // Input field names, derived from the tool's own declaration.
        for (const field of Object.keys(tool.inputSchema)) expect(doc).toContain(`\`${field}`);
        // Output field names, derived from the schema rather than listed --
        // and walked to the leaves, because the first version of this test read
        // only the top level and passed while every nested name was missing.
        if (tool.outputSchema) {
          for (const field of leafNames(z.toJSONSchema(tool.outputSchema))) {
            expect(doc).toContain(`\`${field}`);
          }
        }
      }
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("the checked-in copy matches what the generator produces", () => {
    // The whole freshness mechanism: one assertion, in a file that already
    // renders this document for other reasons. No hook, no check:* script.
    // When it fails: `bun run docs:tools`.
    //
    // docs/mcp-tools.md is checked in because it is the only place this
    // domain's API is reviewable as a single file, and its diff is the point --
    // a changed line means the API changed.
    expect(readFileSync(DOCS_FILE, "utf8")).toBe(renderToolDocs());
  });

  test("the document is generated, not stored", async () => {
    // Rendering a subset produces a smaller document naming only that subset --
    // which a checked-in file could not do, and which is the property that makes
    // the served one impossible to leave stale.
    const one = renderToolDocs([TOOLS[0]!], []);
    expect(one).toContain(`## ${TOOLS[0]!.name}`);
    expect(one).not.toContain(`## ${TOOLS[1]!.name}`);
    expect(one).not.toContain(`## ${WRITE_TOOLS[0]!.name}`);
  });
});

describe("behaviour — the same answers, over the wire", () => {
  /**
   * One programme: a question asked, worked on, concluded and closed, plus a
   * second question nothing has touched. Enough for every tool to have
   * something to say and for `known` to have both a settled and an untested
   * bucket.
   */
  async function seeded() {
    const graph = await scenario.begin();
    const s = new ResearchSession(graph, { clock, events: inMemoryEventLog() });

    const enquiry = await s.openEnquiry("does the pruning schedule move convergence?");
    await s.pose("does depth move convergence?");
    const observations = await s.recordObservations({
      enquiry,
      name: "sweep readings",
      finding: "twelve runs at five seeds",
    });
    const { analysis: analysis, claims: analysisClaims } = await s.recordAnalysis({
      enquiry,
      method: "paired comparison",
      from: [observations],
      concludes: [{ proposition: PROP, finding: "moves by ~3 steps" }],
    });
    await s.closeEnquiry({
      enquiry,
      answeredBy: claimOf(analysisClaims, PROP),
    });

    const current = await scenario.current();
    const read = new ReadSurface(current);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await connectServer(current, serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    return { client, read, enquiry, analysis, analysisClaims, observations };
  }

  const PROP = "the pruning schedule moves convergence";

  const structured = async (client: Client, name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError ?? false).toBe(false);
    return result.structuredContent as Record<string, unknown>;
  };

  test("known, why_supported, what_depends_on and enquiry_status agree with the read surface", async () => {
    const { client, read, enquiry } = await seeded();
    try {
      expect(await structured(client, "known", {})).toEqual(
        JSON.parse(JSON.stringify(await read.whatIsKnown())),
      );
      const claim = await claimNamed(read, PROP);
      expect(await structured(client, "why_supported", { claim: claim })).toEqual(
        JSON.parse(JSON.stringify(await read.whySupported(claim))),
      );
      expect(
        await structured(client, "what_depends_on", {
          artefact: "sweep readings",
        }),
      ).toEqual(JSON.parse(JSON.stringify(await read.whatDependsOn("sweep readings"))));
      expect(await structured(client, "enquiry_status", { enquiry: enquiry })).toEqual(
        JSON.parse(JSON.stringify(await read.enquiryStatus(enquiry))),
      );
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("known --at answers as of a moment, and canonicalises the instant it was given", async () => {
    const { client } = await seeded();
    try {
      // Everything above happened in March 2026. Asked about February, the
      // programme had not begun -- and a question posed later is absent, not
      // open. See tests/consumer/historical_survey.test.ts.
      const february = await structured(client, "known", {
        at: "2026-02-01T00:00:00.000Z",
      });
      expect(february.open).toEqual([]);
      expect(february.established).toEqual([]);

      // Offered with an offset, the answer echoes the instant it compared.
      const offset = await structured(client, "known", {
        at: "2026-04-01T00:00:00+02:00",
      });
      expect(offset.at).toBe("2026-03-31T22:00:00.000Z");
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("the whole report crosses, not a chosen subset of it", async () => {
    // The defect this guards against is the CLI's, one level up: a renderer
    // that names the fields it prints falls behind the type the day a field is
    // added. Nothing here names a field, so nothing can.
    const { client, read } = await seeded();
    try {
      const claim = await claimNamed(read, PROP);
      const direct = JSON.parse(JSON.stringify(await read.whySupported(claim)));
      const overWire = await structured(client, "why_supported", {
        claim: claim,
      });
      expect(Object.keys(overWire).sort()).toEqual(Object.keys(direct).sort());
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("every tool's real output parses against its declared schema", async () => {
    // The compile-time gate in src/mcp/schemas.ts is two-way assignability, and
    // it has one measured hole: a schema that DROPS an optional field is still
    // assignable both ways, so tsc passes.
    //
    // This narrows that hole and does not close it. The schemas are strict, so
    // an output carrying a key the schema has forgotten fails to parse here --
    // but only if this session produces that key. Demonstrated both ways:
    // deleting `restsOn` from enquiryStatusSchema fails this test; deleting
    // `replacedBy` from supportExplanationSchema passes it, because nothing
    // below withdraws a claim. An optional field no test data produces is
    // still unguarded.
    const { client, read, enquiry } = await seeded();
    try {
      const parsed = async (name: string, args: Record<string, unknown>) => {
        const schema = TOOLS.find((t) => t.name === name)?.outputSchema;
        if (!schema) throw new Error(`${name} declares no outputSchema`);
        const result = await schema.safeParseAsync(await structured(client, name, args));
        if (!result.success) throw new Error(`${name}: ${JSON.stringify(result.error.issues)}`);
      };

      await parsed("why_supported", {
        claim: (await read.claimsAsserting(PROP))[0]!.claim,
      });
      await parsed("what_depends_on", { artefact: "sweep readings" });
      await parsed("enquiry_status", { enquiry: enquiry });

      // `known` is the one tool with no declared schema -- the SDK cannot carry
      // a union (see src/mcp/tools.ts). Its two shapes are still checked, here.
      expect(knowledgeSurveySchema.safeParse(await structured(client, "known", {})).success).toBe(
        true,
      );
      expect(
        historicalSurveySchema.safeParse(
          await structured(client, "known", { at: "2026-04-01T00:00:00.000Z" }),
        ).success,
      ).toBe(true);
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("every tool but `known` declares an output schema", () => {
    // Derived, not listed: a tool added later without one fails here rather
    // than shipping unvalidated.
    expect(TOOLS.filter((t) => !t.outputSchema).map((t) => t.name)).toEqual(["known"]);
  });

  test("a domain refusal arrives as an error, never as an empty success", async () => {
    const { client } = await seeded();
    try {
      const result = await client.callTool({
        name: "enquiry_status",
        arguments: { enquiry: "LOE_does_not_exist" },
      });
      expect(result.isError).toBe(true);
      await client.close();
    } finally {
      await scenario.end();
    }
  });
});
