/**
 * The package entry point (`package.json`'s `main`).
 *
 * It was `console.log("Hello via Bun!")` — bun's template leftover, still there
 * at 258 tests. An entry point that prints on import is not merely untidy now:
 * `src/mcp/server.ts` speaks MCP over **stdout**, so a stray write anywhere
 * under `src/` corrupts the protocol stream. `scripts/check-stdout.sh` makes
 * that a check rather than a habit.
 *
 * Re-exports the two adapter-facing halves and nothing else. Everything a
 * caller needs to *read* a research record is here; everything that writes one
 * is reached through `src/domain` deliberately, so an importer picks the write
 * surface on purpose.
 */
export { ReadSurface } from "./domain";
export type { LabKitDB } from "./db/backend";
export { connectDb } from "./db/connect";
export { resolveTenantContext } from "./db/tenant";
export { TenantGraph } from "./db/graph";
