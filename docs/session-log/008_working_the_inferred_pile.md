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
  the second item. **Nothing else.** No code, no test, no run.

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

**Base rate: one examined, one not a defect.** Reported as it accumulates rather
than at the end, because the pile is 28 items produced by six agents told what
shape to look for, and the rate is the most useful thing the sweep will produce.

## Next

Wait for `labkit-dev` to release the machine, then run the `evaluateCriterion`
demonstration — deterministic injection at each of the three windows, following
`tests/domain-session.test.ts`'s two existing negative tests.

**Stop at the first window that is not a defect and say so**, rather than
continuing until something looks fixable. If the verdict is "not a defect, and
the rule needs a clause", that is the result and it goes in `041`.

Offer standing to `labkit-dev`: an independent confirmation run on this worktree
once it is done, since its failing measurement was taken under this session's load
and a clean comparison from a second tree is worth more than a second run on its
own.
