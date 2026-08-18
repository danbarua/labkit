# PJ-004: Implementation plan for PJ-003 (domain & tenancy review)

**Status: implemented (2026-08-18).** P0/P0/P1/P1 all landed as planned, with
one deviation from the plan as originally written — decision #7's `MERGE`
choice turned out broken under `pglite-age` and was replaced with an
explicit check-then-`CREATE`, corrected in place below rather than left
stale. See that section for the detail.

Concrete, file-level plan for implementing `docs/project-journal/003_review_domain_tenancy.md`
against the current `main`. Originally written before implementation began;
now doubles as the record of what actually shipped.

**License to rewrite history:** there is no persistent/deployed database yet.
Every migration touched below is edited or replaced in place — `0000`,
`0001`, `0002` come out the other side looking like they were written this
way from the start. No `0003_rename_projects_to_tenants.sql`-style migration
stacked on top of a design we're actively disowning. If a real database ever
exists before this lands, this paragraph is void and the plan needs a rewrite
pass to become additive instead.

---

## Decisions (resolved 2026-08-18)

### 1. CQRS views under graph-per-tenant — (a), as recommended

`provisionTenantGraph()` creates the 13 views inside each tenant's own
schema (`labkit_t1.questions`, not a global `labkit_questions`). Read access
becomes `SELECT * FROM "${ctx.graphName}".questions`.

### 2. `Decision.is_open` / `Decision.closed_at` — keep, with a locked-down meaning

Keep both, as recommended — but narrower than a bare "keep": these fields
mean exactly one thing and must not be allowed to acquire a second meaning
by accretion.

```text
Decision.is_open / closed_at answer:
    "is this decision record still active in the control process?"

They do NOT answer:
    "is the proposition embodied by this decision scientifically valid?"
```

Validity keeps flowing from evidence, supersession, review, and dependency
state — never from these two fields. `Question.is_open` is removed (it
duplicates `Decision -[:RESOLVES]-> Question` outright, which is the actual
distinction between the two: Question's openness *is* a graph fact,
Decision's is administrative state the graph has no opinion on).

**Lifecycle integrity rule** (ordinary operational integrity, not graph-derived
epistemics):

- `is_open = true` implies `closed_at = null`
- `is_open = false` may have `closed_at` set
- setting `closed_at` should normally also set `is_open = false`

This pairing is exactly what a raw `SET n.is_open = ..., n.closed_at = ...`
call can't be trusted to preserve across every call site — see
`TenantGraph.closeDecision()` below, the one sanctioned way to close a
decision, so the invariant lives in one place instead of being re-derived
(or forgotten) at every caller.

### 3. `tenants.id` type — serial, as recommended (unchanged, no objection raised)

`graph_name` as a generated column: `text generated always as
('labkit_t' || id) stored`.

### 4. Natural-ID separator — underscore, not hyphen

`EU_17`, `COMP_42`, not `EU-17`/`COMP-42` — avoids a hyphen↔underscore
mapping step for user-facing IDs. This changes:

- `labkit_next_natural_id()` in `drizzle/0002_natural_ids.sql`:
  `prefix || '-' || nextval(...)` → `prefix || '_' || nextval(...)`.
- Every regex/example in this doc, PJ-002 (historical — leave as-is,
  it's a record of what was true when written), the postgres-age skill, and
  `tests/domain-graph.test.ts`'s `toMatch(/^Q-\d+$/)`-style assertions
  (→ `/^Q_\d+$/`).
- Natural-id → label resolution (needed for `createEdge`, see below) parses
  on the **first** `_`, since no prefix contains one:
  `naturalId.slice(0, naturalId.indexOf("_"))`.

### 5. `CriterionEvaluation.evidence_ref` — replace with an edge now, not later

PJ-003 §10 allowed deferring this ("add the edge only if the use case is
required now"). Decision: don't defer — if it can be represented in-graph,
keep it in-graph rather than leaving a string-reference gap to fill in
later. Add `CriterionEvaluation -[:BASED_ON]-> Evidence` by extending
`BASED_ON`'s allowed pairs (see `EDGE_SCHEMA` below) rather than inventing a
new edge label — `BASED_ON` already means "this record's conclusion rests on
this evidence," which is exactly what `evidence_ref` was gesturing at.
`evidence_ref` is removed from `CriterionEvaluationProps` with this as its
direct replacement, not a someday-maybe.

### 6. Tenant provisioning is serialized as a whole, not statement-by-statement

Superseded from the first draft's "check-then-create, tolerate the specific
already-exists error" — that leaves room for two processes interleaving
*partial* provisioning across the graph/13 labels/19 labels/13 indexes/13
views sequence. `provisionTenantGraph()` now wraps the whole sequence in one
transaction guarded by a transaction-scoped `pg_advisory_xact_lock(tenantId)`
(see P0 below) — the contract is "serialized per tenant, idempotent as a
whole," not "each statement happens to survive a race."

### 7. `createEdge` is idempotent — check-then-`CREATE`, not `MERGE` (revised post-spike)

`(from natural_id, edge label, to natural_id)` identifies a relationship
uniquely; calling `createEdge` twice with the same three values is a
no-op, not a duplicate parallel edge. Necessary because an MCP mutation
surface has to assume agent retries.

**This decision's original text said "implemented via Cypher `MERGE`" — the
pre-implementation spike this section called for found `MERGE` broken under
pglite-age.** `MATCH (a...), (b...) MERGE (a)-[:EDGE]->(b)` runs without
error and returns what looks like a valid edge, but the created edge's
`start_id`/`end_id` are both `0` (confirmed via `id(a)`/`id(b)`, which
resolve correctly, while the merged edge never actually connects them).
Shipped instead: an explicit `MATCH` for an existing edge before `CREATE`,
inside `TenantGraph.createEdge()`. This leaves a narrow check-then-create
race under concurrent callers that atomic `MERGE` would have closed — moot
under PGlite's single-writer architecture (same reasoning as decision #6's
lock being uncontended there), and a real gap only for a future
direct-Postgres backend, where it's a known, documented, revisit-if-`MERGE`-
ever-gets-fixed limitation rather than a silent one (see
`.claude/skills/postgres-age/SKILL.md`'s gotchas and
`examples/full-lifecycle.md`'s spike-outcomes checklist).

### 8. Decision lifecycle invariant enforced at creation, not just at closure

`closeDecision()` alone leaves `createNode("Decision", { is_open: true,
closed_at: "..." })` able to construct a contradiction straight through the
generic creation path. A `NODE_VALIDATORS` map (`Decision` today, nothing
else yet — not a bespoke method per label) runs before `createNode` issues
its `CREATE`. The rule itself is tightened while there's no legacy data to
accommodate: `is_open` and `closed_at` are now a strict biconditional
(`is_open ⟺ closed_at absent`), not decision #2's original one-directional
"`is_open = false` **may** have `closed_at`" — no ambiguous third state.

### 9. `Gate` reconnected to what it actually gates

`GATES`'s source changes from `Criterion` to `Gate` in `EDGE_SCHEMA` — see
the full rationale under "Edge-shape validation" in P0 below. Writing
`EDGE_SCHEMA` down as one authoritative table is what surfaced this; it
predates PJ-004 but was invisible while the two edges (`TRIGGERS`, `GATES`)
lived as separate, uncompared facts.

---

## P0: tenant namespace

### `src/db/schema.ts`

Replace `projects` with `tenants`:

```ts
export const tenants = p.pgTable("tenants", {
  id: p.serial().primaryKey(),
  slug: p.text().notNull().unique(),        // e.g. "labkit" — user-facing, NEVER used to derive graph_name directly
  display_name: p.text().notNull(),
  graph_name: p.text().generatedAlwaysAs((): SQL => sql`'labkit_t' || id`).notNull(),
  created_at: p.timestamp().defaultNow().notNull(),
});
export type Tenant = typeof tenants.$inferSelect;
```

(Exact Drizzle `generatedAlwaysAs` syntax needs a quick doc check when this
is implemented — the principle is fixed, the API call may differ slightly
from the sketch above.)

### `drizzle/0000_*.sql`

Regenerate from the `tenants` schema above (rewritten in place, per the
license at the top of this doc — not a new migration).

### `drizzle/0001_age_bootstrap.sql`

Shrinks to extensions only:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
```

Everything graph-specific (`create_graph`, `create_vlabel`/`create_elabel`,
per-label indexes, and per-label views — decision #1) moves out of the
static migration and into `provisionTenantGraph()`, run once per tenant at
tenant-resolution time rather than once globally at deploy time.
This is the one genuinely new architectural concept this plan introduces:
**one-time global setup (migrations) vs. per-tenant runtime provisioning
(application code)** are now different things with different lifecycles.

### `drizzle/0002_natural_ids.sql`

Keeps the global, tenant-independent parts (natural IDs are explicitly
*globally* allocated per PJ-003 §12): the 13 `CREATE SEQUENCE` statements,
`labkit_next_natural_id()`, `labkit_prop()`. Drops the 13
`CREATE UNIQUE INDEX ... ON labkit."Label"` and 13 `CREATE VIEW labkit_*`
statements — those referenced the fixed `labkit` schema and move into
`provisionTenantGraph()` (both indexes and views, per decision #1).

### `src/db/tenant.ts` (new)

```ts
export interface TenantContext {
  tenantId: number;
  graphName: string;
}

export async function resolveTenantContext(db: LabKitDB, slug = "labkit"): Promise<TenantContext> {
  // insert-or-fetch by slug via ON CONFLICT (slug) DO NOTHING — this alone
  // is already race-safe (Postgres's unique constraint does the serializing,
  // no app-level lock needed for the row itself), returning
  // { tenantId, graphName } from the row — graph_name is read back from the
  // DB (the generated column), never reconstructed client-side from slug or
  // any other user-controlled value.
  // Then: await provisionTenantGraph(db, tenantId, graphName).
}

async function provisionTenantGraph(db: LabKitDB, tenantId: number, graphName: string): Promise<void> {
  // Contract: serialized per tenant, idempotent AS A WHOLE — not "each
  // individual DDL statement happens to survive a race" (decision #6).
  await db.query("BEGIN");
  try {
    // Transaction-scoped advisory lock keyed by tenantId: a second process
    // provisioning the same tenant blocks here until the first COMMITs,
    // then sees the graph already exists (below) and does nothing further.
    // Auto-released on COMMIT/ROLLBACK, so a crash mid-provisioning can't
    // leave a stale lock the way the old PID-lockfile pattern could.
    await db.query("SELECT pg_advisory_xact_lock($1)", [tenantId]);

    const existing = await db.query(`SELECT 1 FROM ag_catalog.ag_graph WHERE name = $1`, [graphName]);
    if (existing.rows.length === 0) {
      // create_graph; create_vlabel for every NODE_LABELS entry;
      // create_elabel for every EDGE_LABELS entry (count intentionally not
      // stated here — read it off the array in the implementation, not off
      // this prose); per-label UNIQUE functional index on natural_id; per
      // decision #1, per-label CREATE VIEW — all inside this one
      // transaction, all as one atomic "this tenant is now provisioned".
    }
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}
```

On PGlite, this lock is uncontended in practice (PGlite is already
single-writer — every mutation funnels through the one primary process
regardless), but the code path is identical across backends: no
backend-conditional branch, `pg_advisory_xact_lock` is a normal Postgres
builtin either way. The win isn't concurrency control PGlite didn't already
have — it's that provisioning becomes one atomic unit instead of thirteen-
plus independent racy statements, which matters the moment a second backend
(or a future "add a label to an existing tenant" migration path) actually
has concurrent writers.

### `src/db/graph.ts` → a `TenantGraph` class, not `ctx`-threaded free functions

Every mutating/query function in `graph.ts` was about to gain a `ctx:
TenantContext` first parameter — the same two values (`ctx`, `db`) repeated
at every call site, for the rest of the file's life. Since every call site
is already being touched for this change, this is the free moment to
centralize instead: a small class holding `ctx`/`db` once, with the
existing free functions becoming its methods. This isn't a new abstraction
for its own sake — it's the natural home for two things this plan already
needs and would otherwise have nowhere non-arbitrary to live:

- `EDGE_SCHEMA` validation and natural-id → label resolution, which
  `createEdge` needs internally regardless of whether it's a method or a
  function;
- `closeDecision()` (decision #2's lifecycle-integrity rule) — a
  `Decision.is_open`/`closed_at` mutation helper needs to be the *only*
  sanctioned way to touch those two fields together, which is much easier
  to make true of one method on a class than to enforce by convention
  across every call site that might otherwise reach for a raw `SET`.
- `NODE_VALIDATORS` (decision #8) — the same lifecycle invariant has to hold
  at *creation* too, not just at `closeDecision()`-time, since generic
  `createNode()` would otherwise happily accept a pre-contradicted Decision.

Kept as plain module-level exports (label/schema-level constants, not
per-connection state): `NODE_LABELS`, `EDGE_LABELS`, `NATURAL_ID_PREFIX`,
`LABEL_BY_PREFIX`, `EDGE_SCHEMA`, `NODE_VALIDATORS`, `parseAgtype`, all the
`*Props` types. Kept as free functions (bootstrap concerns, not ongoing
graph operations): `resolveTenantContext()`, `provisionTenantGraph()`,
`bootstrapSession()`.

```ts
export class TenantGraph {
  constructor(private readonly ctx: TenantContext, private readonly db: LabKitDB) {}

  async cypher<T>(query: string, asClause: string, params?: Record<string, unknown>): Promise<T[]> {
    // same as today's free cypher(), using this.ctx.graphName instead of GRAPH_NAME
  }

  async createNode<T extends Record<string, unknown>>(label: NodeLabel, props: T): Promise<PublicNode<T>> {
    // NODE_VALIDATORS[label]?.(props) ?? props first (decision #8), THEN
    // the rest is unchanged from today's createNode() body, just
    // `this.cypher(...)` instead of a passed-in db.
  }

  async createEdge(fromId: string, edge: EdgeLabel, toId: string): Promise<void> {
    // resolve both labels via resolveLabelFromNaturalId(), validate the
    // pair against EDGE_SCHEMA[edge], MATCH both by natural_id, throw if
    // either is missing, then MERGE (not CREATE) the edge — decision #7,
    // (from natural_id, edge, to natural_id) is a unique key, so a retried
    // call is a no-op rather than a duplicate parallel edge.
  }

  async closeDecision(naturalId: string, closedAt: string = new Date().toISOString()): Promise<void> {
    // SET n.is_open = false, n.closed_at = $closedAt in one Cypher SET —
    // the only sanctioned way to close a Decision. Together with
    // NODE_VALIDATORS.Decision at creation time (decision #8), the pairing
    // invariant now holds at every point a Decision's lifecycle fields can
    // change, not just at closure.
  }
}

// decision #8: creation-time enforcement, so the invariant can't be
// bypassed by handing createNode() an already-contradictory Decision.
// Tightened per review: no ambiguous third state while there's no legacy
// data to accommodate — is_open and closed_at are a strict biconditional,
// not "closed MAY have closed_at".
const NODE_VALIDATORS: Partial<{ [L in NodeLabel]: (props: Record<string, unknown>) => Record<string, unknown> }> = {
  Decision: (props) => {
    const is_open = props.is_open ?? true;
    const closed_at = props.closed_at;
    if (is_open && closed_at) throw new Error("Decision.is_open=true cannot have closed_at set");
    if (!is_open && !closed_at) throw new Error("Decision.is_open=false requires closed_at");
    return { ...props, is_open };
  },
};
```

`src/db/graph.ts` keeps the constants/types/free-bootstrap-functions above;
the class itself can live in the same file or a new `src/db/tenant-graph.ts`
— naming/file split is an implementation-time call, not a design one.

Removed regardless of the class question: `export const GRAPH_NAME =
"labkit"` (superseded by `ctx.graphName`), and `project_id` from all 13
`*Props` interfaces (see the dedicated section below — this is the one
change that touches almost every file).

### Everything that calls into `graph.ts`

`tests/domain-graph.test.ts`, `examples/full-lifecycle.ts`: every call site
becomes `const graph = new TenantGraph(ctx, db); await graph.createNode(...)`
instead of a free-function call, `ctx`/`db` resolved once per
test/script via `resolveTenantContext(db)`.

---

## P0: graph mutation integrity

### Natural-ID-based edge addressing

```ts
// method on TenantGraph — see above
async createEdge(
  fromId: string,   // e.g. "EU_17" — label is inferred from the prefix
  edge: EdgeLabel,
  toId: string,      // e.g. "COMP_42"
): Promise<void>
```

Label inference: build `LABEL_BY_PREFIX: Record<string, NodeLabel>` as the
reverse of `NATURAL_ID_PREFIX`, parse the prefix off `fromId`/`toId` by
slicing to the first `_` (decision #4 — prefixes themselves never contain
one), look up the label, then `MATCH (n:${label} {natural_id: $id})` in
`this.ctx.graphName`. If either match returns zero rows, throw explicitly
("source EU_17 not found in tenant labkit_t1") rather than silently creating
zero edges — this is the acceptance-test requirement in PJ-003 §15
("missing source/target fails explicitly").

Because `natural_id` is now DB-uniqueness-enforced (PJ-002) and the sole
match key, "multiple endpoint matching" (the arbitrary-property-map risk
PJ-003 §7 flags) becomes structurally impossible — a natural_id lookup
returns at most one row by construction, not by caller discipline.

**Edge idempotency (decision #7):** `(from natural_id, edge label, to
natural_id)` is a unique key for a relationship — calling `createEdge` twice
with the same three values must be a no-op, not a second parallel edge, so
agent retries (an MCP mutation surface has to assume retries) are safe by
construction rather than by caller discipline. The actual Cypher clause is
`MERGE (a)-[:${edge}]->(b)` (both `a`/`b` already bound by the preceding
`MATCH`), not `CREATE` — Cypher's `MERGE` matches-or-creates, `CREATE`
always creates. `MERGE` is in AGE's clause list but hasn't been exercised by
this codebase yet (everything so far used `CREATE`) — spike it against
`pglite-age` before relying on it, same discipline as every other syntax
claim in this plan. If a domain need for *multiple distinct observations* of
the same `(from, edge, to)` triple ever shows up, that's a signal for a new
node or edge properties with their own identity — not a reason to make
edges non-unique again.

### Edge-shape validation

```ts
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
  GATES: [["Gate", "Task"], ["Gate", "Computation"]], // decision #9 — source fixed from Criterion to Gate, see below
  CHANGES: [["Decision", "Criterion"]],
  BASED_ON: [["Decision", "Evidence"], ["CriterionEvaluation", "Evidence"]], // 2nd pair: decision #5, replaces evidence_ref
  RESOLVES: [["Decision", "Question"]],
  NARROWS: [["Decision", "Question"]],
  DEFERS: [["Decision", "Question"]],
  SUPERSEDES: [["Decision", "Decision"]],
  EVALUATES: [["Review", "Claim"], ["Review", "Decision"], ["Review", "Evidence"]],
  IMPLEMENTS: [["Task", "EvidenceUnit"]],
};
```

`createEdge` looks up the resolved `(fromLabel, toLabel)` pair for `edge` in
`EDGE_SCHEMA` and throws before issuing any Cypher if the pair isn't listed
— validation happens against the labels resolved from the natural-id
prefixes, so it's driven by the same single source of truth `createEdge`
already needed for addressing, not a second parallel definition. This one
table is both the runtime guard and (via `(typeof EDGE_SCHEMA)[E][number]`
if it turns out worth the type-level ceremony) the closest thing to
compile-time typing PJ-003 §8 asks for "where practical" — full
per-edge-label overloads aren't worth building given the label is only
known at runtime (parsed from a natural-id string), not at the call site.

**Decision #9 — `Gate` was structurally disconnected from what it governs.**
Before this table existed as a single authoritative artifact, the shipped
shape was `CriterionEvaluation -[:TRIGGERS]-> Gate` *and separately*
`Criterion -[:GATES]-> Task/Computation` — meaning nothing ever actually
flowed out of `Gate`; `Criterion` (not `Gate`) was what gated the task or
computation. That contradicts PJ-001's own definitions (`Criterion`: an
evaluable proposition; `Gate`: the *policy consequence* attached to an
evaluation). Writing `EDGE_SCHEMA` down as one table made the disconnect
visible, so it's fixed here rather than frozen: `GATES`'s source becomes
`Gate`, not `Criterion`. The full chain now actually chains:
`Criterion -[:EVALUATED_AS]-> CriterionEvaluation -[:TRIGGERS]-> Gate -[:GATES]-> Task/Computation`.
No existing shipped code creates a `GATES` edge yet (only `EVALUATED_AS`/
`TRIGGERS` are exercised in `tests/domain-graph.test.ts` today), so this is
a zero-cost correction, not a migration.

### `ADDRESSES` edge

Add to `EDGE_LABELS`, `EDGE_SCHEMA` (above), and `provisionTenantGraph`'s
`create_elabel` list.

---

## P1: remove dual truth

Per decision #2: remove `Question.is_open` (fully derived from `Decision
-[:RESOLVES]-> Question`) and `Decision.evidence` (duplicates `Decision
-[:BASED_ON]-> Evidence`). Keep `Decision.is_open`/`closed_at`, with the
narrow meaning and lifecycle-integrity rule locked down in decision #2 above.
Per decision #5, remove `CriterionEvaluation.evidence_ref` and replace it
with `CriterionEvaluation -[:BASED_ON]-> Evidence` (extending `BASED_ON`'s
allowed pairs in `EDGE_SCHEMA`, not a new edge label) — built now, since it
can be done entirely in-graph.

**`project_id` removal fallout** (mechanical, but touches nearly every file
from the last iteration — enumerating so nothing gets missed mid-implementation):

- `src/db/graph.ts`: drop `project_id` from `QuestionProps`, `LineOfEnquiryProps`,
  `EvidenceUnitProps`, `EvidenceProps`, `ClaimProps`, `DecisionProps`,
  `CriterionProps`, `GateProps`, `ReviewProps` (9 of the 13 interfaces — the
  other 4 — `CriterionEvaluationProps`, `ArtefactProps`, `ComputationProps`,
  `TaskProps` — never had it).
- `tests/domain-graph.test.ts`: every fixture/seed function currently passing
  `project_id: "p1"` (or similar) loses that field — tenancy is now the
  connection-level/`ctx`-level partition, not a per-node property.
- `examples/full-lifecycle.ts`: same — every `createNode` call drops
  `project_id`, and the script's `getOrCreateProject`/`project` variable
  becomes `resolveTenantContext`/`ctx`.
- Add a new tenant-isolation test asserting the removal actually achieved
  its purpose: two tenants can hold nodes with identical properties (e.g.
  two `Claim`s both named `"x"`) without any query crossing between them,
  and a `createEdge` call cannot address a node that lives in a different
  tenant's graph (PJ-003 §15 "Tenant isolation").

**Docs go stale the moment this lands** — add to this P1 pass, not a later
one:

- `.claude/skills/postgres-age/SKILL.md`: every example currently hardcodes
  `'labkit'` as the graph name (`cypher('labkit', ...)`,
  `labkit."Question"`, `CREATE (n:Question {..., project_id: 'p1'})`).
  Rewrite to `ctx.graphName`-parameterized form and drop `project_id` from
  the example properties. Written yesterday; if this isn't updated in the
  same pass, it's already lying by the time anyone reads it next.

---

## P1: update acceptance tests

Rewrite `tests/domain-graph.test.ts` around `TenantContext` + natural-id
edge addressing rather than property-map identities. New coverage needed
(PJ-003 §15) beyond what P0/P1 above already implies:

- **Tenant resolution**: default tenant resolves at a boundary equivalent to
  the CLI/MCP layer (in tests, that's just calling `resolveTenantContext`
  once in `beforeEach`); internal graph functions reject a missing `ctx`
  (this falls out of `ctx` being a required, non-optional first parameter —
  a TS compile error, not a runtime check, satisfies "cannot operate without
  a resolved TenantContext").
- **Natural-ID mutation**: `createEdge` with a nonexistent `fromId`/`toId`
  throws (not a silent no-op); AGE internal graph IDs still never appear in
  any assertion (already covered by the existing "natural ids" describe
  block — extend it to cover the new `createEdge` signature).
- **Edge semantics**: one passing case and one `EDGE_SCHEMA`-rejected case
  (e.g. attempting `MOTIVATES` from `Claim` to `LineOfEnquiry` should throw
  before touching the database).
- **Failed/planned inquiry provenance**: the `LOE_1`/`EU_1`/`COMP_1`-with-no-
  `Evidence` scenario from PJ-003 §15, answered via
  `COMP_1 <- USES - EU_1 - ADDRESSES -> LOE_1`.
- **Derived question state**: a `Question` with no resolving `Decision`
  reads as open; adding `Decision -[:RESOLVES]-> Question` changes that
  read — both via a graph traversal helper (mirrors the existing "open
  lines of enquiry" describe block, which already does exactly this
  pattern for `LineOfEnquiry`/`Question` and needs no new mechanism, just
  no more `is_open` property to accidentally contradict it).
- **Decision lifecycle integrity**: `TenantGraph.closeDecision()` sets
  `is_open = false` and `closed_at` together, never one without the other —
  assert both after one call, not just the field the test happens to check.

---

## P2: invalidation refinement

No functional change needed — PJ-003 §11 confirms the existing directional
`OPTIONAL MATCH` traversal (not a blind undirected `*` walk) is already
correct. The only action item is making the **affected ≠ unsupported**
distinction explicit somewhere durable (a comment on the invalidation test,
or a line in the SKILL.md cookbook entry for that query) so a future change
doesn't quietly conflate the two. No code changes beyond the `ctx`
threading already covered in P0.

---

## Explicitly not doing (per PJ-003 §16 and this plan's own scope)

No `Workspace` entity. No scientific `Project` entity. No full
truth-maintenance engine. No agent-facing MCP vocabulary design (PJ-003 says
that's the *next* review, after this one lands). No W&B/MLflow-style
telemetry storage.

---

## What's next

This is a plan, not a diff. Nothing above has been implemented — `main` is
unchanged except for this document. All nine decisions above are now
resolved (1–5 from the initial review pass, 6–9 from the pre-implementation
review that followed). Say the word and I'll start on P0.
