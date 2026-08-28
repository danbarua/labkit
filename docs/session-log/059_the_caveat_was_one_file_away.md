# 059: the caveat was one file away

**Session wrap, 2026-08-28, on `docs/caveat-nearest-the-claim` then
`docs/unstale-bun-claims`.** Not a decision record — each argument lives on the
code it is about, which is the point of both changes.

**Entry 058 is closed and covers the CI split** (merged as #73). This one opens
because what followed is unrelated work and no single Goal line covers both.

**The range is far wider than this session.** This session's commits are
`97d2c30` and `7d0d86e`, plus this entry's own; everything else between the
baseline and HEAD is a peer merge (#71 onward).

## Goal

Correct claims in this repo that had stopped being true — first one reported
from `exo-ledger`, then every version-pinned claim the day's bun upgrade put in
doubt.

## Changed

**`97d2c30` — docs: the caveat belongs nearest the claim, not one file away.**
Merged as **#78**. Comment-only; no code changed.

- `src/db/connect.ts` — `gitProjectRoot`'s doc comment said *"a worktree is a
  **sibling** of the main checkout, not a descendant"*. True of this
  repository's layout; `git worktree add` takes any path, and Claude Code nests
  worktrees at `<repo>/.claude/worktrees/<name>`.
- `CLAUDE.md` — two statements of the general form corrected; the surviving one
  now points at the code comment rather than restating the argument.

`connect.ts:149` was already phrased conditionally and is untouched.

**`7d0d86e` — docs: re-measure the bun-pinned claims on 1.4.0; two had gone
stale.** Open as **PR #79**. `CLAUDE.md`, `src/cli/palette.ts`,
`src/db/connect.ts`, `scripts/build-binary.sh`. Ten claims name bun 1.3.14; five
were cheap to re-run and were re-run.

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

**For `7d0d86e`, five claims re-measured on bun 1.4.0. Two had changed:**

| claim | 1.3.14 | 1.4.0 |
| --- | --- | --- |
| `spawnSync` finds `git`, `PATH`=empty dir | found | **`ENOENT`** |
| `styleText` writes escapes into a pipe | escapes | **bare text** |
| `bun --cwd` sets `process.cwd()` | yes | yes |
| `--compile` leaks a byte-identical `bun` | yes | yes (sha256) |
| `bunfig.toml` `[test] timeout` honoured | no | no |

The last row carries a **positive control** — the same probe passes at
`--timeout 20000` — because three identical failures prove nothing unless the
probe could have gone green.

Also checked and clean: 82 paths and 30 symbols referenced by `CLAUDE.md` all
resolve or are deliberately past-tense, and command parity is exact across 30
`package.json` scripts.

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

**bun on this machine is now 1.4.0**, upgraded to take that measurement, and the
sweep is green on it. Five of the version-pinned claims have since been
re-measured (`7d0d86e`); **two have not**, and are named in that commit rather
than left implicit: `$bunfs` streaming, and the stdin `data` listener keeping the
MCP server alive. Both need a compiled binary and a live server.

**`dotGitProjectRoot`'s export may no longer be earned.** The measurement that
justified it — the subprocess being unfailable in-process — is false on 1.4.0.
Deliberately flagged rather than acted on: the first version of those tests was
passing through the subprocess while claiming to test the filesystem, and only
its own control caught it. Removing the export on one re-measurement would be
the same mistake facing the other way.

## Next

`gh pr view 79` for review (#78 is merged). Then two open calls, both Dan's:
whether the caveat-placement rule joins the DX Principles header, and whether
`dotGitProjectRoot`'s export can go now that the subprocess can be made to
fail.
