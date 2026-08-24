# 023: numbers that outlived their derivations

**Session wrap, 2026-08-24, on `fix/date-the-rate`.** Not a decision record —
the corrected statements are in CLAUDE.md and `docs/TASKS.md`.

**The range is wider than this entry.** The pinned baseline is `72dbe15` and
covers twenty-seven commits across seven entries; 017-022 hold the rest. This
entry covers `07d3dab` and `4682e89`.

**PR #3 merged** (`d54cce3`), so entry 022's closing line — "`fix/suite-ceiling`
is pushed and unmerged" — was true when written and is not now. This branch is
cut fresh from `origin/main`.

## Goal

Act on a tip from a peer session (`exo-ledger`): *"if you have anything that
stores a number produced by a versioned formatter, that's the shape to check
for"* — a stored value later compared against a different version of the thing
that produced it, where the claim reads as rigour and rests on a premise that
stopped holding. Then audit the rest of the repo's prose figures for the same.

## Changed

**`07d3dab` — the rate every flake extrapolation multiplies by.** Every `Nms`
figure in the flake investigation, including two written the day before and one
in the body of PR #3, rests on "~16ms per round trip", stated in both live
documents with no provenance at all.

Recovered from history: `311 queries / 4.955s` ≈ 15.93ms, measured 2026-08-21.
Worse than merely old — that run's own note says its dominant cost was
`provisionTenantGraph()` re-checking ~38 labels at a round trip each, the work
`6eeeb92` deleted hours later. So it is an **average over a query mix that no
longer exists**, weighted toward cheap catalog round trips since removed, biased
in a direction nobody has measured. Both statements now carry the derivation,
the date, and what the derivation means.

**`4682e89` — the audit, which found two more.** 102 prose numerals across
CLAUDE.md and `docs/TASKS.md`; most are dates, journal-entry numbers or Postgres
error codes.

- *Dated.* CLAUDE.md's entire profile cluster — nine figures — hung off the
  phrase **"Measured on today's code"**. Relative dating, in the document whose
  own headline rule is that a sentence wrong next week does not belong in a
  document, one paragraph above where `07d3dab` had just fixed the identical
  defect. `docs/TASKS.md` dated the same cluster correctly.
- *Withdrawn, then restored — and the withdrawal was the worse error.*
  "Provisioning got 69% cheaper" looked underivable: its prose workings had been
  edited away by `d596672`, and what survived seemed to sit between three
  unreconcilable numbers. It was deleted on that basis in `4682e89`.

  **It was fully recoverable, and I did not look where the workings were.**
  `6eeeb92`'s own commit message carries the measurement: 2,448 queries before
  and 1,716 after over one scenario file, of which provisioning bookkeeping went
  1,086 → 332. That is the 69%, and the 30% beside it. The apparent conflict was
  not one either — `6eeeb92` reports three round trips of *reconciliation*, and
  2026-08-24's six are a whole provisioning call: those three plus `BEGIN`, the
  advisory lock and `COMMIT`. Restored with its derivation.

**A fourth outcome exists, and this was not an instance of it.** CLAUDE.md's
rule is *earn an assertion, be deleted, or be explicitly dated*; a claim whose
baseline no longer exists can do none of those honestly, so **withdraw and say
so** is real. But reaching it here took a search that stopped one artefact
short. The ordering matters more than the outcome: prose history, then **every
machine-written record — commit messages, tracer output, script results** — and
only then withdrawal. A commit message is a durable artefact written at the
moment of measurement, and it is the first place to look for the workings of a
number about a change, not a place nobody thought of.

## Verified

Documentation only; no code changed. `bun run check:doc-comments` — OK.

Not run, and not applicable: `bun test`, `typecheck`, `depcruise`,
`check:tests-assert`, `check:stdout`. Nothing under `src/` or `tests/` was
touched.

## Open

**The pattern, sharpened, because the first statement of it was too kind.** A
number outlives its derivation because rewriting for concision keeps conclusions
and drops workings. That much is the editing instinct working correctly and is
invisible in the diff — the paragraph simply gets shorter and clearer.

But both instances here are in **one commit whose subject was fixing stale
numbers**. The trigger is not concision in general; it is that tightening a
paragraph you are already correcting feels like more of the same virtue. That is
the moment to watch, and it is when review is least likely to catch it, because
the diff shows someone fixing exactly this class of defect.

The written remedy is to put the derivation *inside* the sentence —
`311 queries / 4.955s ≈ 16ms, measured 2026-08-21` — so a later rewrite cannot
keep the conclusion without carrying the workings.

Unchanged from entry 022, and none of it addressed here:

- **`flake/setup-off-budget` needs a port, not a merge.** Against current `main`
  it shows 82 files and −10188 lines, because it is cut from the pre-PR-#2
  lineage and half that "diff" is PR #2's work appearing as deletions.
- **Two dead agent worktrees** remain under `labkit/.claude/worktrees/`.
  `flake/current-no-reprovision` has a zero diff against `main` on the only file
  it touched.
- **The flake is still not measured against the failure rate**, and this work
  makes that worse rather than better: the rate those extrapolations use is now
  known unreliable.
- **Hookify rules do not propagate to new worktrees** — the loader globs
  relative to cwd with no upward walk.

## Next

`fix/date-the-rate` is pushed and unmerged, three commits.

The queued lever is unchanged: 220-314 queries per heavy file are domain cypher
issued in per-item loops (`reinterpret` runs one per withdrawn claim,
`replaceAnalysis` one per input), and `closeDecision` still does
precheck-then-write — the shape `createEdge` shed in `4a45eeb`. Trace, classify,
cut, re-trace paired. **It needs no timing figure at all**, which after this
work is the argument for preferring it.
