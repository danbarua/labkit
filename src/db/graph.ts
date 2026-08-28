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
  type MintedEdge,
} from "./domain";
import type { LabKitDB } from "./backend";
import type { Transactor } from "./transactor";
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
  /**
   * Natural ids minted since the last {@link drainMinted}.
   *
   * **Collected here rather than listed by callers**, because a caller that
   * mints three nodes and remembers two is a state nobody could see. A verb
   * writes an event saying what it created; that list has to come from the
   * thing doing the creating.
   *
   * Cleared when the outermost transaction settles — see {@link inTransaction}
   * — so a verb that throws before draining cannot leave its ids to be claimed
   * by the next one.
   */
  private minted: string[] = [];

  /**
   * Edges created since the last {@link drainMintedEdges}.
   *
   * The same argument as {@link minted}, made for the other half of a write.
   * That comment says a caller that mints three nodes and remembers two is a
   * state nobody could see; until 2026-08-28 an act's edges were a state nobody
   * could see *at all* — `createEdge` recorded nowhere, so `recordAnalysis`
   * wrote eight edges and the event log reported none of them.
   *
   * **Pushed only where a row came back**, which is one of `createEdge`'s three
   * exits and the only one that created anything. The duplicate check and the
   * `23505` race both end at an edge that exists and that *this* act did not
   * make; recording those would have two events claiming one edge. Same
   * semantics as `minted`: what this act brought into existence, not what it
   * found true afterwards.
   */
  private mintedEdges: MintedEdge[] = [];

  /**
   * `tx` is required and never defaulted. Two graphs over one connection must
   * share one boundary — `tests/helpers/scenario.ts`'s `current()` and
   * `tests/domain-graph.test.ts`'s two-tenant cases both build a second one —
   * and a defaulted transactor would give them a depth counter each. See
   * `./transactor.ts`.
   */
  constructor(
    private readonly ctx: TenantContext,
    db: LabKitDB,
    private readonly tx: Transactor,
  ) {
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
   * **The boundary itself is not this class's any more** — see
   * `./transactor.ts` for why it moved and what it would cost to move back.
   * What stays here is the one consequence of settling that only a graph knows
   * about: clearing {@link minted}. A verb that threw never reached its `emit`,
   * so its ids are still in the list, and clearing them when the *outermost*
   * transaction settles is what stops the next verb's event claiming to have
   * created records that were rolled back. On the success path `emit` has
   * already drained and it is a no-op.
   *
   * Note this is a *transaction* boundary, not a raw-string escape hatch: no
   * caller gains the ability to issue Cypher this class would not otherwise
   * run. See the file header.
   */
  async inTransaction<T>(work: () => Promise<T>): Promise<T> {
    // Asked **before** entering, and this is the whole subtlety. Inside the
    // transactor's `work` the depth is 1 for an outermost call *and* for one
    // nested inside it — a nested call joins rather than incrementing — so
    // testing it there makes an inner `inTransaction` clear the list before the
    // outer verb's `emit` has drained it, and the outer event then reports
    // creating nothing. Caught by `tests/event-store.test.ts`'s
    // "an act is found by what it created", which is exactly the case: three
    // verbs deep, one event.
    const outermost = this.tx.depth === 0;
    return this.tx.inTransaction(async () => {
      try {
        return await work();
      } finally {
        if (outermost) {
          this.minted.length = 0;
          this.mintedEdges.length = 0;
        }
      }
    });
  }

  /**
   * The natural ids minted since the last call, and clears them.
   *
   * Read once per event, by `WriteSurface.emit`. Draining rather than reading
   * is deliberate: two events in one transaction must not both claim the same
   * new records.
   */
  drainMinted(): string[] {
    return this.minted.splice(0);
  }

  /**
   * The edges created since the last call, and clears them.
   *
   * Drained per event alongside {@link drainMinted}, and for the same reason:
   * two events in one transaction must not both claim the same new edges.
   */
  drainMintedEdges(): MintedEdge[] {
    return this.mintedEdges.splice(0);
  }

  /**
   * Runs a read query against this tenant's graph. `columns` declares each
   * `RETURN`ed name and how to decode it (see src/db/cypher.ts's decoders) —
   * that one declaration produces both the SQL `AS` clause AGE requires and
   * the row type this resolves to.
   */
  async query<S extends RowSpec>(
    cypher: string,
    columns: S,
    params?: Record<string, unknown>,
  ): Promise<DecodedRow<S>[]> {
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
  async createNode<L extends NodeLabel>(
    label: L,
    props: NodePropsByLabel[L],
  ): Promise<PublicNode<L>> {
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
    this.minted.push(natural_id);
    return {
      natural_id,
      label,
      properties: properties as unknown as NodePropsByLabel[L],
    };
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
   * argument rather than a second `createEdge` with different properties.
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
    /**
     * Skip the duplicate check because at least one endpoint was created by
     * the *same* call and cannot already carry this edge.
     *
     * The check is not decoration: a `23505` raised inside `inTransaction`
     * poisons the enclosing Postgres transaction, so an idempotent re-call
     * would take a compound verb down with it. It costs a round trip per edge
     * — 284 of 1584 queries in `tests/scenarios/s11_invalidate_analysis.test.ts`,
     * 18% of that file — and where the endpoint was minted microseconds ago it
     * is buying a guarantee already held by construction.
     *
     * **Only pass this when a fresh node is an endpoint.** It is a claim about
     * the caller, not a preference, and `EDGE_SCHEMA` validation and endpoint
     * diagnosis are unaffected either way.
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
    if (!endpointIsNew) {
      const existing = await this.query(
        `MATCH (:${fromLabel} {natural_id: $from})-[e:${edge}]->(:${toLabel} {natural_id: $to}) RETURN e`,
        { e: edgeColumn() },
        { from: fromId, to: toId },
      );
      if (existing.length > 0) return;
    }

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
    if (created.length > 0) {
      this.mintedEdges.push({ from: fromId, label: edge, to: toId });
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
