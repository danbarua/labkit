/**
 * The query/mutation surface for one tenant's graph
 * (docs/project-journal/003_review_domain_tenancy.md,
 * docs/project-journal/004_tenancy_implementation_plan.md): one Apache AGE
 * graph per tenant, addressed and mutated exclusively through the
 * `TenantGraph` class below — never a hardcoded graph name, never an
 * arbitrary property-map edge match, never AGE's internal graphid past this
 * file's boundary.
 *
 * What LabKit's entities *are* lives in src/db/domain.ts; how a tenant's
 * graph gets created lives in src/db/provisioning.ts. This file is only the
 * verbs.
 */

import { LABKIT_SCHEMA } from "./schema";
import { buildPropertyClause, validateIdentifier } from "./agtype";
import { CypherRunner, edge as edgeColumn, vertex as vertexColumn, type DecodedRow, type RowSpec } from "./cypher";
import {
  EDGE_SCHEMA,
  NODE_TYPES,
  labelForNaturalId,
  type EdgeLabel,
  type NodeLabel,
  type NodePropsByLabel,
  type PublicNode,
} from "./domain";
import type { LabKitDB } from "./client";
import type { TenantContext } from "./tenant";

/**
 * Bundles `ctx`/`db` once instead of threading them through every call —
 * every call site was going to gain a `ctx: TenantContext` first parameter
 * regardless (PJ-003 §5), so this centralizes it, and gives `EDGE_SCHEMA`
 * validation, natural-id -> label resolution, and the `Decision` lifecycle
 * invariant one non-arbitrary home instead of scattering them across free
 * functions.
 */
export class TenantGraph {
  private readonly runner: CypherRunner;
  private readonly db: LabKitDB;
  /** Depth counter, so a compound verb calling another one does not nest BEGIN. */
  private depth = 0;

  constructor(
    private readonly ctx: TenantContext,
    db: LabKitDB,
  ) {
    this.db = db;
    // CypherRunner validates ctx.graphName once, in its own constructor —
    // graphName is immutable for this instance's lifetime, and always
    // server-derived (tenants.graph_name is a generated column, PJ-003 §5),
    // so it should never fail in practice. Still worth checking before it's
    // interpolated into every query this instance issues.
    this.runner = new CypherRunner(db, ctx.graphName);
  }

  /**
   * Runs `work` inside one database transaction: everything it writes commits
   * together, or none of it does.
   *
   * Earned by external review of S-3c, as a negative test rather than as
   * infrastructure hygiene. A compound research action was not atomic and had
   * become *consequential*: `replaceAnalysis()` invalidates the superseded
   * output first, and since S-3c invalidating an output withdraws the criterion
   * evaluations that cited it. So a failure between the two halves left a
   * record where the earlier failure had stopped deciding its check and no
   * corrected check existed — a partially committed scientific state, which is
   * the thing this system exists to prevent. `reverify()` had the same shape
   * with a worse landing: without its second write, the durable state is
   * exactly S-10's demonstrated wrong answer.
   *
   * Re-entrant by depth count rather than by savepoint. A verb that composes
   * another (`reverify` calls the analysis writer) must not issue a nested
   * `BEGIN`, and partial rollback to a savepoint is not something any caller
   * has needed — the whole point is that these actions are indivisible.
   *
   * Note this is a *transaction* boundary, not a raw-string escape hatch: no
   * caller gains the ability to issue Cypher this class would not otherwise
   * run. See the file header.
   */
  async inTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.depth > 0) return work();
    await this.db.query("BEGIN");
    this.depth += 1;
    try {
      const result = await work();
      await this.db.query("COMMIT");
      return result;
    } catch (err) {
      // A failed ROLLBACK must not become the error the caller sees. The
      // original is why we are here; the rollback failure is a consequence of
      // it, and reporting the consequence loses the cause.
      try {
        await this.db.query("ROLLBACK");
      } catch {
        // deliberately swallowed -- see above
      }
      throw err;
    } finally {
      // In `finally`, so it happens exactly once on every path. It used to be
      // decremented before COMMIT *and* again in the catch, so a throwing
      // COMMIT left `depth` at -1 -- and since re-entrancy is keyed on
      // `depth > 0`, the next compound verb would run at an apparent depth of
      // 0 and a verb nested inside it would issue a second BEGIN instead of
      // joining. The re-entrancy contract silently inverted, for the life of
      // the TenantGraph. Never observed firing; found while investigating the
      // suite flake and demonstrated in tests/domain-graph.test.ts.
      this.depth -= 1;
    }
  }

  /**
   * Runs a read query against this tenant's graph. `columns` declares each
   * `RETURN`ed name and how to decode it (see src/db/cypher.ts's decoders) —
   * that one declaration produces both the SQL `AS` clause AGE requires and
   * the row type this resolves to.
   */
  async query<S extends RowSpec>(cypher: string, columns: S, params?: Record<string, unknown>): Promise<DecodedRow<S>[]> {
    return this.runner.query(cypher, columns, params);
  }

  /**
   * Creates a single node and stamps it with a fresh natural id, in one
   * round trip. `label` selects the property shape (`NodePropsByLabel`), so
   * passing another label's props is a compile error.
   *
   * `label` is one of NODE_LABELS, never caller-controlled input — the
   * generator call's `label`/`prefix` arguments are template-interpolated
   * literals for that reason (`labkit_next_natural_id` in
   * drizzle/0002_natural_ids.sql), never passed through `props`/`$`-params.
   *
   * The `::text` casts on those two literals are required, not decorative:
   * AGE types bare Cypher string literals as `agtype`, and Postgres won't
   * resolve a `(text, text)` function overload against `agtype` arguments —
   * confirmed empirically against pglite-age before this was written this way.
   */
  async createNode<L extends NodeLabel>(label: L, props: NodePropsByLabel[L]): Promise<PublicNode<L>> {
    const nodeType = NODE_TYPES[label];
    const validated = nodeType.validate ? nodeType.validate(props) : props;
    const naturalIdClause = `natural_id: ${LABKIT_SCHEMA}.labkit_next_natural_id('${label.toLowerCase()}'::text, '${nodeType.prefix}'::text)`;
    const propsClause = buildPropertyClause(validated as unknown as Record<string, unknown>);
    const clause = propsClause ? `${propsClause}, ${naturalIdClause}` : naturalIdClause;

    const rows = await this.query(
      `CREATE (n:${label} {${clause}}) RETURN n`,
      { n: vertexColumn<NodePropsByLabel[L] & { natural_id: string }>() },
      validated as unknown as Record<string, unknown>,
    );
    const created = rows[0];
    if (!created) throw new Error(`CREATE (n:${label}) returned no rows`);

    const { natural_id, ...properties } = created.n.properties;
    return { natural_id, label, properties: properties as unknown as NodePropsByLabel[L] };
  }

  /**
   * Creates a directed edge identified by natural IDs — never AGE's
   * internal graphid, never an arbitrary property-map match that could
   * silently address more than one node (PJ-003 §7). The label of each
   * endpoint is inferred from its natural-id prefix (`labelForNaturalId`),
   * then validated as a legal `(fromLabel, edge, toLabel)` combination
   * against `EDGE_SCHEMA` before anything is matched in the database. A
   * missing source/target throws explicitly rather than silently creating
   * zero edges.
   *
   * `(fromId, edge, toId)` is a unique key for a relationship — calling
   * this twice with the same three values is a no-op, not a duplicate
   * parallel edge, so agent retries are safe by construction. This is
   * implemented as an explicit existence check before `CREATE` (the fast
   * path), NOT Cypher `MERGE` — `MERGE` for a relationship between two
   * already-matched nodes was spiked and found broken under pglite-age (the
   * created edge's `start_id`/`end_id` are both `0`, so it never actually
   * connects the nodes — see .claude/skills/postgres-age/SKILL.md's
   * gotchas).
   *
   * The check-then-create fast path alone would leave a race under
   * concurrent callers on the direct-Postgres backend (already shipped, not
   * hypothetical — two processes can both pass the existence check before
   * either `CREATE`s). Closed at the DB layer instead: every edge label's
   * table has a `UNIQUE (start_id, end_id)` index (provisioned in
   * `src/db/provisioning.ts`, confirmed to actually enforce uniqueness — a
   * duplicate `CREATE` raises a real Postgres `23505` error), and this
   * method catches exactly that error code and treats it as the same
   * successful no-op the fast-path check would have produced. The
   * uniqueness guarantee is real regardless of backend; the pre-check is
   * purely an optimization to avoid a wasted round trip in the common case.
   *
   * **`props` are set on creation only, and that is a consequence of the
   * idempotency above rather than a separate decision.** This verb is
   * create-if-absent, so a second call against an existing edge is a no-op and
   * any properties it carries are dropped, silently. Making it an upsert would
   * mean two callers with different properties racing to overwrite each other
   * under a contract that currently promises retries are free. If a property
   * ever needs to change after the fact, that wants its own verb and its own
   * argument, the way `closeDecision()` is the only sanctioned way to set
   * `is_open`.
   *
   * Ledger row **T** claimed edges cannot carry properties. They can — every
   * AGE label is a real Postgres table and an edge row has the same
   * `properties` agtype column a vertex row has, verified in
   * `tests/domain-graph.test.ts` through Cypher and through plain SQL. Nothing
   * was stopping this parameter existing except that no caller had wanted one.
   * What survives of the row is narrower and real: **`UNIQUE (start_id, end_id)`
   * means a property can annotate a relationship but never distinguish two of
   * them.** Two edges of the same label between the same pair are one edge, and
   * no property changes that.
   *
   * Untyped per label, deliberately. `EDGE_SCHEMA` declares endpoint pairs and
   * no property shapes, so there is nothing to key a `NodePropsByLabel`
   * equivalent off. When an edge earns a declared shape, type it the way node
   * props are typed rather than widening this signature further.
   */
  async createEdge(
    fromId: string,
    edge: EdgeLabel,
    toId: string,
    // `number[]` because one CONSUMES edge has to carry every position at which
    // its artefact was read: `(from, label, to)` is this method's identity and
    // a repeat is a no-op, so a run that read one record twice cannot be two
    // edges. See `recorded()` and S-10e.
    props?: Record<string, string | number | boolean | number[]>,
  ): Promise<void> {
    const fromLabel = labelForNaturalId(fromId);
    const toLabel = labelForNaturalId(toId);

    const allowed = EDGE_SCHEMA[edge].some(([f, t]) => f === fromLabel && t === toLabel);
    if (!allowed) {
      throw new Error(`${edge} does not allow ${fromLabel} -> ${toLabel} (natural ids ${fromId} -> ${toId})`);
    }

    // **The endpoints are not checked up front.** They used to be, one query
    // each, and that made every edge cost three round trips before a single
    // byte was written. The `CREATE` below matches both endpoints itself: if
    // either is missing the pattern binds nothing, the statement creates
    // nothing and returns **no rows**, which is the same information those two
    // queries were buying -- so they are issued only when that happens, purely
    // to say *which* endpoint was missing. Measured on
    // `tests/scenarios/s11b_which_review_retracted_it.test.ts`: 240 of that
    // file's 812 queries were these two, 30% of everything it ran.
    //
    // Verified against this backend before relying on it, because pglite-age
    // has form on edge operations (`MERGE` builds edges with both endpoints
    // `0`): `CREATE (a)-[e:E]->(b) RETURN e` returns exactly one row when both
    // endpoints exist and the edge genuinely connects them, returns zero rows
    // and **no error** when one is missing, and still raises `23505` on a
    // duplicate.
    const existing = await this.query(
      `MATCH (:${fromLabel} {natural_id: $from})-[e:${edge}]->(:${toLabel} {natural_id: $to}) RETURN e`,
      { e: edgeColumn() },
      { from: fromId, to: toId },
    );
    if (existing.length > 0) return;

    // Expanded per key rather than passed as a map: AGE rejects a whole-map
    // `CREATE (a)-[e:LABEL $props]->(b)`, the same limitation createNode()
    // works around.
    //
    // Not `buildPropertyClause()`, whose own comment says it is the shape this
    // method builds on -- it names each parameter after its key, and this query
    // already binds `$from` and `$to`. A property called `from` would silently
    // rebind the source node's natural id. Same validator, prefixed parameters.
    const entries = Object.entries(props ?? {});
    for (const [key] of entries) validateIdentifier(key, "edge property key");
    const assignment = entries.length
      ? ` {${entries.map(([k]) => `${k}: $p_${k}`).join(", ")}}`
      : "";

    let created: unknown[];
    try {
      // `RETURN e` so the caller can tell "created" from "matched nothing".
      // Lower-case on purpose: a camelCase RETURN name decodes as null.
      created = await this.query(
        `MATCH (a:${fromLabel} {natural_id: $from}), (b:${toLabel} {natural_id: $to}) CREATE (a)-[e:${edge}${assignment}]->(b) RETURN e`,
        { e: edgeColumn() },
        {
          from: fromId,
          to: toId,
          ...Object.fromEntries(entries.map(([k, v]) => [`p_${k}`, v])),
        },
      );
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return; // lost the race to a concurrent caller — same edge now exists, which is the desired end state
      throw err;
    }
    if (created.length > 0) return;

    // Nothing was created, so one of the endpoints did not match. Only now is
    // it worth two queries to say which -- this is the slow path, and it ends
    // in a throw.
    const fromRows = await this.query(`MATCH (n:${fromLabel} {natural_id: $id}) RETURN n`, { n: vertexColumn() }, { id: fromId });
    if (fromRows.length === 0) throw new Error(`source ${fromId} not found in tenant ${this.ctx.graphName}`);

    const toRows = await this.query(`MATCH (n:${toLabel} {natural_id: $id}) RETURN n`, { n: vertexColumn() }, { id: toId });
    if (toRows.length === 0) throw new Error(`target ${toId} not found in tenant ${this.ctx.graphName}`);

    // Both endpoints are there and the CREATE still matched nothing. Nothing
    // known produces this; say so loudly rather than returning as though the
    // edge exists, which is what a silent `return` here would claim.
    throw new Error(
      `${edge} ${fromId} -> ${toId}: both endpoints exist but CREATE matched nothing in tenant ${this.ctx.graphName}`,
    );
  }

  /**
   * The only sanctioned way to close a Decision — sets `is_open = false`
   * and `closed_at` together, in one Cypher `SET`, so the biconditional
   * invariant (`NODE_TYPES.Decision.validate`) can never be observed broken
   * between the two writes.
   */
  async closeDecision(naturalId: string, closedAt: string = new Date().toISOString()): Promise<void> {
    const rows = await this.query(`MATCH (n:Decision {natural_id: $id}) RETURN n`, { n: vertexColumn() }, { id: naturalId });
    if (rows.length === 0) throw new Error(`decision ${naturalId} not found in tenant ${this.ctx.graphName}`);

    await this.runner.execute(`MATCH (n:Decision {natural_id: $id}) SET n.is_open = false, n.closed_at = $closedAt`, {
      id: naturalId,
      closedAt,
    });
  }
}
