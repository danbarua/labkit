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

**The remedy was not a guard, and working that out is the useful part.** The
residue came from hand-typed commands, not from tooling, so there was nothing to
fix in the scripts. Creating a record is what the first command in a new project
is *supposed* to do — the defect is that it happens silently, producing an empty
42MB database that answers "nothing" to everything and reads exactly like an
untouched project. One line on stderr, once. Not phrased as a warning: on a real
first run this is correct and expected, and crying wolf there teaches a reader
to ignore the line in the case that matters.

## Next

PR #45 awaits review — it now carries both the split and the silence that hid
it.

Then the digest work: `feat/digest-design-2` carries the revised design, and
§8's build order says the §2 scenario is next — a promoted, closed answer whose
claim is held to a failed or never-run criterion, with the scenario picking the
bucket.
