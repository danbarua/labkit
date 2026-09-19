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
    // The event table first: the sequence is seeded from what it holds.
    await this.ensureEventTable();
    await this.ensureNaturalIdSequence();
    const policies = await this.existingPolicies();
    for (const label of NODE_LABELS) await this.ensureRetractionPolicy(label, policies);
    await this.ensureGrants();
  }

  /**
   * One id sequence for this workspace, in its own schema.
   *
   * Asked of the catalogue rather than `CREATE IF NOT EXISTS`: a sequence
   * created now must be seeded past what the graph already holds, and only a
   * first creation should do that.
   */
  private async ensureNaturalIdSequence(): Promise<void> {
    const { rows } = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'S' AND c.relname = 'labkit_natural_id_seq' AND n.nspname = $1
       ) AS exists`,
      [this.graphName],
    );
    if (rows[0]?.exists) return;

    await this.db.query(`CREATE SEQUENCE "${this.graphName}".labkit_natural_id_seq`);

    // **Start above what the workspace already holds.** A record minted before
    // this sequence existed took its ids from the per-label sequences in
    // `public`, and a counter starting at 1 hands out `Q_1` again. Retracted
    // nodes count — their ids are taken whether or not a read can see them.
    const used = await this.db.query<{ high: number | null }>(
      `SELECT max((regexp_match(id, '_(\\d+)$'))[1]::bigint) AS high
       FROM (
         SELECT ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)::text AS id
         FROM "${this.graphName}"."_ag_label_vertex"
       ) ids
       WHERE id ~ '_\\d+"?$'`,
    );
    // The events too: their `seq` comes from this counter, and a record moved off the old
    // event table has rows here before the sequence exists.
    const events = await this.db.query<{ high: number | null }>(
      `SELECT max(seq) AS high FROM "${this.graphName}".domain_event`,
    );
    const high = Math.max(used.rows[0]?.high ?? 0, events.rows[0]?.high ?? 0);
    if (high > 0) {
      await this.db.query(`SELECT setval($1, $2)`, [
        `"${this.graphName}".labkit_natural_id_seq`,
        high,
      ]);
    }
  }

  /**
   * This workspace's event log, in its own schema.
   *
   * The columns come from `workspaceEvents`, which is the only place they are written down.
   */
  private async ensureEventTable(): Promise<void> {
    const { rows } = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r' AND c.relname = 'domain_event' AND n.nspname = $1
       ) AS exists`,
      [this.graphName],
    );
    if (rows[0]?.exists) return;

    const g = `"${this.graphName}"`;
    await this.db.query(`CREATE TABLE ${g}.domain_event (
      seq bigint PRIMARY KEY,
      tenant_id integer NOT NULL REFERENCES public.tenants(id),
      at text NOT NULL,
      operation text NOT NULL,
      subject text NOT NULL,
      changes jsonb NOT NULL DEFAULT '[]'::jsonb,
      attribution_label text NOT NULL,
      attribution_id text NOT NULL,
      attribution_how text,
      git_hash text,
      reconstructed_from text,
      command jsonb NOT NULL
    )`);
    await this.db.query(
      `CREATE INDEX domain_event_tenant_seq_idx ON ${g}.domain_event (tenant_id, seq)`,
    );
    await this.db.query(
      `CREATE INDEX domain_event_tenant_subject_idx ON ${g}.domain_event (tenant_id, subject)`,
    );
    await this.db.query(
      `CREATE INDEX domain_event_tenant_agent_idx ON ${g}.domain_event (tenant_id, attribution_id, seq)`,
    );
    await this.db.query(
      `CREATE INDEX domain_event_changes_idx ON ${g}.domain_event USING gin (changes jsonb_path_ops)`,
    );
    await this.db.query(`ALTER TABLE ${g}.domain_event ENABLE ROW LEVEL SECURITY`);
    await this.db.query(
      `CREATE POLICY domain_event_tenant_isolation ON ${g}.domain_event FOR ALL TO ${APP_ROLE}
         USING (tenant_id = current_setting('labkit.tenant_id')::int)
         WITH CHECK (tenant_id = current_setting('labkit.tenant_id')::int)`,
    );
  }

  /**
   * Lets the application role reach this tenant's graph.
   */
  private async ensureGrants(): Promise<void> {
    // An identifier cannot be a bind parameter, and these statements grant privileges.
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
   * At most one edge of a type between two nodes, enforced by the database.
   *
   * An edge label is a real table with `start_id`/`end_id` columns, so `UNIQUE (start_id, end_id)`
   * states it directly. It closes the race `createEdge`'s check-then-create cannot.
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
   *
   * `retracted` is a key inside the agtype `properties` column, not a column. AGE creates
   * these tables as the provisioning role, so `postgres` owns them and bypasses this.
   * `_ag_label_vertex` has no policy and shows retracted rows to any reader.
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
