# PJ-006: In-house agtype client, AGE provenance, and a pglite-socket concurrency bug

**Status: implemented (2026-08-18), on `spike/drizzle-age`.**

## Context

Two threads, which turned out to be connected. First: the user added the
`pg-age` npm package (Apache AGE's official Node.js driver) and a vendored
copy of its `index.ts`, asking whether `TenantGraph.cypher()`/`parseAgtype()`
(`src/db/graph.ts`) could be replaced by reusing it, and separately raised
that LabKit's DB access abstractions were overdue a look — specifically,
whether AGE catalog calls and LabKit's own SQL objects should be
schema-qualified explicitly rather than relying on `search_path` ordering.
Second, while stabilizing the resulting test suite, a `bun test` run that
passed reliably in isolation started failing intermittently — chasing that
down surfaced a real bug in a dependency, not in LabKit's own code, with
implications reaching into the PGlite backend's production design.

## 1. `pg-age`/`antlr4ts` reviewed as reference implementations, not adopted

Reading the actual driver source (not just its docs) found real problems
with adopting it as-is: no native `$name` parameter binding — every value
would have to be string-interpolated into Cypher text, a regression from
what `TenantGraph.cypher()` already does via AGE's native 3-arg
`cypher(graph, query, params)` form; a confirmed, reproduced bug where
floats inside an array get pushed twice by its ANTLR listener
(`AGTypeParse('[1.5, 2.5]')` → `["1.5", 1.5, "2.5", 2.5]`, no test in that
repo covers it); a dependency on `antlr4ts@0.5.0-alpha.4`, itself alpha; and
the vendored source doesn't compile under this repo's `noImplicitOverride`/
`verbatimModuleSyntax` tsconfig without patching generated ANTLR code by
hand. Decision: write `src/db/agtype.ts` in-house, lifting only the
validated *ideas* (identifier hardening, dollar-quote collision handling),
not the code.

The scope of that in-house parser changed mid-review. The first cut
deliberately narrowed it to shapes LabKit's own `*Props` interfaces
actually produce, to avoid taking on ANTLR-grammar-level generality. Pushed
back on directly: infrastructure code shouldn't bake in assumptions about
its caller's current usage, and once §2 below established AGE's *complete*
set of extended-type tags from source, handling all of them correctly cost
barely more than handling a subset. The parser in `src/db/agtype.ts` today
is general, not LabKit-scoped.

## 2. `pglite-age`'s actual provenance, confirmed from source

Before this round, `pglite-age` was treated as "a WASM build of AGE,
diverges from stock AGE in a few places" — true as a description, wrong as
an explanation. Fetching and reading `electric-sql/postgres-pglite` (a
genuine Postgres core fork; AGE is pinned there as a real git submodule,
`apache/age` branch `PG18`, commit `806fa2ebdb3`, tag `v1.7.0-rc0`) found
AGE's own C/SQL source completely unpatched for WASM — `grep`ing the whole
submodule for `__PGLITE__`/`EMSCRIPTEN`/`WASM` returns zero hits. The only
WASM-motivated lever is a build flag (`SIZEOF_DATUM=4`) that AGE's own
Makefile already supports as of its own 1.7.0 32-bit-`graphid` feature —
pglite just turns it on.

That reframed three of LabKit's four known "pglite-age quirks" entirely:
whole-map `CREATE $props` rejection and the missing multi-type
variable-length-edge grammar are literal, unconditional AGE 1.7.0-rc0
source (`cypher_clause.c:6407`, `cypher_gram.y:1369`) — not WASM-specific at
all, confirmed by running the identical queries against a real Postgres 18
container (`docker-compose.yml`, `apache/age:release_PG18_1.7.0`, no WASM
involved). The fourth — `MERGE` for relationships producing an edge with
`start_id`/`end_id` both `0` — is the opposite case: it works correctly on
that same real container, so it's genuinely a WASM/pglite-age regression,
most plausibly connected to the `SIZEOF_DATUM=4` pass-by-reference
`graphid` change (the code paths that would need `DatumGetInt64`-style
accessors for that don't visibly use them). None of this has been filed
upstream yet; tracked in `.claude/skills/postgres-age/SKILL.md`'s "Upstream
filing" section, along with the `pg-age` driver bugs from §1.

## 3. `src/db/agtype.ts`: a real recursive-descent parser

Confirmed from `agtype.c`'s output serializer that AGE emits exactly four
extended-type tags (`numeric`/`vertex`/`edge`/`path`) and that they nest at
arbitrary depth (a numeric property value inside a vertex's `properties`
map is tagged too, since the `extend` flag propagates recursively) — which
a strip-the-trailing-suffix-then-`JSON.parse` approach can't handle
correctly. Two bugs in an early draft, caught by review before either
shipped: a plain `RETURN [n, m]` (two vertices, not a path — AGE only tags
an array `::path` if it's already a valid alternating vertex/edge/vertex
sequence) was misparsed as a single vertex by a "last tag in the string
wins" heuristic; and a nested `::numeric` broke the outer parse the same
way. Both are structurally impossible now — tag resolution is one function,
used identically at every nesting depth, not a positional hack.

Also fixed, not just documented: AGE's internal `graphid` is
`label_id * 2^48 + entry_id`, unquoted in agtype text (no `::numeric` tag —
plain `AGTV_INTEGER`, same as any other Cypher integer). LabKit provisions
32 labels per tenant (13 node + 19 edge); once a label's id reaches 32,
`label_id * 2^48` alone is `9007199254740992` — past
`Number.MAX_SAFE_INTEGER`. Confirmed live, not hypothetical: a `SUPERSEDES`
edge's id in a freshly-provisioned tenant is `9007199254740993`. The parser
threads the exact source digit text through tag resolution and returns
`bigint` for anything that doesn't fit safely in `Number`, rather than
accepting silent truncation.

`graph.ts` was migrated onto it: `propPattern()` → `buildPropertyClause()`,
which validates every property key against the same identifier rules AGE's
own driver uses for graph/label names, before the key reaches Cypher text.
This closes a real gap, not a theoretical one — `createNode<T extends
Record<string, unknown>>()` accepts arbitrary keys at runtime, and LabKit's
primary use case is a per-project MCP server where an external agent
supplies `props`. A key like `"x: 1}) CREATE (m:Evil {y"` reached Cypher
text unvalidated before this change; confirmed after that it's rejected by
the real `createNode()`, not just by `agtype.ts` in isolation.

## 4. Explicit schema-qualification

Prompted by the same review: LabKit was relying on `search_path` ordering
in more places than intended. Concretely found (not assumed): migration
0001's `SET search_path = ag_catalog, "$user", public` stays active into
migration 0002, so the originally-unqualified `CREATE FUNCTION
labkit_next_natural_id`/`labkit_prop` were landing in `ag_catalog` — AGE's
namespace, not LabKit's own. Fixed at the root (the migration now qualifies
those `CREATE FUNCTION`/`CREATE SEQUENCE` statements to `public` directly)
and at every call site: `ag_catalog.` on every AGE catalog function
(`cypher`, `create_graph`, `create_vlabel`, `create_elabel`, `drop_graph`),
and a new `LABKIT_SCHEMA` constant (`src/db/schema.ts`, currently
`"public"`) on every LabKit-owned SQL object. One wrinkle: `drizzle-orm`
refuses `pgSchema("public")` outright ("just use `pgTable()` instead"), so
`tenants`' Drizzle declaration stays a plain `pgTable()` — `LABKIT_SCHEMA`
is for the raw-SQL call sites in `tenant.ts`/`graph.ts`, which aren't
subject to that restriction.

## 5. Tests moved off raw PGlite, onto the same `pg.Client` path production uses

`tests/domain-graph.test.ts` originally talked to a raw `PGlite` instance
directly. That gap became concrete, not just theoretical, mid-review: an
uncommitted experiment (`pg`'s `types.setTypeParser()`, registering an
agtype parser on the driver's global type registry) looked harmless under
that raw-instance test setup and would have shipped — but `src/db/backend.ts`
never hands out a raw `PGlite` object even for the primary role; it opens
its own `pg.Client` (`selfClient`) and returns that. The registration would
have taken effect in production and not in tests, the same shape of gap
PJ-005 reverted `schema_version` over. Extracted `tests/helpers/db.ts` so
application-code test files never import `@electric-sql/pglite`/
`pglite-age`/`pglite-pgvector` themselves — they only ever see a
`LabKitDB`-shaped `pg.Client`.

## 6. A real, already-filed concurrency bug in `pglite-socket`

Routing tests through a real connection surfaced a second, unrelated
problem: a specific test (`createEdge` losing a race to a concurrent
caller, via `Promise.all()`) started failing intermittently, and the
failure cascaded into unrelated later tests in the same file. Isolated with
throwaway spikes down to plain SQL, no AGE involved: two `pg.Client`
connections issuing concurrent queries against one `PGLiteSocketServer`,
where at least one query errors (e.g. a `23505` unique violation),
eventually and unpredictably corrupt the connection(s) — a wire-protocol
desync, or silently wrong rows. Found already filed upstream after
reproducing it independently:
[electric-sql/pglite#1046](https://github.com/electric-sql/pglite/issues/1046),
open, with the exact root cause in `pglite-socket`'s
`QueryQueueManager.processQueue()` — it serializes per *message*, not per
*batch*, and only applies connection affinity while inside a transaction.

Confirmed empirically that corruption stays contained to the connection
that triggered it — a fresh connection against the same underlying PGlite
instance is immediately clean. Fixed on that basis: `tests/helpers/db.ts`
now opens a new connection per test (`beforeEach`/`afterEach`) instead of
sharing one for a whole file, containing the blast radius even though the
underlying bug isn't fixed. The flaky `Promise.all()` race test was
replaced with a deterministic one that mocks the DB layer to inject a
`23505` at the exact point a real race would produce one, proving
`createEdge()`'s error handling without depending on two live connections
actually racing reliably against this backend — confirmed they can't be
relied on to. Verified via repeated stress runs: 0 failures across 25
consecutive full runs of `domain-graph.test.ts` + `agtype.test.ts`,
versus roughly 1-in-5 to 1-in-7 before. `scripts/check-pglite-concurrency.sh`
(`bun run check:pglite-concurrency`) now regression-checks this — exit 0
means the bug still reproduces (expected, nothing to do), exit 1 means it
didn't (worth checking whether `pglite-socket` picked up a fix upstream).

**Left open, deliberately not fixed this round:** `tests/leader-election.test.ts`
races three concurrent `connectDb()` calls against one shared
`.labkit-test-tmp` PGlite instance, which is exactly this bug's trigger
condition — and it's now an intermittent failure too. It can't be fixed the
way the `TenantGraph` tests were (opening more connections doesn't help;
the whole point of that test is proving three *simultaneous* connections
work), because `pgliteLeaderElectionBackend`'s actual production design is
every secondary process hitting the primary's socket concurrently — the
same shape. This is a real open question about that backend's reliability
under genuine concurrent multi-process load, not a test-suite nuisance, and
it's unresolved as of this entry.

## Judgment calls

- **Nothing filed upstream yet, on any of the four findings this round
  surfaced** (two `apache/age` C-source gaps, the `pg-age` driver's
  float-array bug, and independent confirmation of pglite#1046) —
  deliberately left as tracked findings in the postgres-age skill rather
  than filed, since posting to a third-party project's issue tracker is a
  visible action worth a separate, explicit decision.
- **`pg-age.ts` and the `pg-age`/`antlr4ts` dependencies are removed**
  (the user's own follow-through, mid-review, on this entry's §1
  conclusion) rather than kept around unused "for reference."
- **`leader-election.test.ts` is flaky and not fixed.** Forcing a fix
  (e.g. serializing the three connections, defeating the point of the
  test) would have hidden the actual finding — that the PGlite backend's
  concurrent multi-process design rests on a dependency with a confirmed,
  open reliability bug — rather than surfaced it.
- **`agtype.ts`'s unknown-tag handling degrades rather than throws**
  (`{ kind: "unknown", tag, value }`), on the reasoning that the four-tag
  set is closed for the *pinned* AGE version, not permanently — a future
  AGE upgrade adding a fifth tag should be visible in results, not crash
  every query that touches it.
