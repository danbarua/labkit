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

**No code, no test, no run.** Three commits, all documents.

## Verified

**Nothing was run, deliberately.** `labkit-dev` asked for a quiet machine for an
interleaved paired A/B of a flake fix — its earlier 238 pass / 29 fail / 24 errors
was measured under this session's load and it will not attribute that to its own
change until the confound is gone. Running `bun test` here would have been the
confound.

The last verified state, from 006's range at `a4b7898`: **262 pass / 0 fail**,
typecheck clean, depcruise no violations, four checks green.

## Open

**`evaluateCriterion` is orientated but not demonstrated.** What reading alone
established, and what it cannot settle:

It writes `EVALUATED_AS` **second**, where `sharpen` writes its reachability edge
(`MOTIVATES`) **last**. So from the third write onward the evaluation is reachable
and the edges after it are what give it meaning — the opposite arrangement, which
makes this a real test of `039`'s rule rather than a repeat of it.

Its two readers disagree about what reaches a gate:

| reader | traversal | needs `TRIGGERS`? |
| --- | --- | --- |
| `checks` / `state` / `unmet` | `(c)-[:EVALUATED_AS]->(ev)-[:TRIGGERS]->(g)` | yes |
| `everFailed` | `(c)-[:EVALUATED_AS]->(ev)` | no |

So an interruption between those two edges makes one gate report a check
`never-run` **and** `everFailed: true`. Predicted **not** a defect: the no-gate
S-3b path produces the identical state legitimately, and `everFailed`'s unfiltered
scope is documented as deliberate.

**The prediction that matters is that the rule is what breaks, not the code.**
Interrupted before `BASED_ON`, a verdict reads as *asserted* rather than
*measured* (row W) and can never be withdrawn, since `isWithdrawn` is
`cited > 0 && standing === 0`. That state is legitimately reachable — call without
`citing` — so `039`'s rule says acceptable, while the record now says something
false about how the verdict was reached. **"Legitimately reachable" and "says
something true" are not the same test.** If that holds, the output is a third
clause on the rule, not a transaction.

All of it is prediction. None of it is evidence, which is the entry's whole point.

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

Wait for `labkit-dev` to release the machine. Then, in this order:

1. **An independent confirmation run of its flake patch on this worktree** — its
   238 pass / 29 fail / 24 errors was measured under this session's load, and a
   clean run from a second tree is worth more than a second run of its own. Owed
   before my own work, so its measurement is not waiting on mine.
2. **The `evaluateCriterion` demonstration** — deterministic injection at each of
   the three windows, following `tests/domain-session.test.ts`'s two existing
   negative tests.

**Stop at the first window that is not a defect and say so**, rather than
continuing until something looks fixable. The verdict goes in `041`, and it has
three possible shapes now rather than two: a defect, or not a defect, or **not a
defect under my rule and a defect under `labkit-dev`'s** — which is the outcome
that settles which rule the project keeps.
