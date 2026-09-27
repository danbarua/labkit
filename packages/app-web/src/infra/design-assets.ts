import { cp, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const DESIGN_ROOT = fileURLToPath(new URL("../../../design/", import.meta.url));

const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

/**
 * Serves packages/design at /design/ so the static explorer page, which has no build step, links
 * the same tokens and brand mark the React app imports. A build copies the folder next to the
 * bundle's static files.
 */
export function designAssets(): Plugin {
  let outDir = "dist";
  return {
    name: "labkit-design-assets",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use("/design", async (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
        const file = path.resolve(DESIGN_ROOT, `.${name}`);
        const type = TYPES[path.extname(file)];
        if (!file.startsWith(DESIGN_ROOT) || type === undefined) {
          next();
          return;
        }
        try {
          res.setHeader("content-type", type);
          res.end(await readFile(file));
        } catch {
          next();
        }
      });
    },
    async closeBundle() {
      await cp(DESIGN_ROOT, path.join(outDir, "design"), { recursive: true });
    },
  };
}
