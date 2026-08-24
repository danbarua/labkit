# 025: a signal that started working again

**Session wrap, 2026-08-24, on `fix/readme-exit-code`.** Not a decision record —
the corrected line is in `README.md`.

**The range is wider than this entry.** The pinned baseline is `72dbe15` and
covers thirty-eight commits across nine entries; 017-024 hold the rest. This
entry covers `ac4607e` alone. PR #5 merged as `5f7ac90`, and another session
landed `9fccfef` (the PGlite bump) and `f991b93` on `main` meanwhile; this
branch is cut from `origin/main` after all of them.

## Goal

PGlite 0.5.7 restored `bun test`'s exit code. Find every live document still
telling readers to ignore it, and fix what is left.

## Changed

**Most of it was already done.** CLAUDE.md and `.claude/skills/wrap/SKILL.md`
were corrected alongside the dependency bump by another session. **`README.md`
was missed** — one line, `# read the pass/fail counts, not the exit code`, in
the first file a new contributor reads.

That is the failure mode CLAUDE.md names in its own words: *a rule telling
readers to ignore a signal removes the only watcher that signal had*, written
after `examples/full-lifecycle.ts` sat broken for 221 commits behind exactly
such a note. `ac4607e` replaces it with the trap that is still true — `$?` after
a pipeline reports the pipe — and drops the one that is not.

## Verified

**The verification nearly went wrong, and that is the part worth carrying.**
`package.json` said `^0.5.7`; this worktree still had **0.5.5 installed**.
Measuring at that point would have exercised the old behaviour and concluded
the fix did not transfer. `bun install` first, then:

| case | exit | result |
| --- | --- | --- |
| all-passing file | 0 | 20 pass / 0 fail |
| deliberate failing test | **1** | 0 pass / 1 fail |
| DB-touching file (the path that produced 99) | 0 | 3 pass / 0 fail |
| full suite | 0 | 323 pass / 0 fail, 141s |

The failing case matters as much as the passing ones: an exit code that is
always 0 is as useless as one that is always 99, and only the deliberate
failure distinguishes them.

`check:doc-comments` not run — no doc comments were touched. No code changed.

## Open

**Two fixes landed in gitignored files and cannot be reviewed in the PR.** Both
are in `.claude/hookify.piped-bun-test.local.md`, the rule added earlier today,
and both are mine:

1. **It carried the same stale claim** it was written to prevent — *"exits
   non-zero even when every test passes"* — hours before the dependency landed.
   That is a seventh place, authored the same day the audit for stale claims was
   run.
2. **Its pattern had a false positive that blocked its own author twice.**
   `grep -n "bun test" file | head` matched, because a quoted argument
   containing a command is indistinguishable from the command; then it matched
   again on its own test cases inside a heredoc. Now anchored at a command
   position (`^` or after `;` `&&` `|` `(`) and verified against eight positive
   and negative cases. Synced to the base checkout by hand, which is the only
   way these propagate.

That is the same defect class this session spent the day on from the other
side: **matching a token rather than a claim.** It has now produced a false
OUTSTANDING in a peer's shadow miner, a false "still present" in a removal
audit, and a false block in a hook — three instruments, one mistake.

Unchanged and unaddressed:

- **`flake/setup-off-budget` needs a port, not a merge**, and on entry 024's
  evidence should be expected to buy wall time rather than failures.
- **Two dead agent worktrees** under `labkit/.claude/worktrees/`.
- **Hookify rules do not propagate to new worktrees** — the loader globs
  `.claude/hookify.*.local.md` relative to cwd with no upward walk, so copying
  to the base checkout helps that checkout and nothing else.

## Next

`fix/readme-exit-code` is PR #6, open. Nothing else is queued.

If anyone picks the flake back up, entry 024 carries the measurement and the
prediction it earned: the remaining query-count levers should make the suite
faster and **not** less flaky, because the ceiling is crossed by whichever test
is unlucky rather than by the slowest one. Moving the failure rate needs a
change to the shape of the distribution — the ceiling itself, or the cascade —
and both are named and unbuilt in `docs/TASKS.md`.
