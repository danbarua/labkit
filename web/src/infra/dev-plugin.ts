import type { IncomingMessage, ServerResponse } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import type { Plugin, ViteDevServer } from "vite";
import { ensureOverlapBench } from "./seed";
import { ensureLabkitPostgres, LABKIT_PG_URL } from "./postgres";
import { handle, isLabkitApiPath } from "../server/handler";
import { openRuntime, type Runtime } from "../server/runtime";

function toRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? "127.0.0.1";
  const url = `http://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    }
  }
  return new Request(url, { method: req.method, headers });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function attachLabkit(server: ViteDevServer): void {
  const boot: Promise<Runtime> = (async () => {
    await ensureLabkitPostgres();
    await ensureOverlapBench();
    return openRuntime();
  })();
  server.middlewares.use(async (req, res, next) => {
    try {
      const pathname = (req.url ?? "/").split("?")[0] ?? "/";
      const accept = String(req.headers.accept ?? "");
      const runtime = await boot;
      if (!isLabkitApiPath(pathname, accept)) {
        next();
        return;
      }
      const response = await handle(toRequest(req), runtime);
      const ctype = response.headers.get("content-type") ?? "";
      const line = `${req.method ?? "GET"} ${pathname} ${response.status} ${ctype}`;
      if (response.status >= 400) {
        server.config.logger.warn(`${line} accept=${accept}`);
      } else {
        server.config.logger.info(line);
      }
      await writeResponse(res, response);
    } catch (err) {
      next(err);
    }
  });
}

export function labkitDev(): Plugin {
  return {
    name: "labkit-dev",
    configureServer(server) {
      attachLabkit(server);
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        announceServices(server);
        runTypecheck(server);
      };
    },
    handleHotUpdate({ file, server }) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return;
      if (file.includes("node_modules")) return;
      runTypecheck(server);
    },
  };
}

function listeningPid(port: number): number | undefined {
  const out = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
  });
  if (out.status !== 0) return undefined;
  const pid = Number((out.stdout ?? "").trim().split(/\s+/)[0]);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function dbPort(url: string): number {
  try {
    const port = Number(new URL(url).port);
    return Number.isInteger(port) && port > 0 ? port : 5433;
  } catch {
    return 5433;
  }
}

function boundPort(server: ViteDevServer): number {
  const addr = server.httpServer?.address();
  if (typeof addr === "object" && addr && typeof addr.port === "number") return addr.port;
  return Number(process.env.LABKIT_PORT_EXPLORER ?? "8850");
}

function line(label: string, url: string, pid: number | undefined): string {
  const pidBit = pid == null ? "" : `pid ${pid}`;
  return `${label.padEnd(12)}${url.padEnd(32)}${pidBit}`;
}

function announceServices(server: ViteDevServer): void {
  const port = boundPort(server);
  const pg = dbPort(process.env.LABKIT_DB_URL ?? LABKIT_PG_URL);
  const httpPid = process.pid;
  const pgPid = listeningPid(pg);
  const log = server.config.logger.info.bind(server.config.logger);
  log(line("front-end", `http://localhost:${port}/`, httpPid));
  log(line("back-end", `http://localhost:${port}/api`, httpPid));
  log(line("labkit-db", `postgres://localhost:${pg}/`, pgPid));
}

let typecheckRunning = false;
let typecheckAgain = false;

function runTypecheck(server: ViteDevServer): void {
  if (typecheckRunning) {
    typecheckAgain = true;
    return;
  }
  typecheckRunning = true;
  const child = spawn("bun", ["run", "check:types"], {
    cwd: server.config.root,
    env: process.env,
  });
  const chunks: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  child.on("close", (status) => {
    typecheckRunning = false;
    const out = Buffer.concat(chunks).toString("utf8").trim();
    if (status === 0) server.config.logger.info("tsc ok");
    else server.config.logger.error(out.length > 0 ? `tsc failed\n${out}` : "tsc failed");
    if (typecheckAgain) {
      typecheckAgain = false;
      runTypecheck(server);
    }
  });
}
