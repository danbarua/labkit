# 041: a second backend, then the DB layer untangled

**Session wrap, 2026-08-26, on `fix/binary-migrations`.** Not a decision record
— the arguments live in `tests/helpers/db.ts`'s header, `src/db/transactor.ts`,
`src/db/orm.ts`, `src/db/scoped.ts` and `drizzle/0004_rls.sql`.

Baseline `a5f1fa6`, where entry 040 was closed. Five commits, on **PR #29**.
This entry was written when the session was only the second backend and is
rewritten here to cover what followed.

## Goal

Two, in sequence. First: Dan asked whether to add an optional bun task running
the suite against the docker container. Then: steps 3, 4 and 5 of
`docs/db-layering-plan.md` — the pipeline, RLS, and the four raw-SQL sites.

## Changed

### The second backend

**`4013f78` — `bun run test:pg`.** `scripts/test-postgres.sh` **new** starts
`docker-compose.yml`'s `db` service, waits on `pg_isready`, sets
`LABKIT_DB_URL` and runs `bun test`. `tests/helpers/db.ts` branches on that
variable; `src/db/migrate.ts` grows `runMigrationsOnPostgres` beside
`runMigrations`, both over one `applyEmbedded`.
`tests/connection-lock.test.ts` skips (its subject is the PGlite lockfile) and
`tests/mcp-stdio.test.ts` strips the variable from the servers it spawns.

**`e8f714b` — `labkit_tests`, not the maintenance database.** The default was
`postgres`, which every tool connects to when nothing says otherwise, and
`reset()` truncates every table outside four system schemas. Not `labkit`
either: that is the name a real deployment would pick.

**`ab1b19b`** is the earlier version of this entry.

### The pipeline

**`6be9b09` — the connection owns transactions; drizzle mounts on the seam.**

- `src/db/transactor.ts` **new** — BEGIN/COMMIT/ROLLBACK and the depth counter,
  one per connection, on `LabKitDBConnection.tx`. `TenantGraph` takes one as a
  **required** argument and `graph.inTransaction` delegates, keeping only the
  minted-id clearing. Nineteen construction sites updated.
- `src/db/orm.ts` **new** — `ormOver(db)`, drizzle through
  `drizzle-orm/pg-proxy` over `LabKitDB.query`.
- `src/db/backend.ts` — the seam gains `QueryOptions` (`rowMode`), and
  `directPostgresBackend` now wraps its `pg.Client` rather than handing it over.
- `src/db/tenant.ts`, `src/domain/event-store.ts` — the four hand-built SQL
  sites move onto the ORM. `Number(r.seq)` goes with them.

### RLS

**`87409b7` — row-level security, and the honest account of what it buys.**

- `drizzle/0004_rls.sql` **new** (hand-edited from `drizzle-kit generate`) —
  the role in a guarded `DO` block, `ENABLE ROW LEVEL SECURITY`, the policy, and
  the grants drizzle does not manage.
- `src/db/scoped.ts` **new** — `set_config('labkit.tenant_id', …)` then
  `SET ROLE labkit_app`, called by both composition roots after the tenant
  resolves.
- `src/db/schema.ts` — `APP_ROLE`, `pgRole`, `pgPolicy`, `.enableRLS()`.
- `drizzle.config.ts` — `entities: { roles: true }`.
- `src/db/provisioning.ts` — `ensureGrants()` per tenant graph.
- `tests/tenancy-isolation.test.ts` **new**.
- `docs/db-layering-plan.md` **deleted**, as it asked to be.

Working tree clean at `87409b7`; pushed.

## Verified

- **`bun run check` — all 16 pass, exit 0**, at every step. Suite 364→365 pass,
  0 fail, ~55s.
- **`bun run test:pg` — 365 pass, 4 skip, 0 fail, 61s**, from a `docker compose
  down -v`. First run of the suite against a real Postgres was earlier the same
  day and also passed first time.
- **`bun run example` and `bun run check:cli` both exit 0**, which is what
  proves the RLS grants are complete: they drive the real step-down end to end,
  and a missing grant is a permissions error rather than a silent pass.

**Measured, all 2026-08-26, none quoted from memory:**

- **A non-superuser cannot `LOAD 'age'`** — 42501, `access to library "age" is
  not allowed` — and without it `agtype` does not resolve, so every Cypher query
  fails, reads included. This is why RLS is `SET ROLE` from a superuser session
  and not a login role.
- **`LOAD` then `SET ROLE` works**: Cypher read and write both fine, policy
  bites, cross-tenant insert refused with 42501, `RESET ROLE` restores
  everything — which is what makes it a safety boundary and not a security one.
- **drizzle's pg-proxy needs `rowMode: "array"` and its absence is silent**:
  `select().from(t)` returns `[{}, {}]`, right row count, no error, or throws
  `value.map` once a `WHERE` is involved.
- **`bigserial` is a string from `pg` and a number from raw PGlite**; drizzle's
  column mappers normalise it on both.
- Migrations via the node-postgres dialect **22ms**; `resolveTenantContext`
  **74ms cold / 5ms warm** against the container.

**Three defects the tests found rather than review:**

1. A **nested** `graph.inTransaction` cleared the minted-id list before the
   outer verb's `emit` drained it, so the outer event reported creating
   nothing. Asking "am I outermost?" inside the transactor's closure reads 1
   for both cases; it is asked before entering now.
2. **`drizzle-kit` silently ignores `pgRole`** without `entities: { roles: true }`
   and emits a policy naming a role it never creates.
3. **Drizzle's error wrapper prints the bound parameters** — propositions,
   findings, event payloads — and `src/mcp/server.ts` deliberately does not
   catch, so that message reaches the agent. `src/db/trace.ts` refuses to log
   parameters for exactly this reason. `unwrapped()` rethrows the cause; it has
   to match on the wrapper's own `query`/`params` properties because `err.name`
   is the inherited `"Error"`, and the first version caught nothing while
   looking correct.

## Open

Nothing broken. The layering plan is complete and deleted.

**Half of step 6 was declined, with the reason in
`tests/tenancy-isolation.test.ts`.** Moving the graph-isolation cases out of
`tests/domain-graph.test.ts` rests on a false premise —
`resolveTenantContext` scopes nothing — and would weaken "an edge in A cannot
address a node in B", which needs one connection holding both graphs to say
anything about `createEdge`. The two files divide by what isolates: AGE by
schema, the relational side by policy.

**A genuine login boundary is noted and not built.** It needs
`ALTER ROLE labkit_app SET session_preload_libraries = 'age'` so the library
arrives without a `LOAD`. Written down in `drizzle/0004_rls.sql`, unmeasured.

**`provisionTenantGraph()` still opens its own transaction** with raw
`BEGIN`/`COMMIT` rather than the transactor. It is admin DDL that runs before
the application pipeline exists, so it has nothing to join — but it is the one
place left that owns a boundary, and it should be said out loud rather than
noticed later.

**A new relational call site has to remember `unwrapped()`.** Drizzle offers no
hook, so this is convention, and convention is what this repo distrusts. Nothing
checks it.

**Nothing runs `test:pg` for you** — no CI, no hook, and `bun run check` does
not include it. Steps 4 to 6 are the ones only that backend can settle, so it is
worth running before anything else touching roles or tenancy lands.

## Next

PR #29 carries fourteen commits and awaits review.

`docs/TASKS.md` still has no actionable items. The domain modelling behind
PJ-008 §3's open rows is the larger thing waiting, and is what Dan named as the
important work before this run of infrastructure began.
