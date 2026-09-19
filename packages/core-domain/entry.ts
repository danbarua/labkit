/**
 * The package entry point (`package.json`'s `main`).
 */
export { ReadSurface } from ".";
export type { LabKitDB } from "@labkit/core-db/backend";
export { connectDb } from "@labkit/core-db/connect";
export { resolveTenantContext } from "@labkit/core-db/tenant";
export { TenantGraph } from "@labkit/core-db/graph";
