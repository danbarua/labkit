import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Connect, Logger, Plugin, ViteDevServer } from "vite";
import { LABKIT_PG_URL } from "./postgres";

/** The router's base path. Everything the browser app serves lives under it. */
const APP_BASE = "/app";

function isApp(pathname: string): boolean {
  return pathname === APP_BASE || pathname.startsWith(`${APP_BASE}/`);
}

/** The HTML the browser app is served as, for a request path. */
type Page = (url: string, originalUrl: string | undefined) => Promise<string>;

// Runs after Vite's own middlewares, so anything that reaches it is neither a module, an asset
// nor a proxied API path. The browser app answers under `/app`, and `/` sends a browser there;
// every other path is a 404 rather than index.html.
function appOrNotFound(logger: Logger, page: Page): Connect.NextHandleFunction {
  return async (req, res, next) => {
    try {
      const pathname = (req.url ?? "/").split("?")[0] ?? "/";
      const isRead = req.method === "GET" || req.method === "HEAD";
      if (isRead && pathname === "/") {
        res.statusCode = 302;
        res.setHeader("location", `${APP_BASE}/`);
        res.end();
        return;
      }
      if (isRead && isApp(pathname)) {
        res.statusCode = 200;
        res.setHeader("content-type", "text/html");
        res.end(await page(req.url ?? "/", req.originalUrl));
        return;
      }
      logger.warn(`${req.method ?? "GET"} ${pathname} 404`);
      res.statusCode = 404;
      res.setHeader("content-type", "application/problem+json");
      res.end(
        JSON.stringify({
          type: "about:blank",
          title: "Not Found",
          status: 404,
          detail: `${req.method ?? "GET"} ${pathname} is not handled`,
        }),
      );
    } catch (err) {
      next(err);
    }
  };
}

// `vite preview` takes the base off the path before this runs, and answers `/` and anything outside
// the base itself, so every path that arrives is inside the app. It also runs this before serving
// the built files, so a path with a file extension is left for it.
function previewPage(page: Page): Connect.NextHandleFunction {
  return async (req, res, next) => {
    try {
      const pathname = (req.url ?? "/").split("?")[0] ?? "/";
      const isRead = req.method === "GET" || req.method === "HEAD";
      if (!isRead || path.extname(pathname) !== "") {
        next();
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "text/html");
      res.end(await page(req.url ?? "/", req.originalUrl));
    } catch (err) {
      next(err);
    }
  };
}

export function labkitDev(): Plugin {
  return {
    name: "labkit-dev",
    // "custom" turns off Vite's fallback to index.html for unknown paths. Vite's CORS layer
    // would answer a preflight before the proxy sees it, so it is off and the API owns CORS.
    config: () => ({ appType: "custom", server: { cors: false } }),
    configureServer(server) {
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        announceServices(server);
      };
      const page: Page = async (url, originalUrl) => {
        const raw = await readFile(path.join(server.config.root, "index.html"), "utf8");
        return server.transformIndexHtml(url, raw, originalUrl);
      };
      return () => server.middlewares.use(appOrNotFound(server.config.logger, page));
    },
    // The built bundle is served the same way, so what `vite preview` shows is what would ship.
    configurePreviewServer(server) {
      const built = path.resolve(server.config.root, server.config.build.outDir, "index.html");
      const page: Page = () => readFile(built, "utf8");
      return () => server.middlewares.use(previewPage(page));
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
  const api = Number(process.env.LABKIT_PORT_WEB ?? "8899");
  const pgPid = listeningPid(pg);
  const log = server.config.logger.info.bind(server.config.logger);
  log(line("front-end", `http://localhost:${port}${APP_BASE}/`, process.pid));
  log(line("back-end", `http://localhost:${port}/graph`, listeningPid(api)));
  log(line("labkit-db", `postgres://localhost:${pg}/`, pgPid));
}
