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
    await new TenantGraphProvisioner(db, tenantId, graphName).reconcile();
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
    private readonly tenantId: number,
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
    await this.ensureNaturalIdSequence();
    await this.ensureEventTable();
    await this.ensureSuppliedEventSeq();
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
    const high = used.rows[0]?.high;
    if (high) {
      await this.db.query(`SELECT setval($1, $2)`, [
        `"${this.graphName}".labkit_natural_id_seq`,
        high,
      ]);
    }
  }

  /**
   * This workspace's event log, in its own schema.
   *
   * Copied from `public.labkit_event` with `LIKE`, which is where the column list is still
   * written down. `LIKE` runs once: a column added there later never reaches a workspace
   * that already has the table.
   */
  private async ensureEventTable(): Promise<void> {
    const { rows } = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r' AND c.relname = 'labkit_event' AND n.nspname = $1
       ) AS exists`,
      [this.graphName],
    );
    if (rows[0]?.exists) return;

    const g = `"${this.graphName}"`;
    // `INCLUDING INDEXES` brings the primary key and the three tenant indexes. It does not
    // bring the foreign key, row-level security or the policy — those are stated below.
    await this.db.query(
      `CREATE TABLE ${g}.labkit_event (LIKE public.labkit_event INCLUDING DEFAULTS INCLUDING INDEXES)`,
    );

    await this.db.query(
      `ALTER TABLE ${g}.labkit_event ADD CONSTRAINT labkit_event_tenant_id_tenants_id_fk
         FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)`,
    );
    await this.db.query(`ALTER TABLE ${g}.labkit_event ENABLE ROW LEVEL SECURITY`);
    await this.db.query(
      `CREATE POLICY labkit_event_tenant_isolation ON ${g}.labkit_event FOR ALL TO ${APP_ROLE}
         USING (tenant_id = current_setting('labkit.tenant_id')::int)
         WITH CHECK (tenant_id = current_setting('labkit.tenant_id')::int)`,
    );

    // Rows written before the log moved. Filtered by `tenant_id` rather than left to the
    // policy: provisioning runs before `scopeToTenant`, as the owning role and with
    // `labkit.tenant_id` unset, so the policy is not in force here. `SELECT *` is safe only
    // because `LIKE` guarantees the column order matches.
    await this.db.query(
      `INSERT INTO ${g}.labkit_event SELECT * FROM public.labkit_event WHERE tenant_id = $1`,
      [this.tenantId],
    );
    // The one counter has to clear the copied events too: an act takes its number from
    // `labkit_natural_id_seq`, and that number is now a `seq` as well as an id. The `WHERE`
    // is what makes this do nothing on an empty workspace — an unconditional `setval` would
    // burn number 1 and the first act of a new record would be event 2.
    await this.db.query(
      `SELECT setval($1, m.high, true)
         FROM (SELECT max(seq) AS high FROM ${g}.labkit_event) m
        WHERE m.high IS NOT NULL
          AND m.high >= (SELECT last_value FROM ${g}.labkit_natural_id_seq)`,
      [`${this.graphName}.labkit_natural_id_seq`],
    );
  }

  /**
   * Removes the `seq` default a workspace made by 0.7.459 still carries, and lifts the id
   * counter above the event numbers already written.
   *
   * Those workspaces draw event numbers from `labkit_event_seq_seq` and ids from
   * `labkit_natural_id_seq`. One counter does both jobs now, so the second one goes — and
   * the first has to clear what it handed out, or the next act writes a `seq` a row holds.
   */
  private async ensureSuppliedEventSeq(): Promise<void> {
    const { rows } = await this.db.query<{ has_default: boolean }>(
      `SELECT a.atthasdef AS has_default
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = 'labkit_event' AND a.attname = 'seq'`,
      [this.graphName],
    );
    if (rows[0]?.has_default !== true) return;
    await this.db.query(
      `ALTER TABLE "${this.graphName}".labkit_event ALTER COLUMN seq DROP DEFAULT`,
    );
    // Past the numbers the old counter handed out, or the next act collides with an event
    // that already holds its number.
    await this.db.query(
      `SELECT setval($1, m.high, true)
         FROM (SELECT max(seq) AS high FROM "${this.graphName}".labkit_event) m
        WHERE m.high IS NOT NULL
          AND m.high >= (SELECT last_value FROM "${this.graphName}".labkit_natural_id_seq)`,
      [`${this.graphName}.labkit_natural_id_seq`],
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
