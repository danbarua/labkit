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
- **A real login-role boundary works and is unbuilt.** Probed end to end
  2026-08-27 against `docker/postgres`, which preloads AGE: a plain LOGIN role
  that never issues `LOAD` resolves `agtype`, reads through Cypher, and
  **writes** — `createNode` minted a natural id and `createEdge` connected two
  nodes. It is refused `LOAD` (42501, and never needs it) and refused
  `SET ROLE postgres` (42501), which is the difference that matters: the
  step-down we ship today is a safety boundary precisely because a session can
  `RESET ROLE` back to superuser, and a login role cannot. Both halves are now
  measured; what is unbuilt is the seam. It is per-backend — PGlite has no
  preload and one superuser session, so it keeps the step-down — which is the
  design question to answer before writing any of it. See `src/db/scoped.ts`.
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

## The agent-facing surface

Extracted from `docs/mcp-server/001_domain-consumer_feedback_and_next_steps.md`
before it was deleted — a captured conversation from 2026-08-22 whose status
table had gone wrong in every row that could. These two ideas were the part
worth keeping.

- **Dogfood LabKit on LabKit, narrowly.** Not the two hundred commits and not
  the journal — the things that generated the most recursive work: open design
  questions and their discriminators, review findings that spawn follow-up
  work, decisions that close or narrow them, boundaries versus actionable
  defects, tasks that exist only because another task exposed something, and
  "do not build this yet" conclusions with what would reopen them. That is
  where the markdown became a coordination mechanism rather than
  documentation. The success criterion is concrete and is not "replace
  markdown": an agent asks LabKit *what should I investigate next, and why*
  and gets the answer with its supporting chain and the things deliberately not
  being done, instead of reading N files. If it still needs a parallel queue,
  ledger, journal and session log to explain what LabKit means, that is a
  product finding.
- **An agent that does not already know an identifier cannot orient.** Every
  read tool answers well *once the caller knows* the proposition, enquiry,
  artefact or analysis it wants. None answers: what am I working on, why does
  it exist, what is blocked, what is deliberately not being done, what decision
  is waiting on evidence, which work is ready, what evidence would change the
  state. `claims_asserting` is the only entry point from text and it refuses to
  pick. This is the half that would replace queue-scanning rather than
  answering questions about objects already named.

## Tooling, not product

`/wrap` is scaffolding. It has been necessary and it is an annoyance; nothing
here ships.

- **A wrap entry pushed while its pull request is merging is lost, silently.**
  A squash merge takes the branch as it stood when the merge commit was cut, so
  a wrap pushed after that moment is not in `main` and nothing reports it. It
  has happened twice — entry 048 to PR #38, then 048 *and* 049 to PR #39,
  forty-five seconds after the squash. Firing the hook on a push narrowed the
  window and did not close it; it is a race, so "push before merging" is not a
  remedy. Two candidate fixes, neither built: a check that refuses when a merged
  branch holds commits the merge does not contain, or a wrap that writes to
  `main` rather than to the branch.

## Deliberately not being done

Here so nobody re-discovers them as gaps.

- **Bitemporality.** Record-time versus belief-time is real and unrepresentable,
  and no source obligation requires it. `Decision.decided_at` is record time.
- **An instant on `EvidenceUnit`.** Would let `whatWasKnown()` split `open` into
  worked-on and untouched. Nothing has needed it.
