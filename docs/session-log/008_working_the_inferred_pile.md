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

- `08c6538` — this entry.
- `f074ebd` — merge of `labkit-dev`'s cascade fix (`2de1060`) and its docs.
- `3521853` — `docs/consumer-contract/042`: predictions for `closeEnquiry`, the
  third item. Orientation only; no run.

Most of these are documents written while the machine was held for `labkit-dev`'s
paired A/B. `56a1f43` is the one demonstration and fix.

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

**Then a confirmation run against `labkit-dev`'s cascade fix** (`2de1060`), which
is the clean single-change test its own run could not be, since that carried a
second uncommitted change:

```
256 pass / 14 fail / 11 errors, 270 tests, 301.46s
all 14 failures at 5000.7–5022.1ms — every one a ceiling crossing
COLLATERAL: 0
```

| | BASE (this tree) | with `2de1060` |
| --- | --- | --- |
| collateral failures | 4 | **0** |
| `Connection terminated unexpectedly` | 7 | **0** |
| `graph "labkit_t1" does not exist` | 4 | 6 |
| `Client was closed and is not queryable` | 2 | 3 |

**Its prediction holds on the metric it defined** — no failure whose cause is
another test's teardown. **Two of the three signatures persist**, as unattached
errors that no longer fail a test. So `labkit-dev`'s *"the entire teardown
vocabulary is gone"* is a property of its two-change tree, not of the cascade fix;
it accepted the correction.

**My crossing count is not usable and I said so before it could be quoted.** 14
against this tree's BASE of 5, measured while `labkit-dev` was running four
suites. The collateral figure survives that because it is a vocabulary check
rather than a count — which is exactly why the sharpened prediction is worth
having, and this session's BASE data is what forced the sharpening.

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

**`closeEnquiry` is the third, predicted and not yet run.** `041`'s heuristic —
order the writes, find the reachability edge, ask what a reader derives between it
and the end — produced it on the first look, one grep per verb:

```
createNode(Decision) → RESOLVES → BASED_ON per cited finding
```

Reachability edge second, evidence links last, **nothing after the loop**. And
`enquiryStatus()` derives `answer: challenges ? "no" : "yes"` from those edges, so
an interrupted closure would let the surviving subset decide the polarity — **the
recorded answer to a research question, inverted.** Window 3 corrupted a verdict's
standing; this would corrupt a finding's content.

**It stays a prediction.** `042` names the wrong answer to avoid, and it is about
the heuristic itself: assuming this follows from `evaluateCriterion` because the
shapes match. Two verbs sharing an arrangement is not evidence about the second —
`sharpen` looked like a defect on that reasoning and was not. A heuristic that
skips the demonstration has replaced the method.

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

Three things, all waiting on an idle machine. `labkit-dev` is mid-measurement and
this session's runs have already confounded its numbers once, and its runs mine.

1. **The `closeEnquiry` demonstration.** Predictions in `042`, unrun. Deterministic
   injection in the `BASED_ON` loop, following `tests/domain-session.test.ts`'s
   three existing negative tests. Look specifically at whether `answer` flips.
2. **Verify `labkit-dev`'s `reset()` truncate**, once pushed — not yet on
   `origin/feat/domain-consumer` at `bf7d0b4`. Its prediction is specific and has a
   mechanism rather than a correlation: **`graph "labkit_t1" does not exist` should
   be zero**, because truncating the label tables leaves the graph in place and
   nothing else in the suite drops it. This tree measured **6** against the cascade
   fix alone, so zero is a real result and non-zero refutes the mechanism.
3. **A load-controlled crossing count.** The 14 above is unusable next to
   `labkit-dev`'s 5 and must not be quoted as a comparison.

Then the remaining four. `pursue`, `recordReview`, `planWork`, `stateCriterion`
and `declareGate` are **undecided, not cleared**. `pursue` writes its `MOTIVATES`
last, so on the heuristic it is the most likely to be clean — worth doing early
precisely because a clean result is what makes the base rate mean anything.

**Stop at the first that is not a defect and say so**, rather than continuing until
something looks fixable.
