/**
 * **The real process, over a real pipe.**
 */

import pkg from "../package.json" with { type: "json" };
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A handle out of a tool's reply.
 */
const id = (v: unknown): string =>
  // A bare string passes through: `Object.values("COMP_1")[0]` is `"C"`, which
  // reaches the server as a handle and is refused there -- loudly, but two
  // layers from the mistake.
  typeof v === "string" ? v : (Object.values(v as Record<string, unknown>)[0] as string);

const SERVER = join(import.meta.dir, "..", "src", "mcp", "server.ts");

/**
 * This process's environment with `LABKIT_DB_URL` removed.
 */
function childEnv(): Record<string, string> {
  const { LABKIT_DB_URL: _dropped, ...rest } = process.env as Record<string, string>;
  return rest;
}

let workdir: string;
let client: Client;

// Generous, and deliberately not left to bun's 5000ms default: a cold start
// runs migrations into an empty PGlite directory, which is ~1.6s of real work
// on top of everything else. This is the one test that pays that cost.
const COLD_START = 60_000;

beforeAll(async () => {
  workdir = mkdtempSync(join(tmpdir(), "labkit-stdio-"));
  const transport = new StdioClientTransport({
    // `process.execPath` is bun itself, so this does not depend on PATH.
    command: process.execPath,
    args: [SERVER],
    cwd: workdir,
    env: {
      ...childEnv(),
      LABKIT_TENANT: "stdio-probe",
    },
  });
  client = new Client({ name: "stdio-probe", version: "0" });
  await client.connect(transport);
}, COLD_START);

afterAll(async () => {
  await client.close().catch(() => {});
  rmSync(workdir, { recursive: true, force: true });
});

/**
 * **Over the wire, not off the constructor.** `serverInfo.version` reaches a client through the
 * `initialize` response, and asserting the value handed to `new McpServer` would pass while the
 * wire said something else.
 */
test(
  "the launched server tells a client the version the package says",
  async () => {
    expect(client.getServerVersion()).toMatchObject({ name: "labkit", version: pkg.version });
  },
  COLD_START,
);

test(
  "the launched server lists its tools",
  async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map((t) => t.name)).toContain("open_enquiry");
  },
  COLD_START,
);

test(
  "the launched server refuses a write until it is told who is calling",
  async () => {
    // **This is the gate's only test against a real process.** Everything else drives
    // `buildServer` in-process over `InMemoryTransport`; here the server was spawned, and the
    // registry it consults is the one `main()` built.
    const refused = await client.callTool({
      name: "pose",
      arguments: { question: "who is asking?" },
    });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain("register_session");
  },
  COLD_START,
);

test(
  "it writes, and then reads back what it wrote",
  async () => {
    // Signing on, exactly as an agent would: `agent-bus whoami` gives the id,
    // this hands it to LabKit. Nothing verifies it and nothing is meant to.
    const registered = await client.callTool({
      name: "register_session",
      arguments: { id: "stdio-test-0", label: "mcp-stdio test" },
    });
    expect(registered.isError ?? false).toBe(false);

    const opened = await client.callTool({
      name: "open_enquiry",
      arguments: { question: "does the launched server write?" },
    });
    expect(opened.isError ?? false).toBe(false);
    const enquiry = opened.structuredContent as { kind: string; id: string };
    expect(id(enquiry)).toMatch(/^LOE_/);
    expect(id(enquiry).startsWith("LOE_")).toBe(true);

    // Read back through a different tool, so the answer comes from the graph
    // rather than from the value the write returned.
    const known = await client.callTool({ name: "known", arguments: {} });
    const untested = (known.structuredContent as { untested: Array<{ asks: string }> }).untested;
    expect(untested.map((q) => q.asks)).toContain("does the launched server write?");
  },
  COLD_START,
);

test(
  "it serves the tool documentation as a resource",
  async () => {
    const { contents } = await client.readResource({
      uri: "labkit://docs/tools",
    });
    const text = (contents[0] as { text: string }).text;
    expect(text).toContain("open_enquiry");
    expect(text.length).toBeGreaterThan(1000);
  },
  COLD_START,
);

/**
 * Every line the process writes to stdout parses as JSON.
 */
test(
  "nothing but JSON-RPC reaches stdout",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "labkit-stdout-"));
    try {
      const child = Bun.spawn([process.execPath, SERVER], {
        cwd: dir,
        env: {
          ...childEnv(),
          LABKIT_TENANT: "stdout-probe",
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "ignore",
      });
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "p", version: "0" },
          },
        })}\n`,
      );
      await child.stdin.end();
      const out = await new Response(child.stdout).text();
      await child.exited;

      const lines = out.split("\n").filter((l) => l.length > 0);
      // At least the initialize response, or this proves nothing about a stream
      // that was simply empty.
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(() => JSON.parse(line) as unknown).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  COLD_START,
);

test(
  "a session that says what it is reading off stamps every act it writes",
  async () => {
    // The launched process, so this exercises `surfacesOver` -- the in-memory
    // harness in `tests/mcp.test.ts` builds its own surfaces and would pass
    // even if the server never sampled the registry for a source.
    const source = "Ito et al. 2024, fig. 3";
    await client.callTool({
      name: "register_session",
      arguments: { id: "stdio-test-0", label: "mcp-stdio test", reconstructed_from: source },
    });
    const posed = await client.callTool({
      name: "pose",
      arguments: { question: "was this act read off something?" },
    });
    expect(posed.isError ?? false).toBe(false);
    const subject = id(posed.structuredContent);

    const seen = await client.callTool({ name: "what_happened", arguments: { touching: subject } });
    const acts = (seen.structuredContent as { events: { reconstructed_from: string | null }[] })
      .events;
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.map((e) => e.reconstructed_from)).toEqual(acts.map(() => source));

    // Registering again is a fresh statement of who is on the line, so the
    // source does not carry over onto work nobody said was reconstructed.
    await client.callTool({
      name: "register_session",
      arguments: { id: "stdio-test-0", label: "mcp-stdio test" },
    });
    const live = await client.callTool({
      name: "pose",
      arguments: { question: "and this one, asked with no source?" },
    });
    const after = await client.callTool({
      name: "what_happened",
      arguments: { touching: id(live.structuredContent) },
    });
    expect(
      (after.structuredContent as { events: { reconstructed_from: string | null }[] }).events.map(
        (e) => e.reconstructed_from,
      ),
    ).toEqual([null]);
  },
  COLD_START,
);
