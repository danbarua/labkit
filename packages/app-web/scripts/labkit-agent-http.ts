#!/usr/bin/env bun
/**
 * labkit-effect's ACP agent over HTTP, for the dev stack:
 * `bun scripts/labkit-agent-http.ts --port <port> --cwd <folder> --sessions-dir <folder>`.
 * Each ACP connection runs the installed `labkit-effect` package's `src/agent-acp/main.ts` as an
 * editor launches it (`src/infra/stdio-agent-http.ts`), in the `--cwd` folder, keeping its sessions
 * in `--sessions-dir`, and serves the files those sessions stored at `/blob/<sha256>.<ext>`
 * (`src/infra/labkit-blobs.ts`). Every request must carry `Authorization: Bearer $LABKIT_ACP_HTTP_TOKEN`.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { brandFrom } from "labkit-effect/src/agent-host/brand.ts";
import { brandFoldersOf } from "labkit-effect/src/agent-host/brand-folders.ts";
import { blobPath, labkitBlobs } from "../src/infra/labkit-blobs";
import { stdioAgentHttp } from "../src/infra/stdio-agent-http";

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    cwd: { type: "string" },
    "sessions-dir": { type: "string" },
  },
});
if (values.port === undefined || values.cwd === undefined || values["sessions-dir"] === undefined)
  throw new Error("labkit-agent-http needs --port, --cwd and --sessions-dir");
const port = Number(values.port);
// Absolute, because the agent resolves a relative --sessions-dir against its own working folder.
const cwd = path.resolve(values.cwd);
const sessionsDir = path.resolve(values["sessions-dir"]);

const token = process.env.LABKIT_ACP_HTTP_TOKEN;
if (token === undefined || token === "")
  throw new Error("LABKIT_ACP_HTTP_TOKEN is not set: the bridge refuses every request without it");

/**
 * The dev server's settings for reaching the bridge, which the agent processes do not receive.
 * The agent reads its own settings from `LABKIT_*` variables, so the names it receives are logged.
 */
const BRIDGE_VARIABLES = ["LABKIT_ACP_HTTP_TOKEN", "LABKIT_ACP_AGENT_URL"];
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !BRIDGE_VARIABLES.includes(name)),
);

const main = Bun.resolveSync("labkit-effect/src/agent-acp/main.ts", import.meta.dir);
// Where the agent stores files: its data folder's `blobs/`, `~/.local/share/<brand>/blobs` for the
// brand its environment names, since the agent is given no `--data-dir`. `--sessions-dir` does not
// move it; a `LABKIT_ACP_DATA_DIR` in the environment moves the agent's but not this one.
const blobsDir = brandFoldersOf(brandFrom(env)).blobs;
await mkdir(cwd, { recursive: true });
await mkdir(sessionsDir, { recursive: true });

const bridge = stdioAgentHttp({
  // Without `.env` files or a `bunfig.toml`, as labkit-effect's `bin/labkit.ts` runs it. With
  // `--local-tools`, because the browser client has no `fs/*` or `terminal/*` methods to offer.
  command: [
    process.execPath,
    "--no-env-file",
    "--config=/dev/null",
    main,
    "--local-tools",
    "--sessions-dir",
    sessionsDir,
  ],
  cwd,
  env,
  token,
  routes: { [blobPath]: labkitBlobs({ blobs: blobsDir, sessions: sessionsDir }) },
});

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  // A POST of `initialize` is answered once the agent process has started and answered it.
  idleTimeout: 0,
  fetch: bridge.fetch,
});

console.error(`labkit-effect agent http://127.0.0.1:${server.port}/acp`);
console.error(`  agent  ${main}`);
console.error(`  cwd  ${cwd}`);
console.error(`  sessions  ${sessionsDir}`);
console.error(`  stored files  http://127.0.0.1:${server.port}${blobPath}<sha256>.<ext>`);
console.error(`  blobs  ${blobsDir}, then each session's blobs/`);
console.error(
  `  LABKIT_* variables passed to the agent  ${
    Object.keys(env)
      .filter((name) => name.startsWith("LABKIT_"))
      .join(", ") || "none"
  }`,
);
console.error(
  `  variables withheld from the agent  ${
    BRIDGE_VARIABLES.filter((name) => process.env[name] !== undefined).join(", ") || "none"
  }`,
);

const stop = async () => {
  await bridge.close();
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
