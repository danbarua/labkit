/**
 * Per-tenant AGE graph schema management (docs/project-journal/005_provisioning_reconciliation.md).
 *
 * There's no `ALTER GRAPH` DDL the way there's `ALTER TABLE`, so evolving a
 * tenant's graph structure — a new label, edge or index — is the
 * application's job, and it runs as reconciliation on every tenant
 * resolution rather than as a migration.
 *
 * `provisionTenantGraph()` is the only exported way in, deliberately: it's
 * what holds the transaction and the advisory lock that the reconciliation
 * below assumes. See `TenantGraphProvisioner`'s note on why the class stays
 * module-private.
 */

import { NODE_LABELS, EDGE_LABELS, NODE_TYPES, type NodeLabel, type EdgeLabel } from "./domain";
import { LABKIT_SCHEMA } from "./schema";
import type { LabKitDB } from "./client";

/**
 * Reconciles a tenant's AGE graph, unconditionally, every time it's called
 * — inside one transaction guarded by a transaction-scoped advisory lock
 * keyed by `tenantId`. No version gate: an earlier version tried skipping
 * reconciliation when a stored `schema_version` already matched the
 * current code, but that meant `resolveTenantContext()` — the actual
 * production path — would stop self-healing the moment the version
 * matched, even though the whole point of moving to per-resource
 * reconciliation (PJ-005) was to make drift repairable through normal
 * tenant resolution. Removed rather than kept as an unmeasured
 * optimization: each `ensure*` call is already a cheap existence check,
 * there's no evidence the full pass is a material cost, and the version
 * field created real correctness questions of its own (what happens when
 * an older process sees a newer tenant?) for a problem that was never
 * confirmed to exist. Measure first if this ever needs revisiting.
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
    await new TenantGraphProvisioner(db, graphName).reconcile();
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}

/** Drops a tenant's graph and everything in it. Used by test teardown (tests/helpers/db.ts); there is no production caller yet. */
export async function dropTenantGraph(db: LabKitDB, graphName: string): Promise<void> {
  await db.query(`SELECT * FROM ag_catalog.drop_graph($1, true)`, [graphName]);
}

/**
 * The `ensure*` steps, with the `(db, graphName)` pair they all thread held
 * as constructor state instead of repeated in every signature.
 *
 * NOT exported, and neither is `reconcile()` reachable any other way — it
 * takes no lock and opens no transaction itself, so two callers invoking it
 * directly and concurrently could race the check-then-create steps below.
 * `provisionTenantGraph()` above is the only entry point; tests exercise
 * reconciliation through `resolveTenantContext()`, the same locked path
 * production uses, not a second unlocked route that exists only for testing.
 */
class TenantGraphProvisioner {
  constructor(
    private readonly db: LabKitDB,
    private readonly graphName: string,
  ) {}

  /**
   * Ensures the currently supported ADDITIVE graph structure exists: the
   * graph, every vertex/edge label, every natural-id uniqueness index and
   * every edge-relationship uniqueness index — each independently, not gated
   * behind a single "does the graph exist at all" check. This is what makes a
   * *new* label, edge or index added to the codebase actually reach a tenant
   * whose graph was provisioned before that change shipped, not just
   * brand-new tenants.
   *
   * Deliberately not a claim of full structural reconciliation: indexes are
   * checked by name (`IF NOT EXISTS`), not compared by definition, and
   * labels are checked for existence, not arbitrary structural equivalence.
   * A change that isn't purely additive — renaming a label, reshaping a
   * property that already has data — has no story here; see
   * docs/project-journal/005_provisioning_reconciliation.md.
   */
  async reconcile(): Promise<void> {
    await this.ensureGraph();
    for (const label of NODE_LABELS) await this.ensureVertexLabel(label);
    for (const edge of EDGE_LABELS) await this.ensureEdgeLabel(edge);
    for (const label of NODE_LABELS) await this.ensureNaturalIdIndex(label);
    for (const edge of EDGE_LABELS) await this.ensureEdgeUniqueIndex(edge);
  }

  private async ensureGraph(): Promise<void> {
    const existing = await this.db.query(`SELECT 1 FROM ag_catalog.ag_graph WHERE name = $1`, [this.graphName]);
    if (existing.rows.length === 0) {
      await this.db.query(`SELECT ag_catalog.create_graph($1)`, [this.graphName]);
    }
  }

  private async labelExists(label: string): Promise<boolean> {
    const rows = await this.db.query(
      `SELECT 1 FROM ag_catalog.ag_label WHERE name = $2 AND graph = (SELECT graphid FROM ag_catalog.ag_graph WHERE name = $1)`,
      [this.graphName, label],
    );
    return rows.rows.length > 0;
  }

  private async ensureVertexLabel(label: NodeLabel): Promise<void> {
    if (!(await this.labelExists(label))) {
      await this.db.query(`SELECT ag_catalog.create_vlabel($1, $2)`, [this.graphName, label]);
    }
  }

  private async ensureEdgeLabel(edge: EdgeLabel): Promise<void> {
    if (!(await this.labelExists(edge))) {
      await this.db.query(`SELECT ag_catalog.create_elabel($1, $2)`, [this.graphName, edge]);
    }
  }

  /**
   * DB-enforced natural-id uniqueness per label (see `.claude/skills/postgres-age/SKILL.md`
   * for why `agtype_access_operator` is the right expression here). Named
   * explicitly (rather than left to Postgres's auto-naming) so `IF NOT EXISTS`
   * has something to key its idempotency check on.
   */
  private async ensureNaturalIdIndex(label: NodeLabel): Promise<void> {
    const indexName = `${label.toLowerCase()}_natural_id_idx`;
    await this.db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON "${this.graphName}"."${label}" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)))`,
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
  private async ensureEdgeUniqueIndex(edge: EdgeLabel): Promise<void> {
    const indexName = `${edge.toLowerCase()}_start_end_idx`;
    await this.db.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON "${this.graphName}"."${edge}" (start_id, end_id)`);
  }

}
