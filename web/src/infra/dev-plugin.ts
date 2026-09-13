import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { ensureOverlapBench } from "./seed";
import { ensureLabkitPostgres } from "./postgres";
import { openSession, type Session } from "../server/session";

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

/**
 * Dev composition root. Migrate+seed once. API routes go through ssrLoadModule
 * so handler edits hot-reload without dropping the Postgres session.
 */
export function labkitDev(): Plugin {
  return {
    name: "labkit-dev",
    configureServer(server) {
      const boot: Promise<Session> = (async () => {
        await ensureLabkitPostgres();
        await ensureOverlapBench();
        return openSession();
      })();

      server.middlewares.use(async (req, res, next) => {
        try {
          const pathname = (req.url ?? "/").split("?")[0] ?? "/";
          const accept = String(req.headers.accept ?? "");
          const session = await boot;
          const mod = (await server.ssrLoadModule("/src/server/handler.ts")) as {
            handle: (request: Request, sess: Session) => Promise<Response>;
            isLabkitApiPath: (path: string, acc: string) => boolean;
          };
          if (!mod.isLabkitApiPath(pathname, accept)) {
            next();
            return;
          }
          await writeResponse(res, await mod.handle(toRequest(req), session));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}
