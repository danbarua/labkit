/**
 * The package entry point (`package.json`'s `main`).
 */
export { ReadSurface } from "./domain";
export type { LabKitDB } from "./db/backend";
export { connectDb } from "./db/connect";
export { resolveTenantContext } from "./db/tenant";
export { TenantGraph } from "./db/graph";
