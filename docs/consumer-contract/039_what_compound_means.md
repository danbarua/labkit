# What "compound" means — verdict: the sentence was wrong, the code was not

**2026-08-22.** Predictions in `038`, written before a line of test. First item
off PJ-028's *inferred* pile.

## Predictions

| Prediction | Outcome |
| --- | --- |
| Neither of `labkit-dev`'s two readings is right; both assume one answer covers all six verbs | **held** |
| The discriminator is reachability, not composition or write-count | **held**, and it is PJ-011 §5 applied to interruption |
| `openEnquiry` needs no transaction despite being the archetypal composed verb | **held** |
| **`sharpen` does need one** | **refuted** — see below. This was the substantive prediction and it was wrong |
| The comment needs rewriting under every outcome | **held** |
| I could not settle the other five verbs | **held** — undecided, not cleared |
| The wrong answer I expected to write: wrapping all six because one demonstration landed | **avoided**, and the refutation removed the temptation entirely |

## The rule

> **A partial state is acceptable exactly when some other verb could legitimately
> have produced it, or when no reader can reach it at all.**

An unreachable leftover is an absence. A partial state that *misreports* is a
wrong answer, and only that earns a transaction. This is not a new bar — it is
PJ-011 §5, which the project already applies to missing features, pointed at
interruption instead.

It also explains the existing split without appeal to a category. Every
transactional verb has a partial state that is both unreachable by other means
*and* readable — the combination that produces a confident falsehood.

## Why `sharpen` is not a defect

The reading was good and the code disagreed with it. `sharpen` writes a
`Decision`, a `NARROWS` edge, one `BASED_ON` per standing finding, the sharper
`Question`, then `MOTIVATES`. Interrupt the loop and the decision keeps a
**subset** of what was standing — which `originOf()` would report as
`knownAtTheTime`, complete and wrong, if it could see it.

It cannot. Demonstrated by injection, not argued:

- Fail on the second `BASED_ON`: one decision survives with one finding of three,
  **no `MOTIVATES`**, no sharper question. `originOf()` matches `MOTIVATES` before
  `NARROWS`, so it returns `null`. `whatIsKnown()` is simply correct.
- Fail on `MOTIVATES`: the decision is complete and the sharper question survives
  with no origin — **exactly what `pose()` produces**, reported `untested`, which
  is true. It is on the books and nothing has been run against it.

`grep` settles the load-bearing half: `NARROWS` has one writer (`sharpen`) and
one reader (`originOf`), and that reader requires `MOTIVATES` first. The window
in which a subset could be read does not exist, because the edge that opens it is
written last.

**The order of the writes is doing the work of a transaction**, and nobody wrote
that down. So the finding is real and the remedy was the sentence.

## What was changed

Nothing in the code. The header of `src/domain/write.ts` no longer says
"compound", a word that already meant something else two paragraphs away in
CLAUDE.md — where `openEnquiry` is *the* composed verb and is not transactional.
One word, two meanings, in the header of the file being audited: PJ-027's shape,
found while auditing for PJ-027's shape.

And a test, because this is a property rather than an accident:
`tests/domain-session.test.ts`'s *"a partial sharpen leaves nothing a reader can
reach"* injects the failure and asserts the unreachability. **If anyone adds a
`NARROWS` reader that does not require `MOTIVATES`, it fails**, and `sharpen`
becomes transactional that day. That converts the argument above from prose into
a check, which is PJ-028's whole preference.

## The base rate, which is the point of going one at a time

**One examined, one not a defect.** `labkit-dev` asked for the first few to be
taken slowly precisely because nobody knows how often "looked wrong on reading"
survives contact. The first answer is: not this time.

That is worth more than a fix would have been. The inferred pile is 28 items read
by six agents told what shape to look for, and this says plainly that reading is
not evidence — which is the sweep's own lesson, now applied to the sweep's own
output.

## Still open, and explicitly not cleared

`pursue`, `recordReview`, `closeEnquiry`, `planWork`, `stateCriterion`,
`declareGate` are **undecided**. None is demonstrated by this result, and each
needs its own negative test under the rule above.

`evaluateCriterion` is the strongest next candidate and should be next: its own
comment argues that a malformed evaluation "sits in the graph as durable
nonsense" because `gateStatus()` traverses from `GOVERNS`, and then it writes the
node and three edges untransacted. If that partial state is reachable, it is the
wrong answer this one turned out not to be.
