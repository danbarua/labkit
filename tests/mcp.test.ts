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
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ReadSurface, ResearchSession, inMemoryEventLog, type Clock } from "../src/domain";
import { TenantGraph } from "../src/db/graph";
import { buildServer } from "../src/mcp/server";
import { TOOLS } from "../src/mcp/tools";
import { historicalSurveySchema, knowledgeSurveySchema } from "../src/mcp/schemas";
import { DOCS_URI, renderToolDocs } from "../src/mcp/docs";
import { z } from "zod";
import { openScenario, type Scenario } from "./helpers/scenario";
import { writeVerbNames, writeVerbsCalledIn } from "./helpers/read-only";

let scenario: Scenario;
beforeAll(async () => { scenario = await openScenario(); });
afterAll(async () => { await scenario.close(); });

const clock: Clock = (() => { let t = 0; return { now: () => new Date(Date.UTC(2026, 2, 1) + t++ * 60_000).toISOString() }; })();

/** Source of every file under src/mcp/, comments stripped — prose naming a verb is not importing it. */
const mcpSource = readdirSync("src/mcp")
  .map((f) => readFileSync(`src/mcp/${f}`, "utf8"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("structure", () => {
  test("the server imports the read half and not the write half", () => {
    expect(mcpSource).toContain("ReadSurface");
    expect(mcpSource).not.toContain("WriteSurface");
    expect(mcpSource).not.toContain("ResearchSession");
  });

  test("no write verb name appears anywhere under src/mcp", () => {
    // Both surfaces the server holds, not only WriteSurface -- it builds a
    // TenantGraph, whose createNode/createEdge are writes that a list derived
    // from WriteSurface can never contain. PJ-028 found that hole here and in
    // the CLI at the same time; tests/helpers/read-only.ts states what the
    // check proves and what it does not.
    expect(writeVerbNames().length).toBeGreaterThan(10);
    expect(writeVerbNames()).toContain("createEdge");
    expect(writeVerbsCalledIn(mcpSource)).toEqual([]);
  });

  test("every tool names a real read-surface method and declares itself read-only", async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const graph = await scenario.begin();
    try {
      await buildServer(new ReadSurface(graph)).connect(serverSide);
      const client = new Client({ name: "test", version: "0" });
      await client.connect(clientSide);

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
      for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
      await client.close();
    } finally {
      await scenario.end();
    }
  });
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
    await buildServer(new ReadSurface(graph)).connect(serverSide);
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

      for (const tool of TOOLS) {
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
    const one = renderToolDocs([TOOLS[0]!]);
    expect(one).toContain(`## ${TOOLS[0]!.name}`);
    expect(one).not.toContain(`## ${TOOLS[1]!.name}`);
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

    const read = new ReadSurface(await scenario.current());
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await buildServer(read).connect(serverSide);
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
