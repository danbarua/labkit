/**
 * The fake agent on stdin and stdout, as an editor launches an agent. When `FAKE_AGENT_EXIT_FILE`
 * names a file, the process writes "stdin closed" to it before it exits. `FAKE_AGENT_SESSIONS`
 * names sessions, comma-separated, that the agent has from the start, with no history.
 */

import { writeFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { createFakeAgent, createFakeWorld } from "@labkit/acp-fake";

const world = createFakeWorld();
for (const sessionId of process.env.FAKE_AGENT_SESSIONS?.split(",") ?? [])
  world.sessions.set(sessionId, { cwd: process.cwd(), history: [], turns: 0 });

const connection = createFakeAgent(world).connect(
  acp.ndJsonStream(
    Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
    Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>,
  ),
);

await connection.closed;
const exitFile = process.env.FAKE_AGENT_EXIT_FILE;
if (exitFile !== undefined) writeFileSync(exitFile, "stdin closed");
process.exit(0);
