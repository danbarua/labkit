# 040: the binary, then the first cuts at `src/db/`

**Session wrap, 2026-08-25/26, on `fix/binary-migrations`.** Not a decision
record — the asset-embedding design is argued in `src/db/migrations.ts` and
`src/db/extensions.ts`, the connection model in `src/db/backend.ts`, and the
whole layering argument in `docs/db-layering-plan.md`.

Range is exactly this session: baseline `0099d5b`, the merge of PR #28, closed
with `close-entry.sh` when that merged. Nine commits, all on **PR #29**, which
grew from one bug fix into the first two steps of a layering plan because the
plan touches migrations and Dan asked to keep it on one branch.

This entry was written when the session was only the binary fix, and is
rewritten here to cover what followed. It was renamed for the same reason.

## Goal

Two, in sequence. First `docs/TASKS.md` Task 1: the compiled binary could not
migrate a database that did not exist yet. Then, once that was done and Dan
named it as the next real job: untangle the `src/db/` abstractions so the raw
SQL query function can stay on the seam while drizzle becomes available above
it — starting with a map and a reviewable plan, not with edits.

## Changed

### The binary

**`c7186a1` — the compiled binary works.**

- `src/db/migrations.ts` **new** — the SQL as text imports; rebuilds the
  `MigrationMeta[]` `readMigrationFiles` would have returned, byte-identically.
  Throws by name if the journal and the imports disagree in either direction.
- `src/db/migrate.ts` — drizzle's `migrate()` with its first statement replaced.
- `src/db/extensions.ts` **new** — `bundlePath` for AGE and pgvector, plus
  PGlite's `pgliteWasmModule` / `initdbWasmModule` / `fsBundle`. The two
  tarballs are materialised to a temp file; everything else is read in place.
- `src/db/backend.ts` — takes its extensions and assets from there.
- `src/db/sql-modules.d.ts` **new** — `*.sql`, `*.tar.gz`, `*.wasm`, `*.data`.
- `tests/migrations.test.ts` **new** — deep-compares the embedded builder
  against `readMigrationFiles` over the same folder.
- `scripts/smoke-binary.sh` **new** (`bun run check:binary`).
- `docs/TASKS.md` — Task 1 deleted. The queue now holds only the
  deliberately-not-being-done list.
- `CLAUDE.md`, `package.json`.

**`fc3e007` — the upstream context**, after Dan asked whether we could really be
the first team bundling bun + PGlite + drizzle. We are not, and it is not fixed:
pglite#414 and bun#15032 are the same `ENOENT … /$bunfs/root/pglite.data`, open
since Bun 1.1.33 and labelled outside the maintainers' control. Cited in
`src/db/extensions.ts` and CLAUDE.md so the next reader does not re-derive it.

**`ef941bb` — cull pgvector.** Two references under `src/`, nothing else: no
column, no query, no `CREATE EXTENSION`. It cost a dependency, an embedded
tarball, and half of `streamable()`'s reason to exist. Confirmed against the
container, which does not offer `vector` at all. Dated records keep their
finding; only live statements moved.

**`395749f` — `docs/db-layering-plan.md`**, for review, nothing built. The
`src/db/` map, the superuser/application split, the lock-not-socket connection
model, drizzle via `pg-proxy`, RLS, a sequence and four open questions. It says
to delete itself when the work lands.

**`430bfdb`, `c8901cd`, `c0ab5e4`** are earlier versions of this entry.

### The plan, answered and begun

Dan answered the four open questions: delete the barrel; fold `client.ts` into
`LabKitDBConnection`; take transaction ownership off `graph.ts`; give tenancy
isolation its own suite over the full DB stack.

**`31db527` — delete the barrel, fold the seam into `backend.ts`.**

- `src/db/index.ts` **deleted**. It exported 11 names, 4 were imported through
  it, and 47 imports reached into submodules directly. `src/index.ts` repointed.
- `src/db/client.ts` **deleted**; `LabKitDB` and `bootstrapSession` moved into
  `backend.ts` beside `LabKitDBConnection`. 12 importers repointed, every one of
  them `import type`, so nothing pulls PGlite in by depending on the seam.
- `AgtypeScalar`, `CypherColumn`, `AgtypeParseError`, `labkitHome` un-exported —
  nothing deleted, so `AgtypeParseError`'s fate is still open.
- `CLAUDE.md` module table, `docs/dependency-graph.mmd`.

**`9960eb1` — a lock, not a socket.**

- `src/db/backend.ts` — `pgliteBackend` takes an exclusive PID lock, opens the
  file, runs migrations, works, closes and releases. `pgliteLeaderElectionBackend`,
  `PGLiteSocketServer`, the `selfClient` loopback, `tryClient`, `waitForClient`
  and `role: "primary" | "secondary"` all gone. Waiting is bounded, not an error.
- `src/db/connect.ts` — `derivePort` gone with the port.
- `src/mcp/server.ts` — `buildServer` takes a `WithSurfaces` **scope** rather
  than a surface and a factory, and `main()` opens and closes a connection
  inside it, per tool call.
- `tests/leader-election.test.ts` **deleted**, replaced by
  `tests/connection-lock.test.ts` **new**.
- `tests/helpers/db.ts` — one shared PGlite instance, no socket; `openClient()`
  is a labelled view and its `close()` a no-op; `reset()` split into three calls.
- `scripts/probe-pglite-concurrency.{sh,ts}` **deleted**, with
  `probe:pglite-concurrency` and the `@electric-sql/pglite-socket` dependency.
- Comment sweep across seven test files, `CLAUDE.md`, `biome.jsonc`,
  `examples/full-lifecycle.sh` and `scripts/smoke-cli.sh` — everything that
  described the socket, the election or the port.

Working tree clean at `9960eb1`; pushed.

## Verified

- `bun run check` — **all 16 pass, exit 0**, at each of the three points it was
  run: the binary fix, `31db527` and `9960eb1`.
- Suite at `9960eb1`: **364 pass, 0 fail, 1772 assertions, 52.5s** — down from
  ~63s, which is the socket and the per-test connections going.
- **A full lifecycle through the binary**: open, observe, analyse, promote,
  close, then `known`, `happened` and `--json` from a *second process* against
  the same directory — which is what proves the ledger was written and nothing
  re-applied.
- **Watched to fail**: removing one entry from `EMBEDDED` makes `check:binary`
  name the missing tag and reddens all three migration tests.
- **Five racing CLI writers** against one `--db` directory: all five exited 0,
  all six questions on the record afterwards, lockfile gone.
- **An MCP server and a CLI process writing the same database at once**: four
  handles, no deadlock, all four questions in one `known`. MCP tool call warm
  **94-98ms**; CLI invocation ~330-360ms including bun's own startup.
- `bun run example` exits 0.

**Measured, all on 2026-08-25/26, none quoted from memory:**

- Cycle cost against a real `dataDir`: **cold 1067ms** (open 825, migrate 73,
  tenant 156); **warm 80-96ms** (open 70-85, migrate 2, tenant 7-8, close 2).
  These are what made killing the socket viable, and they are what the 10s
  default lock deadline is sized against.
- **What happened when the primary died**, before it was deleted: the secondary
  took an uncaught `'error'` event from `pg` — `Connection terminated
  unexpectedly`, the same string CLAUDE.md attributes to teardown races — and
  the process was gone before a `catch` ran.
- **Raw PGlite vs `pg.Client`, decoded side by side.** Identical for agtype
  vertices, Cypher scalars, `tenants` rows, `now()` and `labkit_event`.
  Different in two ways: `count(*)` comes back a **number** rather than a
  string, and a multi-statement string **throws**. Both were then chased to
  their call sites rather than assumed harmless.
- **SQLSTATE survives**: `23505` and `42P01` reach a caller off a raw PGlite
  exactly as off `pg`, so `createEdge`'s duplicate-means-success idempotency is
  untouched.
- **What keeps the MCP process alive is stdin, not a held connection.** The
  comment in `server.ts` credited the connection; a process whose only handle is
  a `data` listener on stdin stayed up and kept answering under Bun 1.3.14. This
  was checked *before* restructuring, because the restructure removes the thing
  the comment credited.
- **RLS on both backends.** Superusers bypass it unconditionally and `FORCE` is
  not enough; under a non-superuser role, PGlite showed only the scoped tenant
  and real Postgres showed 5 of 6 then 1 of 6, refusing a cross-tenant insert.
- **`pg-proxy` is a callback, not a socket** — drizzle over a raw in-process
  PGlite, one invocation, zero sockets, correct typed result.
- **The full CLI lifecycle against real Postgres 18.1 + AGE 1.7.0**, with the
  embedded migrations applied out-of-band. First time the CLI has ever been run
  against Postgres.
- **Drizzle's documented advice was tested, not argued about.** Its docs say to
  copy `drizzle/` alongside the build output. A binary built that way, with
  `migrationsFolder` resolved next to `process.execPath`, finds the folder
  correctly and then dies on `pglite.data` — so it fixes at most one of the
  three.

## Open

Nothing broken. `docs/TASKS.md` has no actionable items left.

**Four of the plan's six steps are unbuilt**: the pipeline (`scoped()` beside
`traced()`, transaction ownership off `graph.ts`, drizzle mounted via
`pg-proxy`), RLS, the four raw-SQL sites, and the tenancy-isolation suite.

**`src/domain/event-store.ts` still builds its `WHERE` clause by array-push and
`$${params.push(v)}`** — one of the four sites, and `labkitEvents` is a fully
declared `pgTable` with still **zero readers**.

**Migrations are not hand-rolled**, which is worth stating because the change
looks like it. `dialect.migrate()` is drizzle's — its ledger, transaction and
skip logic, untouched — and the SQL is still drizzle-kit's under `drizzle/`.
What was replaced is `readMigrationFiles`: ten lines reading a journal and
hashing a file, held to drizzle's own output by `tests/migrations.test.ts`.

**One tension the plan named and step 2 did not resolve**: the test suite now
shares a single database session, and session-scoped tenancy wants a session per
tenant. The isolation suite will get its concurrency proof from the container
over `LABKIT_DB_URL`; sequential open-as-A/close/open-as-B reproduces the
visibility claim on PGlite at ~90ms a cycle.

Two things named across entries 034-039 and still unbuilt, neither queued:
`docs/cli.md` generated from `src/cli/program.ts`'s command surface in the shape
of `docs/mcp-tools.md`, and shell completions from the same surface.

## Next

Step 3 of `docs/db-layering-plan.md`: `scoped()` beside `traced()` in
`src/db/trace.ts`'s decorator shape, transaction ownership moved out of
`src/db/graph.ts`'s `inTransaction` to the top of the pipeline, and drizzle
mounted through `drizzle-orm/pg-proxy` over `LabKitDB.query`. Then RLS, the four
SQL sites, and `tests/tenancy-isolation.test.ts`.

PR #29 is open and carries all nine commits.
