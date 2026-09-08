/**
 * The query and mutation surface for one tenant's graph.
 *
 * One AGE graph per tenant, reached only through `TenantGraph`. No hardcoded graph name, no
 * property-map edge match, and no AGE graphid past this file.
 */

import { LABKIT_SCHEMA } from "./schema";
import { buildPropertyClause, validateIdentifier } from "./agtype";
import {
  CypherRunner,
  edge as edgeColumn,
  vertex as vertexColumn,
  type DecodedRow,
  type RowSpec,
} from "./cypher";
import {
  EDGE_SCHEMA,
  NODE_TYPES,
  labelForNaturalId,
  type EdgeLabel,
  type NodeLabel,
  type NodePropsByLabel,
  type PublicNode,
  type EdgeProps,
} from "./domain";
import type { LabKitDB } from "./backend";
import type { Transactor } from "./transactor";
import type { TenantContext } from "./tenant";

/**
 * Bundles `ctx`/`db` once instead of threading a `TenantContext` through every call, and gives
 * `EDGE_SCHEMA` validation, natural-id -> label resolution and the `Decision` lifecycle
 * invariant one home rather than scattering them across free functions.
 */
export class TenantGraph {
  private readonly runner: CypherRunner;
  /**
   * `tx` is required and never defaulted.
   */
  constructor(
    private readonly ctx: TenantContext,
    private readonly db: LabKitDB,
    private readonly tx: Transactor,
  ) {
    // CypherRunner validates ctx.graphName once, in its own constructor —
    // graphName is immutable for this instance's lifetime, and always
    // server-derived (`tenants.graph_name` is a generated column), so it should
    // never fail in practice. Still worth checking before it is
    // interpolated into every query this instance issues.
    this.runner = new CypherRunner(db, ctx.graphName);
  }

  /**
   * Runs `work` inside one database transaction: everything it writes commits together, or none
   * of it does.
   */
  async inTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.tx.inTransaction(work);
  }

  /**
   * Runs a read query against this tenant's graph. `columns` declares each `RETURN`ed name and
   * how to decode it (see src/db/cypher.ts's decoders) — that one declaration produces both the
   * SQL `AS` clause AGE requires and the row type this resolves to.
   */
  async query<S extends RowSpec>(
    cypher: string,
    columns: S,
    params?: Record<string, unknown>,
  ): Promise<DecodedRow<S>[]> {
    return this.runner.query(cypher, columns, params);
  }

  /**
   * Reserves the next natural id for a label, creating nothing.
   */
  async reserveId(label: NodeLabel): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT ${LABKIT_SCHEMA}.labkit_next_natural_id($1::text, $2::text) AS id`,
      [label.toLowerCase(), NODE_TYPES[label].prefix],
    );
    const reserved = rows[0];
    if (!reserved) throw new Error(`reserving an id for ${label} returned no rows`);
    return reserved.id;
  }

  /**
   * Creates a single node. `label` selects the property shape (`NodePropsByLabel`), so passing
   * another label's props is a compile error.
   */
  async createNode<L extends NodeLabel>(
    label: L,
    props: NodePropsByLabel[L],
    id?: string,
  ): Promise<PublicNode<L>> {
    const nodeType = NODE_TYPES[label];
    const validated = nodeType.validate ? nodeType.validate(props) : props;
    const naturalIdClause =
      id === undefined
        ? `natural_id: ${LABKIT_SCHEMA}.labkit_next_natural_id('${label.toLowerCase()}'::text, '${nodeType.prefix}'::text)`
        : `natural_id: $__reserved_id`;
    const propsClause = buildPropertyClause(validated as unknown as Record<string, unknown>);
    const clause = propsClause ? `${propsClause}, ${naturalIdClause}` : naturalIdClause;

    const rows = await this.query(
      `CREATE (n:${label} {${clause}}) RETURN n`,
      { n: vertexColumn<NodePropsByLabel[L] & { natural_id: string }>() },
      {
        ...(validated as unknown as Record<string, unknown>),
        ...(id === undefined ? {} : { __reserved_id: id }),
      },
    );
    const created = rows[0];
    if (!created) throw new Error(`CREATE (n:${label}) returned no rows`);

    const { natural_id, ...properties } = created.n.properties;
    return {
      natural_id,
      label,
      properties: properties as unknown as NodePropsByLabel[L],
    };
  }

  /** Sets one property on an existing node. */
  async setNodeProperty(id: string, key: string, value: unknown): Promise<void> {
    const label = labelForNaturalId(id);
    validateIdentifier(key, "property name");
    const rows = await this.query(
      `MATCH (n:${label} {natural_id: $id}) SET n.${key} = $value RETURN n`,
      { n: vertexColumn<{ natural_id: string }>() },
      { id, value },
    );
    if (rows.length === 0) throw new Error(`no ${label} ${id} to set ${key} on`);
  }

  /**
   * Creates a directed edge identified by natural IDs — never AGE's internal graphid, never an
   * arbitrary property-map match that could silently address more than one node.
   */
  async createEdge(
    fromId: string,
    edge: EdgeLabel,
    toId: string,
    // `number[]` because one CONSUMES edge has to carry every position at which
    // its artefact was read: `(from, label, to)` is this method's identity and
    // a repeat is a no-op, so a run that read one record twice cannot be two
    // edges. See `recorded()`.
    props?: Record<string, string | number | boolean | number[]>,
    /**
     * Skip the duplicate check because at least one endpoint was created by the *same* call and
     * cannot already carry this edge.
     */
    endpointIsNew = false,
  ): Promise<void> {
    const fromLabel = labelForNaturalId(fromId);
    const toLabel = labelForNaturalId(toId);

    const allowed = EDGE_SCHEMA[edge].some(([f, t]) => f === fromLabel && t === toLabel);
    if (!allowed) {
      throw new Error(
        `${edge} does not allow ${fromLabel} -> ${toLabel} (natural ids ${fromId} -> ${toId})`,
      );
    }

    // **The endpoints are not checked up front**, which would cost three round trips per edge
    // before a single byte is written. The `CREATE` below matches both endpoints itself: if
    // either is missing the pattern binds nothing, the statement creates nothing and returns
    // **no rows** — the same information a check would buy.
    if (!endpointIsNew) {
      const existing = await this.query(
        `MATCH (:${fromLabel} {natural_id: $from})-[e:${edge}]->(:${toLabel} {natural_id: $to}) RETURN e`,
        { e: edgeColumn() },
        { from: fromId, to: toId },
      );
      if (existing.length > 0) return;
    }

    // Expanded per key rather than passed as a map: AGE rejects a whole-map `CREATE
    // (a)-[e:LABEL $props]->(b)`, the same limitation createNode() works around. Not
    // `buildPropertyClause()`, whose own comment says it is the shape this method builds on --
    // it names each parameter after its key, and this query already binds `$from` and `$to`.
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
    if (created.length > 0) {
      return;
    }

    // Nothing was created, so one of the endpoints did not match. Only now is
    // it worth two queries to say which -- this is the slow path, and it ends
    // in a throw.
    const fromRows = await this.query(
      `MATCH (n:${fromLabel} {natural_id: $id}) RETURN n`,
      { n: vertexColumn() },
      { id: fromId },
    );
    if (fromRows.length === 0)
      throw new Error(`source ${fromId} not found in tenant ${this.ctx.graphName}`);

    const toRows = await this.query(
      `MATCH (n:${toLabel} {natural_id: $id}) RETURN n`,
      { n: vertexColumn() },
      { id: toId },
    );
    if (toRows.length === 0)
      throw new Error(`target ${toId} not found in tenant ${this.ctx.graphName}`);

    // Both endpoints are there and the CREATE still matched nothing. Nothing
    // known produces this; say so loudly rather than returning as though the
    // edge exists, which is what a silent `return` here would claim.
    throw new Error(
      `${edge} ${fromId} -> ${toId}: both endpoints exist but CREATE matched nothing in tenant ${this.ctx.graphName}`,
    );
  }
}
