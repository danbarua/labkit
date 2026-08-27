# 051: a worktree resolved to itself, not to the repository

**Session wrap, 2026-08-27, on `fix/worktree-database-split`.** Not a decision
record — the reasoning is in `src/db/connect.ts`'s `gitProjectRoot` and in
CLAUDE.md's "Where the database lives".

Open as **PR #45**. A new entry rather than more of 050: that entry is the
digest design, and this is an unrelated shipped fix.

## Goal

Relayed from Dan via `labkit-review`, from his question — *"in a db-per-project
deployment, is the labkit db resolvable from a git worktree?"* It was not.

## Changed

**`f8b5f92`** — `src/db/connect.ts` asks git before walking;
`tests/project-root.test.ts` gains six tests; CLAUDE.md's paragraph updated.

**`2f94464`** — a command that is about to create a record says so, on stderr,
once. `scripts/smoke-cli.sh` asserts both halves.

**`018efac`** — the gap Dan found reviewing from `exo-ledger`: the fallback
could not solve the bug it was the fallback for. With git absent, a sibling
worktree walks up, misses the repository and creates a database exactly as
before — and a compiled binary on a host without git is what `bun run build`
ships. A linked worktree's `.git` is a *file* naming
`…/.git/worktrees/<name>`, so the same answer is available with no subprocess.
Order is now `LABKIT_HOME` → git → read `.git` → walk → cwd.

## Verified

**The defect, measured before fixing.** Three `.labkit/` directories existed for
one project. `git rev-parse --path-format=absolute --git-common-dir` returns the
main checkout's `.git` from the main checkout, from a worktree, and from a
nested subdirectory of a worktree; it fails outside a repository, which is what
keeps the walk as a fallback rather than a replacement.

**The fix, live**: from this worktree, and from `src/db` inside it,
`resolveProjectRoot` now returns `/Users/dan/Code/science/labkit`. From `/tmp`
it returns `/tmp`.

**Six tests build real repositories and real worktrees**, because the bug *is*
the layout — a test that only ever runs in a normal checkout cannot fail either
way, which is the shape that let this ship. **Negative control run:** with the
git lookup removed, three go red, and the non-git and `LABKIT_HOME` cases
correctly stay green.

`bun run check` — all 18.

**There was no cruft in the toolchain, and this was measured before anything
was changed.** `bun run check` — all 18 gates, including `check:cli` and
`check:binary`, both of which drive a real database — and `bun run example` each
leave no `.labkit` behind. Every script in `scripts/` and `examples/` pins
`--db` into a `mktemp -d` removed on exit. Tests boot PGlite in memory. Dan's
instruction was to clear out anything that writes to `.labkit`; the honest
finding is that nothing in the repository does.

**Negative control on the new assertion:** remove the `announceNewRecord` call
and `check:cli` fails naming it.

**The fallback's first tests were passing through the subprocess, and their own
control caught it.** They hid `git` by emptying `PATH`, with one test asserting
`git` really was hidden. That test failed — under bun 1.3.14 `spawnSync` finds
`git` with `PATH` set to the empty string, unset, *or* pointing at an empty
directory, all three measured. So the four tests beside it had been exercising
the subprocess while naming the filesystem. Rewritten as direct tests of
`dotGitProjectRoot`, with the reason for the export written into it.

## Open

**Dan asked whether anyone had actually been using LabKit without saying so.
They had not, and checking rather than assuming changed what the fix means.**
The three databases were inspected on copies: `feat-mcp-server`'s is empty in
every bucket and its event log reports nothing; the other two **will not open**,
dying on `0004_rls.sql`, so they predate 2026-08-26.

**A brand-new empty database is 42M**, so 41M / 60M / 41M carried no information
about content at all. The relayed note that *"60M is the largest, so it may hold
something"* was reading meaning into a number that has none — the third peer
claim today whose conclusion was fine and whose stated evidence was not.

That sharpens the case rather than softening it: **the fragmentation was
invisible precisely because the records were empty.** The first time it would
have mattered is the first time anyone recorded something real, and by then the
record would have been split across three trees with nothing to notice it by.

**`--path-format=absolute` is load-bearing and easy to drop.** The bare form
returns a *relative* path at the top of a normal checkout — it prints `.git`,
whose dirname is `.` — which would resolve every project to the process's
working directory. That failure would pass every test written from a worktree.

**Dan reviewed the PR from `exo-ledger` and corrected an overstated premise.**
*"A worktree is a sibling of the main checkout"* is true of this repository's
layout and not of worktrees generally — exo nests them under
`.claude/worktrees/`, where a walk *would* find the root. The fix is correct for
both, which puts it on the stronger footing of `--git-common-dir` being the
right question rather than on the sibling premise.

**All three were deleted by Dan.** His reading, and it is better than the one
in this entry's first draft: *the existence of those databases is the error, not
the migrations.* Pre-first-deploy in-place migration edits are the documented
policy, so a database from 20 August has no claim on being openable — "stranded
by a migration edit" describes the policy working. The artefact was the bug.

**Reading them was not free either.** `labkit-review` reported that their own
`bun run dev known` opened one and ran migrations partway before failing, so its
mtime is their command rather than old data. Mine were inspected on copies with
the lockfile removed, which is why the originals kept their timestamps — but the
general point stands and is worth carrying: **inspecting a LabKit database
mutates it**, because `runMigrations()` runs on every open.

**The source of the three databases was found, and it was not what this entry
first said.** `examples/full-lifecycle.ts`, deleted in `8f57fef`, opened with
`connectDb(process.cwd())` — no temporary directory. `bun run example` wrote a
`.labkit/` into whichever tree it was run from, which is three trees and three
databases. It was replaced on 2026-08-25 by `examples/full-lifecycle.sh`, which
pins `--db` into a `mktemp -d`, so the measurement taken today came back clean
and **"clean now" was mistaken for "never was"**. Dan's question — *"who runs
`bun run dev`? I never have"* — is what forced the check; the assertion of
hand-typed commands had been made twice, in a commit message and in this entry,
without looking.

Two other candidates were eliminated on the way: `mcpServers` is empty in the
user's config, so no MCP client ever launched it, and
`tests/mcp-stdio.test.ts` says in a comment that *a test must not write into the
repo* and uses `mkdtemp` — someone had already hit this.

**The remedy was not a guard, and working that out is the useful part.** The
residue came from hand-typed commands, not from tooling, so there was nothing to
fix in the scripts. Creating a record is what the first command in a new project
is *supposed* to do — the defect is that it happens silently, producing an empty
42MB database that answers "nothing" to everything and reads exactly like an
untouched project. One line on stderr, once. Not phrased as a warning: on a real
first run this is correct and expected, and crying wolf there teaches a reader
to ignore the line in the case that matters.

## Next

PR #45 carries the split, the silence that hid it, and the no-git fallback.

**Awaiting a decision before more goes in**: Dan asked for the request DTO to be
logged with the error when a command fails. It conflicts on its face with the
argument behind `unwrapped()` and `src/db/trace.ts`, both of which refuse to log
bound parameters because an error *message* reaches the calling agent verbatim
over MCP. The distinction that resolves it is the **stream** — message to the
agent, DTO to the operator's stderr — but where the wrapper sits, and whether
research prose is logged whole, are his calls and were put to him rather than
assumed.

Then the digest work: `feat/digest-design-2` carries the revised design, and
§8's build order says the §2 scenario is next — a promoted, closed answer whose
claim is held to a failed or never-run criterion, with the scenario picking the
bucket.
