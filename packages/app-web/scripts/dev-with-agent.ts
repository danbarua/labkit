#!/usr/bin/env bun
/**
 * `bun run dev:with-agent`: the API, the browser app and a real ACP agent, one command. Checks for
 * a bound provider before spawning anything, and reuses a generated bearer token across runs. See
 * `docs/environment.md` for `LABKIT_ACP_AGENT_URL`/`LABKIT_ACP_HTTP_TOKEN` and the launcher's log
 * location for diagnosing a failed session.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ensureLabkitPostgres } from "../src/infra/postgres";

const PROVIDER_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "XAI_API_KEY",
];

async function localModelServerReachable(): Promise<boolean> {
  const base = process.env.LABKIT_LOCAL_BASE_URL ?? "http://localhost:8000/v1";
  try {
    const res = await fetch(new URL("models", `${base}/`), { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function requireAProvider(): Promise<void> {
  if (PROVIDER_KEYS.some((name) => process.env[name])) return;
  if (await localModelServerReachable()) return;
  throw new Error(
    `No provider is bound: set one of ${PROVIDER_KEYS.join(", ")}, or run a local model server ` +
      `at LABKIT_LOCAL_BASE_URL (default http://localhost:8000/v1).`,
  );
}

// Relative to this file: scripts/ -> app-web/ -> packages/ -> the repository root.
const TOKEN_DIR = new URL("../../../.labkit-dev/", import.meta.url);
const TOKEN_FILE = new URL("acp-http-token", TOKEN_DIR);

async function acpHttpToken(): Promise<string> {
  if (process.env.LABKIT_ACP_HTTP_TOKEN) return process.env.LABKIT_ACP_HTTP_TOKEN;
  try {
    return (await readFile(TOKEN_FILE, "utf8")).trim();
  } catch {
    const token = crypto.randomUUID() + crypto.randomUUID();
    await mkdir(TOKEN_DIR, { recursive: true });
    await writeFile(TOKEN_FILE, token);
    return token;
  }
}

await requireAProvider();
await ensureLabkitPostgres();

// ACP sessions write their journal and blobs under `<cwd>/.labkit/`. The browser has no
// filesystem of its own to name, so it needs a real, writable directory from somewhere; without
// one, `connectSession`'s own fallback of `/` fails with EROFS the first time a session opens.
const WORKSPACE_DIR = new URL("../../../.labkit-dev/agent-workspace/", import.meta.url);
await mkdir(WORKSPACE_DIR, { recursive: true });

const token = await acpHttpToken();
const acpPort = process.env.LABKIT_PORT_ACP ?? "8951";
const agentUrl = `http://127.0.0.1:${acpPort}`;

console.error(
  `labkit-web agent  ${agentUrl}/acp  (proxied at /acp; the browser never sees the token)`,
);
console.error(`labkit-web agent cwd  ${WORKSPACE_DIR.pathname}`);

const inherit = { stdout: "inherit", stderr: "inherit", stdin: "inherit" } as const;
const env = {
  ...process.env,
  LABKIT_ACP_HTTP_TOKEN: token,
  LABKIT_ACP_AGENT_URL: agentUrl,
  VITE_LABKIT_ACP_CWD: WORKSPACE_DIR.pathname,
};
const acp = Bun.spawn(
  [
    "bun",
    "../app-acp/cli.ts",
    "--config",
    "../app-acp/examples/vscode-workspace.ts",
    "--http",
    acpPort,
  ],
  { ...inherit, env },
);

// The CLI prints its own "Labkit ACP HTTP endpoint" line and diagnostics log path once it is
// actually listening. If it exits before that (a bad config, a port already in use), fail here
// with its exit code instead of leaving the browser to report an opaque connection error.
const exitedEarly = await Promise.race([acp.exited, Bun.sleep(3000).then(() => undefined)]);
if (exitedEarly !== undefined) {
  throw new Error(`the ACP agent exited immediately (code ${exitedEarly}); see its output above`);
}

const children = [
  acp,
  Bun.spawn(["bun", "--watch", "--no-clear-screen", "src/server/main.ts"], { ...inherit, env }),
  Bun.spawn(["bun", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], { ...inherit, env }),
];

const stop = () => {
  for (const child of children) child.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// Whichever ends first takes the others with it, so a crash is never a half-running stack.
const code = await Promise.race(children.map((child) => child.exited));
stop();
process.exit(code);
