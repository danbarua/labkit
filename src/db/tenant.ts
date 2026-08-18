import type { LabKitDB } from "./graph";
import { NODE_LABELS, EDGE_LABELS, NODE_VIEW_COLUMNS, type NodeLabel, type EdgeLabel } from "./graph";
import { LABKIT_SCHEMA } from "./schema";

export interface TenantContext {
  tenantId: number;
  graphName: string;
}

/**
 * Resolves (creating if needed) a tenant by slug, reconciles its AGE graph,
 * and returns the `TenantContext` every `TenantGraph` operation requires.
 * This is the CLI/MCP/bootstrap-boundary resolution point PJ-003 §5
 * describes — below this, there is no "tenant omitted" mode.
 */
export async function resolveTenantContext(db: LabKitDB, slug = "labkit"): Promise<TenantContext> {
  const inserted = await db.query<{ id: number; graph_name: string }>(
    `insert into ${LABKIT_SCHEMA}.tenants (slug, display_name) values ($1, $2) on conflict (slug) do nothing returning id, graph_name`,
    [slug, slug],
  );
  const row =
    inserted.rows[0] ??
    (await db.query<{ id: number; graph_name: string }>(`select id, graph_name from ${LABKIT_SCHEMA}.tenants where slug = $1`, [slug]))
      .rows[0];
  if (!row) throw new Error(`tenant "${slug}" not found after insert-or-fetch race`);

  await provisionTenantGraph(db, row.id, row.graph_name);
  return { tenantId: row.id, graphName: row.graph_name };
}

/**
 * Reconciles a tenant's AGE graph, unconditionally, every time it's called
 * — inside one transaction guarded by a transaction-scoped advisory lock
 * keyed by `tenantId`. No version gate: an earlier version tried skipping
 * reconciliation when a stored `schema_version` already matched the
 * current code, but that meant `resolveTenantContext()` — the actual
 * production path — would stop self-healing the moment the version
 * matched, even though the whole point of moving to per-resource
 * reconciliation (PJ-005) was to make drift repairable through normal
 * tenant resolution, not just through a test calling the reconciliation
 * internals directly. Removed per review (2026-08-18) rather than kept as
 * an unmeasured optimization: each `ensure*` call is already a cheap
 * existence check, there's no evidence the full pass is a material cost,
 * and the version field created real correctness questions of its own
 * (what happens when an older process sees a newer tenant?) for a problem
 * that was never confirmed to exist. Measure first if this ever needs
 * revisiting.
 *
 * Contract: serialized per tenant — not "each individual DDL statement
 * happens to survive a race." Tenant resolution is runtime code (unlike
 * the one-time migrations in ./drizzle/), so two processes can call this
 * concurrently; the loser blocks on the advisory lock until the winner
 * commits, then runs the same reconciliation itself — redundant but
 * idempotent, not incorrect.
 *
 * On PGlite this lock is uncontended in practice (PGlite is already
 * single-writer), but the code path is identical across backends —
 * `pg_advisory_xact_lock` is a normal Postgres builtin either way.
 */
export async function provisionTenantGraph(db: LabKitDB, tenantId: number, graphName: string): Promise<void> {
  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock($1)", [tenantId]);
    await reconcileTenantGraph(db, graphName);
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}

/**
 * Ensures the currently supported ADDITIVE graph structure exists: the
 * graph, every vertex/edge label, every natural-id uniqueness index, every
 * edge-relationship uniqueness index, and every CQRS view — each
 * independently, not gated behind a single "does the graph exist at all"
 * check. This is what makes a *new* label/edge/view added to the codebase
 * actually reach a tenant whose graph was provisioned before that change
 * shipped, not just brand-new tenants.
 *
 * Deliberately not a claim of full structural reconciliation: indexes are
 * checked by name (`IF NOT EXISTS`), not compared by definition, and
 * labels are checked for existence, not arbitrary structural equivalence.
 * A change that isn't purely additive — removing/reordering a view column,
 * renaming a label, reshaping a property that already has data — has no
 * story here; see docs/project-journal/005_provisioning_reconciliation.md.
 *
 * NOT exported — only reachable through `provisionTenantGraph()`'s
 * transaction + advisory lock above. This function does neither itself, so
 * two callers invoking it directly and concurrently could race the
 * check-then-create `ensure*` calls below; tests exercise reconciliation
 * through `resolveTenantContext()`/`provisionTenantGraph()`, the same
 * locked path production uses, not a second unlocked route that only
 * exists for testing.
 */
async function reconcileTenantGraph(db: LabKitDB, graphName: string): Promise<void> {
  await ensureGraph(db, graphName);
  for (const label of NODE_LABELS) await ensureVertexLabel(db, graphName, label);
  for (const edge of EDGE_LABELS) await ensureEdgeLabel(db, graphName, edge);
  for (const label of NODE_LABELS) await ensureNaturalIdIndex(db, graphName, label);
  for (const edge of EDGE_LABELS) await ensureEdgeUniqueIndex(db, graphName, edge);
  for (const label of NODE_LABELS) await ensureView(db, graphName, label);
}

async function ensureGraph(db: LabKitDB, graphName: string): Promise<void> {
  const existing = await db.query(`SELECT 1 FROM ag_catalog.ag_graph WHERE name = $1`, [graphName]);
  if (existing.rows.length === 0) {
    await db.query(`SELECT ag_catalog.create_graph($1)`, [graphName]);
  }
}

async function labelExists(db: LabKitDB, graphName: string, label: string): Promise<boolean> {
  const rows = await db.query(
    `SELECT 1 FROM ag_catalog.ag_label WHERE name = $2 AND graph = (SELECT graphid FROM ag_catalog.ag_graph WHERE name = $1)`,
    [graphName, label],
  );
  return rows.rows.length > 0;
}

async function ensureVertexLabel(db: LabKitDB, graphName: string, label: NodeLabel): Promise<void> {
  if (!(await labelExists(db, graphName, label))) {
    await db.query(`SELECT ag_catalog.create_vlabel($1, $2)`, [graphName, label]);
  }
}

async function ensureEdgeLabel(db: LabKitDB, graphName: string, edge: EdgeLabel): Promise<void> {
  if (!(await labelExists(db, graphName, edge))) {
    await db.query(`SELECT ag_catalog.create_elabel($1, $2)`, [graphName, edge]);
  }
}

/**
 * DB-enforced natural-id uniqueness per label (see `.claude/skills/postgres-age/SKILL.md`
 * for why `agtype_access_operator` is the right expression here). Named
 * explicitly (rather than left to Postgres's auto-naming) so `IF NOT EXISTS`
 * has something to key its idempotency check on.
 */
async function ensureNaturalIdIndex(db: LabKitDB, graphName: string, label: NodeLabel): Promise<void> {
  const indexName = `${label.toLowerCase()}_natural_id_idx`;
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON "${graphName}"."${label}" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)))`,
  );
}

/**
 * DB-enforced edge-relationship uniqueness: every edge label's underlying
 * table has exactly `id`/`start_id`/`end_id`/`properties` columns (AGE
 * materializes edges as real tables just like vertices — confirmed via
 * `information_schema.columns`), so `UNIQUE (start_id, end_id)` encodes
 * "at most one edge of this type between these two nodes" directly, closing
 * the concurrent-create race `TenantGraph.createEdge()`'s check-then-create
 * fast path alone can't (see that method's docstring).
 */
async function ensureEdgeUniqueIndex(db: LabKitDB, graphName: string, edge: EdgeLabel): Promise<void> {
  const indexName = `${edge.toLowerCase()}_start_end_idx`;
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON "${graphName}"."${edge}" (start_id, end_id)`);
}

/**
 * Per-tenant CQRS read view, schema-qualified to this tenant so there's
 * never a naming collision between tenants. `CREATE OR REPLACE VIEW` is
 * itself idempotent and picks up column additions — it can NOT remove or
 * reorder existing columns (a real Postgres restriction), so a
 * `NODE_VIEW_COLUMNS` change that does either needs an actual migration
 * story once one exists, not just a reconcile pass. Acceptable for now per
 * the "lay the groundwork, figure out real graph migrations later" decision
 * (docs/project-journal/005_provisioning_reconciliation.md).
 */
async function ensureView(db: LabKitDB, graphName: string, label: NodeLabel): Promise<void> {
  const columns = NODE_VIEW_COLUMNS[label]
    .map((col) => `${LABKIT_SCHEMA}.labkit_prop(properties, '${col}') AS ${col}`)
    .join(",\n           ");
  await db.query(
    `CREATE OR REPLACE VIEW "${graphName}".${label.toLowerCase()} AS
     SELECT ${LABKIT_SCHEMA}.labkit_prop(properties, 'natural_id') AS natural_id,
     ${columns}
     FROM "${graphName}"."${label}"`,
  );
}
