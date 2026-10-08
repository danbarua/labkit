#!/usr/bin/env bun
/**
 * `bun run dev:with-agent`: the API, the browser app and a real ACP agent, one command. The agent
 * is labkit-effect's, served over HTTP by `scripts/labkit-agent-http.ts`, and reads its models and
 * keys from its own configuration (`~/.config/labkit/`). An agent process that cannot use that
 * configuration exits 1 with the reason on stderr, which the bridge logs. The bearer token is
 * generated once and reused. See `docs/environment.md` for `LABKIT_ACP_AGENT_URL`/`LABKIT_ACP_HTTP_TOKEN`.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ensureLabkitPostgres } from "../src/infra/postgres";

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

await ensureLabkitPostgres();

// The browser has no folder of its own to name as a session's working folder, so the agent gets
// this one; its tools read and write there. The agent keeps its sessions in SESSIONS_DIR.
const AGENT_DIR = new URL("../../../.labkit-dev/labkit-effect/", import.meta.url);
const WORKSPACE_DIR = new URL("workspace/", AGENT_DIR);
const SESSIONS_DIR = new URL("sessions/", AGENT_DIR);
await mkdir(WORKSPACE_DIR, { recursive: true });

const token = await acpHttpToken();
const acpPort = process.env.LABKIT_PORT_ACP ?? "8951";
const agentUrl = `http://127.0.0.1:${acpPort}`;

console.error(
  `labkit-web agent  ${agentUrl}/acp and ${agentUrl}/blob/  (proxied at /acp and /blob/, where the dev server adds the Authorization header with the token)`,
);
console.error(`labkit-web agent cwd  ${WORKSPACE_DIR.pathname}`);

const inherit = { stdout: "inherit", stderr: "inherit", stdin: "inherit" } as const;
const env = {
  ...process.env,
  LABKIT_ACP_HTTP_TOKEN: token,
  LABKIT_ACP_AGENT_URL: agentUrl,
  VITE_LABKIT_ACP_CWD: WORKSPACE_DIR.pathname,
};

// The agent sends its traces, log lines and metrics as OTLP while OTEL_EXPORTER_OTLP_ENDPOINT is
// set (labkit-effect's docs/guide/logs-and-telemetry.md). The bridge passes its environment to the
// agent, so the dev stack sets the variable there: to the local collector, unless the environment
// already names one. A collector that does not answer loses the telemetry, so that is logged.
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
const collector = await fetch(otlpEndpoint, { signal: AbortSignal.timeout(2000) }).then(
  (response) => `a collector answered (HTTP ${response.status})`,
  (err: unknown) =>
    `WARN no collector answered (${err instanceof Error ? err.message : String(err)}); the agent's telemetry is lost until one runs: labkit-effect's scripts/observability/lgtm-stack.sh starts one`,
);
console.error(`labkit-web agent telemetry  ${otlpEndpoint}  ${collector}`);

// At the debug level the agent also writes the body of each model request and response to
// ~/.local/share/labkit/logs/http-captures/, which Grafana's "Body" links open. The dev stack sets
// it unless the environment names a level. The agent's own LABKIT_ACP_LOG_LEVEL wins over it.
const logLevel = process.env.LABKIT_LOG_LEVEL ?? "debug";
console.error(
  `labkit-web agent log level  LABKIT_LOG_LEVEL=${logLevel}${process.env.LABKIT_ACP_LOG_LEVEL === undefined ? "" : `, overridden by LABKIT_ACP_LOG_LEVEL=${process.env.LABKIT_ACP_LOG_LEVEL}`}`,
);
const acp = Bun.spawn(
  [
    "bun",
    "scripts/labkit-agent-http.ts",
    "--port",
    acpPort,
    "--cwd",
    WORKSPACE_DIR.pathname,
    "--sessions-dir",
    SESSIONS_DIR.pathname,
  ],
  {
    ...inherit,
    env: { ...env, OTEL_EXPORTER_OTLP_ENDPOINT: otlpEndpoint, LABKIT_LOG_LEVEL: logLevel },
  },
);

// The bridge prints its address once it is listening. If it exits before that (a port already in
// use, a missing token), fail here with its exit code instead of leaving the browser to report an
// opaque connection error.
const exitedEarly = await Promise.race([acp.exited, Bun.sleep(3000).then(() => undefined)]);
if (exitedEarly !== undefined) {
  throw new Error(
    `the agent's HTTP bridge exited immediately (code ${exitedEarly}); see its output above`,
  );
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
