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

import { NODE_LABELS, EDGE_LABELS, INDEXED_PROPS, type NodeLabel, type EdgeLabel } from "./domain";
import type { LabKitDB } from "./backend";
import type { Transactor } from "./transactor";
import { validateGraphName } from "./agtype";
import { APP_ROLE } from "./schema";

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
 *
 * **No production caller, and as of 2026-08-22 no test-teardown caller either.**
 * `tests/helpers/db.ts` used to call it between every test; it now truncates the
 * label tables instead, because dropping destroyed thirty-eight labels and
 * thirty-eight indexes that the next `resolveTenantContext()` had to rebuild —
 * about half the suite's wall time, measured.
 *
 * Kept rather than deleted, and given its own test rather than left dark. It is
 * the only way to remove a tenant, which is a real operation a deploy will need;
 * and an untested drop is the kind of thing that is discovered to be broken at
 * the moment someone needs it most. `tests/reconciliation.test.ts` is its one
 * reader.
 */
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
   * checked by name, not compared by definition, and labels are checked for
   * existence, not arbitrary structural equivalence. A change that isn't
   * purely additive — renaming a label, reshaping a property that already has
   * data — has no story here; see
   * docs/project-journal/005_provisioning_reconciliation.md.
   *
   * **Asked once, not seventy-eight times.** Every label and every index this
   * tenant already has is read in two queries up front, and the loops below
   * then issue DDL only for what is genuinely missing. In the steady state —
   * which is every call after the first, for the life of a tenant — that is
   * three round trips instead of about eighty.
   *
   * Measured before it was changed, as PJ-005 asked: query tracing
   * (`LABKIT_TRACE=all`, see src/db/trace.ts) over a single scenario file
   * counted **2,448 queries, of which 1,086 — 44% — were this bookkeeping**,
   * repeated across fourteen reconciliations that each found nothing to do.
   * It is also the cost behind the suite's intermittent 5-second timeouts: a
   * test doing 311 sequential queries is mostly doing these.
   *
   * **This is not the `schema_version` gate PJ-005 reverted, and the
   * difference is the whole point.** That gate skipped reconciliation when a
   * stored version matched, so drift stopped being repaired the moment the
   * number agreed. This reads the *actual* catalog every single time and
   * reconciles against what is really there — it just asks in one question
   * rather than seventy-eight. Self-healing is preserved exactly; nothing is
   * remembered between calls.
   *
   * Reading AGE's own catalog tables directly is the sanctioned move — every
   * label is a real Postgres table registered in `ag_catalog.ag_label`, which
   * is the same fact that makes natural-id and edge-uniqueness indexes
   * possible at all. **Writing** to them is a different proposition and is not
   * done here: `create_vlabel` does catalog bookkeeping *and* creates a table,
   * and hand-rolling that would couple us to AGE's internals for a cost paid
   * once per tenant.
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
    await this.ensureGrants();
  }

  /**
   * Lets the application role reach this tenant's graph.
   *
   * **This has to live here rather than in a migration**, and it is the clearest
   * case for reconciliation in the whole file: a tenant's schema does not exist
   * when the migrations run, and neither do the label tables a *future* release
   * will add to it. A migration can only grant on what already exists.
   *
   * `ALTER DEFAULT PRIVILEGES` covers the tables created after this statement
   * *by this role*, which is what makes a label added next year reachable
   * without anyone remembering to grant it. The blanket `GRANT … ON ALL TABLES`
   * beside it covers the ones created before — including everything AGE's
   * `create_vlabel` just made, since default privileges do not apply
   * retroactively. Both, because each misses what the other catches.
   *
   * Unconditional, like everything else here. Re-granting is a catalog write
   * that costs a round trip and cannot drift; checking first would cost a round
   * trip too and could.
   */
  private async ensureGrants(): Promise<void> {
    // Validated before interpolation even though `graph_name` is a generated
    // column the server derives from a trusted id (PJ-003 §5) — an identifier
    // cannot be a bind parameter, so the check is the only thing standing where
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
   *
   * A tenant's graph is a Postgres schema named after it, so `pg_indexes`
   * scoped to that schema is the whole picture. Names only: this checks
   * existence by name exactly as `IF NOT EXISTS` did, and claims no more than
   * that — see the note above on what reconciliation deliberately is not.
   */
  private async existingIndexes(): Promise<Set<string>> {
    const rows = await this.db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1`,
      [this.graphName],
    );
    return new Set(rows.rows.map((r) => r.indexname));
  }

  /**
   * DB-enforced natural-id uniqueness per label (see `.claude/skills/postgres-age/SKILL.md`
   * for why `agtype_access_operator` is the right expression here). Named
   * explicitly (rather than left to Postgres's auto-naming) so `IF NOT EXISTS`
   * has something to key its idempotency check on.
   */
  private async ensureNaturalIdIndex(label: NodeLabel, existing: Set<string>): Promise<void> {
    const indexName = `${label.toLowerCase()}_natural_id_idx`;
    if (existing.has(indexName)) return;
    await this.db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON "${this.graphName}"."${label}" ((ag_catalog.agtype_access_operator(properties, '"natural_id"'::agtype)))`,
    );
  }

  /**
   * Indexes for the properties LabKit actually matches on, from
   * `INDEXED_PROPS`.
   *
   * Same functional-index form as `ensureNaturalIdIndex` and for the same
   * reason — a property lives inside one `properties` agtype column, so the
   * index has to be on the extraction expression rather than a column.
   *
   * **Not unique.** The natural-id index above is; this one must not be. Two
   * claims asserting the same sentence in different lines of enquiry are two
   * claims (S-5), and a unique index on `Claim.name` would turn that from
   * something the domain models into a `23505`.
   *
   * Before this existed, every `MATCH (c:Claim {name: $name})` — twelve sites —
   * was a sequential scan over the label's table.
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
   * DB-enforced edge-relationship uniqueness: every edge label's underlying
   * table has exactly `id`/`start_id`/`end_id`/`properties` columns (AGE
   * materializes edges as real tables just like vertices — confirmed via
   * `information_schema.columns`), so `UNIQUE (start_id, end_id)` encodes
   * "at most one edge of this type between these two nodes" directly, closing
   * the concurrent-create race `TenantGraph.createEdge()`'s check-then-create
   * fast path alone can't (see that method's docstring).
   */
  private async ensureEdgeUniqueIndex(edge: EdgeLabel, existing: Set<string>): Promise<void> {
    const indexName = `${edge.toLowerCase()}_start_end_idx`;
    if (existing.has(indexName)) return;
    await this.db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON "${this.graphName}"."${edge}" (start_id, end_id)`,
    );
  }
}
