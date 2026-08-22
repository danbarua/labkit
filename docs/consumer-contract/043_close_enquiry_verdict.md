# `closeEnquiry` — verdict: a defect, and both my predictions were wrong

**2026-08-22.** Predictions in `042`. Third item off PJ-028's inferred pile.

## Predictions

| Prediction | Outcome |
| --- | --- |
| It writes `BASED_ON` **per cited finding**, in a loop | **wrong** — it writes at most **one**, from a single `answeredBy` |
| The answer can be **inverted**: `challenges ? "no" : "yes"` reads a subset and flips | **wrong** — `enquiryStatus` guards the empty case explicitly: *"abandoned, not answered — absence of evidence is not a negative result"* |
| `restsOn` degrades to `exploratory` | **not reached** — the guard returns before `restsOn` is computed |
| **Therefore a defect** | **held**, for a reason I had not predicted |
| The wrong answer I expected to write: assuming it follows from `evaluateCriterion` because the shapes match | **avoided** — and the shape match was in fact wrong twice over |

**Two of three specific predictions were false and the verdict was still right.**
That is worth recording plainly: the heuristic pointed at the right verb and the
reasoning attached to it was wrong in its particulars. Had I fixed on the
prediction rather than demonstrating, I would have wrapped the right function
while believing something false about why.

## What is actually wrong

`RESOLVES` is written before `BASED_ON`. An interrupted close therefore leaves a
resolving decision with nothing cited — which is **indistinguishable from a
deliberate close without a cited result**, a legitimate call (`closeEnquiry({
enquiry })` with no `answeredBy`). Shape-wise it looks safe, and under `039`'s
superseded rule it *was* safe.

It is not safe from the **retry**. The caller saw a throw and closes again:

```
CLOSE resolving decisions: 2
CLOSE closure: abandoned answer: null
CLOSE evidence: []
```

Two decisions resolve one question. `enquiryStatus` picks between them with
`.find()` over unordered rows, and the orphan won. **A question answered "no" on
cited evidence reports itself abandoned, with no answer and no evidence.**

The answer is not inverted — it is **erased**. And PJ-011 §5 does not excuse it:
`closure: "abandoned"` is a positive classification, not an empty result. Under
`labkit-dev`'s rule — *every answer a reader can derive must be true* — that is a
false answer, twice over: the question was neither abandoned nor unanswered.

After the fix, the same script gives one decision, `answered`, `"no"`, and the
finding cited.

## Two things this sharpens

**The arbitrary-`rows[0]` shape is reachable by interruption.** `read.ts`'s own
comment calls that shape *"the arbitrary-`rows[0]` shape S-1 turned into a wrong
answer"* and guards three functions against it by cardinality checks. `originOf`,
`enquiryStatus` and `whySupported` were left with unguarded picks on the argument
that the write side makes multiples impossible. **An interrupted write plus a
retry makes them possible.** The transaction closes it here; the general point is
that "the writer cannot produce two" is not a safe premise when the writer can
fail halfway.

**Legitimate-looking is the dangerous case, not the safe one.** The partial state
here is byte-identical to a supported call, which is why it survived the sweep, my
own reading, and `039`'s rule. `041` established that a shape has no truth value;
this adds that *the more legitimate a partial state looks, the less the shape tells
you*, because the reader cannot distinguish it either.

## Base rate

**Three examined, two defects.** `sharpen` clean, `evaluateCriterion` a defect,
`closeEnquiry` a defect.

The write-order heuristic has now selected two verbs and been right about both
being worth examining — and wrong about the mechanism in this one. It is a good
way to choose what to look at and no kind of evidence about what is there.

## Still open

`pursue`, `recordReview`, `planWork`, `stateCriterion`, `declareGate` remain
**undecided, not cleared**. `pursue` writes `MOTIVATES` last and is the most
likely to be clean, which is the reason to do it next: the base rate needs clean
results as much as it needs defects.
