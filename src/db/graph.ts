/**
 * Graph-shaped half of the LabKit domain model (docs/project-journal/001_git_init.md).
 * Everything here is provenance/dependency structure — "why does this claim
 * hold", "what does invalidating this artefact break" — which is what Apache
 * AGE's graph queries are for, not what FK tables are for. `projects`
 * (src/db/schema.ts) is the one core entity that stays relational.
 */

export interface LabKitDB {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export const GRAPH_NAME = "labkit";

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
  "SUPPORTS", // Evidence -> Claim
  "CHALLENGES", // Evidence -> Claim
  "USES", // EvidenceUnit -> Computation
  "PRODUCES", // EvidenceUnit/Computation/Task -> Evidence/Artefact/Computation
  "RECORDED_IN", // Evidence -> Artefact
  "EVALUATED_AS", // Criterion -> CriterionEvaluation
  "TRIGGERS", // CriterionEvaluation -> Gate
  "GATES", // Criterion -> Task/Computation
  "CHANGES", // Decision -> Criterion
  "BASED_ON", // Decision -> Evidence
  "RESOLVES", // Decision -> Question
  "NARROWS", // Decision -> Question
  "DEFERS", // Decision -> Question
  "SUPERSEDES", // Decision -> Decision (an amendment is a decision with this edge)
  "EVALUATES", // Review -> Claim | Decision | Evidence
  "IMPLEMENTS", // Task -> EvidenceUnit
] as const;
export type EdgeLabel = (typeof EDGE_LABELS)[number];

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

export interface QuestionProps {
  project_id: string;
  name: string;
  is_open?: boolean;
}

export interface LineOfEnquiryProps {
  project_id: string;
  name: string;
}

export interface EvidenceUnitProps {
  project_id: string;
  role: EvidenceUnitRole;
}

export interface EvidenceProps {
  project_id: string;
  statement: string;
}

export interface ClaimProps {
  project_id: string;
  name: string;
  kind?: "exploratory" | "confirmatory";
}

export interface DecisionProps {
  project_id: string;
  reason: string;
  evidence: string;
  invalidation_check: string;
  is_open?: boolean;
  closed_at?: string;
}

export interface CriterionProps {
  project_id: string;
  proposition: string;
}

export interface CriterionEvaluationProps {
  value: string;
  outcome: "pass" | "fail";
  evaluated_at: string;
  evidence_ref?: string;
}

export interface GateProps {
  project_id: string;
  consequence: string;
}

export interface ReviewProps {
  project_id: string;
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

export interface AgtypeValue<T = Record<string, unknown>> {
  id: number;
  label: string;
  properties: T;
}

/**
 * A node as returned to callers outside the persistence layer: AGE's
 * internal graphid (`AgtypeValue.id`, a large opaque bigint — see
 * docs/project-journal/002_schema_dot_ts.md) is stripped and replaced with
 * the short, incrementing `natural_id` (e.g. `"COMP-123"`) that's safe to
 * show a user or an AI-agent caller.
 */
export interface PublicNode<T> {
  natural_id: string;
  label: NodeLabel;
  properties: T;
}

/**
 * Short display prefix per label for natural IDs (e.g. `Computation` ->
 * `"COMP-123"`). Scoped globally per entity-type, not per-project — decided
 * 2026-08-17. Must stay in sync with the per-label `CREATE SEQUENCE`
 * statements in drizzle/0002_natural_ids.sql; a mismatch here is a
 * code-review-visible diff in this one file, not a silent drift.
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

/** Strips AGE's `::vertex` / `::edge` suffix and parses the remaining agtype JSON. */
export function parseAgtype<T = Record<string, unknown>>(raw: string): AgtypeValue<T> {
  return JSON.parse(raw.replace(/::(vertex|edge)$/, ""));
}

/**
 * Per-session setup: `LOAD`/`search_path` are session-scoped in Postgres, so
 * every connecting process must call this itself — it can't be migrated
 * away like the one-time bootstrap (`CREATE EXTENSION`, `create_graph`,
 * `create_vlabel`/`create_elabel`) can. That one-time work now lives in
 * drizzle/0001_age_bootstrap.sql, applied once via src/db/migrate.ts.
 */
export async function bootstrapSession(db: LabKitDB): Promise<void> {
  await db.query(`LOAD 'age';`);
  await db.query(`SET search_path = ag_catalog, "$user", public;`);
}

/**
 * Runs a cypher query against the labkit graph. `asClause` must match the
 * RETURN arity, e.g. `"(n agtype)"` or `"(a agtype, b agtype)"` — AGE needs
 * the column list declared at the SQL level since it can't infer it.
 * `params` are passed as agtype and referenced with `$name` inside the query,
 * so caller-supplied values never get string-interpolated into the query text.
 */
export async function cypher<T = Record<string, unknown>>(
  db: LabKitDB,
  query: string,
  asClause: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const sql = params
    ? `SELECT * FROM cypher('${GRAPH_NAME}', $$ ${query} $$, $1) AS ${asClause};`
    : `SELECT * FROM cypher('${GRAPH_NAME}', $$ ${query} $$) AS ${asClause};`;
  const res = await db.query<T>(sql, params ? [JSON.stringify(params)] : undefined);
  return res.rows;
}

/** `{k: $k, ...}` clause plus the matching flat param object; AGE rejects passing a whole map as `$props`. */
function propPattern(props: Record<string, unknown>): string {
  return Object.keys(props)
    .map((k) => `${k}: $${k}`)
    .join(", ");
}

/**
 * Creates a single node and stamps it with a fresh natural id, in one round
 * trip. `label` is one of NODE_LABELS, never caller-controlled input — the
 * generator call's `label`/`prefix` arguments are template-interpolated
 * literals for that reason (`labkit_next_natural_id` in
 * drizzle/0002_natural_ids.sql), never passed through `props`/`$`-params.
 *
 * The `::text` casts on those two literals are required, not decorative:
 * AGE types bare Cypher string literals as `agtype`, and Postgres won't
 * resolve a `(text, text)` function overload against `agtype` arguments —
 * confirmed empirically against pglite-age before this was written this way.
 */
export async function createNode<T extends Record<string, unknown>>(
  db: LabKitDB,
  label: NodeLabel,
  props: T,
): Promise<PublicNode<T>> {
  const prefix = NATURAL_ID_PREFIX[label];
  const naturalIdClause = `natural_id: labkit_next_natural_id('${label.toLowerCase()}'::text, '${prefix}'::text)`;
  const propsClause = propPattern(props);
  const clause = propsClause ? `${propsClause}, ${naturalIdClause}` : naturalIdClause;

  const rows = await cypher<{ n: string }>(db, `CREATE (n:${label} {${clause}}) RETURN n`, "(n agtype)", props);
  const parsed = parseAgtype<T & { natural_id: string }>(rows[0]!.n);
  const { natural_id, ...properties } = parsed.properties;
  return { natural_id, label, properties: properties as unknown as T };
}

/**
 * Creates a directed edge between two existing nodes, matched by label and an
 * exact-match property (e.g. `{ name: "..." }`), analogous to a natural key
 * lookup. `fromLabel`/`edge`/`toLabel` are NodeLabel/EdgeLabel constants, never
 * caller-controlled input; only the match property *values* go through params.
 */
export async function createEdge(
  db: LabKitDB,
  fromLabel: NodeLabel,
  fromMatch: Record<string, unknown>,
  edge: EdgeLabel,
  toLabel: NodeLabel,
  toMatch: Record<string, unknown>,
): Promise<void> {
  const from = Object.fromEntries(Object.entries(fromMatch).map(([k, v]) => [`from_${k}`, v]));
  const to = Object.fromEntries(Object.entries(toMatch).map(([k, v]) => [`to_${k}`, v]));
  const fromPattern = Object.keys(fromMatch)
    .map((k) => `${k}: $from_${k}`)
    .join(", ");
  const toPattern = Object.keys(toMatch)
    .map((k) => `${k}: $to_${k}`)
    .join(", ");
  await cypher(
    db,
    `MATCH (a:${fromLabel} {${fromPattern}}), (b:${toLabel} {${toPattern}})
     CREATE (a)-[:${edge}]->(b)`,
    "(x agtype)",
    { ...from, ...to },
  );
}
