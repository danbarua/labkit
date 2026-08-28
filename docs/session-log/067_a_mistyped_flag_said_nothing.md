# 067: a mistyped flag said nothing and made a database

**Session wrap, 2026-08-28, across `fix/enum-flag-typos-say-so`,
`chore/board-triage-as-a-script` and `fix/ports-per-worktree`.** Not a decision record — each finding's
reasoning is in its commit and PR.

**Renumbered from 066.** A peer's entry took that number via #99 while this was
in flight and merged first, so this one moves — the collision SKILL.md
anticipates, resolved the way it says.

**This session's commits are `72ea99a`, `d3365e4` and `0f59baa`**, plus this
entry's own.
Everything else between the baseline and HEAD is a peer merge (#82 onward),
with entries 064, 065 and the other 066 covering the most recent.

## Goal

Act on a cold review of #93, rank the open backlog, then take the top of it.

## Changed

**`72ea99a` — fix(cli): a mistyped --state said nothing and made a database.**
Open as **PR #100**. Four findings, all verified by running them.

- `src/cli/commands/reads.ts` — `gateState`/`workState` moved from inside
  `.action()` to commander's option parser. Option types are
  `ReturnType<typeof gateState>` so they cannot drift from the enum.
- `src/mcp/tools.ts` — `work_list`'s description claimed `blocked` means "a gate
  protecting it is not satisfied"; the code blocks only on a gate that is
  *itself* `blocked`.
- `src/domain/read.ts` — both enumerations sorted by handle.
- `tests/cli/args.test.ts`, `tests/enumeration.test.ts`,
  `tests/mcp-smoke.test.ts` — two new CLI tests, the missing `gateList(state)`
  coverage, and two tool names restored to a comment they had dropped out of.

## Verified

- `bun run check` — **19/19**.
- **The defect, measured before the fix.** `labkit gates --state blockd` printed
  `creating a new record at …` and **nothing else**, exit 1. The message naming
  the four valid states was swallowed, and `logFailedRequest` with it.
- **After:** the message prints with usage, and **no database is created** — the
  refusal now happens during `parseAsync`, before the run wrapper opens one.
- **The negative control, run rather than assumed.** Reverted `reads.ts` to
  `origin/main` and re-ran: `6 pass, 2 fail`. Restored: `8 pass, 0 fail`. Both
  new tests go red against the old code.

The second test is the one that would have caught this. The old code *did*
throw — it reached `run` first, which is what made the database — so asserting
`ran === false` discriminates where asserting the message alone would not.

**For `0f59baa`:** `bun run ports` correct from `main` (offset 0) and from a
worktree (13359); `--version` correct in all three cases, including the no-git
fallback, which omits the name rather than inventing one.

**The collision guard fired on *every* run before it was fixed**, and that is
the finding worth keeping. awk's uninitialised `prev` coerces to `0`, which
matched the main checkout's offset, so the first row always looked like a
collision. **A check that always fails is as useless as one that cannot** —
same defect, opposite sign, and only running it tells you which you have. It
was then made red on purpose against two equal offsets, and silent against two
unequal ones.

**Two silent no-op string edits, one caught by a typechecker and one by an
assert.** A `python .replace()` adding `const VERSION` matched nothing, because
its anchor still named `Globals` — culled two days ago. `.replace()` reports
success on zero matches. The retry asserted, and that assert then caught a
second one while writing *this entry*: an anchor that exists in 059 and not
here. Both were mine, twenty minutes apart, and the assert is the only reason
the second was not silent too.

## Open

**`gateList(state)` had no test at all** before this, and it is the only caller
of the coercion the fix moved. Now covered over every state the fixture
produces, with a length assertion so a filter returning `[]` cannot pass by
agreeing with an empty expectation.

**The backlog is ranked and the board now says so.** The finding worth
keeping: **8 of 17 open issues cannot be started** — four are
`domain model` + `open question`, which CLAUDE.md defines as *defined and
tracked, not ready to work on*; two are `deferred` behind #49; two wait on a
Drizzle and a bun release. The labels already say this and the board's single
Todo/In-progress/Done axis hides it. Recommended filtering the view by label
rather than adding a Parked status, so nothing new can drift.

Applied as 8 Todo, 2 Blocked, 6 Parked, 1 Done. **#57 closed** (by #99) while
this was being written, so the top of Todo is **#95** — a green `/healthz`
answering from another worktree's process — then **#50** (the guard-comment
sweep, 30 measured candidates) and **#55**, which may be closeable now that #93
shipped the enumerations.

**`d3365e4` — the triage as a script, not a session.** PR #101, borrowed from
`exo-ledger`'s PR #60. The first version of this triage was done by hand and
thrown away, so the ranking survived only in this entry; `bun run board:status`
is idempotent and checked in. Two changes from theirs, both refusals: an
unlisted item is an error rather than defaulting to a backlog column, and an
empty listing is an error rather than a loop that runs zero times and exits 0.
Both were made red on purpose before being trusted.

**`0f59baa` — a port per worktree, and a health check that says whose it is.**
PR #102, closing **#95**, which the ranking had put at the top of Todo.

Dan's design, with one correction: **a hash of the worktree path, not an index
into `git worktree list`.** An index is not stable — removing a worktree shifts
every later one, so a stack that was on 18902 silently becomes a different
worktree's port, and it happens during `git worktree remove`, which is exactly
when nobody is thinking about ports. That would have been #95 again by a route
that looks deliberate.

The main checkout keeps offset 0, so `main` still has 5432/8899 and log-scanning
is unchanged. `test:pg` needed one line, not the redesign it looked like: it
already honoured an explicit `LABKIT_DB_URL` and only *defaulted* to 5432.

**Two fixes, and only the second addresses what actually happened.** The
collision is the loud half. What cost the debugging session was `/healthz`
answering green from another checkout's server — so `worktreeName()` now names
the checkout in `/healthz` and in `labkit --version`, which did not exist
before. Isolation prevents the accident; identity makes one that gets through
self-diagnosing.

**A board hazard worth carrying.** `updateProjectV2Field` **replaces the entire
option set** — adding `Blocked` and `Parked` cleared the Status of all
seventeen items and regenerated every option id, with no warning and no error.
Harmless here, since everything was `Todo` and the script was about to set them
all, but on a populated board it is silent data loss. Recorded in the script,
beside the thing that would break.

## Next

**#50** — the next Todo, and the sweep with a measured end: 30 present-tense
guard comments under `src/` and `scripts/`, of a class that produced four
instances across two repos this week.

Review of PR #102 is the only thing outstanding from this session; #100 and
#101 are merged, and **#95 is closed by #102**.
