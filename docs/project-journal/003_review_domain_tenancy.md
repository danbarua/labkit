# PJ-003: Domain and Tenancy Review Handoff

**Repository:** `danbarua/labkit`  
**Target:** current `main`  
**Purpose:** consolidate the domain-model review and the tenancy
decisions made after reviewing the current implementation. This is an
implementation handoff, not a request to expand the ontology.

## 1. Architectural boundary

LabKit is a **research control plane**, not an experiment telemetry
plane.

Its durable concern is:

- provenance;
- justification;
- dependency propagation;
- research state;
- why a computation was run;
- what evidence resulted;
- what claims and decisions depend on that evidence;
- what remains unresolved;
- what changes if an artefact or evidence item is invalidated.

W&B / MLflow remain the natural home for:

- metric histories;
- epoch losses;
- GPU/system telemetry;
- run logs;
- sweep-controller state;
- dashboards;
- detailed run telemetry.

LabKit may reference those systems through a thin `Computation` or
`Artefact` record. It should not clone them.

A useful boundary test remains:

> If W&B disappeared tomorrow, would this entity still exist
> conceptually in the scientific record?

## 2. Core domain retained

The scientific/control-plane graph remains:

``` text
Question
LineOfEnquiry
EvidenceUnit
Evidence
Claim
Decision
Criterion
CriterionEvaluation
Gate
Review
Artefact
Computation
Task
```

The existing distinctions remain intentional.

### EvidenceUnit vs Evidence

``` text
EvidenceUnit
    planned or executed bounded unit of inquiry

Evidence
    durable observation or result produced by one or more evidence units
```

### Evidence vs Artefact

Do not collapse a scientific result into the file that records it.

``` text
EvidenceUnit
    ├── PRODUCES -> Evidence
    └── PRODUCES -> Artefact

Evidence
    └── RECORDED_IN -> Artefact
```

Example:

``` text
Evidence:
    evolved_T mean delta-MSE = -0.021
    95% CI [-0.025, -0.017]

Artefact:
    stage2b_confirmatory_results.json
```

The evidence is the observation/proposition. The artefact is a durable
representation of it.

This distinction matters because:

- one artefact can contain multiple evidence statements;
- one evidence statement can be recorded in multiple artefacts;
- invalidating one artefact does not necessarily invalidate
  independently recorded or reproduced evidence.

### Criterion, CriterionEvaluation, Gate

Keep these separate:

``` text
Criterion
    proposition that can be mechanically evaluated

CriterionEvaluation
    durable record of what happened when it was evaluated

Gate
    policy consequence attached to the evaluation
```

The existing
`Criterion -> EVALUATED_AS -> CriterionEvaluation -> TRIGGERS -> Gate`
shape is sound.

### Decision amendments

Do not add a separate `Amendment` entity.

``` text
Decision D2
    └── SUPERSEDES -> Decision D1
```

An amendment is a decision related to an earlier decision by
`SUPERSEDES`.

### Task

`Task` is orchestration state, not scientific truth.

Operational state may generate scientific state, but a scientific claim
must never depend logically on a task merely having existed or
completed.

## 3. Decision: rename the infrastructure `Project` to `Tenant`

The current relational `Project` entity is actually acting as a
persistence/isolation boundary. That is not the same thing as a
scientific project.

`Project` is therefore the wrong noun for this layer.

Reasons:

- repositories can be renamed or relocated;
- a LabKit research universe need not correspond 1:1 with a Git
  repository;
- “project” may later have a genuine scientific/domain meaning;
- LabKit may run from per-repository PGlite, `~/.config/.labkit`, full
  PostgreSQL, or cloud infrastructure without changing the scientific
  ontology.

### Target relational entity

Use `Tenant` as the infrastructure namespace.

A minimal shape is sufficient:

``` text
Tenant
------
id
slug
display_name
created_at
graph_key / graph_name
```

Exact SQL types are an implementation choice. User-controlled strings
should not directly become AGE graph identifiers.

For the MVP, create one tenant corresponding to LabKit itself,
conceptually:

``` text
Tenant(1) = "labkit"
```

The exact persisted ID representation may remain UUID/bigint according
to the implementation, but there must be a stable internal graph
identifier from which the AGE graph name is derived.

## 4. Decision: one AGE graph per tenant

Treat the AGE graph as the tenant namespace.

Conceptually:

``` text
Postgres
├── tenants
├── AGE graph labkit_t1
│   ├── Question
│   ├── Claim
│   ├── Evidence
│   └── ...
└── AGE graph labkit_t2
    ├── Question
    ├── Claim
    ├── Evidence
    └── ...
```

This is preferred to one global graph with `tenant_id` repeated on every
vertex.

Benefits:

- cross-tenant edges are impossible by graph construction;
- Cypher queries do not need repeated tenant predicates;
- one tenant can be exported, deleted, backed up, or reasoned about as a
  bounded research universe;
- agents cannot accidentally omit a tenant filter from a traversal;
- the scientific graph is not polluted with infrastructure partition
  metadata.

### Consequence

Once graph-per-tenant is implemented, remove `project_id` / `tenant_id`
properties from graph nodes. The graph itself is the partition key.

Do not retain both mechanisms as duplicate tenancy state.

## 5. Decision: tenant context is mandatory internally

The user-facing boundary may default to the single MVP tenant.
Persistence/domain code may not.

Do not implement:

``` ts
createClaim(tenantId?: string, ...)
```

Prefer a resolved context:

``` ts
interface TenantContext {
  tenantId: string;
  graphName: string;
}
```

Then:

``` ts
createClaim(ctx, ...)
createEvidence(ctx, ...)
createEdge(ctx, ...)
cypher(ctx, ...)
```

The CLI/MCP/bootstrap boundary may resolve:

``` text
no tenant supplied
    -> resolve default tenant
    -> TenantContext for LabKit tenant
```

Below that boundary, there is no “tenant omitted” mode.

This avoids a permanent split between:

``` text
tenant supplied -> multi-tenant semantics
tenant omitted  -> magical legacy "labkit" graph
```

### AGE graph naming

Do not use user-controlled tenant names directly as graph identifiers.

Prefer boring generated names such as:

``` text
labkit_t1
labkit_t42
```

Avoid hyphenated identifiers such as `tenant-1`.

The current hard-coded:

``` ts
export const GRAPH_NAME = "labkit";
```

must become tenant-context driven.

## 6. Repository/workspace identity is not tenant identity

A repository path, repository name, Git remote, or filesystem location
is mutable external attachment metadata.

Do not make any of these the identity of a tenant.

A future concept such as:

``` text
Workspace
---------
tenant_id
kind        git | filesystem | remote | ...
uri
is_primary
```

may be useful, but is **not required for this change**.

Do not introduce it merely to complete the model.

The important design constraint is simply that tenant identity survives
repository rename or relocation.

## 7. Graph integrity changes required before exposing MCP graph mutations

The current `createEdge()` API matches endpoints using arbitrary
property maps:

``` ts
createEdge(
  db,
  fromLabel,
  fromMatch,
  edge,
  toLabel,
  toMatch,
)
```

This is unsafe as the durable mutation interface.

Properties such as:

``` text
EvidenceUnit.role = "verification"
Decision.reason = "..."
```

are not identities. Multiple nodes may match, causing an edge-creation
query to address multiple endpoints.

LabKit already has natural IDs. Use them.

### Required target

Edge mutation should be identity-based and tenant-scoped, approximately:

``` ts
createEdge(
  ctx,
  fromId: "EU-17",
  edge: "USES",
  toId: "COMP-42",
)
```

Exact function shape is an implementation choice, but arbitrary
property-map endpoint matching should not remain the public mutation
path.

Natural IDs are agent/user-facing identities. AGE graph IDs remain
internal implementation details.

## 8. Enforce valid edge shapes

`EdgeLabel` being an enum is not enough. The current API can still
construct semantically nonsensical label combinations.

Introduce a single authoritative edge-schema definition mapping edge
label to allowed source and target labels.

Examples:

``` text
MOTIVATES      Question            -> LineOfEnquiry
SUPPORTS       Evidence            -> Claim
CHALLENGES     Evidence            -> Claim
USES           EvidenceUnit        -> Computation
RECORDED_IN    Evidence            -> Artefact
EVALUATED_AS   Criterion           -> CriterionEvaluation
TRIGGERS       CriterionEvaluation -> Gate
BASED_ON       Decision            -> Evidence
RESOLVES       Decision            -> Question
NARROWS        Decision            -> Question
DEFERS         Decision            -> Question
SUPERSEDES     Decision            -> Decision
EVALUATES      Review              -> Claim | Decision | Evidence
IMPLEMENTS     Task                -> EvidenceUnit
```

For polymorphic relations such as `PRODUCES` and `GATES`, enumerate the
allowed pairs explicitly.

The edge-schema definition should drive both runtime validation and,
where practical, TypeScript typing. Avoid maintaining independent
comment-only and runtime definitions that can drift.

## 9. Add an explicit EvidenceUnit -\> LineOfEnquiry relation

The graph currently cannot reliably answer:

> Which line of enquiry did this computation address?

without walking through successfully produced evidence:

``` text
Computation
    <- USES - EvidenceUnit
    - PRODUCES -> Evidence
    <- REQUIRES - LineOfEnquiry
```

That fails for exactly the research states LabKit needs to preserve:

- planned work;
- failed experiments;
- halted computations;
- inconclusive evidence units;
- investigations that never produce durable evidence.

Add an explicit relation:

``` text
EvidenceUnit -[:ADDRESSES]-> LineOfEnquiry
```

`ADDRESSES` is the preferred name for this handoff.

This gives a stable purpose chain even when execution fails:

``` text
Computation COMP-42
    <- USES -
EvidenceUnit EU-17
    - ADDRESSES ->
LineOfEnquiry LOE-3
```

## 10. Remove duplicate sources of scientific truth

Default rule:

> Research state is derived from graph facts unless a stored property
> represents state that cannot be derived from those facts.

Current examples that should be cleaned up:

### Question

Current:

``` ts
QuestionProps {
  ...
  is_open?: boolean;
}
```

But closure is already represented by:

``` text
Decision -[:RESOLVES]-> Question
```

Do not retain both as independent truths.

### Decision

Current properties include:

``` ts
evidence: string;
is_open?: boolean;
closed_at?: string;
```

while evidence dependency is already represented by:

``` text
Decision -[:BASED_ON]-> Evidence
```

Remove string shadow references such as `Decision.evidence`.

Review whether `is_open` / `closed_at` represent genuinely independent
operational facts. If they merely duplicate graph-derived
resolution/supersession state, remove them rather than adding
synchronization logic.

### CriterionEvaluation

Current:

``` ts
evidence_ref?: string;
```

If evidence supports an evaluation, represent that as a graph
relationship rather than a string reference.

Add the appropriate explicit edge only if the use case is required now.
Do not invent redundant reference properties.

### Task

Task status is operational state and may legitimately be stored as
operational state. The “derive scientific state from graph facts” rule
does not prohibit normal task lifecycle fields.

## 11. Invalidation semantics: affected is not the same as unsupported

The current directional invalidation traversal is conceptually correct.
Do not replace it with a blind undirected `*` graph walk.

However, keep this distinction explicit:

``` text
affected
    dependency chain needs reconsideration

unsupported
    no remaining valid evidential support exists
```

If Artefact A12 is invalidated and Evidence E7 is also independently
recorded or reproduced elsewhere, Claim C7 may be **affected** without
becoming **unsupported**.

For the MVP:

- preserve the acceptance question “what becomes affected?”;
- do not automatically mark downstream claims false/unsupported merely
  because one recording artefact is invalidated;
- provenance traversal should be directional and relation-aware.

Full truth-maintenance / support-set evaluation can remain later work
unless required by an acceptance test.

## 12. Natural IDs

Keep the existing natural-ID direction.

Properties of the design to preserve:

- user/agent-facing;
- short and readable;
- AGE internal graph IDs never escape the persistence layer;
- stable identity used for graph mutation;
- label-specific prefixes such as `CLM-`, `EV-`, `COMP-`, `EU-`.

Natural IDs may remain globally allocated across tenants. Tenant context
is still mandatory for DB operations even if an ID happens to be
globally unique.

Do not use natural-ID global uniqueness as a reason to bypass tenant
scoping.

## 13. Updated conceptual model

``` text
Relational infrastructure
=========================

Tenant
    └── owns one AGE graph namespace


Per-tenant AGE graph
====================

Question
    - MOTIVATES -> LineOfEnquiry

LineOfEnquiry
    <- ADDRESSES - EvidenceUnit

EvidenceUnit
    - USES -> Computation
    - PRODUCES -> Evidence
    - PRODUCES -> Artefact

Evidence
    - RECORDED_IN -> Artefact
    - SUPPORTS -> Claim
    - CHALLENGES -> Claim

Criterion
    - EVALUATED_AS -> CriterionEvaluation

CriterionEvaluation
    - TRIGGERS -> Gate

Decision
    - BASED_ON -> Evidence
    - RESOLVES -> Question
    - NARROWS -> Question
    - DEFERS -> Question
    - SUPERSEDES -> Decision

Review
    - EVALUATES -> Claim | Decision | Evidence

Task
    - IMPLEMENTS -> EvidenceUnit
    - may produce Computation / Artefact
    - remains operational, not logical support for Claim
```

Existing valid relations not shown above, such as deliberately scoped
`GATES` or `CHANGES`, need not be removed simply because this diagram is
focused on the reviewed paths.

## 14. Implementation order

Prefer the following sequence so later API work is built on the
corrected boundary.

### P0: tenant namespace

1.  Rename relational `Project` concept to `Tenant`.
2.  Create/resolve the default LabKit tenant.
3.  Derive an AGE graph name from internal tenant identity.
4.  Introduce `TenantContext`.
5.  Require context in `cypher()` and all graph DB operations.
6.  Remove hard-coded `GRAPH_NAME`.
7.  Move graph bootstrap/migration logic from one fixed `labkit` graph
    to tenant graph provisioning.
8.  Remove per-node `project_id` once graph-per-tenant isolation is
    active.

### P0: graph mutation integrity

1.  Change edge addressing to natural IDs.
2.  Add authoritative allowed edge-shape validation.
3.  Ensure mutation cannot accidentally match multiple endpoints.
4.  Ensure operations cannot cross tenant graphs.
5.  Add `ADDRESSES`.

### P1: remove dual truth

1.  Remove `Question.is_open` if fully derived from graph state.
2.  Remove `Decision.evidence`.
3.  Review/remove duplicate Decision lifecycle fields where
    graph-derived.
4.  Remove `CriterionEvaluation.evidence_ref` in favor of an explicit
    relation if that relation is currently needed.
5.  Keep operational task state separate from scientific state.

### P1: update acceptance tests

Rewrite fixtures and queries around tenant context and natural IDs
rather than property-map identities.

### P2: invalidation refinement

Keep directional “affected” propagation now. Do not build a full
truth-maintenance engine unless a concrete requirement appears.

## 15. Acceptance tests required for this change

The implementation should demonstrate at least the following.

### Tenant resolution

- A default LabKit tenant can be resolved at the CLI/MCP/application
  boundary.
- Internal graph functions cannot operate without a resolved
  `TenantContext`.
- Graph name is derived from trusted internal tenant metadata, not raw
  user input.

### Tenant isolation

- Two tenants can contain equivalent domain data without queries
  crossing between them.
- An edge operation in tenant A cannot address a node in tenant B.
- No graph vertex needs a duplicated `tenant_id` property to achieve
  isolation.

### Natural-ID mutation

- `createEdge()` resolves exactly one source and one target by natural
  ID.
- Missing source/target fails explicitly.
- Duplicate/multiple endpoint matching is structurally impossible
  through the public API.
- AGE internal graph IDs are not exposed.

### Edge semantics

- Valid source/edge/target combinations succeed.
- Invalid combinations fail before mutation.
- Polymorphic edges are limited to explicitly enumerated pairs.

### Failed/planned inquiry provenance

Create:

``` text
LineOfEnquiry LOE-1
EvidenceUnit EU-1
Computation COMP-1
```

with no resulting `Evidence`.

The system must still answer:

> Why was COMP-1 run?

through:

``` text
COMP-1 <- USES - EU-1 - ADDRESSES -> LOE-1
```

### Derived question state

- A question with no resolving decision is open.
- A `Decision -[:RESOLVES]-> Question` makes it resolved for read-side
  purposes.
- There is no independently mutable `Question.is_open` capable of
  contradicting that graph fact.

### Artefact invalidation

- Invalidating an artefact can identify affected evidence, claims,
  decisions, and lines of enquiry through directional dependency
  relations.
- The traversal does not blindly pull in upstream computations/questions
  as if they were invalidated.
- The system does not equate “affected” with “unsupported” without
  checking remaining support.

### Existing MVP questions remain answerable

LabKit must still answer:

> Show me the evidence supporting Claim C7, the computations that
> generated it, and the relevant external run reference/metrics link.

> Why does Claim C7 currently count as supported?

> If Artefact A12 is invalidated, what claims, decisions, and open lines
> of enquiry become affected?

> Why is this line of enquiry still open?

## 16. Explicit non-goals for this implementation

Do **not** use this review as justification to:

- build W&B/MLflow-style metric storage;
- build dashboards;
- build sweep orchestration;
- create a general truth-maintenance engine;
- add `Workspace` merely because it may eventually be useful;
- add a scientific `Project` entity merely because the infrastructure
  entity was renamed;
- expose raw Cypher CRUD as the eventual agent-facing MCP vocabulary;
- force every exploratory activity into a criterion/gate;
- make every diagnostic a mandatory gate;
- add ceremony to represent uncertainty that is genuinely unresolved;
- freeze incidental implementation choices that do not affect scientific
  interpretation.

The immediate goal is **integrity of the control-plane substrate**, not
completeness of the future research bureaucracy.

## 17. Design principles to preserve

- Formal where state and consequences matter; permissive where discovery
  is still happening.
- A missing structure is tolerable when the science is genuinely
  unresolved.
- A missing dependency, criterion evaluation, or provenance link must
  never be silently interpreted as satisfied.
- Operational state may generate scientific state; scientific truth does
  not depend on operational state.
- Record evidence and relationships before inventing process machinery
  around them.
- External execution systems own telemetry; LabKit owns why the
  execution mattered.
- Infrastructure namespace and scientific-domain vocabulary are separate
  concerns.
- Tenant isolation should be invisible to a single-tenant user but
  mandatory in the implementation.
- The control plane should reduce context burden on implementing agents,
  not make them manually maintain the ontology.
- Do not accumulate ceremony merely because an earlier project
  encountered a particular failure mode.

## 18. Definition of done for this handoff

This review is implemented when:

1.  `Project` no longer serves as the infrastructure namespace noun;
    `Tenant` does.
2.  the default single-tenant experience still works without callers
    having to care about tenancy;
3.  every internal graph operation receives resolved tenant context;
4.  each tenant owns a separate AGE graph;
5.  graph nodes no longer duplicate tenant/project partition properties;
6.  edge mutation is natural-ID based and validates legal endpoint
    shapes;
7.  `EvidenceUnit -> ADDRESSES -> LineOfEnquiry` exists;
8.  obvious string/property shadow references to graph facts are
    removed;
9.  the acceptance tests above pass;
10. no experiment-telemetry subsystem or unnecessary process ceremony
    has been introduced.

After this, the next design review should focus on the **agent-facing
MCP command vocabulary**, with the aim of making the formal graph model
useful without requiring implementation agents to understand or
manipulate raw ontology/graph CRUD.
