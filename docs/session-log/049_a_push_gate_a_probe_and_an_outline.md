# 049: a push gate, a probe, and an outline

**Session wrap, 2026-08-26/27, across three branches — `fix/wrap-on-push`,
`docs/wrap-entries-recovered`, `docs/outline-and-probe`.** Three because each
of the first two had its pull request merged out from under work still being
pushed to it; see Open. Renamed — it began as one gate and its test,
and the gate's first firing turned up work that outgrew the title.

**PR #39** (`ffe1fb2`) and **PR #40** (`f462fcd`) are merged; **PR #41** carries
the rest. The first entry written under the rule it describes, and the first
eaten by the window it predicted.

## Goal

Dan, on watching a wrap commit threaten to become PR #39: make the hook fire on
a push rather than on every commit. Then, once it fired and lost two entries to
a squash: a status review, and the four items it produced.

## Changed

**The range is wider than this entry.** `collect.sh` flags `82342ed` as touching
another entry's file — it touches 048, which it restores, and is this session's
own commit. The range also contains `25f3348`, PR #38's merge, which entry 048
covers.

**`457bf9d`** (merged as `ffe1fb2`, PR #39) — `.claude/skills/wrap/wrap-hook.sh`
gains one gate; SKILL.md's Notes record it.

**`82342ed`** (PR #40) — restores 048 *and* this entry onto `main`, and adds the
merge race to `docs/TASKS.md`. Both had been pushed to branches whose pull
requests were already merged; see Open.

**`0259242`, `e721c8f`** — `.githooks/pre-push` and the fix that keys it on the
remote ref; `scripts/install-hooks.sh` and `dev:install-hooks`. See Open.

**`776ee82`** — Dan's "never fire on `main`" guard, ported verbatim from his
uncommitted change in the main checkout. **Not verified here**: a synthetic
two-repo harness never fired on its own control, so it demonstrated nothing and
is not written up as though it did.

**Both hooks are tracked and `core.hooksPath` is shared between worktrees**, so
neither needs installing twice — the config in `.git/config` already reads
`.githooks` for all three checkouts, and `.githooks` being relative means each
resolves its own copy.

**`dc07f40`** — four things Dan asked for after the review:

- **`CLAUDE.md` gets an outline.** 1,606 lines and no header below `##`; the
  longest run of prose with nothing to skim by was **175 lines**, now 76.
  Thirty-eight headers, no text moved and nothing deleted — deliberately, so
  there is something to read the file against before deciding what to cull.
  `## Commands` was the worst of it: 364 lines covering the command table, the
  binary's leak, the CLI, the MCP server, shell traps, CI, the check sweep and
  biome, under one word.
- **The login-role boundary is measured, not deferred** — see Verified.
  `src/db/scoped.ts` carries the result with its date.
- **`docs/mcp-server/` deleted**, 184 lines. Its status table recorded the
  agent-facing write contract as not done against 18 shipped write tools, and
  the suite ceiling as unresolved after it was re-measured to zero. The two
  ideas worth keeping went into `docs/TASKS.md` first.
- **The wrap race moves to a `## Tooling, not product` section.** Dan: `/wrap`
  is an annoyance that has been necessary, and is not something we ship.

**`6797e54`** — moves the stale-document finding below into `docs/TASKS.md`. It
had been written into the Next section of this entry and nowhere else, which is
the wrong place: a session log is disposable and the queue is not. Dan caught
it by asking whether any of it was in `TASKS.md`. Worth knowing for the next
review that produces findings — **a review's output is queue material, and
putting it in the handover only looks like recording it.**

048 was first lost in **#38's** squash — pushed to `docs/ledger-owners` shortly
before the merge, recovered from `5360287` — and then lost again with 049 in
**#39's**.

## Verified

Four states, run rather than reasoned about:

| state | result |
| --- | --- |
| committed, not pushed | quiet |
| pushed | **fires, once** |
| same HEAD again | quiet |
| entry committed, unpushed | quiet |
| entry pushed | quiet — only the session log changed |

`bun run check` — all 17 pass, twice: at `457bf9d` and again at `82342ed`
(55.8s for the suite).

**The login-role probe, 2026-08-27, and the answer is yes.** Against
`docker/postgres`, which runs `postgres -c shared_preload_libraries=age`, a
plain LOGIN role that never issues `LOAD`:

| | result |
| --- | --- |
| `agtype` resolves | works |
| Cypher read | works |
| **Cypher write — `createNode`** | works, minted a natural id |
| **Cypher write — `createEdge`** | works, connected two nodes |
| `LOAD 'age'` | refused, 42501 — and never needed |
| `SET ROLE postgres` | **refused, 42501** |

The write half had never been run; the read half had. That last row is the
whole difference from the step-down we ship, whose session can `RESET ROLE`
back to superuser — a safety boundary rather than a security one. What is
unbuilt is the seam, and it is per-backend: PGlite has no preload and exactly
one superuser session, so it keeps the step-down.

The probe was written, run, and deleted, along with its database and role.

**The orphaning was found by comparison, not by any check.** `git merge-base
--is-ancestor` against `origin/main` is what showed both entries missing; the
merge reported success and nothing else disagreed with it.

**A silenced stderr cost a commit its contents.** `git add … docs/mcp-server`
was run with `2>/dev/null` after the directory had already been removed, so the
pathspec error was invisible and `git add` aborted having staged nothing. The
commit carried the deletion alone while its message described four changes.
Caught by reading `git show --stat` rather than trusting the exit code, and
amended. The repo's own header has this as a rule; it was broken by the person
applying it.

**The first probe proved nothing, twice over**, and both failures are worth
knowing before writing another. An empty `--allow-empty` commit tripped the
existing empty-range guard, so the run exercised that rather than the gate. And
a `git reset --hard` inside the probe silently reverted the *uncommitted* hook
change under test, so the second run exercised the **old** hook and reported the
opposite of the truth. It was caught only because the result was backwards from
what the gate should do — a probe that had agreed with the hypothesis would have
been believed.

## Open

**`asked` is deliberately not advanced when the work is unpushed**, and that is
the one thing to preserve if this is ever edited. Advancing it would mark the
HEAD handled, and the push that follows — same HEAD — would be skipped by the
check above, so the work would never be wrapped at all.

**No `main` guard was added.** `labkit-review` reported disabling the hook on
`main`; nothing to that effect is in the merged hook or `.claude/settings.json`,
so their change is unmerged or local. Duplicating a guard that cannot be seen
seemed worse than leaving it.

**It has now happened three times, and the third one ate the work rather than
the write-up.** PR #40 was merged at 23:04:38, squashed at `0cbfaeb`; everything
pushed to that branch afterwards — the `CLAUDE.md` outline, the login-role
measurement, the deletion of `docs/mcp-server/`, the queue restructure and this
entry's rewrite — was on a merged branch and not in `main`. Recovered by
cherry-picking onto `docs/outline-and-probe`, verified by diffing the trees.

**What the third instance changes:** this is not a wrap-tooling annoyance. The
same race takes code. And the operative mistake is mine and simpler than the
race — **I kept pushing to a branch whose pull request was already merged.**
Nothing warned me, because nothing looks wrong: the push succeeds, the branch
exists, `git log` is fine. The only tell is comparing against `origin/main`,
which is not a thing anyone does by habit.

**A `pre-push` hook now refuses it**, which is Dan's answer to the third
instance and a better one than the wrap gate: the wrap gate narrowed one
symptom, and the hook refuses the act. `.githooks/pre-push` asks `gh` for the
pull request's state — a squash merge leaves no ancestry `git merge-base` can
find, so the local repository genuinely does not know — and refuses on `MERGED`
or `CLOSED`, naming the recovery commands. It refuses rather than passes when
`gh` is absent. Turned on by `bun run dev:install-hooks`, because hooks are not
cloned.

**Two bugs in it, both found by running it and neither by reading it, and both
with the same tell — every test passed, including the one that had to fail.**
It read all-zeroes on the *remote* side as a deletion, which actually means "new
branch there", so the merged branch it exists to refuse was skipped before `gh`
was ever asked. And it took the branch name from the **local** ref, so
`git push origin HEAD:refs/heads/foo` — writing `foo` on the remote under the
pull request's name — skipped the check completely; that one surfaced only
because a `--dry-run` said `Everything up-to-date` and I went looking for a
push that would actually reach the hook. Ten states are checked now.

Third time in this session that a probe agreeing with me would have been
believed.

**The squash that ate 048 did it again, to this entry, forty-five seconds
later.** The prediction above was written, pushed, and immediately confirmed:
`ffe1fb2` was cut from `457bf9d` at 23:37:00; the commit carrying 048 and 049
was authored at 23:37:45 and is not in it. So both entries were orphaned on a
branch whose pull request was already closed, and this is the second consecutive
squash to eat 048.

Firing on a push makes the window *smaller* and demonstrably does not close it —
a wrap still loses a race against a merge that is already in flight. It is a
race, not a rule violation, so "remember to push before merging" is not an
available remedy. What would close it: a check that refuses a merge whose branch
has commits the merge commit does not contain, or a wrap that writes to `main`
rather than to the branch. Queued in `docs/TASKS.md`; neither is built.

**`f042c0e`** (PR #42, after #41 merged) — the login role moves out of the DB
loose ends and under a new `### Deferred until multi-tenancy is real` in
`docs/TASKS.md`. It had been reading as *available and unbuilt*, which invites
building it; the trigger is named instead — a second party able to reach the
database. Nothing is exposed by leaving it, LabKit being one tenant per process
on the operator's own machine.

**`99cbd66`, `29c6109`** — the crud, cleared in one batch on Dan's instruction
to stop opening a PR per change.

- **Four DB loose ends gone.** `provisionTenantGraph()` joins the transactor —
  and the hazard was real rather than tidiness: a `resolveTenantContext()`
  called inside an open transaction would have had its `COMMIT` end the
  caller's transaction early and silently. Threading cost almost nothing
  because every call site already had a transactor. `check:orm-unwrapped` is a
  new AST check tracking the value `ormOver()` returns. `LABKIT_HOME` naming a
  missing path is refused rather than built. An existing `.labkit/` above cwd
  is found when it is unset. `tests/project-root.test.ts` covers the last two,
  and three of its eight go red when the behaviour is removed.
- **`docs/persistence.md` is a move, not a new explainer**, which is
  `labkit-review`'s call and the right one: CLAUDE.md already held ~350 lines
  on the subject, so composing beside it would have put one subsystem in two
  places. Four sections lifted verbatim, `persistence-spikes.md` folded in as
  dated findings and deleted, a pointer left with the three rules that are
  quiet to break. AGE gotchas stayed — needed before writing a query, not
  looked up after. **CLAUDE.md 1,716 → 1,365.**
- **The one live defect in `labkit-review`'s 88/100 audit is fixed**: `labkit
  mcp` and `src/cli/commands/serve.ts` appeared nowhere, so two lines still
  sent a reader to `src/mcp/server.ts` for an entry point that has been a
  subcommand since PR #35.

**`labkit-review` found why the guard harness never fired**, and it was the push
gate, not the branch check: the fake upstream was an `update-ref` with no bare
remote and no actual push, so `@{upstream}` never matched HEAD and the run was
silenced before the guard was reached. Their own table — quiet on `main`, quiet
with no upstream, fires when genuinely pushed — is the verification; it is in on
their measurement, not re-run here.

**Two self-inflicted losses, both from blunt git.** `git add … <deleted path>`
with stderr silenced aborted the whole stage, so a commit shipped one file while
its message described four. And `git checkout -- src/db/connect.ts`, reached for
to undo a one-line test mutation, discarded the entire edit instead; it was
redone from scratch. Neither cost anything permanent. Both were the same
mistake: using a command that resets to HEAD when what was wanted was to undo
the last thing typed.

## Next

PRs #39, #40 and #41 are merged. **#42 is open** and everything since batches
into it.

**The queue's remaining crud is one item and a wait**: the `CLAUDE.md` sweep,
now with `labkit-review`'s specific move written into it — leave the command
block, lift `### The CLI`, the binary, the MCP paragraphs and formatting out to
a surfaces section — and Drizzle v1, still unreleased.

Then the two agent-facing items, which Dan has held until the crud is clear.

The queue's own recommendation, unchanged by any of this: the two agent-facing
items — orientation, and dogfooding LabKit on its own open questions — are the
same piece of work and the only thing on the list that is not housekeeping.

Everything the review produced is now in `docs/TASKS.md` or done. What it left
for next time:

- **`## Commands` in `CLAUDE.md` is not about commands** — most of it is
  architecture and hard-won traps. It probably wants splitting rather than
  trimming, and the outline is what made that visible.
- **The document blocks in `## What this is` are split in two** by the section
  on working alongside another session. Left alone: moving prose is culling,
  and the outline came first on purpose.

Then `docs/TASKS.md`'s documents group: the CLAUDE.md stale-prose sweep, and
`docs/persistence-spikes.md` becoming `docs/persistence.md`.
