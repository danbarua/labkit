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
  the system under it was rewritten twice this week. Persistence has since
  moved out to `docs/persistence.md`; what is left and least swept is
  `## Commands`, which is 364 lines and mostly not about commands — it holds
  the binary's leak, the CLI, the MCP server, shell traps, CI and biome. The
  move `labkit-review` suggested: leave the command block, lift the rest into
  a surfaces section or the architecture half. The document inventory in
  `## What this is` is also split in two by an unrelated block, so a reader
  scanning for which document holds what finds half a list and stops.

## Loose ends from the DB layer work

- **Walk the present-tense guard comments once.** A comment saying *guards
  against X* / *prevents* / *ensures* is an assertion about the code and can be
  wrong in silence; one saying *X was possible until <date>, and this stopped
  it* names an event and cannot. 28 comments under `src/` and `scripts/` match
  the first shape (counted 2026-08-27 — `labkit-review` said 30 and the
  difference is not worth chasing). Most are presumably true. The question for
  each is not *is this true* but **what would fail if it were false**, and the
  discriminator is `labkit-review`'s: **delete the guard and run the same input
  again — if it still fails, the guard is not what stopped it.** That is
  PJ-009's bar 1 for earning an edge, pointed one level down. Found because
  `check:orm-unwrapped`'s own comment claimed a protection the typechecker was
  actually providing, and the naive test confirmed the comment.

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
here ships. The item below is here because it stopped being about `/wrap`.

- **Work pushed to a branch whose pull request is already merged is lost,
  silently.** Three times in two days. Twice it took a session-log entry; the
  third time it took a `CLAUDE.md` restructure, a measurement recorded in
  `src/db/scoped.ts`, a file deletion and a queue rewrite. A squash merge takes
  the branch as it stood when the merge commit was cut, and every later push to
  that branch succeeds, leaves the branch looking healthy, and reaches nothing.
  The only tell is diffing against `origin/main`.
  Firing the wrap hook on a push narrowed one instance of this and closed none
  of it, because the real mistake is continuing to work on a merged branch.
  **`.githooks/pre-push` now refuses it** (`bun run dev:install-hooks`), which
  closes the mechanical half. What is left is that hooks are not cloned, so
  every fresh clone and worktree starts unprotected and silently — the one
  remaining way to walk into this.
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

### Deferred until multi-tenancy is real

Built or measured, and parked. The trigger for all of it is the same: a second
party can reach the database — `LABKIT_DB_URL` pointing at a shared Postgres
holding more than one tenant, or anyone but the operator issuing queries.

- **A login role is a real security boundary, and works.** Measured 2026-08-27
  against `docker/postgres`, which preloads AGE: a plain LOGIN role that never
  issues `LOAD` reads *and writes* through Cypher, and is refused
  `SET ROLE postgres` (42501). That refusal is the point — the `SET ROLE`
  step-down we ship today can `RESET ROLE` back to superuser, so it stops a
  query that forgot its tenant filter and not a caller who means harm.
  Nothing is exposed by leaving it: LabKit runs one tenant per process on the
  operator's own machine, where the superuser session is inside the process
  that would be the attacker. It is also per-backend — PGlite has no preload
  and one superuser session, so it keeps the step-down — and designing a seam
  where one backend offers a stronger boundary than the other is the work. See
  `src/db/scoped.ts`.
