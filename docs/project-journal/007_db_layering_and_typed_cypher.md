# PJ-007: Layering `src/db/`, and making the agtype types actually reach callers

**Status: implemented (2026-08-18), on `spike/drizzle-age`.**

## Context

Prompted by reading `dependency-graph.svg` rather than the code: `src/db/`
was six modules with `graph.ts` as a 445-line hub that everything else
reached into, and most files were bags of exported functions rather than
anything with a boundary. Three concrete defects fell out of that shape,
each verified on disk before any of this was changed — not inferred from the
diagram.

## 1. The typed surface `agtype.ts` already had was unused

`CypherColumn` and `buildAsClause` were exported with zero callers.
Not because they were premature — because `TenantGraph.cypher()` still took
a hand-written `asClause` string (`"(e agtype, comp agtype)"`) that had to
be kept matching the query's `RETURN` arity by eye, and returned raw agtype
**text**. So all ~20 call sites re-did the same two steps the parser had
already done: `parseAgtype()`, then narrow the discriminated union. That
narrowing had congealed into a local `props()` helper in
`tests/domain-graph.test.ts` whose docstring conceded it was only valid "by
construction of the Cypher queries themselves" — an invariant the compiler
couldn't see and nothing enforced.

Replaced by column decoders (`src/db/cypher.ts`): a query declares
`{ returnedName: decoder }` once, and that single declaration produces both
the `AS` clause and the row type. `optional()` covers `OPTIONAL MATCH`
columns, which moves nullability into the type and removed a row of `!`
assertions at the call sites. `props()` is gone; so is every literal
`"(n agtype)"`.

Decoding deliberately happens at the `query()` boundary and not through
`pg`'s `types.setTypeParser()`, which is what the Apache AGE Node driver's
`setAGETypes()` does. That registry is process-global and invisible to any
code path holding a raw PGlite instance — it takes effect in production and
not in tests, which is the exact divergence PJ-006 §5 reverted. The driver
remains a reference implementation, not a dependency; `cypherDollarQuote()`
was ported from it, with one gap closed (upstream falls back to a tagged
delimiter when the query *contains* `$$`, but a query *ending* in `$` breaks
bare `$$`-quoting too).

## 2. `createNode` didn't typecheck against its own domain model

The signature was `createNode<T extends Record<string, unknown>>(label: NodeLabel, props: T)`,
so `createNode("Question", { totally: "wrong" })` compiled. The 13 `*Props`
interfaces existed and were documentation only — nothing connected a label
to the props it selects.

Fixed with a `NodePropsByLabel` map and a label-generic signature. The
`tests/domain-graph.test.ts` fixture table that creates one node per label
is now typed `{ [L in NodeLabel]: NodePropsByLabel[L] }`, so a wrong fixture
is a compile error rather than a runtime surprise inside AGE. That loop
needed a small generic helper: at `for (const label of NODE_LABELS)` the
label is the whole union and won't narrow, so `fixtures[label]` only
resolves inside a function generic in `L`.

## 3. Four parallel per-label tables, kept aligned by comment

`NODE_LABELS`, `NATURAL_ID_PREFIX`, `NODE_VIEW_COLUMNS`, `NODE_VALIDATORS`
and the `*Props` interfaces were five structures indexed by the same key,
with "Keep in sync with the *Props interfaces above" as the only enforcement.

Collapsed into `NODE_TYPES` in the new `src/db/domain.ts` — one entry per
label carrying `prefix`, `viewColumns`, and an optional `validate`. The
useful part isn't the tidiness, it's that `viewColumns` is typed
`readonly (keyof NodePropsByLabel[L] & string)[]`, so a CQRS view column that
drifts from its `*Props` interface now fails `tsc` instead of failing at
runtime in a tenant's view definition. All 13 existing entries already
satisfied it, so this was a no-op at runtime.

One sync obligation genuinely can't be typed and was carried across as a
comment: `prefix` must match the per-label `CREATE SEQUENCE` names in
`drizzle/0002_natural_ids.sql`. That's a cross-file obligation to a migration;
the per-label `createNode` round-trip test is what actually catches it.

## 4. The layering itself

`domain.ts` (what the entities *are*) and `client.ts` (`LabKitDB` +
`bootstrapSession`) split out; `provisioning.ts` split from `tenant.ts`.
The `backend.ts → graph.ts` edge is gone — `backend.ts` never wanted the
graph module, only the connection interface, and that edge existed purely
because `LabKitDB` happened to be declared in `graph.ts`. `graph.ts` is 177
lines and no longer imported by anything except `index.ts` and tests.

`tenant.ts` was doing two jobs: deciding *which* tenant, and managing that
tenant's graph schema. The second is now `provisioning.ts`, where the seven
`ensure*` helpers that all threaded `(db, graphName)` became methods on a
class holding that pair. The class is **module-private**, deliberately:
`provisionTenantGraph()` is what takes the transaction and the advisory lock,
and exporting the provisioner would make `reconcile()` reachable without
either — the same reason `reconcileTenantGraph` was unexported before.

`dropTenantGraph()` is the one genuinely new export. `TenantGraph.dropGraph()`
had zero callers repo-wide, and re-exporting it as an orphan would have
recreated defect (1). It's wired as the implementation of
`tests/helpers/db.ts`'s per-test `reset()`, which had the same `drop_graph`
call inline — so it has a real caller and runs on every `afterEach`.

## Judgment calls

- **No raw escape hatch survives on `TenantGraph`.** `cypher()` was deleted
  outright rather than kept alongside `query()`. Keeping it would have meant
  two ways to do the same thing and a standing invitation back to
  hand-written `AS` clauses; a query needing an uncovered shape should get a
  decoder in `src/db/cypher.ts` instead.
- **`TenantContext` stayed in `tenant.ts`**, imported `import type` by
  `graph.ts`. A `TenantGraph` genuinely is scoped to a tenant, so the
  dependency is honest; being type-only it erases at runtime, and
  `tenant.ts` no longer imports `graph.ts`, so there's no cycle either way.
- **`NODE_TYPES` is a plain record, not a class hierarchy.** Node/edge
  "types" here carry data and at most one validator function; wrapping them
  in classes would have added ceremony without behaviour. The OOP went where
  behaviour actually lives — `CypherRunner`, `TenantGraph`,
  `TenantGraphProvisioner`.
- **`src/index.ts` and `src/cli.ts` remain orphans** in dependency-cruiser's
  output. They're still empty stubs; that warning is pre-existing and
  correct, and left alone rather than silenced with a config exception.
