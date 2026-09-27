import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

interface TranscriptFile {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly events: readonly unknown[];
}

/** One JSON response this route answers with, whatever the outcome. */
export interface RouteResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Answers `GET /transcripts` (every file's `{id, title, description}`) and `GET /transcripts/:id`
 * (that one file whole, `events` included) by reading `dataDir` fresh on every call -- not a
 * module a static import would cache. `requested` is the path after `/transcripts/`, `""` for the
 * list. Malformed JSON in one file fails only a request for that file, never the list.
 */
export async function transcriptsRoute(dataDir: string, requested: string): Promise<RouteResponse> {
  const files = async (): Promise<string[]> =>
    (await readdir(dataDir)).filter((name) => name.endsWith(".json"));

  const read = async (name: string): Promise<TranscriptFile> =>
    JSON.parse(await readFile(path.join(dataDir, name), "utf8"));

  try {
    if (requested === "") {
      const entries = await Promise.all(
        (await files()).map(async (name) => {
          try {
            const { id, title, description } = await read(name);
            return { id, title, description };
          } catch {
            return undefined;
          }
        }),
      );
      return { status: 200, body: entries.filter((entry) => entry !== undefined) };
    }
    const match = (await files()).find((name) => name === `${requested}.json`);
    if (!match) {
      return {
        status: 404,
        body: { title: "Not Found", detail: `no transcript named ${requested}` },
      };
    }
    return { status: 200, body: await read(match) };
  } catch (error) {
    return {
      status: 500,
      body: {
        title: "Application Error",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Mounts {@link transcriptsRoute} at `/transcripts` on the dev server, so the gallery reads
 * `packages/acp-transcripts/data` from disk without a second process. Editing a file there and
 * reloading the gallery shows the change with no build step.
 */
export function transcripts(): Plugin {
  const dataDir = path.resolve(import.meta.dirname, "../../../acp-transcripts/data");
  return {
    name: "labkit-transcripts",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/transcripts", async (req, res) => {
        const { status, body } = await transcriptsRoute(
          dataDir,
          (req.url ?? "/").replace(/^\/+/, ""),
        );
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(body));
      });
    },
  };
}
