# 023: a number that outlived its derivation

**Session wrap, 2026-08-24, on `fix/date-the-rate`.** Not a decision record —
the corrected statement is in CLAUDE.md and `docs/TASKS.md`.

**The range is wider than this entry.** The pinned baseline is `72dbe15` and
covers twenty-five commits across seven entries; 017-022 hold the rest.
This entry covers `07d3dab` alone.

**PR #3 merged** (`d54cce3`), so entry 022's closing line — "`fix/suite-ceiling`
is pushed and unmerged" — was true when written and is not now. This branch is
cut fresh from `origin/main`.

## Goal

Act on a tip from a peer session (`exo-ledger`): *"if you have anything that
stores a number produced by a versioned formatter, that's the shape to check
for"* — a stored value later compared against a different version of the thing
that produced it, where the resulting claim reads as rigour and rests on a
premise that stopped holding.

## Changed

This repo has it, in the work of the last two days.

Every timing extrapolation in the flake investigation multiplies a query count
by "**~16ms per round trip**" — including two written yesterday and one in the
body of PR #3. CLAUDE.md and `docs/TASKS.md` both stated it with **no
provenance at all**.

Recovered from history: the figure is `311 queries / 4.955s` ≈ 15.93ms,
measured 2026-08-21. It is worse than merely old. That run's own note says its
dominant cost was `provisionTenantGraph()` re-checking thirteen node labels and
twenty-odd edge labels at one round trip each — the work `6eeeb92` deleted
hours later. So 16ms is an **average over a query mix that no longer exists**,
weighted toward cheap catalog round trips that have since been removed, and its
bias against today's mix is unmeasured and could run either way.

Both statements now carry the derivation, the date, and what the derivation
means. The extrapolations stay: a wrong-but-stated basis can be re-derived and
a deleted one cannot. They say to re-measure before acting.

**The derivation was deleted by `d596672`, which is this session's own commit.**
Rewriting `docs/TASKS.md`'s flake section kept the conclusion (`~16ms`) and
dropped the `311 queries / 4.955s` line it came from — in the same commit that
was fixing a stale number one paragraph above. CLAUDE.md's own rule is that a
numeral in prose must earn an assertion, be deleted, or be explicitly dated;
one undated claim was replaced with another.

The generalisation, which is the part worth keeping: a number outlives its
derivation **because rewrites keep conclusions and drop workings**, which is
what editing for concision does. The remedy is to write the derivation *inside*
the sentence — `311 queries / 4.955s ≈ 16ms, measured 2026-08-21` — so that a
later rewrite cannot keep the conclusion without carrying the workings.

## Verified

Documentation only; no code changed. `bun run check:doc-comments` — OK.

Not run, and not applicable: `bun test`, `typecheck`, `depcruise`,
`check:tests-assert`, `check:stdout`. Nothing under `src/` or `tests/` was
touched.

## Open

Unchanged from entry 022, and none of it addressed here:

- **`flake/setup-off-budget` needs a port, not a merge.** Diffed against
  current `main` it shows 82 files and −10188 lines, because it is cut from the
  pre-PR-#2 lineage and half that "diff" is PR #2's work appearing as deletions.
- **Two dead agent worktrees** remain under `labkit/.claude/worktrees/`.
  `flake/current-no-reprovision` has a zero diff against `main` on the only file
  it touched — its content was cherry-picked and it is redundant.
- **The flake is still not measured against the failure rate**, and this entry
  makes that worse rather than better: the rate those extrapolations use is now
  known to be unreliable.
- **Hookify rules do not propagate to new worktrees** — the loader globs
  relative to cwd with no upward walk.

## Next

`fix/date-the-rate` is pushed and unmerged.

The queued lever is unchanged: 220-314 queries per heavy file are domain cypher
issued in per-item loops (`reinterpret` runs one per withdrawn claim,
`replaceAnalysis` one per input), and `closeDecision` still does
precheck-then-write — the shape `createEdge` shed in `4a45eeb`. The method that
worked there is trace, classify, cut, re-trace paired; it needs no timing
figure at all, which is now the argument for preferring it.
