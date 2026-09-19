import type { IncomingMessage, ServerResponse } from "node:http";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { ensureLabkitPostgres, LABKIT_PG_URL } from "./postgres";
import { handle, isLabkitApiPath, notFound } from "../server/handler";
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
      const requestStart = Date.now();
      const response = await handle(toRequest(req), runtime);
      const requestEnd = Date.now();
      const ctype = response.headers.get("content-type") ?? "";
      const line = `${req.method ?? "GET"} ${pathname} ${response.status} ${ctype} ${requestEnd - requestStart}ms`;
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

// Runs after Vite's own middlewares, so anything that reaches it is neither a module, an asset
// nor an API path. The SPA lives at `/` only; every other path is a 404 rather than index.html.
function serveSpaOrNotFound(server: ViteDevServer): void {
  server.middlewares.use(async (req, res, next) => {
    try {
      const pathname = (req.url ?? "/").split("?")[0] ?? "/";
      const isRead = req.method === "GET" || req.method === "HEAD";
      if (isRead && (pathname === "/" || pathname === "/index.html")) {
        const raw = await readFile(path.join(server.config.root, "index.html"), "utf8");
        const html = await server.transformIndexHtml(req.url ?? "/", raw, req.originalUrl);
        res.statusCode = 200;
        res.setHeader("content-type", "text/html");
        res.end(html);
        return;
      }
      const response = notFound(`${req.method ?? "GET"} ${pathname} is not handled`);
      server.config.logger.warn(`${req.method ?? "GET"} ${pathname} 404`);
      await writeResponse(res, response);
    } catch (err) {
      next(err);
    }
  });
}

export function labkitDev(): Plugin {
  return {
    name: "labkit-dev",
    // "custom" turns off Vite's fallback to index.html for unknown paths. Vite's own CORS layer
    // answers preflights before our handlers run, so it is off and handler.ts owns CORS.
    config: () => ({ appType: "custom", server: { cors: false } }),
    configureServer(server) {
      attachLabkit(server);
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        announceServices(server);
      };
      return () => serveSpaOrNotFound(server);
    },
    handleHotUpdate({ file }) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return [];
      if (file.includes("node_modules")) return [];
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
  log(line("back-end", `http://localhost:${port}/graph`, httpPid));
  log(line("labkit-db", `postgres://localhost:${pg}/`, pgPid));
}
