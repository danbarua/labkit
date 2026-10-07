/**
 * The fake agent on stdin and stdout, as an editor launches an agent. When `FAKE_AGENT_EXIT_FILE`
 * names a file, the process writes "stdin closed" to it before it exits.
 */

import { writeFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { createFakeAgent } from "@labkit/acp-fake";

const connection = createFakeAgent().connect(
  acp.ndJsonStream(
    Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
    Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>,
  ),
);

await connection.closed;
const exitFile = process.env.FAKE_AGENT_EXIT_FILE;
if (exitFile !== undefined) writeFileSync(exitFile, "stdin closed");
process.exit(0);
