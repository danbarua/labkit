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

- `e3390fa` — this entry.
- `0e6f329` — **`closeEnquiry` is transactional.** Third item, second defect.
  `docs/consumer-contract/043`, `src/domain/write.ts`, one test.

- `2c416f8` — this entry.
- `31c7cef` — **`pursue` is clean.** Fourth verb, second clean result.
  `docs/consumer-contract/044`, `045`, one test, **no code change**.

Plus merges of `labkit-dev`'s cascade fix, its `reset()` truncate (`5439085`),
`3c00496` and its `closeEnquiry` double-close guard (`5921647`). Three
demonstrations, two fixes of mine; the rest are documents, several written while
the machine was held for its paired A/B.

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

**Then `labkit-dev`'s `reset()` truncate (`5439085`), on an idle machine:**

```
270 pass / 0 fail   89.44s
270 pass / 0 fail   82.13s
270 pass / 0 fail  110.21s
zero crossings, zero teardown vocabulary in all three
```

Against this tree's 220s BASE and 301s confounded run, so **the halving reproduces
on a second tree** — the independent confirmation it wanted. That is also the
load-controlled crossing count: **zero**, three times.

**Those runs do not verify its prediction, and the entry says so.** Zero crossings
means no teardown race could occur, so three greens are three times not testing
it. What settles it is by construction: `reset()` drops nothing now, and `grep`
gives `dropTenantGraph()` exactly one caller — a reconciliation test that drops and
rebuilds inside a single test. No flake needed.

**My stated reason for that being safe was wrong, and `labkit-dev` checked instead
of accepting it.** I said the test targets a different graph because its tenant
slug is `"drop-me"`. It is not: that is the first tenant resolved in its file,
`tenants.id` restarts, so it *is* `labkit_t1`. The safety comes from
`setupTestDb()` building a **separate PGlite instance per test file**. Same
conclusion, different mechanism — and the distinction matters, because my reason
would have licensed dropping `labkit_t1` from a scenario file and its reason
forbids it.

Final suite on the merged tree with every fix: **274 pass / 0 fail, 104.63s**;
typecheck clean, `check:doc-comments` and `check:tests-assert` green.

**One correction from `labkit-dev` that belongs here rather than in its entry
alone:** it later measured **266 pass / 6 fail with one collateral failure**
carrying a `Connection terminated`. So collateral is **not** zero in every run.
The sharpened prediction survived this tree's run and failed its own, which makes
it a live disagreement rather than a confirmed result — and the earlier zeros were
real without being the whole picture.

**A ninth instance of PJ-028's shape, found by that correction.** `docs/TASKS.md`
still carried the *withdrawn* first form of the prediction — the unfalsifiable one
this tree's baseline refuted hours earlier. It had been sharpened in messages and
in entry 009 and never carried back to the file where it was actually written down.
Six hours after this branch closed out eight instances of prose disagreeing with
the code beside it. Fixed in `81c6ea5`, along with recording the disagreement above
so the file could not read as though the flake work had settled it.

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

**Demonstrated, and it is a defect — with both specific predictions wrong.** It
writes **one** `BASED_ON`, not one per finding, and the answer **cannot** be
inverted: `enquiryStatus` guards the empty case explicitly (*"abandoned, not
answered — absence of evidence is not a negative result"*). Someone had already
thought about it.

The verdict was right and the reasoning under it was wrong, which is the reason to
demonstrate rather than fix on a prediction — otherwise the right function gets
wrapped for a false reason.

What is wrong is the **retry**. `RESOLVES` before `BASED_ON`, so an interrupted
close leaves a resolving decision citing nothing — *indistinguishable from a
deliberate close without a cited result*, a legitimate call. The caller saw a throw
and closes again:

```
CLOSE resolving decisions: 2
CLOSE closure: abandoned answer: null
CLOSE evidence: []
```

`enquiryStatus` picks between them with `.find()` over unordered rows and the
orphan won. **A question answered "no" on cited evidence reports itself abandoned,
with no answer and no evidence.** Not inverted — erased. `abandoned` is a positive
classification, so PJ-011 §5 does not excuse it.

**Two findings that outlive the verb**, both in `043`:

- **The arbitrary-`rows[0]` shape is reachable by interruption.** `read.ts` guards
  three functions by cardinality check and leaves `originOf`, `enquiryStatus` and
  `whySupported` unguarded, on the argument that the write side cannot produce
  two. An interrupted write plus a retry does. **"The writer cannot make
  multiples" is not safe when the writer can fail halfway** — worth looking at the
  three unguarded picks independently of the transaction work.
- **A legitimate-looking partial state is the dangerous case, not the safe one.**
  This one is byte-identical to a supported call, which is why it survived the
  sweep, my reading and `039`'s superseded rule. A shape has no truth value
  (`041`); the more legitimate it looks, the less it tells you, because the reader
  cannot distinguish it either.

**`closeEnquiry` had a second, independent defect that my fix does not touch**, and
`labkit-dev` found it by taking the read-side thread: **no interruption, two clean
calls.** Abandon a question, then close it citing a result, and the answer is erased
exactly as above — because nothing guarded against closing a closed question, so a
second `RESOLVES` was written and the same `.find()` picked between them. Fixed on
the write side with a refusal (`5921647`); a read-side tie-break would have been
unreachable code, since `closeEnquiry` is `RESOLVES`'s only writer — verified here,
not taken on trust.

**The two fixes are not independent, and neither is sufficient.** On the
pre-transaction tree its guard would have refused the retry *permanently*,
converting a repairable erasure into a question that could never be closed again.
Flagged before it pushed; it is in that commit's message.

**And its ordering observation is worth more than the finding:** its first probe
closed-then-abandoned, `.find()` happened to pick the cited decision, and the
defect was invisible. Only the reverse order exposed it. *"I tried it and it was
fine"* is worth very little against a latent arbitrary pick — the same failure as
this entry's three green runs not testing the truncate prediction.

**`pursue` is clean** (`045`), and it was taken *because* it was the likeliest
clean one. Reachability edge (`MOTIVATES`) last, orphan enquiry unreachable, every
prediction held including the mechanisms — the first time in this pile, and named
as the exception rather than the norm.

Its one soft spot is asserted rather than described: `whatDependsOn` enumerates
`LineOfEnquiry` unconditionally and is saved only by requiring an inbound
`REQUIRES` an orphan lacks. **That is an accident of write order**, so the test
pins it; if anything ever writes `REQUIRES` before `MOTIVATES`, `pursue` needs a
transaction that day.

## Base rate — five routes examined, three defects

| route | verdict |
| --- | --- |
| `sharpen` | clean |
| `evaluateCriterion` — window 3 | defect |
| `closeEnquiry` — interrupted retry | defect |
| `closeEnquiry` — double close (`labkit-dev`) | defect |
| `pursue` | clean |

Counted **per route, not per verb**, at `labkit-dev`'s suggestion: one verb carried
two independent defects with different remedies, and per-verb counting hides that
stopping at the first fix in a function would have left the second.

Both clean verbs write their reachability edge **last**; all three defects came
from verbs that write it early. **That is one correlation with a mechanism behind
it, and explicitly not a rule** — five is not enough, and this exact reasoning has
been wrong twice in this pile already.

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

**`recordReview`, `planWork`, `stateCriterion`, `declareGate`** — the last four,
still **undecided, not cleared**.

Take `stateCriterion` early: it writes **one node and no edge at all**, so it may
have no partial state to have. That would be a third *kind* of answer rather than a
third clean one, and is worth reporting as a category the pile did not anticipate
rather than as another tick in a column.

**Stop at the first that is not a defect and say so**, rather than continuing until
something looks fixable. And write the predictions each time: two of three were
wrong on `closeEnquiry` and the verb was still a defect, so the predictions are
earning their keep by being wrong in public rather than by being right.

**Separately, and not part of the pile:** `043` found that the arbitrary-`rows[0]`
shape is reachable by interruption plus retry, which the three unguarded picks in
`read.ts` were argued safe against. The transaction closes it for `closeEnquiry`;
whether `originOf` and `whySupported` want cardinality checks of their own is a
question the pile did not ask and nobody owns.
