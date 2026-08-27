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

**Not decided here:** what becomes of the two unopenable databases. They are
Dan's and nothing was deleted.

## Next

PR #45 awaits review.

Then the digest work: `feat/digest-design-2` carries the revised design, and
§8's build order says the §2 scenario is next — a promoted, closed answer whose
claim is held to a failed or never-run criterion, with the scenario picking the
bucket.
