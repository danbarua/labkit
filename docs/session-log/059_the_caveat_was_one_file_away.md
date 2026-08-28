# 059: the caveat was one file away

**Session wrap, 2026-08-28, on `docs/caveat-nearest-the-claim`.** Not a decision
record — the argument lives on `gitProjectRoot` in `src/db/connect.ts`, which is
the point of the change.

**Entry 058 is closed and covers the CI split** (merged as #73). This one opens
because what followed is unrelated work and no single Goal line covers both.

**The range is far wider than this session.** Nineteen commits sit between the
baseline and HEAD; **`97d2c30` is the only one written here.** The rest are peer
merges (#71 through #77).

## Goal

Act on a cross-repo report from `exo-ledger`: a doc comment in this repo states a
general property of git worktrees that is false.

## Changed

**`97d2c30` — docs: the caveat belongs nearest the claim, not one file away.**
Open as **PR #78**. Comment-only; no code changed.

- `src/db/connect.ts` — `gitProjectRoot`'s doc comment said *"a worktree is a
  **sibling** of the main checkout, not a descendant"*. True of this
  repository's layout; `git worktree add` takes any path, and Claude Code nests
  worktrees at `<repo>/.claude/worktrees/<name>`.
- `CLAUDE.md` — two statements of the general form corrected; the surviving one
  now points at the code comment rather than restating the argument.

`connect.ts:149` was already phrased conditionally and is untouched.

## Verified

- `bun run check` — **19/19**, on bun 1.4.0.
- **Both layouts measured rather than assumed**, which is what established that
  no behaviour needed changing:
  - nested worktree, git available → `/Users/dan/Code/science/labkit` ✓
  - nested layout, **no `.git` anywhere** → the parent project ✓

  In a nested worktree the fallback walk finds the parent's `.labkit/` — the
  same answer `--git-common-dir` gives. The two agree; the fallback is not
  wrong there.
- Grepped for a surviving flat claim in both files: none.

## Open

**The DX Principles header does not carry this rule and arguably should.** *A
caveat belongs at the shortest distance from the claim it qualifies* — a
qualification one file away is one that has already failed. Four instances in
two repos this week, three found by someone reading the *other* project's code.
Deliberately not added: it is a bigger change than the fix that was asked for,
and Dan's call.

**Issues #50 and #70 are the standing sweep for this class** and neither is
closed by this. #70 in particular says no check stops the next one, which is
still true — a comment asserting a false general property fails nothing.

**Also this session, none of it in the repo:** #43 closed as already
implemented, with its "one temp file per build" residual **refuted by
measurement** (one per extension per dependency version; a full rebuild
reproduced the identical two files). #54 re-measured on bun 1.4.0 and left open
— `bunfig.toml`'s `[test] timeout` is still ignored, with a positive control
proving the probe could have passed.

**bun on this machine is now 1.4.0**, upgraded to take that measurement. The
sweep is green on it, but a dozen claims in `CLAUDE.md` are measured against
1.3.14 *by name* and **none was re-checked**. They stand as dated records; they
should not be assumed to have carried.

## Next

`gh pr view 78` for review, then the ledger question Dan left open: whether the
caveat-placement rule joins the DX Principles header.
