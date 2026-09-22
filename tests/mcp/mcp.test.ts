/**
 * The MCP server, driven as a client drives it.
 *
 * Every harness here hands `buildServer` surfaces it built itself, so this file
 * covers the declarations and the handlers and nothing about how `surfacesOver`
 * assembles a write. Guard a change to that in `tests/mcp-stdio.test.ts`: a test
 * added here passes on a server that never made the call.
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
} from "@labkit/core-domain";
import type { TenantGraph } from "@labkit/core-db/graph";
import { buildServer } from "@labkit/app-mcp/server";
import {
  commandContext,
  mockGitContext,
  registeredSession,
  sessionRegistry,
  type SessionRegistry,
} from "@labkit/core-domain/context";
import { SESSION_TOOLS, TOOLS, WRITE_TOOLS } from "@labkit/app-mcp/tools";
import { explanationSchema } from "@labkit/app-mcp/schemas";
import {
  DOCS_TOOL,
  DOCS_URI,
  INSTRUCTIONS,
  META_TOOLS,
  renderToolDocs,
} from "@labkit/app-mcp/docs";
import { z } from "zod";
import { Command } from "commander";
import { globalOptions } from "@labkit/app-cli/program";
import { openScenario, type Scenario } from "../helpers/scenario";
import { claimNamed, claimOf } from "../helpers/claims";
import { recordAnalysis } from "../helpers/analysis";

/**
 * A handle out of a tool's reply.
 */
const id = (v: unknown): string =>
  // A bare string passes through: `Object.values("COMP_1")[0]` is `"C"`, which
  // reaches the server as a handle and is refused there -- loudly, but two
  // layers from the mistake.
  typeof v === "string" ? v : (Object.values(v as Record<string, unknown>)[0] as string);

/**
 * The composition `packages/app-mcp/server.ts` uses: one graph, one sink owned here, and handed to a
 * **scope** the server enters per tool call.
 */
async function connectServer(
  graph: TenantGraph,
  transport: Parameters<ReturnType<typeof buildServer>["connect"]>[0],
  session: SessionRegistry = registeredSessionRegistry(),
) {
  const events = inMemoryEventLog();
  return buildServer(
    (work) =>
      work({
        read: new ReadSurface(graph, { events }),
        write: new WriteSurface(graph, { events }),
      }),
    session,
  ).connect(transport);
}

/**
 * A registry that has already been registered, which is what every test but the gate's own
 * wants.
 */
function registeredSessionRegistry(): SessionRegistry {
  const session = sessionRegistry();
  session.register("test-agent", "test-agent-0");
  return session;
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
  test("every declared tool is registered, and only the reads claim to be read-only", async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const graph = await scenario.begin();
    try {
      await connectServer(graph, serverSide);
      const client = new Client({ name: "test", version: "0" });
      await client.connect(clientSide);

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(
        [...META_TOOLS, ...TOOLS, ...WRITE_TOOLS, ...SESSION_TOOLS].map((t) => t.name).sort(),
      );

      // Derived from which list a tool is in, not from a list of names here.
      // Meta tools read nothing from the record and are read-only all the same.
      const readNames = new Set([...META_TOOLS, ...TOOLS].map((t) => t.name));
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
   * The sentence this file exists to assert: **an agent with this server, handed the handles
   * the write tools take, can put a piece of research on the record and then ask about it.**
   * The enquiry, work, criterion and gate a test needs are seeded through the domain's write
   * surface; every act after that goes over the wire through `callTool`, and the reads at the
   * end see what the writes put there.
   */
  async function client() {
    const graph = await scenario.begin();
    const seed = new WriteSurface(graph, { clock, events: inMemoryEventLog() });
    const read = new ReadSurface(graph);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await connectServer(graph, serverSide);
    const c = new Client({ name: "test", version: "0" });
    await c.connect(clientSide);
    return { c, seed, read };
  }

  const call = async (c: Client, name: string, args: Record<string, unknown>) => {
    const result = await c.callTool({ name, arguments: args });
    // The message, not just `true`. `expect(isError).toBe(false)` reported
    // "Expected: false / Received: true" and nothing about which tool or why,
    // which is a failing test that cannot name its own failure.
    if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
    return result.structuredContent as Record<string, unknown>;
  };

  test("record, analyse, conclude — then why answers about it", async () => {
    const { c, seed } = await client();
    try {
      const { enquiry } = await seed.openEnquiry("does the pruning schedule move convergence?");

      const observations = await call(c, "record_observations", {
        enquiry,
        name: "sweep readings",
        finding: "twelve runs at five seeds",
        content_hash: "sha256:abc",
      });

      const analysis = await call(c, "record_analysis", {
        enquiry,
        method: "paired comparison",
        from: [id(observations)],
      });
      expect(analysis.analysis as string).toMatch(/^COMP_/);
      // Two calls, because the run and the finding are two acts.
      const concluded = await call(c, "conclude", {
        analysis: id(analysis),
        proposition: PROP,
        finding: "moves by ~3 steps",
      });
      const claimId = (concluded.claims as Array<{ claim: string; asserts: string }>).find(
        (x) => x.asserts === PROP,
      )!.claim;
      expect(claimId.startsWith("CLM_")).toBe(true);

      // Now the reads, which had nothing to say before any of the above.
      const why = await call(c, "why", { subject: claimId });
      expect(why.kind).toBe("claim");
      expect((why.report as Record<string, unknown>).verdict).toBe("supported");

      // The same claim, reached by its proposition rather than its handle.
      const byWording = await call(c, "why", { subject: PROP });
      expect(byWording.subject).toBe(claimId);

      const status = await call(c, "why", { subject: enquiry });
      expect(status.kind).toBe("enquiry");
      expect(
        ((status.report as Record<string, unknown>).enquiry as Record<string, unknown>).open,
      ).toBe(true);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  test("a gate is computed from its checks, not set", async () => {
    // The second loop worth having end to end: state a condition before running
    // anything, gate work on it, record an analysis held to it, then evaluate.
    // Nothing anywhere sets a gate to `satisfied` -- the read computes it.
    const { c, seed, read } = await client();
    try {
      const { criterion } = await seed.stateCriterion("the effect holds at five seeds");
      const { work } = await seed.planWork({
        objective: "publish the convergence result",
        acceptance: "the prespecified check passes",
      });
      const { gate } = await seed.declareGate({
        governedBy: [criterion],
        consequence: "whether the result may be published",
        protecting: [work],
      });
      const { enquiry } = await seed.openEnquiry("does it hold at five seeds?");

      const observations = await call(c, "record_observations", {
        enquiry,
        name: "seed sweep",
        finding: "five seeds, consistent",
      });
      const sweep = await call(c, "record_analysis", {
        enquiry,
        method: "seed sweep",
        from: [id(observations)],
        implementing: work,
        held_to: [criterion],
      });
      await call(c, "conclude", {
        analysis: id(sweep),
        proposition: HOLDS,
        finding: "holds at all five",
        standing: "confirmatory",
      });

      // Unmet before the check is run -- an unrun check counts against the
      // finding it qualifies, which is why the criterion is stated up front.
      const beforeCheck = await read.whySupported({ claim: await claimNamed(read, HOLDS) });
      expect(beforeCheck.unmet).not.toEqual([]);
      expect((await call(c, "why", { subject: gate })).is).not.toBe("satisfied");
      expect(
        ((await call(c, "work_list", { state: "blocked" })).work as Array<{ work: string }>).map(
          (w) => w.work,
        ),
      ).not.toContain(work);

      await call(c, "evaluate_criterion", {
        criterion,
        gate,
        value: "5/5 seeds",
        outcome: "pass",
      });

      const afterCheck = await read.whySupported({ claim: await claimNamed(read, HOLDS) });
      expect(afterCheck.unmet).toEqual([]);
      expect((await call(c, "why", { subject: gate })).is).toBe("satisfied");
      expect(
        (
          (await call(c, "work_list", { state: "carried-out" })).work as Array<{ work: string }>
        ).map((w) => w.work),
      ).toContain(work);
      await c.close();
    } finally {
      await scenario.end();
    }
  });

  const PROP = "the pruning schedule moves convergence";
  const HOLDS = "the effect holds at five seeds";
});

describe("the tool documentation resource", () => {
  /**
   * The property worth testing is not that the markdown looks right -- it is that it is
   * *derived*.
   */

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

  test("the same document is a tool, for a client that cannot see resources", async () => {
    const client = await connected();
    try {
      const { tools } = await client.listTools();
      // First, so a client scanning the list meets it before what it documents.
      expect(tools[0]?.name).toBe(DOCS_TOOL.name);

      // The handshake says what the record is and what to call first. It no
      // longer sends the agent to read the page: a caller that wants the
      // arguments already has them, and a person asks for the page.
      expect(client.getInstructions()).toBe(INSTRUCTIONS);
      expect(INSTRUCTIONS).toContain("register_session");
      expect(INSTRUCTIONS).not.toContain(DOCS_URI);

      const result = await client.callTool({ name: DOCS_TOOL.name, arguments: {} });
      const { contents } = await client.readResource({ uri: DOCS_URI });
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toBe(markdown(contents).text);
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  /**
   * Both surfaces say what `reconstructed_from` is **not** for, and that is the whole of the
   * guard: an earlier wording said only "if you did not see the work happen", which a caller
   * writing up yesterday's own run reads as an invitation. An over-stamped act is
   * indistinguishable downstream from a real transcription, so the description is load-bearing.
   */
  test("the reconstruction flag says what it is not for, on both surfaces", () => {
    const registerSession = SESSION_TOOLS.find((t) => t.name === "register_session")!;
    // Through `toJSONSchema`, the way the output-field test below reads names:
    // it is what an agent is actually handed.
    const declared = z.toJSONSchema(z.strictObject(registerSession.inputSchema)) as {
      properties: Record<string, { description?: string }>;
    };
    const described = declared.properties.reconstructed_from!.description!.toLowerCase();
    expect(described).toContain("did not perform");
    expect(described).toContain("not for your own results");

    const cli = globalOptions(new Command("labkit"))
      .options.find((o) => o.long === "--reconstructed-from")!
      .description.toLowerCase();
    expect(cli).toContain("did not perform");
    expect(cli).toContain("not for your own results");
  });

  test("every tool is documented, and no tool's arguments are restated", async () => {
    const client = await connected();
    try {
      const { contents } = await client.readResource({ uri: DOCS_URI });
      const doc = markdown(contents).text;

      for (const tool of [...TOOLS, ...WRITE_TOOLS, ...SESSION_TOOLS]) {
        expect(doc).toContain(`## ${tool.name}`);
        expect(doc).toContain(tool.description);
      }

      // Every caller already has the arguments and the result shape in the
      // tool list the harness gave it. Repeating them here put the same
      // `events` envelope in the page 27 times, for a fifth of its length.
      expect(doc).not.toContain("**Takes**");
      expect(doc).not.toContain("**Returns**");
      expect(doc).not.toContain("attribution_label");

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
   * One programme: a question asked, worked on, concluded and closed, plus a second question
   * nothing has touched, and one piece of planned work. Enough for every tool to have something
   * to say.
   */
  async function seeded() {
    const graph = await scenario.begin();
    const s = new ResearchSession(graph, { clock, events: inMemoryEventLog() });

    const { enquiry } = await s.writes.openEnquiry("does the pruning schedule move convergence?");
    await s.writes.pose({ question: "does depth move convergence?" });
    const { observations } = await s.writes.recordObservations({
      enquiry,
      name: "sweep readings",
      finding: "twelve runs at five seeds",
    });
    const { analysis, claims: analysisClaims } = await recordAnalysis(s.writes, {
      enquiry,
      method: "paired comparison",
      from: [observations],
      concludes: [{ proposition: PROP, finding: "moves by ~3 steps" }],
    });
    await s.writes.closeEnquiry({
      enquiry,
      answeredBy: claimOf(analysisClaims, PROP),
    });
    await s.writes.planWork({
      objective: "publish the convergence result",
      acceptance: "the prespecified check passes",
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

  test("why, search and work_list agree with the read surface", async () => {
    const { client, read, enquiry } = await seeded();
    try {
      const claim = await claimNamed(read, PROP);
      expect(await structured(client, "why", { subject: claim })).toEqual(
        JSON.parse(JSON.stringify(await read.why({ subject: claim }))),
      );
      expect(await structured(client, "why", { subject: enquiry })).toEqual(
        JSON.parse(JSON.stringify(await read.why({ subject: enquiry }))),
      );
      expect(await structured(client, "search", { text: "convergence" })).toEqual(
        JSON.parse(JSON.stringify({ groups: await read.search({ text: "convergence" }) })),
      );
      expect(await structured(client, "work_list", {})).toEqual(
        JSON.parse(JSON.stringify({ work: await read.workList({}) })),
      );
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("every tool's real output parses against its declared schema", async () => {
    // Runtime parse against the domain codec the tool advertises. The type is
    // `z.infer` of that codec. There is no second Exact<> list in mcp/schemas.ts.
    const { client, read, enquiry } = await seeded();
    try {
      const parsed = async (name: string, args: Record<string, unknown>) => {
        const schema = TOOLS.find((t) => t.name === name)?.outputSchema;
        if (!schema) throw new Error(`${name} declares no outputSchema`);
        const result = await schema.safeParseAsync(await structured(client, name, args));
        if (!result.success) throw new Error(`${name}: ${JSON.stringify(result.error.issues)}`);
      };

      await parsed("search", { text: "convergence" });
      await parsed("work_list", {});

      // `why` is the one tool with no declared schema -- the SDK cannot carry
      // `explanationSchema`'s discriminated union (see packages/app-mcp/tools.ts).
      // Its shapes are still checked, here, for both cases this test has a
      // handle for. `work`'s case is checked the same way in tests/mcp-smoke.test.ts.
      const claimWhy = explanationSchema.safeParse(
        await structured(client, "why", {
          subject: (await read.claimsAsserting({ proposition: PROP }))[0]!.claim,
        }),
      );
      expect(claimWhy.success).toBe(true);
      expect(claimWhy.success && claimWhy.data.kind).toBe("claim");
      const enquiryWhy = explanationSchema.safeParse(
        await structured(client, "why", { subject: enquiry }),
      );
      expect(enquiryWhy.success).toBe(true);
      expect(enquiryWhy.success && enquiryWhy.data.kind).toBe("enquiry");
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("every tool but `why` declares an output schema", () => {
    // Derived, not listed: a tool added later without one fails here rather
    // than shipping unvalidated. `why`'s reason is on its own definition in
    // `packages/app-mcp/tools.ts`: the SDK cannot carry `explanationSchema`'s
    // discriminated union.
    expect(TOOLS.filter((t) => !t.outputSchema).map((t) => t.name)).toEqual(["why"]);
  });

  test("a domain refusal arrives as an error, never as an empty success", async () => {
    const { client } = await seeded();
    try {
      const result = await client.callTool({
        name: "why",
        arguments: { subject: "LOE_does_not_exist" },
      });
      expect(result.isError).toBe(true);
      await client.close();
    } finally {
      await scenario.end();
    }
  });
});

/**
 * **Who signed this?**
 */
describe("the write gate, and what a registered write is signed with", () => {
  /** `main()`'s composition, with the registry left for the caller to control. */
  async function serverWithRegistry(graph: TenantGraph, session: SessionRegistry) {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const events = inMemoryEventLog();
    await buildServer(
      (work) =>
        work({
          read: new ReadSurface(graph, { events }),
          write: new WriteSurface(graph, {
            // Sampled per call, and from the registry, because that is what
            // `surfacesOver` does -- a source read once at connect would pass a
            // test the server would fail.
            ...commandContext(
              mockGitContext,
              registeredSession(session),
              undefined,
              session.registered()?.reconstructedFrom ?? undefined,
            ),
            events,
          }),
        }),
      session,
    ).connect(serverSide);
    const client = new Client({ name: "gate", version: "0" });
    await client.connect(clientSide);
    return { client, events };
  }

  test("a write before register_session is refused, and the refusal names the remedy", async () => {
    const graph = await scenario.begin();
    try {
      // A fresh registry: nobody has said who they are. This is the only way to
      // reach the refusal, which is why the default elsewhere is registered.
      const { client, events } = await serverWithRegistry(graph, sessionRegistry());

      const result = await client.callTool({
        name: "note",
        arguments: { text: "does anyone know who wrote this?" },
      });

      expect(result.isError).toBe(true);
      // The message has to carry the remedy: refusing rather than hiding the
      // tool is only worth anything if the caller learns what to do.
      expect(JSON.stringify(result.content)).toContain("register_session");

      // And nothing was written. A refusal that still records is not a refusal.
      expect(await events.all()).toHaveLength(0);

      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("a read before register_session is not gated", async () => {
    const graph = await scenario.begin();
    try {
      const { client } = await serverWithRegistry(graph, sessionRegistry());
      // Reads create no record, so they have nothing to sign. Gating them would
      // be a refusal with nothing real to refuse.
      const result = await client.callTool({ name: "work_list", arguments: {} });
      expect(result.isError ?? false).toBe(false);
      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("after registering, the write is signed with what the agent said", async () => {
    const graph = await scenario.begin();
    try {
      const { client, events } = await serverWithRegistry(graph, sessionRegistry());

      const registered = await client.callTool({
        name: "register_session",
        arguments: { id: "claude:9f3a", label: "labkit-mcp-dev" },
      });
      // Returns what it recorded -- a caller who cannot read back what LabKit
      // understood cannot tell a typo from a success.
      expect(registered.structuredContent).toEqual({
        registered: { id: "claude:9f3a", label: "labkit-mcp-dev", reconstructed_from: null },
      });

      const noted = await client.callTool({
        name: "note",
        arguments: { text: "does registering change what the event says?" },
      });
      expect(noted.isError ?? false).toBe(false);

      // **Asserted from the stream, not from the reply.** The tool's answer is
      // a handle; attribution rides on the event and nowhere else, so this is
      // the only place the claim is observable.
      const written = await events.all();
      expect(written).toHaveLength(1);
      expect(written[0]!.attribution.attribution_id).toBe("claude:9f3a");
      expect(written[0]!.attribution.attribution_label).toBe("labkit-mcp-dev");

      // The invariant the feature exists for: the placeholder never lands.
      expect(written.map((e) => e.attribution.attribution_id)).not.toContain("mock-session-0");

      await client.close();
    } finally {
      await scenario.end();
    }
  });

  /**
   * An agent transcribing a document has no terminal, so the flag and its environment variable
   * are out of reach. The registration is the seam it does have.
   */
  test("an agent says what it is reading off, and every act it writes carries it", async () => {
    const graph = await scenario.begin();
    try {
      const { client } = await serverWithRegistry(graph, sessionRegistry());
      await client.callTool({
        name: "register_session",
        arguments: { id: "claude:9f3a", reconstructed_from: "Ito et al. 2024, fig. 3" },
      });
      const noted = await client.callTool({
        name: "note",
        arguments: { text: "does the coating slow corrosion?" },
      });

      // Off the write's own reply, not the sink: the wire is what an agent
      // sees, and the field could reach the log and still be dropped from the
      // output.
      const stamps = (r: typeof noted) =>
        (r.structuredContent as { events: { reconstructedFrom: string | null }[] }).events.map(
          (e) => e.reconstructedFrom,
        );
      expect(stamps(noted)).toEqual(["Ito et al. 2024, fig. 3"]);

      // Registering again is a fresh statement of who is on the line. A source
      // carried over would stamp acts the caller never said were reconstructed.
      await client.callTool({ name: "register_session", arguments: { id: "claude:9f3a" } });
      const live = await client.callTool({
        name: "note",
        arguments: { text: "and this one, written without a source?" },
      });
      expect(stamps(live)).toEqual([null]);

      await client.close();
    } finally {
      await scenario.end();
    }
  });

  test("registering again replaces, and says what it replaced", async () => {
    const graph = await scenario.begin();
    try {
      const { client } = await serverWithRegistry(graph, sessionRegistry());
      await client.callTool({
        name: "register_session",
        arguments: { id: "first-0", label: "first" },
      });
      const again = await client.callTool({
        name: "register_session",
        arguments: { id: "second-0" },
      });

      // Anyone may pick up a pen, including a second time. What the record owes
      // is that the change is visible rather than silent -- and `label`
      // defaulting to the id keeps a reader from seeing the previous name
      // against the new id.
      expect(again.structuredContent).toEqual({
        registered: { id: "second-0", label: "second-0", reconstructed_from: null },
        replaced: { id: "first-0", label: "first", reconstructed_from: null },
      });
      await client.close();
    } finally {
      await scenario.end();
    }
  });
});

/**
 * **A server that cannot write does not offer to.**
 */
describe("read-only", () => {
  async function listToolsFrom(graph: TenantGraph, readOnly: boolean) {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const events = inMemoryEventLog();
    await buildServer(
      (work) =>
        work({
          read: new ReadSurface(graph, { events }),
          write: new WriteSurface(graph, { events }),
        }),
      registeredSessionRegistry(),
      { readOnly },
    ).connect(serverSide);
    const client = new Client({ name: "read-only", version: "0" });
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    await client.close();
    return tools.map((t) => t.name).sort();
  }

  test("a read-only server lists every read and no write", async () => {
    const graph = await scenario.begin();
    try {
      const names = await listToolsFrom(graph, true);

      // Derived from the declarations, never a hand-written list of names: a
      // write tool added later must be absent here without anyone remembering
      // to come and say so.
      expect(names).toEqual([...META_TOOLS, ...TOOLS].map((t) => t.name).sort());

      for (const write of WRITE_TOOLS) expect(names).not.toContain(write.name);
    } finally {
      await scenario.end();
    }
  });

  test("register_session goes with the writes, not with the reads", async () => {
    const graph = await scenario.begin();
    try {
      const names = await listToolsFrom(graph, true);
      // It exists to open a gate this server has nothing behind. Leaving it
      // visible would offer an agent a tool whose effect nothing can observe --
      // and worse, would say through the tool list that writing is possible.
      for (const session of SESSION_TOOLS) expect(names).not.toContain(session.name);
    } finally {
      await scenario.end();
    }
  });

  test("the default is not read-only, so the flag is what decides it", async () => {
    const graph = await scenario.begin();
    try {
      // The control. Without this the test above passes on a server that never
      // had write tools at all, which is a different thing from one that
      // withheld them.
      const names = await listToolsFrom(graph, false);
      expect(names).toEqual(
        [...META_TOOLS, ...TOOLS, ...WRITE_TOOLS, ...SESSION_TOOLS].map((t) => t.name).sort(),
      );
    } finally {
      await scenario.end();
    }
  });

  test("a hidden write tool cannot be called by name", async () => {
    const graph = await scenario.begin();
    try {
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      const events = inMemoryEventLog();
      await buildServer(
        (work) =>
          work({
            read: new ReadSurface(graph, { events }),
            write: new WriteSurface(graph, { events }),
          }),
        registeredSessionRegistry(),
        { readOnly: true },
      ).connect(serverSide);
      const client = new Client({ name: "read-only", version: "0" });
      await client.connect(clientSide);

      // Absent from `tools/list` is not the same as unreachable, and a client
      // that cached an older list would ask anyway. Asserted from the wire
      // rather than from the registration loop.
      const result = await client.callTool({
        name: "note",
        arguments: { text: "can a hidden tool still be called?" },
      });
      expect(result.isError).toBe(true);
      expect(await events.all()).toHaveLength(0);

      await client.close();
    } finally {
      await scenario.end();
    }
  });
});
