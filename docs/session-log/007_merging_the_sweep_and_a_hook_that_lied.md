# 007: merging the sweep, a hook that answered about the wrong tree, and a flake detector

**Session wrap, 2026-08-21, on `feat/domain-consumer`.** Not a decision record —
see `docs/project-journal/028_a_test_that_does_not_test.md` for the reasoning
behind the sweep this closes out.

**The range is wider than this entry.** `f1b43ec` and `1650641` are
`labkit-minion`'s entry `006`, which covers its own half of the sweep — PJ-028's
self-correction, the seven wrong counts, the regenerated dependency graph.
Don't read this as a record of those.

Entry `005` was closed at `d3f765b`, which is this entry's baseline.

## Goal

Take `labkit-minion`'s finished sweep work onto this branch, and fix the wrap
hook it flagged on the way out.

## Changed

- `29d81dd` — merged `origin/feat/minion` through `1650641`. Brings PJ-028's
  third branch (**earn an assertion, be deleted, or be explicitly dated**), the
  seven numerals that earned none, the regenerated `docs/dependency-graph.mmd`
  (it predated `src/mcp` and the CLI rewrite), and prose fixes in
  `src/db/agtype.ts`, `src/domain/events.ts`, `read.ts`, `report.ts`,
  `session.ts`, `tests/agtype.test.ts`. No conflicts — the file split agreed in
  advance held.
- `b451955` — **the wrap hook read another worktree's state and lied about it.**
  `state_dir` came from `$CLAUDE_PROJECT_DIR`, which holds the directory the
  session was *started* in, so a session working in a git worktree read the
  other checkout's `.claude/.wrap-state/`: another session's `baseline`, and an
  `entry=` naming a file absent from its own tree. It reported "no entry yet"
  for a session that had written one — three times in an afternoon — until an
  unrelated merge made the file appear elsewhere and the answer changed on its
  own. Resolves from `git rev-parse --show-toplevel` now.
- `7ac64af` — **a run's test count is an exact flake detector.** `docs/TASKS.md`
  gains the derivation and the rule; CLAUDE.md gains the other half of its own
  pipeline trap (`bun test | tail` keeps the counts and discards every `(fail)`
  line, so a failing run cannot be diagnosed at all). See **Verified**.

Working tree clean apart from this entry.

## Verified

- `bun test` → **261 pass / 0 fail**, 36 files, 146s, after the merge. Counts
  from the output, not the exit code. Confirmed twice on this tree.
- **A third run of the same tree gave 239 pass / 23 fail, and it is recorded
  here rather than dropped.** It was racing a second full `bun test` I had left
  running against the same working directory — 431s against the usual 95–146s —
  and I had piped it through `tail -5`, so no failing test can be named from it.
  Consistent with the teardown cascade in `docs/TASKS.md`; **not** demonstrated
  to be caused by the overlap, because nothing was shown to fail *because of*
  it. Reported because a wrap that keeps only the run agreeing with it is the
  shape this session spent the day removing.

  It also reported **262 tests**, and that turned out to be the useful part: the
  suite's count is derived (`249 - 1 + 13 = 261`, one generator over
  `NODE_LABELS`), so any other number means a test was counted twice — which is
  what a body that keeps running past bun's ceiling does. Written up in
  `docs/TASKS.md` as a detector.
- `bun run typecheck` → clean.
- `npx depcruise src tests --output-type err` → **no violations at all**, 0
  errors and 0 warnings.
- `check:ledger`, `check:doc-comments`, `check:tests-assert`, `check:stdout` →
  all green. `check:tests-assert` was landed red by `labkit-minion` naming the
  two tests it was written from; entry `005`'s `7c6853f` is what makes it green,
  and the red→green cycle is what the check is worth.
- The hook fix was verified **from the tree that produced the bug**, by
  `labkit-minion` rather than by me: from its worktree, `--show-toplevel` names
  its own checkout, the state file it now reads carries its baseline and its
  `entry=`, and that file exists there. All three were wrong before.

## Open

**A defect class with three instances today and no journal entry**, deliberately:
`whatWasKnown()` reporting a question `open` in a month before it was posed;
`reproducibilityOf()` reporting `reproducible: true` about an analysis that was
never created; and this hook reporting "no entry" because it looked in the wrong
tree.

None is stale prose and none is a missing assertion. Each is a **well-formed
answer computed from the wrong subject**, indistinguishable from a true one, in
a code path that does exactly what it says. Nothing in PJ-028's method would
have found any of them — all three were caught by a person noticing an answer
was wrong. Left unwritten on purpose: PJ-027's own bar is that a pattern is
earned by instances rather than argued from them, and three found on one day by
two agents looking for something else is a weak sample. **If a fourth turns up,
write it.**

**The sweep's inferred pile remains unverified**, and `006`'s Next names the
right way in: demonstrate one verb (`sharpen` or `closeEnquiry`) against
`write.ts`'s "every compound verb runs in `inTransaction()`", rather than
sweeping. The list is a lead sheet, not an inventory — six readers looking for
one shape find that shape and are silent about every other.

**Ledger:** **AF** is the only `open` row, unowned, and its own cell says it
earns nothing under §5.

## Next

Nothing is queued. The branch is green on every check and both sessions are
merged level.

If work resumes: `docs/TASKS.md` is the queue, and PJ-008 §3 is authoritative
where the two disagree. The one live thread is the inferred pile above — start
with `bun test tests/scenarios/` and a single verb, not a sweep.

Run the suite as `bun test > run.log 2>&1` and check two things in the log:
`0 fail`, and `Ran 261 tests`. A count that is not 261 means a test crossed
bun's ceiling even if nothing failed — recompute the 261 from
`docs/TASKS.md`'s derivation if a test file or a node label has been added.
