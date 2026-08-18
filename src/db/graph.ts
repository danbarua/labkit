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
import { buildPropertyClause } from "./agtype";
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

  constructor(
    private readonly ctx: TenantContext,
    db: LabKitDB,
  ) {
    // CypherRunner validates ctx.graphName once, in its own constructor —
    // graphName is immutable for this instance's lifetime, and always
    // server-derived (tenants.graph_name is a generated column, PJ-003 §5),
    // so it should never fail in practice. Still worth checking before it's
    // interpolated into every query this instance issues.
    this.runner = new CypherRunner(db, ctx.graphName);
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
   */
  async createEdge(fromId: string, edge: EdgeLabel, toId: string): Promise<void> {
    const fromLabel = labelForNaturalId(fromId);
    const toLabel = labelForNaturalId(toId);

    const allowed = EDGE_SCHEMA[edge].some(([f, t]) => f === fromLabel && t === toLabel);
    if (!allowed) {
      throw new Error(`${edge} does not allow ${fromLabel} -> ${toLabel} (natural ids ${fromId} -> ${toId})`);
    }

    const fromRows = await this.query(`MATCH (n:${fromLabel} {natural_id: $id}) RETURN n`, { n: vertexColumn() }, { id: fromId });
    if (fromRows.length === 0) throw new Error(`source ${fromId} not found in tenant ${this.ctx.graphName}`);

    const toRows = await this.query(`MATCH (n:${toLabel} {natural_id: $id}) RETURN n`, { n: vertexColumn() }, { id: toId });
    if (toRows.length === 0) throw new Error(`target ${toId} not found in tenant ${this.ctx.graphName}`);

    const existing = await this.query(
      `MATCH (:${fromLabel} {natural_id: $from})-[e:${edge}]->(:${toLabel} {natural_id: $to}) RETURN e`,
      { e: edgeColumn() },
      { from: fromId, to: toId },
    );
    if (existing.length > 0) return;

    try {
      await this.runner.execute(
        `MATCH (a:${fromLabel} {natural_id: $from}), (b:${toLabel} {natural_id: $to}) CREATE (a)-[:${edge}]->(b)`,
        { from: fromId, to: toId },
      );
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return; // lost the race to a concurrent caller — same edge now exists, which is the desired end state
      throw err;
    }
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
