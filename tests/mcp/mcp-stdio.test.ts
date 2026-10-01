/**
 * **The real process, over a real pipe.**
 */

import pkg from "../../package.json" with { type: "json" };
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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

const CLI = join(import.meta.dir, "..", "..", "packages", "app-cli", "cli.ts");

/**
 * This process's environment without the variables that choose a record, so `--db` is the only
 * thing that does.
 */
function childEnv(): Record<string, string> {
  const {
    LABKIT_DB_URL: _url,
    LABKIT_HOME: _home,
    ...rest
  } = process.env as Record<string, string>;
  return rest;
}

/** Where the server is started, which is not where its record is. */
let workdir: string;
/** The directory `--db` names. */
let dbdir: string;
let client: Client;

// Generous, and deliberately not left to bun's 5000ms default: a cold start
// runs migrations into an empty PGlite directory, which is ~1.6s of real work
// on top of everything else. This is the one test that pays that cost.
const COLD_START = 60_000;

beforeAll(async () => {
  workdir = mkdtempSync(join(tmpdir(), "labkit-stdio-cwd-"));
  dbdir = mkdtempSync(join(tmpdir(), "labkit-stdio-db-"));
  const transport = new StdioClientTransport({
    // `process.execPath` is bun itself, so this does not depend on PATH.
    command: process.execPath,
    args: [CLI, "--db", dbdir, "--tenant", "stdio-probe", "mcp"],
    cwd: workdir,
    env: childEnv(),
  });
  client = new Client({ name: "stdio-probe", version: "0" });
  await client.connect(transport);
}, COLD_START);

afterAll(async () => {
  await client.close().catch(() => {});
  rmSync(workdir, { recursive: true, force: true });
  rmSync(dbdir, { recursive: true, force: true });
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
    expect(tools.map((t) => t.name)).toContain("work_list");
  },
  COLD_START,
);

test(
  "a write is attributed to the stand-in session, since nothing on stdio names the caller",
  async () => {
    const noted = await client.callTool({
      name: "note",
      arguments: { text: "who is asking?" },
    });
    expect(noted.isError ?? false).toBe(false);
    const events = (
      noted.structuredContent as {
        events: { attribution: { attribution_label: string; attribution_id: string } }[];
      }
    ).events;
    expect(events.map((e) => e.attribution.attribution_label)).toEqual(["mock-session"]);
    expect(events.map((e) => e.attribution.attribution_id)).toEqual(["mock-session-0"]);
  },
  COLD_START,
);

test(
  "it writes, and then reads back what it wrote",
  async () => {
    const noted = await client.callTool({
      name: "note",
      arguments: { text: "does the launched server write?" },
    });
    expect(noted.isError ?? false).toBe(false);
    expect(id(noted.structuredContent)).toMatch(/^NOTE_/);

    // Read back through a different tool, so the answer comes from the graph
    // rather than from the value the write returned.
    const found = await client.callTool({
      name: "search",
      arguments: { text: "does the launched server write?" },
    });
    const groups = (
      found.structuredContent as { groups: Array<{ matches: Array<{ handle: string }> }> }
    ).groups;
    expect(groups.flatMap((g) => g.matches.map((m) => m.handle))).toContain(
      id(noted.structuredContent),
    );
  },
  COLD_START,
);

test(
  "`labkit --db <dir> mcp` serves the record in that directory, not the working directory's",
  async () => {
    const noted = await client.callTool({
      name: "note",
      arguments: { text: "which record is this?" },
    });
    expect(noted.isError ?? false).toBe(false);
    expect(existsSync(join(dbdir, ".labkit", "pglite", "PG_VERSION"))).toBe(true);
    expect(readdirSync(workdir)).toEqual([]);
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
      const child = Bun.spawn([process.execPath, CLI, "--db", dir, "mcp"], {
        cwd: dir,
        env: childEnv(),
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
