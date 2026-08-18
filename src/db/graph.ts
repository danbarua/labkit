/**
 * Graph-shaped half of the LabKit domain model (docs/project-journal/001_git_init.md),
 * revised per docs/project-journal/003_review_domain_tenancy.md and
 * docs/project-journal/004_tenancy_implementation_plan.md: one Apache AGE
 * graph per tenant (src/db/tenant.ts), addressed and mutated exclusively
 * through the `TenantGraph` class below — never a hardcoded graph name,
 * never an arbitrary property-map edge match, never AGE's internal graphid
 * past this file's boundary.
 */

import { LABKIT_SCHEMA } from "./schema";
import { parseAgtype, validateGraphName, buildPropertyClause, type AgtypeValue } from "./agtype";

export { parseAgtype, type AgtypeValue } from "./agtype";

export interface LabKitDB {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export const NODE_LABELS = [
  "Question",
  "LineOfEnquiry",
  "EvidenceUnit",
  "Evidence",
  "Claim",
  "Decision",
  "Criterion",
  "CriterionEvaluation",
  "Gate",
  "Review",
  "Artefact",
  "Computation",
  "Task",
] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];

export const EDGE_LABELS = [
  "MOTIVATES", // Question -> LineOfEnquiry
  "REQUIRES", // LineOfEnquiry -> Evidence
  "ADDRESSES", // EvidenceUnit -> LineOfEnquiry
  "SUPPORTS", // Evidence -> Claim
  "CHALLENGES", // Evidence -> Claim
  "USES", // EvidenceUnit -> Computation
  "PRODUCES", // EvidenceUnit/Computation/Task -> Evidence/Artefact/Computation
  "RECORDED_IN", // Evidence -> Artefact
  "EVALUATED_AS", // Criterion -> CriterionEvaluation
  "TRIGGERS", // CriterionEvaluation -> Gate
  "GATES", // Gate -> Task/Computation
  "CHANGES", // Decision -> Criterion
  "BASED_ON", // Decision -> Evidence | CriterionEvaluation -> Evidence
  "RESOLVES", // Decision -> Question
  "NARROWS", // Decision -> Question
  "DEFERS", // Decision -> Question
  "SUPERSEDES", // Decision -> Decision (an amendment is a decision with this edge)
  "EVALUATES", // Review -> Claim | Decision | Evidence
  "IMPLEMENTS", // Task -> EvidenceUnit
] as const;
export type EdgeLabel = (typeof EDGE_LABELS)[number];

/**
 * Single authoritative source of truth for legal edge shapes (PJ-003 §8).
 * `createEdge` validates the resolved `(fromLabel, toLabel)` pair against
 * this table and throws before issuing any Cypher if the pair isn't listed.
 *
 * `GATES`'s source is `Gate`, not `Criterion` (PJ-004 decision #9): the
 * shipped shape had `CriterionEvaluation -[:TRIGGERS]-> Gate` and
 * *separately* `Criterion -[:GATES]-> Task/Computation`, meaning nothing
 * ever flowed out of `Gate` — `Criterion` did the gating, contradicting
 * PJ-001's own definition of `Gate` as "the policy consequence attached to
 * an evaluation." The chain now actually chains:
 * `Criterion -[:EVALUATED_AS]-> CriterionEvaluation -[:TRIGGERS]-> Gate -[:GATES]-> Task/Computation`.
 */
export const EDGE_SCHEMA: Record<EdgeLabel, ReadonlyArray<readonly [NodeLabel, NodeLabel]>> = {
  MOTIVATES: [["Question", "LineOfEnquiry"]],
  REQUIRES: [["LineOfEnquiry", "Evidence"]],
  ADDRESSES: [["EvidenceUnit", "LineOfEnquiry"]],
  SUPPORTS: [["Evidence", "Claim"]],
  CHALLENGES: [["Evidence", "Claim"]],
  USES: [["EvidenceUnit", "Computation"]],
  PRODUCES: [
    ["EvidenceUnit", "Evidence"],
    ["EvidenceUnit", "Artefact"],
    ["Computation", "Artefact"],
    ["Task", "Computation"],
    ["Task", "Artefact"],
  ],
  RECORDED_IN: [["Evidence", "Artefact"]],
  EVALUATED_AS: [["Criterion", "CriterionEvaluation"]],
  TRIGGERS: [["CriterionEvaluation", "Gate"]],
  GATES: [["Gate", "Task"], ["Gate", "Computation"]],
  CHANGES: [["Decision", "Criterion"]],
  BASED_ON: [["Decision", "Evidence"], ["CriterionEvaluation", "Evidence"]],
  RESOLVES: [["Decision", "Question"]],
  NARROWS: [["Decision", "Question"]],
  DEFERS: [["Decision", "Question"]],
  SUPERSEDES: [["Decision", "Decision"]],
  EVALUATES: [["Review", "Claim"], ["Review", "Decision"], ["Review", "Evidence"]],
  IMPLEMENTS: [["Task", "EvidenceUnit"]],
};

export type EvidenceUnitRole =
  | "experiment"
  | "feasibility"
  | "verification"
  | "robustness"
  | "ablation"
  | "mechanistic"
  | "analysis"
  | "infrastructure"
  | "confirmatory";

// `project_id` removed from every *Props interface below (PJ-003 §4): the
// graph itself is the tenant partition now, not a repeated node property.

export interface QuestionProps {
  name: string;
}

export interface LineOfEnquiryProps {
  name: string;
}

export interface EvidenceUnitProps {
  role: EvidenceUnitRole;
}

export interface EvidenceProps {
  statement: string;
}

export interface ClaimProps {
  name: string;
  kind?: "exploratory" | "confirmatory";
}

/**
 * `is_open`/`closed_at` are kept as explicit operational state (PJ-004
 * decision #2) — narrowly scoped to "is this decision record still active
 * in the control process?", never "is the proposition scientifically
 * valid?" (that flows from evidence/supersession/review, never from these
 * fields). `evidence` (a string shadow of `Decision -[:BASED_ON]-> Evidence`)
 * is removed (PJ-003 §10).
 */
export interface DecisionProps {
  reason: string;
  invalidation_check: string;
  is_open?: boolean;
  closed_at?: string;
}

export interface CriterionProps {
  proposition: string;
}

// `evidence_ref` removed (PJ-004 decision #5) — represented in-graph now as
// `CriterionEvaluation -[:BASED_ON]-> Evidence` instead of a string shadow.
export interface CriterionEvaluationProps {
  value: string;
  outcome: "pass" | "fail";
  evaluated_at: string;
}

export interface GateProps {
  consequence: string;
}

export interface ReviewProps {
  verdict: string;
}

// verbatim property list from the journal's Artefact section
export interface ArtefactProps {
  kind: string;
  logical_name: string;
  content_hash?: string;
  uri?: string;
  external_ref?: string;
  invalidated?: boolean;
}

// verbatim property list from the journal's Computation section
export interface ComputationProps {
  kind: string;
  status: string;
  backend?: string;
  external_run_id?: string;
  started_at?: string;
  finished_at?: string;
  code_revision?: string;
  environment_ref?: string;
}

export interface TaskProps {
  objective: string;
  inputs: string;
  outputs: string;
  acceptance: string;
  is_open?: boolean;
}

/** Property-name lists per label, used only to build each tenant's CQRS view columns (src/db/tenant.ts). Keep in sync with the *Props interfaces above. */
export const NODE_VIEW_COLUMNS: Record<NodeLabel, readonly string[]> = {
  Question: ["name"],
  LineOfEnquiry: ["name"],
  EvidenceUnit: ["role"],
  Evidence: ["statement"],
  Claim: ["name", "kind"],
  Decision: ["reason", "invalidation_check", "is_open", "closed_at"],
  Criterion: ["proposition"],
  CriterionEvaluation: ["value", "outcome", "evaluated_at"],
  Gate: ["consequence"],
  Review: ["verdict"],
  Artefact: ["kind", "logical_name", "content_hash", "uri", "external_ref", "invalidated"],
  Computation: ["kind", "status", "backend", "external_run_id", "started_at", "finished_at", "code_revision", "environment_ref"],
  Task: ["objective", "inputs", "outputs", "acceptance", "is_open"],
};

/**
 * Short display prefix per label for natural IDs (e.g. `Computation` ->
 * `"COMP_123"`, underscore per PJ-004 decision #4). Scoped globally per
 * entity-type, not per-tenant. Must stay in sync with the per-label
 * `CREATE SEQUENCE` statements in drizzle/0002_natural_ids.sql.
 */
export const NATURAL_ID_PREFIX: Record<NodeLabel, string> = {
  Question: "Q",
  LineOfEnquiry: "LOE",
  EvidenceUnit: "EU",
  Evidence: "EV",
  Claim: "CLM",
  Decision: "DEC",
  Criterion: "CRIT",
  CriterionEvaluation: "CEVAL",
  Gate: "GATE",
  Review: "REV",
  Artefact: "ART",
  Computation: "COMP",
  Task: "TASK",
};

/** Reverse of NATURAL_ID_PREFIX — resolves a node's label from its natural id's prefix, e.g. "EU_17" -> "EvidenceUnit". */
export const LABEL_BY_PREFIX: Record<string, NodeLabel> = Object.fromEntries(
  NODE_LABELS.map((label) => [NATURAL_ID_PREFIX[label], label]),
) as Record<string, NodeLabel>;

function resolveLabelFromNaturalId(naturalId: string): NodeLabel {
  const sep = naturalId.indexOf("_");
  const prefix = sep === -1 ? naturalId : naturalId.slice(0, sep);
  const label = LABEL_BY_PREFIX[prefix];
  if (!label) throw new Error(`unrecognized natural id prefix in "${naturalId}"`);
  return label;
}

/**
 * Creation-time enforcement of per-label property invariants (PJ-004
 * decision #8) — `closeDecision()` alone can't be the whole story, since
 * generic `createNode()` would otherwise happily accept a pre-contradicted
 * Decision. Strict biconditional, tightened from decision #2's original
 * "may have closed_at" now that there's no legacy data to accommodate.
 */
const NODE_VALIDATORS: Partial<{ [L in NodeLabel]: (props: Record<string, unknown>) => Record<string, unknown> }> = {
  Decision: (props) => {
    const is_open = props.is_open ?? true;
    const closed_at = props.closed_at;
    if (is_open && closed_at) throw new Error("Decision.is_open=true cannot have closed_at set");
    if (!is_open && !closed_at) throw new Error("Decision.is_open=false requires closed_at");
    return { ...props, is_open };
  },
};

/**
 * A node as returned to callers outside the persistence layer: AGE's
 * internal graphid (`AgtypeVertex.id`, a large opaque number/bigint — see
 * src/db/agtype.ts) is stripped and replaced with the short, incrementing
 * `natural_id` that's safe to show a user or an AI-agent caller.
 */
export interface PublicNode<T> {
  natural_id: string;
  label: NodeLabel;
  properties: T;
}

/**
 * Per-session setup: `LOAD`/`search_path` are session-scoped in Postgres, so
 * every connecting process must call this itself — it can't be migrated
 * away like the one-time bootstrap (`CREATE EXTENSION`) can. Graph/label
 * provisioning is per-tenant runtime work now, not migrated at all — see
 * src/db/tenant.ts's provisionTenantGraph().
 */
export async function bootstrapSession(db: LabKitDB): Promise<void> {
  await db.query(`LOAD 'age';`);
  await db.query(`SET search_path = ag_catalog, "$user", public;`);
}

/**
 * The query/mutation surface for one tenant's graph. Bundles `ctx`/`db` once
 * instead of threading them through every call — every call site was going
 * to gain a `ctx: TenantContext` first parameter regardless (PJ-003 §5), so
 * this centralizes it, and gives `EDGE_SCHEMA` validation, natural-id ->
 * label resolution, and the `Decision` lifecycle invariant (`closeDecision`
 * + `NODE_VALIDATORS`) one non-arbitrary home instead of scattering them
 * across free functions.
 */
export class TenantGraph {
  constructor(
    private readonly ctx: { tenantId: number; graphName: string },
    private readonly db: LabKitDB,
  ) {
    // Validated once here, not per-call — graphName is immutable for this
    // instance's lifetime. Always server-derived (tenants.graph_name is a
    // generated column, PJ-003 §5) so this should never actually fail in
    // practice; still worth checking before it's string-interpolated into
    // every query this instance issues, rather than trusting that upstream
    // invariant silently.
    validateGraphName(ctx.graphName);
  }

  /**
   * Runs a cypher query against this tenant's graph. `asClause` must match
   * the RETURN arity, e.g. `"(n agtype)"` or `"(a agtype, b agtype)"` — AGE
   * needs the column list declared at the SQL level since it can't infer
   * it. `params` are passed as agtype and referenced with `$name` inside
   * the query, so caller-supplied values never get string-interpolated
   * into the query text.
   */
  async cypher<T = Record<string, unknown>>(query: string, asClause: string, params?: Record<string, unknown>): Promise<T[]> {
    const sql = params
      ? `SELECT * FROM ag_catalog.cypher('${this.ctx.graphName}', $$ ${query} $$, $1) AS ${asClause};`
      : `SELECT * FROM ag_catalog.cypher('${this.ctx.graphName}', $$ ${query} $$) AS ${asClause};`;
    const res = await this.db.query<T>(sql, params ? [JSON.stringify(params)] : undefined);
    return res.rows;
  }

  /**
   * Creates a single node and stamps it with a fresh natural id, in one
   * round trip. `label` is one of NODE_LABELS, never caller-controlled
   * input — the generator call's `label`/`prefix` arguments are
   * template-interpolated literals for that reason (`labkit_next_natural_id`
   * in drizzle/0002_natural_ids.sql), never passed through `props`/`$`-params.
   *
   * The `::text` casts on those two literals are required, not decorative:
   * AGE types bare Cypher string literals as `agtype`, and Postgres won't
   * resolve a `(text, text)` function overload against `agtype` arguments —
   * confirmed empirically against pglite-age before this was written this way.
   */
  async createNode<T extends Record<string, unknown>>(label: NodeLabel, props: T): Promise<PublicNode<T>> {
    const validated = (NODE_VALIDATORS[label]?.(props) ?? props) as T;
    const prefix = NATURAL_ID_PREFIX[label];
    const naturalIdClause = `natural_id: ${LABKIT_SCHEMA}.labkit_next_natural_id('${label.toLowerCase()}'::text, '${prefix}'::text)`;
    const propsClause = buildPropertyClause(validated);
    const clause = propsClause ? `${propsClause}, ${naturalIdClause}` : naturalIdClause;

    const rows = await this.cypher<{ n: string }>(`CREATE (n:${label} {${clause}}) RETURN n`, "(n agtype)", validated);
    const parsed = parseAgtype<T & { natural_id: string }>(rows[0]!.n);
    if (parsed.kind !== "vertex") throw new Error(`expected CREATE to return a vertex, got ${parsed.kind}`);
    const { natural_id, ...properties } = parsed.properties;
    return { natural_id, label, properties: properties as unknown as T };
  }

  /**
   * Creates a directed edge identified by natural IDs — never AGE's
   * internal graphid, never an arbitrary property-map match that could
   * silently address more than one node (PJ-003 §7). The label of each
   * endpoint is inferred from its natural-id prefix
   * (`resolveLabelFromNaturalId`), then validated as a legal `(fromLabel,
   * edge, toLabel)` combination against `EDGE_SCHEMA` before anything is
   * matched in the database. A missing source/target throws explicitly
   * rather than silently creating zero edges.
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
   * `src/db/tenant.ts`, confirmed to actually enforce uniqueness — a
   * duplicate `CREATE` raises a real Postgres `23505` error), and this
   * method catches exactly that error code and treats it as the same
   * successful no-op the fast-path check would have produced. The
   * uniqueness guarantee is real regardless of backend; the pre-check is
   * purely an optimization to avoid a wasted round trip in the common case.
   */
  async createEdge(fromId: string, edge: EdgeLabel, toId: string): Promise<void> {
    const fromLabel = resolveLabelFromNaturalId(fromId);
    const toLabel = resolveLabelFromNaturalId(toId);

    const allowed = EDGE_SCHEMA[edge].some(([f, t]) => f === fromLabel && t === toLabel);
    if (!allowed) {
      throw new Error(`${edge} does not allow ${fromLabel} -> ${toLabel} (natural ids ${fromId} -> ${toId})`);
    }

    const fromRows = await this.cypher(`MATCH (n:${fromLabel} {natural_id: $id}) RETURN n`, "(n agtype)", { id: fromId });
    if (fromRows.length === 0) throw new Error(`source ${fromId} not found in tenant ${this.ctx.graphName}`);

    const toRows = await this.cypher(`MATCH (n:${toLabel} {natural_id: $id}) RETURN n`, "(n agtype)", { id: toId });
    if (toRows.length === 0) throw new Error(`target ${toId} not found in tenant ${this.ctx.graphName}`);

    const existing = await this.cypher(
      `MATCH (:${fromLabel} {natural_id: $from})-[e:${edge}]->(:${toLabel} {natural_id: $to}) RETURN e`,
      "(e agtype)",
      { from: fromId, to: toId },
    );
    if (existing.length > 0) return;

    try {
      await this.cypher(
        `MATCH (a:${fromLabel} {natural_id: $from}), (b:${toLabel} {natural_id: $to}) CREATE (a)-[:${edge}]->(b)`,
        "(x agtype)",
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
   * invariant (`NODE_VALIDATORS.Decision`) can never be observed broken
   * between the two writes.
   */
  async closeDecision(naturalId: string, closedAt: string = new Date().toISOString()): Promise<void> {
    const rows = await this.cypher(`MATCH (n:Decision {natural_id: $id}) RETURN n`, "(n agtype)", { id: naturalId });
    if (rows.length === 0) throw new Error(`decision ${naturalId} not found in tenant ${this.ctx.graphName}`);

    await this.cypher(
      `MATCH (n:Decision {natural_id: $id}) SET n.is_open = false, n.closed_at = $closedAt`,
      "(n agtype)",
      { id: naturalId, closedAt },
    );
  }

  async dropGraph(): Promise<void> {
    await this.db.query(`SELECT * FROM ag_catalog.drop_graph('${this.ctx.graphName}', true);`);
  }
}
