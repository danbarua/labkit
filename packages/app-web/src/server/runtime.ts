import { basename } from "node:path";
import { APP_ROLE } from "@labkit/core-db/schema";
import { TENANT_SETTING } from "@labkit/core-db/scoped";
import { worktreeName } from "@labkit/app-cli/worktree";
import { type Connections, pgConnections } from "./connections";

// Goes into query text, so it is checked once here rather than trusted downstream.
const GRAPH_NAME = /^[a-z0-9_]+$/;

/**
 * Process-lifetime store: where connections come from. A request borrows one for the length of its
 * transaction and never keeps tenant state on it afterwards.
 */
export interface Runtime {
  connections: Connections;
  worktree: string;
}

export interface Workspace {
  slug: string;
  displayName: string;
}

/**
 * What a handler may touch for one request: one tenant's graph, read-only, inside one transaction.
 */
export interface TenantScope {
  tenantId: number;
  slug: string;
  graphName: string;
  /** Prepended to every path this scope links to: `/workspace/{slug}`. */
  prefix: string;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export function createRuntime(connections: Connections): Runtime {
  return { connections, worktree: worktreeName() ?? basename(process.cwd()) };
}

/** A runtime on the Postgres server `LABKIT_DB_URL` names. */
export function openRuntime(): Runtime {
  process.env.LABKIT_DB_URL ??= "postgresql://postgres:agens@127.0.0.1:5433/labkit";
  return createRuntime(pgConnections(process.env.LABKIT_DB_URL));
}

/**
 * Runs `work` inside a read-only transaction scoped to the workspace `slug`. Resolves to
 * `undefined` when no such workspace exists.
 *
 * The tenant and the role are pinned with `LOCAL`, so they end with the transaction and nothing
 * leaks to the next request that borrows the same connection. The workspace is looked up, never
 * created: `resolveTenantContext` provisions, and a request must not.
 */
export async function withTenant<T>(
  runtime: Runtime,
  slug: string,
  work: (scope: TenantScope) => Promise<T>,
): Promise<T | undefined> {
  const client = await runtime.connections.connect();
  let failure: unknown;
  try {
    type TenantRow = { id: number; slug: string; graph_name: string };
    const found = await client.query<TenantRow>(
      `SELECT id, slug, graph_name FROM public.tenants WHERE slug = $1`,
      [slug],
    );
    const row = found.rows[0];
    if (row === undefined) return undefined;
    if (!GRAPH_NAME.test(row.graph_name)) {
      throw new Error(
        `tenant ${row.id} has a graph name that is not safe to query: ${row.graph_name}`,
      );
    }

    await client.query("BEGIN READ ONLY");
    try {
      await client.query(`SELECT set_config($1, $2, true)`, [TENANT_SETTING, String(row.id)]);
      await client.query(`SET LOCAL ROLE ${APP_ROLE}`);
      const result = await work({
        tenantId: row.id,
        slug: row.slug,
        graphName: row.graph_name,
        prefix: `/workspace/${encodeURIComponent(row.slug)}`,
        query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => {
          return client.query<R>(sql, params);
        },
      });
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  } catch (err) {
    failure = err;
    throw err;
  } finally {
    // A connection that failed mid-transaction is not handed to another request.
    client.release(failure !== undefined);
  }
}

/** Every workspace, oldest first. The tenants table is shared, so no tenant is set for the read. */
export async function listWorkspaces(runtime: Runtime): Promise<Workspace[]> {
  const client = await runtime.connections.connect();
  let failure: unknown;
  try {
    const r = await client.query<{ slug: string; display_name: string }>(
      `SELECT slug, display_name FROM public.tenants ORDER BY id`,
    );
    return r.rows.map((w) => ({ slug: w.slug, displayName: w.display_name }));
  } catch (err) {
    failure = err;
    throw err;
  } finally {
    client.release(failure !== undefined);
  }
}
