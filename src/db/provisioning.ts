/**
 * Per-tenant AGE graph schema management.
 */

import { NODE_LABELS, EDGE_LABELS, INDEXED_PROPS, type NodeLabel, type EdgeLabel } from "./domain";
import type { LabKitDB } from "./backend";
import type { Transactor } from "./transactor";
import { validateGraphName } from "./agtype";
import { APP_ROLE } from "./schema";

/**
 * Reconciles a tenant's AGE graph, unconditionally, every time it's called — inside one
 * transaction guarded by a transaction-scoped advisory lock keyed by `tenantId`.
 */
export async function provisionTenantGraph(
  db: LabKitDB,
  tx: Transactor,
  tenantId: number,
  graphName: string,
): Promise<void> {
  await tx.inTransaction(async () => {
    await db.query("SELECT pg_advisory_xact_lock($1)", [tenantId]);
    await new TenantGraphProvisioner(db, graphName).reconcile();
  });
}

/**
 * Drops a tenant's graph and everything in it.
 */
export async function dropTenantGraph(db: LabKitDB, graphName: string): Promise<void> {
  await db.query(`SELECT * FROM ag_catalog.drop_graph($1, true)`, [graphName]);
}

/**
 * The `ensure*` steps, with the `(db, graphName)` pair they all thread held as constructor
 * state instead of repeated in every signature.
 */
class TenantGraphProvisioner {
  constructor(
    private readonly db: LabKitDB,
    private readonly graphName: string,
  ) {}

  /**
   * Ensures the currently supported ADDITIVE graph structure exists: the graph, every
   * vertex/edge label, every natural-id uniqueness index and every edge-relationship uniqueness
   * index — each independently, not gated behind a single "does the graph exist at all" check.
   */
  async reconcile(): Promise<void> {
    await this.ensureGraph();
    const labels = await this.existingLabels();
    const indexes = await this.existingIndexes();

    for (const label of NODE_LABELS) {
      if (!labels.has(label))
        await this.db.query(`SELECT ag_catalog.create_vlabel($1, $2)`, [this.graphName, label]);
    }
    for (const edge of EDGE_LABELS) {
      if (!labels.has(edge))
        await this.db.query(`SELECT ag_catalog.create_elabel($1, $2)`, [this.graphName, edge]);
    }
    for (const label of NODE_LABELS) await this.ensureNaturalIdIndex(label, indexes);
    for (const label of NODE_LABELS) await this.ensurePropertyIndexes(label, indexes);
    for (const edge of EDGE_LABELS) await this.ensureEdgeUniqueIndex(edge, indexes);
    const policies = await this.existingPolicies();
    for (const label of NODE_LABELS) await this.ensureRetractionPolicy(label, policies);
    await this.ensureGrants();
  }

  /**
   * Lets the application role reach this tenant's graph.
   */
  private async ensureGrants(): Promise<void> {
    // Validated before interpolation even though `graph_name` is a generated
    // column the server derives from a trusted id — an identifier cannot be a
    // bind parameter, so the check is the only thing standing where
    // a parameter would be. The rest of this file interpolates the same value
    // unvalidated; this is the one that grants privileges.
    validateGraphName(this.graphName);
    const g = `"${this.graphName}"`;
    await this.db.query(`GRANT USAGE ON SCHEMA ${g} TO ${APP_ROLE}`);
    await this.db.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${g} TO ${APP_ROLE}`,
    );
    await this.db.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${g} TO ${APP_ROLE}`);
    await this.db.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${g} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}`,
    );
    await this.db.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${g} GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE}`,
    );
  }

  private async ensureGraph(): Promise<void> {
    const existing = await this.db.query(`SELECT 1 FROM ag_catalog.ag_graph WHERE name = $1`, [
      this.graphName,
    ]);
    if (existing.rows.length === 0) {
      await this.db.query(`SELECT ag_catalog.create_graph($1)`, [this.graphName]);
    }
  }

  /** Every label this graph has, in one read of AGE's catalog. */
  private async existingLabels(): Promise<Set<string>> {
    const rows = await this.db.query<{ name: string }>(
      `SELECT l.name FROM ag_catalog.ag_label l
       JOIN ag_catalog.ag_graph g ON l.graph = g.graphid
       WHERE g.name = $1`,
      [this.graphName],
    );
    return new Set(rows.rows.map((r) => r.name));
  }

  /**
   * Every index in this graph's schema, in one read.
   */
  private async existingIndexes(): Promise<Set<string>> {
    const rows = await this.db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1`,
      [this.graphName],
    );
    return new Set(rows.rows.map((r) => r.indexname));
  }

  /**
   * DB-enforced natural-id uniqueness per label (see `.claude/skills/postgres-age/SKILL.md` for
   * why `agtype_access_operator` is the right expression here).
   */
  private async ensureNaturalIdIndex(label: NodeLabel, existing: Set<string>): Promise<void> {
    const indexName = `${label.toLowerCase()}_natural_id_idx`;
    if (existing.has(indexName)) return;
    await this.db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON "${this.graphName}"."${label}" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)))`,
    );
  }

  /**
   * Indexes for the properties LabKit actually matches on, from `INDEXED_PROPS`.
   */
  private async ensurePropertyIndexes(label: NodeLabel, existing: Set<string>): Promise<void> {
    for (const prop of INDEXED_PROPS[label] ?? []) {
      const indexName = `${label.toLowerCase()}_${prop}_idx`;
      if (existing.has(indexName)) continue;
      await this.db.query(
        `CREATE INDEX IF NOT EXISTS ${indexName} ON "${this.graphName}"."${label}" ((ag_catalog.agtype_access_operator(properties, '"${prop}"'::agtype)))`,
      );
    }
  }

  /**
   * DB-enforced edge-relationship uniqueness: every edge label's underlying table has exactly
   * `id`/`start_id`/`end_id`/`properties` columns (AGE materializes edges as real tables just
   * like vertices — confirmed via `information_schema.columns`), so `UNIQUE (start_id, end_id)`
   * encodes "at most one edge of this type between these two nodes" directly, closing the
   * concurrent-create race `TenantGraph.createEdge()`'s check-then-create fast path alone can't
   * (see that method's docstring).
   */
  private async ensureEdgeUniqueIndex(edge: EdgeLabel, existing: Set<string>): Promise<void> {
    const indexName = `${edge.toLowerCase()}_start_end_idx`;
    if (existing.has(indexName)) return;
    await this.db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON "${this.graphName}"."${edge}" (start_id, end_id)`,
    );
  }

  /** Every RLS policy already on this graph's tables, in one read. */
  private async existingPolicies(): Promise<Set<string>> {
    const rows = await this.db.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE schemaname = $1`,
      [this.graphName],
    );
    return new Set(rows.rows.map((r) => r.policyname));
  }

  /**
   * Hides a retracted node from `labkit_app` — the compensating act `undo` writes stands in the
   * record, and this is what stops it being traversed.
   */
  private async ensureRetractionPolicy(label: NodeLabel, existing: Set<string>): Promise<void> {
    const policyName = `${label.toLowerCase()}_hide_retracted`;
    // Both statements guarded on the one check: `ensureRetractionPolicy` is the only writer of
    // this policy and always enables RLS in the same call that creates it, so the policy's
    // presence already answers both questions.
    if (existing.has(policyName)) return;
    await this.db.query(`ALTER TABLE "${this.graphName}"."${label}" ENABLE ROW LEVEL SECURITY`);
    // `IS DISTINCT FROM`, not `<> true`: the access operator returns SQL NULL
    // for an absent property and `NULL <> true` is NULL, which would hide every
    // ordinary row. `WITH CHECK (true)` because a FOR ALL policy defaults it to
    // the USING expression, refusing the very write that sets `retracted`.
    await this.db.query(
      `CREATE POLICY "${policyName}" ON "${this.graphName}"."${label}" FOR ALL TO ${APP_ROLE}
       USING (ag_catalog.agtype_access_operator(properties, '"retracted"'::agtype)
              IS DISTINCT FROM 'true'::agtype)
       WITH CHECK (true)`,
    );
  }
}
