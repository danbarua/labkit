# PJ-020: Third external review — atomicity, and identity by wording again

**Status: implemented (2026-08-20), on `spike/drizzle-age`. Covers the review of
S-3c/S-10 and its resolution (`e2fa5ff`). Seven findings, all verified and all
accurate; one earned transactions. Verification after: 166 pass / 0 fail,
typecheck clean, `npx depcruise src tests --output-type err` 0 errors, `bun
examples/full-lifecycle.ts` ends `closed connection cleanly`.**

## Context

The third external read-only review, after PJ-013 (the whole arc) and PJ-017
(S-3b and row V). This one read S-3c, S-10, PJ-018/019, the ledger and the
implementation, and did not re-run the suite — it treated the recorded 159/0 as
the build's own result, which is the right posture for a reviewer who cannot
execute.

Every one of its seven findings was verified against the code and then
**demonstrated as a failing test before anything was changed**. All seven were
accurate. That is worth recording plainly: the review found six real defects and
one design overreach in work that had just been through predictions, deletion
verification and two journal entries.

## The finding that changed the architecture

Compound research actions were not atomic, and S-3c had made that
*consequential* rather than merely untidy.

`replaceAnalysis()` invalidates the superseded output first, then records the
replacement. Since S-3c, invalidating an output withdraws the criterion
evaluations that cited it — so a failure between the two halves leaves a record
in which the earlier failure has stopped deciding its check and no corrected
check exists:

```text
failed check exists
  → replaceAnalysis()
  → old output invalidated
  → failure stops counting
  → replacement write fails
  → no corrected check exists
```

`reverify()` has the same shape with a worse landing: without its second write,
the durable state is precisely S-10's demonstrated wrong answer — a second
independent support standing where a re-verification was meant.

**Earned by a negative test, not added as infrastructure polish.** The test
provokes the failure through a real guard (`recordAnalysis()` refuses to
re-assert a withdrawn proposition) rather than a mock, asserts the whole
`whySupported()` report is byte-identical before and after the failed command,
and is deletion-verified: make `inTransaction` a pass-through and it is the only
test in the file that fails.

**The other two compound verbs got the boundary too, on their own evidence.**
The review named `reinterpret()` and `amendDesign()` alongside the two whose
harm a scenario could reach. Their harm is real but not reachable that way — so
the tests live in `tests/domain-session.test.ts`, which is the right home for a
question no researcher asks. That file already exists for states "the
persistence layer can legitimately produce but the research verbs don't
create"; an interrupted command is one of those.

Worth recording that **the guess about where each verb hurts was wrong**, and
probing each write in turn was what corrected it. For `reinterpret()` the
obvious guess is to fail before the withdrawal, leaving both sentences standing
— the S-5/S-12 duplicate-claim state. At that point no reader has changed its
answer. The damage is one write later: with the original withdrawn but its
evidence not yet carried across, the record **retracts a finding and puts
nothing in its place**, which is worse than the duplication and was not the
first hypothesis. Guessing where a compound verb hurts is exactly as reliable
here as guessing anywhere else in this project.

`TenantGraph.inTransaction()` is a **transaction boundary, not a raw-string
escape hatch** — no caller gains the ability to issue Cypher the class would not
otherwise run, so the file header's rule stands. It is re-entrant by depth
count, because a composed verb calling another must not nest `BEGIN`, and no
caller has needed partial rollback to a savepoint; the whole point is that these
actions are indivisible.

## Identity by wording, fifth region

`reproductionOf()` compared execution inputs by `Artefact.logical_name`. Two
runs can each record something called "initial conditions" and mean different
data, and they counted as the same input.

This is now the fifth unrelated region: S-5 (claims), S-12 (interpretations),
S-3b (criteria), S-3c's `checksFrom` (which got it right, keying on natural id
and saying so), and here. The pattern is not that the project keeps making the
mistake — three of those five *caught* it. It is that **every new comparison is
a fresh opportunity to make it**, and the ones that get it right do so because
someone asked the question at the time.

Fixed by keying on natural id. Two related errors in the same comparator went
with it:

- **Both sides empty compared equal**, so two runs that each recorded nothing
  reported `execution: "reproduced"`. That contradicts S-10's premise outright:
  an empty input record means provenance was never captured, not that the run
  consumed nothing. This was the sharpest of the review's findings.
- **`differs` only looked one way.** An input the original read and the re-run
  did not produced `not-reproduced` with nothing named as differing. It now
  reports `not-used-by-the-re-run`, which is a third standing distinct from
  `changed` and from `unrecorded-in-the-original`.

## The rest

**A check with no standing verdict is not a check nobody ran.** With every
evaluation withdrawn, `checksFrom()` fell through to `never-run` while listing
the withdrawn failure beside it — internally contradictory. New state
`no-standing-verdict`, counting as unmet exactly as `never-run` does. S-3c's own
tests missed it because the corrected case records a replacement pass
immediately and the narrowing test has an older pass available; the state
between "found defective" and "corrected run" was never reached. The review
declined to name the vocabulary in advance, which was right — only that
`never-run` was wrong.

**Conclusion agreement was asymmetric.** It read the re-run's bearing alone, so
two runs that both found *against* the proposition reported as disagreeing with
each other. Both bearings are now compared. `bearing` still answers a different
question — which way the re-run cuts *for the claim* — so two runs agreeing on a
negative finding agree with each other and lower confidence in the proposition.

**`restingOn` walked the re-verifying evidence** that the same report had just
excluded from `support`, so a claim was reported as resting directly on inputs
belonging to something explicitly named as not an independent supporting
finding.

**Composed verbs emit one event.** PJ-019 claimed `reverify()` emitted a single
event; it emitted two, because it called the public `recordAnalysis()`.
`replaceAnalysis()` had the same defect — and S-11's event-sequence assertion
had **encoded** it, listing the spurious `recordAnalysis`. `recordAnalysis` is
now a thin wrapper over a private writer, the rule `openEnquiry` established in
PJ-014. A test asserting a known-good sequence is only as good as the sequence
someone checked.

## `confirms` removed rather than redefined

The review's softer point, and it was right. S-10 established that "raises
confidence" and "reproduced the execution" are different things. It did **not**
establish that an independent re-check under different conditions can never
confirm a scientific claim — in ordinary scientific language it often can.

`confirms: reproduced && agrees` quietly settled what an overloaded word means,
on the strength of a scenario that had not asked. The three demonstrated
distinctions — same conclusion? same execution? raises or lowers confidence? —
carry everything S-10 actually showed. The boolean is gone until a scenario
needs it.

This is the same discipline as row V's "record both and pick neither", applied
to vocabulary rather than to structure.

## Judgment calls

**No new ontology**, as the review predicted: no node label, no edge, no
migration. Six defects and one removal, all in the service layer and one
persistence seam.

**`session.ts` is not being split.** The review's advice, and it matches the
project's own instincts: during domain discovery one large semantic hub is less
dangerous than turning provisional concepts into package boundaries. The
dependency rules that matter are already enforced as errors.

**Found while fixing:** AGE rejects a `NOT (pattern)` predicate in `WHERE`
outright — `cypher_yyerror`, a grammar error rather than a decode problem — so
`restingOn` filters in TypeScript against a set the method already computes.
Noted in CLAUDE.md with the other AGE gotchas.

## What this says about the method

The scenario discipline caught what it was built to catch — wrong answers a
researcher would act on — and missed a class it is structurally poor at: states
that only exist *between* two steps of a scenario, and failures that occur
*during* a compound action. Both of the review's most serious findings are of
that kind, and neither was reachable by writing the scenario as a conversation
that runs to completion.

That is not an argument for fewer scenarios. It is an argument that a scenario's
happy path is a floor, and that the questions worth adding to the review
heuristics are **"what does this look like halfway through?"** and **"what if
the second half fails?"**
