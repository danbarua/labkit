/**
 * **The real process, over a real pipe.**
 *
 * Every other MCP test constructs `buildServer` in-process and talks to it
 * through `InMemoryTransport`. That proves the tools answer; it does not prove
 * the thing anyone actually runs works. `bun run mcp` is the deployment
 * artefact, and until this file existed nothing had ever launched it: not the
 * database connection, not leader election, not migrations, not tenant
 * resolution, not `StdioServerTransport`, and not the shutdown path.
 *
 * It also checks the property `bun run check:stdout` exists for, and the last
 * test here is the reason that check cannot be retired. **Measured, because
 * the first version of this file claimed something false:** a stray
 * `console.log` under `src/` does *not* stop this SDK's client connecting.
 * Prefixing `src/db/tenant.ts` with `console.log("POLLUTION")` put that line on
 * stdout ahead of the JSON-RPC and all three tests below still passed — the
 * SDK's read buffer skips lines it cannot parse. So the client is no witness,
 * and the last test reads the raw pipe instead.
 *
 * That tolerance is this SDK's, not the protocol's. A stricter client is
 * entitled to fail, which is why the static check stays too.
 *
 * Given its own temporary directory, because the PGlite backend puts its data
 * under `<cwd>/.labkit` and a test must not write into the repo.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SERVER = join(import.meta.dir, "..", "src", "mcp", "server.ts");

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
    env: { ...(process.env as Record<string, string>), LABKIT_TENANT: "stdio-probe" },
  });
  client = new Client({ name: "stdio-probe", version: "0" });
  await client.connect(transport);
}, COLD_START);

afterAll(async () => {
  await client.close().catch(() => {});
  rmSync(workdir, { recursive: true, force: true });
});

test("the launched server lists its tools", async () => {
  const { tools } = await client.listTools();
  expect(tools.length).toBeGreaterThan(0);
  expect(tools.map((t) => t.name)).toContain("open_enquiry");
}, COLD_START);

test("it writes, and then reads back what it wrote", async () => {
  const opened = await client.callTool({
    name: "open_enquiry",
    arguments: { question: "does the launched server write?" },
  });
  expect(opened.isError ?? false).toBe(false);
  const enquiry = opened.structuredContent as { kind: string; id: string };
  expect(enquiry.kind).toBe("enquiry");
  expect(enquiry.id.startsWith("LOE_")).toBe(true);

  // Read back through a different tool, so the answer comes from the graph
  // rather than from the value the write returned.
  const known = await client.callTool({ name: "known", arguments: {} });
  const untested = (known.structuredContent as { untested: Array<{ asks: string }> }).untested;
  expect(untested.map((q) => q.asks)).toContain("does the launched server write?");
}, COLD_START);

test("it serves the tool documentation as a resource", async () => {
  const { contents } = await client.readResource({ uri: "labkit://docs/tools" });
  const text = (contents[0] as { text: string }).text;
  expect(text).toContain("open_enquiry");
  expect(text.length).toBeGreaterThan(1000);
}, COLD_START);

/**
 * Every line the process writes to stdout parses as JSON.
 *
 * Spawned separately and read raw, because the SDK client tolerates lines it
 * cannot parse and so cannot notice — see this file's header. One stray
 * `console.log` under `src/` shows up here as a line that is not JSON.
 */
test("nothing but JSON-RPC reaches stdout", async () => {
  const dir = mkdtempSync(join(tmpdir(), "labkit-stdout-"));
  try {
    const child = Bun.spawn([process.execPath, SERVER], {
      cwd: dir,
      env: { ...(process.env as Record<string, string>), LABKIT_TENANT: "stdout-probe" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
    });
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "p", version: "0" } },
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
}, COLD_START);
