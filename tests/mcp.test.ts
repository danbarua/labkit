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
 *   - **structural**: no write verb is reachable, and every tool declares
 *     itself read-only. Derived from both surfaces the server holds, never
 *     listed — see tests/helpers/read-only.ts.
 *   - **behavioural**: the seven tools answer, over the wire, what the read
 *     surface answers directly.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ReadSurface, ResearchSession, WriteSurface, inMemoryEventLog, type Clock } from "../src/domain";
import type { TenantGraph } from "../src/db/graph";
import { buildServer } from "../src/mcp/server";
import { TOOLS, WRITE_TOOLS } from "../src/mcp/tools";
import { historicalSurveySchema, knowledgeSurveySchema } from "../src/mcp/schemas";
import { DOCS_URI, renderToolDocs } from "../src/mcp/docs";
import { z } from "zod";
import { openScenario, type Scenario } from "./helpers/scenario";

/**
 * The composition `src/domain/session.ts` specifies for an adapter needing both
 * halves: one graph, one event sink taken from the write side.
 */
async function connectServer(graph: TenantGraph, transport: Parameters<ReturnType<typeof buildServer>["connect"]>[0]) {
  const writes = new WriteSurface(graph);
  return buildServer(new ReadSurface(graph, { events: writes.events }), writes).connect(transport);
}

let scenario: Scenario;
beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });

const clock: Clock = (() => { let t = 0; return { now: () => new Date(Date.UTC(2026, 2, 1) + t++ * 60_000).toISOString() }; })();

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

  const call = async (c: Client, name: string, args: Record<string, unknown>) => {
    const result = await c.callTool({ name, arguments: args });
    expect(result.isError ?? false).toBe(false);
    return result.structuredContent as Record<string, unknown>;
  };

  test("open, record, conclude, close — then the reads answer about it", async () => {
    const c = await client();
    try {
      const enquiry = await call(c, "open_enquiry", {
        question: "does the pruning schedule move convergence?",
      });
      expect(String(enquiry.id).startsWith("LOE_")).toBe(true);

      const observations = await call(c, "record_observations", {
        enquiry: enquiry.id,
        name: "sweep readings",
        finding: "twelve runs at five seeds",
        content_hash: "sha256:abc",
      });

      const analysis = await call(c, "record_analysis", {
        enquiry: enquiry.id,
        method: "paired comparison",
        from: [observations.id],
        concludes: [{ proposition: PROP, finding: "moves by ~3 steps" }],
      });

      await call(c, "close_enquiry", {
        enquiry: enquiry.id,
        answered_by_analysis: analysis.id,
        answered_by_proposition: PROP,
      });

      // Now the reads, which had nothing to say before any of the above.
      const status = await call(c, "enquiry_status", { enquiry: enquiry.id });
      expect(status.open).toBe(false);
      expect(status.closure).toBe("answered");

      const why = await call(c, "why_supported", { proposition: PROP });
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
        analysis: analysis.id,
        proposition: PROP,
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
      const question = await call(c, "pose", { question: "does depth move convergence?" });
      const before = await call(c, "pursuits_of", { question: question.id });
      expect(before.enquiries).toEqual([]);

      const enquiry = await call(c, "pursue", {
        question: question.id,
        approach: "depth sweep at fixed width",
      });
      const after = await call(c, "pursuits_of", { question: question.id });
      expect(after.enquiries).toEqual([{ kind: "enquiry", id: enquiry.id }]);
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
        governed_by: [criterion.id],
        consequence: "whether the result may be published",
        protecting: [work.id],
      });

      const enquiry = await call(c, "open_enquiry", { question: "does it hold at five seeds?" });
      const observations = await call(c, "record_observations", {
        enquiry: enquiry.id, name: "seed sweep", finding: "five seeds, consistent",
      });
      await call(c, "record_analysis", {
        enquiry: enquiry.id,
        method: "seed sweep",
        from: [observations.id],
        concludes: [{ proposition: HOLDS, finding: "holds at all five", standing: "confirmatory" }],
        implementing: work.id,
        held_to: [criterion.id],
      });

      // Unmet before the check is run -- an unrun check counts against the
      // finding it qualifies, which is why the criterion is stated up front.
      const beforeCheck = await call(c, "why_supported", { proposition: HOLDS });
      expect(beforeCheck.unmet).not.toEqual([]);

      await call(c, "evaluate_criterion", {
        criterion: criterion.id,
        gate: gate.id,
        value: "5/5 seeds",
        outcome: "pass",
      });

      const afterCheck = await call(c, "why_supported", { proposition: HOLDS });
      expect(afterCheck.unmet).toEqual([]);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("a claim's reading can be narrowed, and the history says so", async () => {
    const c = await client();
    try {
      const enquiry = await call(c, "open_enquiry", { question: "is the gain general?" });
      const observations = await call(c, "record_observations", {
        enquiry: enquiry.id, name: "benchmark run", finding: "faster on the suite",
      });
      const analysis = await call(c, "record_analysis", {
        enquiry: enquiry.id, method: "benchmark",
        from: [observations.id],
        concludes: [{ proposition: GENERAL, finding: "12% faster overall" }],
      });
      expect(analysis.kind).toBe("analysis");

      const report = await call(c, "reinterpret", {
        proposition: GENERAL,
        as: "the method is faster on this benchmark suite",
        because: "the suite is not representative of the general case",
      });
      expect(report.previously).toBe(GENERAL);
      expect(report.nowClaims).toBe("the method is faster on this benchmark suite");

      const history = await call(c, "interpretation_history", {
        proposition: "the method is faster on this benchmark suite",
      });
      expect(history.originally).toBe(GENERAL);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("closing an enquiry twice is refused, not recorded twice", async () => {
    const c = await client();
    try {
      const enquiry = await call(c, "open_enquiry", { question: "does width matter?" });
      await call(c, "close_enquiry", { enquiry: enquiry.id });

      const again = await c.callTool({
        name: "close_enquiry",
        arguments: { enquiry: enquiry.id },
      });
      expect(again.isError).toBe(true);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("a half-given answer is refused rather than silently abandoning the enquiry", async () => {
    // The two `answered_by_*` fields are one argument split across the wire.
    // Accepting half of it would close as abandoned an enquiry the caller
    // believed it was answering.
    const c = await client();
    try {
      const enquiry = await call(c, "open_enquiry", { question: "does seed count matter?" });
      const result = await c.callTool({
        name: "close_enquiry",
        arguments: { enquiry: enquiry.id, answered_by_proposition: "it does" },
      });
      expect(result.isError).toBe(true);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  const PROP = "the pruning schedule moves convergence";
  const HOLDS = "the effect holds at five seeds";
  const GENERAL = "the method is faster";
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
      enquiry, name: "sweep readings", finding: "twelve runs at five seeds",
    });
    const analysis = await s.recordAnalysis({
      enquiry, method: "paired comparison", from: [observations],
      concludes: [{ proposition: PROP, finding: "moves by ~3 steps" }],
    });
    await s.closeEnquiry({ enquiry, answeredBy: { analysis, proposition: PROP } });

    const current = await scenario.current();
    const read = new ReadSurface(current);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await connectServer(current, serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    return { client, read, enquiry, analysis, observations };
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
      expect(await structured(client, "why_supported", { proposition: PROP })).toEqual(
        JSON.parse(JSON.stringify(await read.whySupported(PROP))),
      );
      expect(await structured(client, "what_depends_on", { artefact: "sweep readings" })).toEqual(
        JSON.parse(JSON.stringify(await read.whatDependsOn("sweep readings"))),
      );
      expect(await structured(client, "enquiry_status", { enquiry: enquiry.id })).toEqual(
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
      const february = await structured(client, "known", { at: "2026-02-01T00:00:00.000Z" });
      expect(february.open).toEqual([]);
      expect(february.established).toEqual([]);

      // Offered with an offset, the answer echoes the instant it compared.
      const offset = await structured(client, "known", { at: "2026-04-01T00:00:00+02:00" });
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
      const direct = JSON.parse(JSON.stringify(await read.whySupported(PROP)));
      const overWire = await structured(client, "why_supported", { proposition: PROP });
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
    const { client, enquiry } = await seeded();
    try {
      const parsed = async (name: string, args: Record<string, unknown>) => {
        const schema = TOOLS.find((t) => t.name === name)?.outputSchema;
        if (!schema) throw new Error(`${name} declares no outputSchema`);
        const result = await schema.safeParseAsync(await structured(client, name, args));
        if (!result.success) throw new Error(`${name}: ${JSON.stringify(result.error.issues)}`);
      };

      await parsed("why_supported", { proposition: PROP });
      await parsed("what_depends_on", { artefact: "sweep readings" });
      await parsed("enquiry_status", { enquiry: enquiry.id });

      // `known` is the one tool with no declared schema -- the SDK cannot carry
      // a union (see src/mcp/tools.ts). Its two shapes are still checked, here.
      expect(knowledgeSurveySchema.safeParse(await structured(client, "known", {})).success).toBe(true);
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
