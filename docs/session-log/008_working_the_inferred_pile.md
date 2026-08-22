# 008: Working PJ-028's inferred pile, one demonstration at a time

**Session wrap, 2026-08-22, on `feat/minion`.** Not a decision record — see
`docs/consumer-contract/039` and `040`, and `docs/project-journal/028`.

Opened by closing 006, which covered row F, the deliberate sweep, its fixes and
the first item verified off its output. That arc is finished. **This entry is the
open-ended part: the remaining 27 inferred candidates, taken one at a time.**

## Goal

Work PJ-028's inferred pile by demonstration rather than by edit, and report the
base rate of "looked wrong on reading, was fine" as it accumulates.

## Changed

- `b10cb98` — `docs/consumer-contract/040`: predictions for `evaluateCriterion`,
  the second item.
- `421f58c` — this entry.
- `37728a8` — `040`'s addendum (a competing rule, below) and PJ-028's fifth and
  sixth self-instances.
- `6c77cf7` — this entry.
- `56a1f43` — **`evaluateCriterion` is transactional.** The second item off the
  pile, and the first that was a defect. `docs/consumer-contract/041`,
  `src/domain/write.ts`, four tests in `tests/domain-session.test.ts`.

The first four commits are documents written while the machine was held for
`labkit-dev`'s paired A/B. The fifth is the demonstration and the fix.

## Verified

**Nothing was run for the first four commits, deliberately** — `labkit-dev` needed
a quiet machine for an interleaved paired A/B, and running `bun test` here would
have been the confound it was trying to remove.

After it released the machine:

- `bun test ./tests/domain-session.test.ts` — **9 pass, 0 fail.** Pre-fix, the
  window-3 test failed with `withdrawn: undefined`; that failure is the
  demonstration and it is quoted in `041`.
- `bun run typecheck` — clean. `npx depcruise` — **no violations**.
  `check:doc-comments`, `check:tests-assert` — green.
- `bun test` (full) — **257 pass / 9 fail / 11 errors, 266 tests, 220.16s.** A
  flake, and **captured this time**, which is the thing lost in 006's range.

**The captured signature, because it is the first one this project has kept:**

```
 5  timed out after 5000ms          <- ceiling crossings
 7  Connection terminated unexpectedly
 4  graph "labkit_t1" does not exist
 2  Client was closed and is not queryable
 0  assertion failures
```

Not one genuine assertion failure — every failure is a timeout or a teardown
artefact. That is CLAUDE.md's documented mechanism, confirmed rather than assumed,
and it rules out reading the run as a regression. Nine failures across **two files
and six probe groups**; timings split cleanly into five at ~5000ms and four at
905–2956ms. **Five crossings, four collateral.**

`labkit-dev`'s patch was **not** on this tree, so this is a clean BASE measurement
from a second worktree. Its own BASE burst was 17 across nine groups, so burst size
is load-dependent and "roughly one failure per crossing" looks closer to the floor
than the ceiling. Log kept at `suite2.log` in this session's scratchpad.

The count was **266 and correct** (262 plus the four tests added here) despite five
crossings — another data point against the withdrawn count detector.

## Open

**`evaluateCriterion` was a defect, and it is fixed.**

The tell was the write order. It writes `EVALUATED_AS` **second**, where `sharpen`
writes its reachability edge (`MOTIVATES`) **last** — so from the third write
onward the evaluation is reachable and everything after it is a claim about a
record readers can already see. That is the opposite arrangement, which is what
made this a test of `039`'s rule rather than a repeat of it. Every prediction in `040` held except the one
that mattered: I said window 3 was acceptable under my rule, and it is not
acceptable at all. Interrupt before `BASED_ON` and `isWithdrawn`'s
`cited > 0 && standing === 0` means the verdict can **never** be withdrawn — so
retracting the evidence it was reached against leaves the gate `blocked` by a
`fail` the record insists still stands. `evaluateCriterion` is now transactional.

**`labkit-dev`'s rule won and mine was refuted**, which is what the run was set up
to decide:

> A partial state is acceptable exactly when every answer a reader can derive from
> it is true.

`basis: []` is an empty result and PJ-011 §5 forgives it — which is why my
shape-based clause called the state acceptable. *"This verdict still stands"* is a
positive claim derived from the same state, and it is false. A shape has no truth
value; an answer does.

**Window 2 was startling and is not a defect**, as predicted: one gate, one call,
check `never-run` *and* `everFailed: true`. The readers disagree by design and both
answers are individually true. `040` had named calling it a defect as the wrong
answer to avoid, and that is why it was avoided.

**Base rate: two examined, one defect.** Reading found both; demonstration
separated them, and neither was settleable from the sweep report.

**The pending run now discriminates between two rules instead of confirming one.**
`labkit-dev` read `039`'s rule and found my two clauses are not parallel: clause 2
is about **answers** (an unreachable state produces none, so none can be false),
clause 1 is about **shapes**, and a shape has no truth value. Two identical shapes
differ in truth when the histories that produced them differ — which is window 3
exactly. Their reformulation subsumes both:

> A partial state is acceptable exactly when every answer a reader can derive from
> it is true.

The two rules **disagree on window 3** — mine says acceptable, theirs says defect
— and that disagreement is recorded in `040` before any run. So is the criterion,
so it cannot be chosen afterwards: **a derived answer that is positively false
rather than merely empty.** `basis: []` is an empty result and PJ-011 §5 says that
is not a wrong answer; but `isWithdrawn` is `cited > 0 && standing === 0`, so an
evaluation that cited nothing can never be withdrawn, and a reader derives *"this
verdict still stands"* after its real basis was invalidated. That is a positive
claim, and its truth decides between the rules.

**PJ-028 took a fifth instance and produced a sixth in the taking.** The fifth is
`labkit-dev`'s, quoted at its request because its account is better than the
entry's own: *"A passing check on the file I edited told me nothing about the two
I didn't"* — the defect as a property of **verification** rather than authorship.
The sixth is mine: adding the fifth left the heading saying "four" and the text
"five", a stale numeral inside the entry that closed out seven of them. Fixed by
**dating the heading** rather than correcting the count.

**Base rate: one examined, one not a defect.** Reported as it accumulates rather
than at the end, because the pile is 28 items produced by six agents told what
shape to look for, and the rate is the most useful thing the sweep will produce.

## Next

**Owed immediately: the independent confirmation run of `labkit-dev`'s cascade
fix**, pushed as `2de1060` as this entry was being written. Its own post-fix run
carries a second uncommitted change, so **this tree's run is the clean test of the
cascade fix alone.**

Classify by the teardown vocabulary, not by the total. The number that matters is
**collateral — failures whose cause is another test's teardown — and the sharpened
prediction is that it should be zero, not "roughly one".** This entry's BASE run is
the comparison: five crossings, thirteen teardown errors, four collateral. A
post-fix run with five crossings and zero teardown errors confirms it; any
`Connection terminated`, `graph … does not exist` or `Client was closed` refutes
it. Load does not enter into it, which is why this form is falsifiable and the
count-based one was not.

Then the next verb. `pursue`, `recordReview`, `closeEnquiry`, `planWork`,
`stateCriterion` and `declareGate` are **undecided, not cleared**. Under the
reformulated rule the procedure is the same each time and now has a shortcut worth
using first: **order the writes, find the reachability edge, and ask what a reader
can derive from the state between it and the end.** A verb that writes its
reachability edge last is very likely clean; one that writes it early is worth the
demonstration.

**Stop at the first that is not a defect and say so**, rather than continuing until
something looks fixable. Two examined, one defect — the number only means something
if the clean ones keep getting reported.
