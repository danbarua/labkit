# Untangling `src/db/` — a plan

**Draft for review, 2026-08-26.** Nothing here is built. Every number in it was
measured today against this tree and a real `apache/age:release_PG18_1.7.0`
container; nothing is quoted from memory or from a doc.

Delete this file when the work lands — the argument belongs in the code, and a
plan that outlives its execution becomes a second description of the system.

## What is actually wrong

Less than it looks. `src/db/` is **acyclic**, with five leaves
(`agtype`, `domain`, `schema`, `extensions`, `migrations`) and a one-method seam
that five modules depend on. The topology is fine. Three specific things are
not.

### 1. The barrel is a fifth wheel

`src/db/index.ts` exports **11 names; 4 are ever imported through it**, while
**47 imports reach into submodules directly** (`db/graph` ×8, `db/cypher` ×5,
`db/client` ×4, …). It is not a public API. It is a file that must be kept in
sync with something nothing depends on.

### 2. Three exports are mis-scoped, not dead

| symbol | truth |
| --- | --- |
| `AgtypeScalar`, `CypherColumn` | used *inside* `agtype.ts` only |
| `AgtypeParseError` | thrown inside `agtype.ts`, never imported or caught |
| `labkitHome` | genuinely unused outside its own default |
| `labkitEvents`, `LabkitEvent` | **not cruft** — the destination of §5 |

The first three want un-exporting. `AgtypeParseError` deserves a second look:
nothing distinguishes it from `Error` at any call site, so it is a class that
buys a name and no behaviour.

### 3. The relational side has no layer at all

The graph side got a whole typed surface — `TenantGraph` → `CypherRunner` →
seam, with decoders and a refused-bad-name `AS` clause builder. The relational
side got nothing, so it grew string concatenation instead. That asymmetry is the
whole of the "string-built SQL nonsense", and it is **four call sites**:

| kind | where | verdict |
| --- | --- | --- |
| Cypher / AGE | most of `graph.ts` | legitimate |
| DDL / provisioning | `provisioning.ts` | legitimate |
| `BEGIN`/`COMMIT` | `graph.ts:102`, `provisioning.ts:50` | legitimate |
| **relational application SQL** | **`tenant.ts` ×2, `event-store.ts` ×2** | **the target** |

## The split: superuser and application

Two handles, assembled once at `main`.

| | holds | is |
| --- | --- | --- |
| **admin** | migrations, provisioning, DDL | the raw connection, undecorated |
| **application** | domain, graph, event store | scoped: role + tenant, traced, transactional |

Provisioning never sees the application handle, so nothing has to special-case
it. This is what makes RLS possible without a carve-out: the DDL simply is not
on that pipeline.

`client.ts` and `connect.ts` are **not** the same thing and should not merge —
`client.ts` is the *interface* (31 lines, 0 dependencies, 5 dependents),
`connect.ts` is *construction*. The confusion is the name: `client.ts` exports
no client. It exports a seam with two permanent implementations.

## The connection model: a lock, not a socket

Today the PGlite backend elects a primary by PID lockfile, starts a
`PGLiteSocketServer`, and **connects to itself over TCP** — the process that
owns the file talks to it through a loopback socket. That is why the raw
instance never escapes.

Measured today:

| | |
| --- | --- |
| cold open (empty dir) | 1031ms |
| **warm open** | **67ms** |
| migrate (first) | 80ms |
| migrate (no-op) | 2ms |
| **full acquire → query → release cycle** | **72ms** |
| query on a held connection | 0.1ms |

And what happens when the primary dies, measured rather than assumed: the
secondary's next query fails with an **uncaught `'error'` event** from `pg` —
`Connection terminated unexpectedly`, the same string CLAUDE.md attributes to
teardown races. The process dies before a `catch` runs. The stale lock is
reclaimed correctly for *new* processes; anyone already connected is gone.

At 72ms a cycle, the socket is not buying anything the use case needs:

- **Multiple agents cannot each hold a connection** — first one in owns the file
  and the rest never connect. So releasing per call is *forced*, not chosen.
- **72ms per MCP tool call** is noise against the domain work in one.
- **The CLI gets cheaper**, not dearer: today it pays a speculative TCP connect,
  possibly a lockfile race, possibly a 25ms poll, then talks over loopback.

So: one exclusive lock, open, work, close. The lock is not optional — PGlite is
file-backed and two processes opening one `dataDir` would corrupt it; today the
socket *is* the mutex, and making it explicit is more honest. Waiting must be a
bounded wait rather than an error: the holder is 72ms away.

`acquirePrimaryLock`'s stale-lock handling (PID check, `ESRCH` → reclaim) is
correct and survives. Only the election and socket around it go.

**`LABKIT_DB_URL` stays**, and is the reason the seam is permanent rather than
collapsible: it is the only route to per-user databases and to real persistence.
Postgres is its own arbiter, so it needs none of the above.

| | PGlite | `LABKIT_DB_URL` |
| --- | --- | --- |
| arbiter | our lock | Postgres |
| `LabKitDB` is | `PGlite` | `pg.Client` |
| migrations | embedded, on open | out-of-band deploy step (PJ-004) |

Verified today: the full CLI lifecycle runs against the container — open,
observe, analyse, promote, close, `known`, `happened` — and the embedded
migrations apply to it out-of-band, four ledger rows. **First time the CLI has
ever been run against real Postgres.**

## One pipeline, and drizzle inside it

`drizzle(client)` takes the *client*. Hand it a `pg.Client` and its queries
never pass through `traced()` — tracing silently stops covering the ORM, and any
later decorator misses it too.

`drizzle-orm/pg-proxy` takes a **callback**, not a connection:

```ts
type RemoteCallback = (sql, params, method) => Promise<{ rows }>
```

That is `LabKitDB.query` with one more argument. **Verified today**: drizzle over
a raw in-process PGlite, one callback invocation, **zero sockets**, correct typed
result from `eq(ev.tenant_id, 2)`. The name means "proxy to wherever you like";
the transport is ours.

```
drizzle (pg-proxy) ─┐
                    ├─→ LabKitDB ─→ traced() ─→ scoped() ─→ PGlite | pg.Client
CypherRunner ───────┘
```

Nothing bypasses. The ORM inherits tracing and every decorator for free.

**Transactions stop being `graph.ts`'s.** It owns them because it was the only
citizen in `src/db/` when it was written — an accident, not a design. Today
`event-store.record()` depends on an implementation detail of
`graph.inTransaction`; when the boundary moves onto the pipeline, both become
participants of a transaction neither owns.

## Tenancy: a policy, not a convention

Measured: production has **exactly two** `resolveTenantContext` call sites —
`src/cli/session.ts` and `src/mcp/server.ts` — both once, at assembly. One tenant
per process. Multi-tenant-per-process exists only in tests.

So the role and the tenant are **session-scoped**, set once where the scoped
handle is assembled. Not threaded through `TenantGraph`, not per transaction.

RLS was tested on both backends today:

| | rows visible | cross-tenant insert |
| --- | --- | --- |
| PGlite, superuser, `ENABLE` | all | allowed |
| PGlite, superuser, `+ FORCE` | all | allowed |
| **PGlite, `SET ROLE labkit_app`** | **only its own** | **refused by policy** |
| **Postgres, `labkit_app` login** | **5 of 6, then 1 of 6** | **refused by policy** |

**Superusers bypass RLS unconditionally** — `FORCE` is not enough, and that is
the trap to know about. A non-superuser role is required.

Drizzle declares this in the schema: `pgPolicy` and `pgRole` are parameters of
`pgTable` (both verified exported from `drizzle-orm/pg-core`), so the policy
lives beside `labkitEvents` in `schema.ts` and `db:generate` emits the DDL.
**`drizzle.config.ts` needs `entities.roles` enabled** or drizzle-kit ignores
role declarations — the config is currently three lines and has no `entities`
key, so this is required, not optional.

AGE needs none of it: `graph_name` is `'labkit_t' || id`, so each tenant already
has its own graph. RLS covers the two relational tables. `tenants` cannot have a
policy — it must be read to resolve a slug *before* the tenant is known.

## Sequence

Each step green on `bun run check` before the next.

1. **Naming and cruft.** Un-export the three `agtype` internals; drop
   `labkitHome`'s export; delete or trim the barrel; rename `client.ts`.
2. **Kill the socket.** Lock, open, work, close. Delete `derivePort`,
   `tryClient`, `waitForClient`, `PGLiteSocketServer`, the `selfClient`
   loopback, `role: "primary" | "secondary"`, `check:pglite-concurrency`,
   `tests/leader-election.test.ts`, and the fresh-connection-per-test
   containment in `tests/helpers/db.ts`. Drop `@electric-sql/pglite-socket`.
   **`src/mcp/server.ts` must release its connection between tool calls** — the
   one piece of real work here rather than deletion.
3. **The pipeline.** `scoped()` beside `traced()`; transaction ownership moves
   off `graph.ts`; drizzle mounted via `pg-proxy`.
4. **RLS.** `pgPolicy`/`pgRole` in `schema.ts`, `entities.roles` in the config,
   role and tenant set where the scoped handle is assembled.
5. **The four SQL sites.** `event-store.ts` ×2 onto `labkitEvents` — which
   finally gives that table its first reader — and `tenant.ts` ×2 onto `tenants`.

## What the tests lose, and why that is right

`tests/helpers/db.ts` boots a PGlite, wraps it in a socket server, and hands each
test a fresh `pg.Client`. Its stated reason is that tests should see the shape
production talks through. **That justification inverts**: if production opens
PGlite directly, a test sharing the instance is *more* faithful, not less.

- fresh connection per test → contains the pglite-socket corruption bug, **which
  is the socket**; nothing left to contain
- `scenario.current()`'s second reader → CLAUDE.md already rates its marginal
  proof "nil"
- `tests/leader-election.test.ts` → tests the thing being deleted, and is the
  suite's flakiest
- `reset()` at 35-40ms and 29% of query time → *probably* cheaper. **Unmeasured.
  Do not bank it.**

The seam is untouched by all of this, which is the tell that it is the right cut.

## Open for review

1. **Barrel** — delete `src/db/index.ts`, or trim to the four used names?
   *(Leaning delete: 47 imports already bypass it.)*
2. **`client.ts`** — rename to `seam.ts`, or fold `LabKitDB` into `backend.ts`
   beside `LabKitDBConnection`?
3. **Transaction ownership** — onto the pipeline, or keep it in `graph.ts` and
   have the event store keep depending on it?
4. **Isolation tests** — `tests/domain-graph.test.ts` resolves `tenant-a` and
   `tenant-b` on one connection, which session-scoped tenancy breaks. One
   connection per tenant (closer to production), or keep tenant scoping
   transaction-local?

## Not in this plan

- **Deriving the tenant slug from the project path.** Robust tenancy makes it a
  detail; it is not one until then.
- **`AgtypeParseError`'s fate.** Named in §2, deliberately not decided.
- **A pre-flight extension check for the Postgres path.** `bootstrapSession`
  runs `LOAD 'age'` on both paths, but a real Postgres needs `CREATE EXTENSION`
  to have happened out-of-band and nothing verifies it. A connect-time assertion
  would turn a confusing mid-query failure into one sentence at startup.
