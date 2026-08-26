# Outstanding work

**A queue, not a record.** Only actionable items live here — a finished item is
**deleted**, not struck through; git history is the record. What the model knows
lives in PJ-008 §3's index table; standing facts and gates live in CLAUDE.md.
Neither is restated here — see CLAUDE.md, "The one rule about documents".

---

## Documents

- **Sweep `CLAUDE.md` for stale prose.** It is long and parts of it describe a
  system two refactors ago. Retire rather than revise where the code now says
  it; the pinned header's sixth rule is what "stale" means, and its tense tell
  makes the sweep a grep rather than a judgement call. The file has grown while
  the system under it was rewritten twice this week — the connection model, the
  testing patterns and the persistence layer are where to start.
- **`docs/persistence-spikes.md` -> `docs/persistence.md`.** It is dated AGE
  findings from 2026-08-17/18 and reads as a lab notebook. What a reader needs
  is a concise explainer of how persistence works now — two backends, one seam,
  a lock, migrations, tenancy. Keep the dated probes that still bite; drop what
  the code has since answered.
- **A wrap entry pushed while its pull request is merging is lost, silently.**
  A squash merge takes the branch as it stood when the merge commit was cut, so
  a wrap pushed after that moment is not in `main` and nothing reports it. It
  has happened twice — entry 048 to PR #38, then 048 *and* 049 to PR #39,
  forty-five seconds after the squash. Firing the hook on a push narrowed the
  window and did not close it; it is a race, so "push before merging" is not a
  remedy. Two candidate fixes, neither built: a check that refuses when a merged
  branch holds commits the merge does not contain, or a wrap that writes to
  `main` rather than to the branch.

## Loose ends from the DB layer work

Each is small and none is blocking.

- **`provisionTenantGraph()` still opens its own transaction** with raw
  `BEGIN`/`COMMIT` rather than `src/db/transactor.ts`. It is admin DDL that runs
  before the application pipeline exists, so it has nothing to join — but it is
  the one boundary left outside the transactor.
- **Nothing checks that a relational call site uses `unwrapped()`.** Drizzle
  offers no hook, so it is convention, and forgetting it leaks bound parameters
  into an error message that reaches an MCP client. Either a `check:` script or
  a reason it does not need one.
- **A real login-role boundary is available and unbuilt.** A server that
  preloads AGE (ours does) plus a `bootstrapSession` that does not issue `LOAD`
  gives a security boundary where `SET ROLE` gives only a safety one. The read
  half is measured; the write half is not. See `src/db/scoped.ts`.
- **`LABKIT_HOME` naming a path that does not exist is manufactured, not
  refused.** `src/db/backend.ts`'s `mkdirSync(lockDir, { recursive: true })`
  creates the whole path, so a typo yields a fresh empty record rather than an
  error — and an empty record looks exactly like a new project. Loud today only
  when the parent happens to be unwritable.
- **`connectDb()` could discover an existing record above it.** Proposed by the
  review session: `LABKIT_HOME` set → use it and require it to exist; unset →
  walk up from cwd for an existing `.labkit/`, and create only at cwd. The walk
  would never decide *where to create*, which is what keeps it from
  reintroducing the implicitness three review rounds removed. It answers the
  case that survives the one binary: a client launched from `packages/foo`
  reports an empty record for a project full of work.
- **Drizzle v1** is release-candidate and we wait for the release. When it
  lands: `.enableRLS()` becomes `pgTable.withRLS()`, and the surfaces most
  likely to break are `src/db/migrate.ts` (it casts through private
  `dialect`/`session` fields) and `src/db/orm.ts` (it depends on `pg-proxy`'s
  callback shape). `drizzle-kit` has a smaller upgrade available independently.

## The suite's margin, and the checks around it

- **The suite runs close to bun's ceiling on a CI worker, and the raised
  ceiling is not headroom.** A `test:pg` run of 368 tests took 208s there, and
  one *test body* — not a hook — failed at 5008ms before the ceiling moved to
  20000ms. Locally the same suite is ~55s. Nothing here measures the margin on
  the machine that actually runs it; `bun run test:in-docker` approximates the
  environment and demonstrably not the speed.
- **`bun run test:in-docker` does not reproduce timing failures.** Green at 2
  cpus and at 1 against a build that was failing. Either find what does — a
  throttled cgroup, an I/O limit — or write down that the tool is for
  environment only, more plainly than its header already does.
- **`bunfig.toml` would delete `check:test-ceiling`.** `[test] timeout` is
  ignored by bun 1.3.14, measured. If a later bun honours it, move the ceiling
  there and remove the check — the trap stops existing rather than being
  guarded.

## Deliberately not being done

Here so nobody re-discovers them as gaps.

- **Bitemporality.** Record-time versus belief-time is real and unrepresentable,
  and no source obligation requires it. `Decision.decided_at` is record time.
- **An instant on `EvidenceUnit`.** Would let `whatWasKnown()` split `open` into
  worked-on and untouched. Nothing has needed it.
