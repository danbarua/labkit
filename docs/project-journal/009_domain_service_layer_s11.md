# PJ-009: The Domain Service Layer, and what the control scenario found

**Status: implemented (2026-08-18), on `spike/drizzle-age`.**

> **One claim here has since been tested and did not hold.** §3 says the
> durable event sink stays an interface until S-1 or S-7 needs it. Both were
> built; both answer their hardest historical question from durable graph
> state, asserted with a provably empty event log. The successor trigger is
> recorded in `src/domain/events.ts` and in PJ-014 §5.

## Context

PJ-008 turned a real research programme into an interaction corpus. This
entry is the first scenario from it actually built against the persistence
layer, and the layer of code that build required.

S-11 was chosen deliberately: PJ-008 promotes it as the **control**, the
scenario the current model was designed for and the one most likely to pass
unchanged. That makes it the wrong scenario for finding gaps and the right
one for establishing whether a failure elsewhere would mean "the design is
wrong" or "that scenario was unreasonable". Starting with a scenario expected
to strain would have left that question unanswerable.

The immediate goal was narrower than "support the corpus": find out what has
to change for the domain to be **verifiable at all**, before changing it to
support scenarios.

## 1. Two things called "domain", deliberately

`src/db/domain.ts` is the domain *as expressed in graph structure* — labels,
edge schema, property shapes. The new `src/domain/` is the domain *as it
matters to a researcher*. They are different subjects and now different code.

```
src/db/        knows nodes and edges
src/domain/    knows research actions
(MCP, later)   knows researcher/agent language
```

The service layer is verb-first. There is no `createClaim()` or
`createEvidence()` — those are persistence operations wearing domain names,
and exposing them would push ontology knowledge back up to the caller.
`recordAnalysis()` alone writes a computation, an evidence unit, an output
artefact, and one evidence plus one claim per conclusion; the caller neither
knows nor cares. The verbs that exist are the ones S-11 needed
(`openEnquiry`, `recordObservations`, `recordAnalysis`, `recordReview`,
`replaceAnalysis`, `whySupported`, `whatDependsOn`) and no others.

The return types were derived one-per-bullet from S-11's "Afterward" list
rather than designed. That direction matters: when a bullet has no natural
home in the types, the API is wrong rather than the bullet.

## 2. The layering is enforced, not described

Two rules, both as `dependency-cruiser` errors rather than conventions:

- **`tests/scenarios/` may not import `src/db`.** A scenario asserts that a
  researcher's intent can be carried out through research verbs alone; if it
  needs the persistence layer, the service failed to cover the interaction,
  which is a finding to record rather than something to route around.
  `tests/helpers/` is exempt — it is harness, not caller.
- **`src/db` may not import `src/domain`**, so the graph model cannot come to
  depend on today's verbs.

The first rule was verified by temporarily adding a violating file and
confirming it errored. A rule nobody has watched fail is not a rule.

Scenario answers are also asserted **twice**: once from the value the
operation returned, once from a query issued afterwards. "Afterward" in
PJ-008 means reconstructible from durable state, not present in a return
value the caller happened to keep.

## 3. The temporal seam, built before a scenario forced it

Every state-changing verb flows through one choke point that stamps it from
an injected `Clock` and records what it did. This was built now, against
review advice, because the part that is hard to retrofit is the API
discipline: once callers can mutate research state without leaving a temporal
trace, "what evidence existed when this decision was amended?" (S-7) becomes
unanswerable for everything already recorded.

What is deliberately **not** decided is where those events durably live. S-11
answers all five of its questions from the graph, so the sink is still an
interface. The rule that keeps this honest:

> Events explain how state changed. The graph explains what the current
> research state is.

S-11's assertions come from the graph. The event log is asserted separately,
for the ordered operation stream — it has not become a second source of
current scientific truth.

## 4. What the control scenario found

S-11 passes: nine assertions, **zero new entities**, two new relationships.
Both relationships were found by a service query returning a wrong answer,
not by ontology design.

**`CONSUMES: Computation → Artefact` — confirmed.** `recordAnalysis()`
accepted the observations an analysis read and then discarded them from the
graph. `whySupported()` reached them via `ADDRESSES` to the enquiry and
`REQUIRES` back out, which answers "what observations is this enquiry
associated with", not "what did this computation consume". Those diverge the
moment one enquiry carries two analyses over different inputs — and this was
demonstrated rather than argued: restoring the old traversal makes a claim
resting on one dataset report both. Paired with `PRODUCES`, execution lineage
now reads in both directions, and it is where an external run tracker would
eventually attach.

**`EVALUATES: Review → EvidenceUnit` — confirmed.** A review of an analysis
had nowhere to point, so its subject survived only in the ephemeral event
stream and "why was this replaced?" was unanswerable from the graph. The
endpoint is the inferential activity, not the `Computation` that executed it:
what S-11's reviewer criticises is the method, and nothing ran incorrectly.
`Review → Computation` may be earned later by a scenario reviewing an
*execution*; S-11 did not earn it.

**Row B (inference supersession) — the prediction did not materialise.** This
is the most informative result of the build. PJ-008 predicted that "mark the
prior inference superseded" would need a relationship, since `SUPERSEDES` is
`Decision`-only. An early draft minted decisions purely to have something
supersedable; it drew **zero** `SUPERSEDES` edges and every assertion still
passed, because what carries the meaning is the invalidated output artefact.

That is not a finding that invalidation *represents* supersession.
`invalidated = true` means "no longer valid as a source of current
inference"; the two merely coincide here. S-12 discriminates — there the
numbers stay valid and only the interpretation changes, which invalidation
cannot honestly carry. The row stays open, and stays in the ledger: a
prediction that fails to materialise is a result, not a mistake to delete.

**Row N (claim identity) — new open question.** Two analyses concluding the
same proposition currently create two `Claim` nodes, and `whySupported()`
matches by name. Correct if a claim is an assertion *occurrence*; wrong if it
is a proposition, in which case one claim should accumulate evidence.
Deliberately unfixed — S-5 and S-12 are the scenarios that should decide it,
and logging it now means a later failure there won't look mysterious.

**Row O (withdrawal reason) — deliberately live.** With no review the reason
is manufactured; with several reviews of one unit the rows multiply and the
causal one is ambiguous, because `EVALUATES` says who reviewed, never which
review caused an invalidation. This may want no relationship at all — it
describes why state changed, which is what the event history is for. Left as
a real defect rather than papered over.

**Row I held.** "Which conclusions changed" proved cleanly derivable from
before/after findings. LabKit reports *that* support changed and shows both
statements; it does not grade "marginal". No strength field on `Claim`.

## 5. Corrections after review

Three, all worth recording because each was a service-layer error rather than
a model one:

- **A Decision was being invented.** `replaceAnalysis()` created one and
  linked it `BASED_ON` the *replacement's* evidence — causality backwards,
  since the decision to replace preceded that evidence. Nothing asserted on
  it. Removed, leaving the finding: S-11 does not require a Decision merely
  because a research action occurred. S-7, which turns on an explicit
  decision to amend a locked procedure, is where one should be earned.
- **Execution lineage was half a pair.** `CONSUMES` made "what did this read"
  one hop while "what did it produce" still detoured through the evidence
  unit. Added `Computation -[:PRODUCES]-> output`, keeping the unit's
  `PRODUCES` too: they express different provenance levels, the scientific
  output versus the execution output.
- **The justifying review was unchecked.** `replaceAnalysis()` accepted any
  review, so any verdict could retire any analysis and `whySupported()` could
  report a withdrawal reason that never referred to the withdrawn work. Now
  guarded by traversing the relationship it already pays for — which is what
  demonstrates `EVALUATES` constrains a research action, not just an
  explanatory query. The guard runs before any mutation, so a rejected
  command cannot partially alter the record.

## 6. Reconciliation, tested on the deployment path

`CONSUMES` is the first genuinely new edge *label* since PJ-005's
reconcile-on-every-resolve machinery shipped, and every existing test creates
fresh graphs — so "additive by design" had never been exercised where it
matters. `tests/reconciliation.test.ts` drops the label from a provisioned
tenant, calls `resolveTenantContext()` again, and confirms the label, its
usability and its uniqueness index all return. It passes, through the
production path, never provisioning internals.

`EVALUATES: Review → EvidenceUnit` needed nothing here: `EVALUATES` was
already an AGE label, and only the endpoint pairs `EDGE_SCHEMA` permits
changed — application-side validation, not tenant DDL.

## Judgment calls

- **The control scenario was built first, on purpose.** Building a scenario
  expected to pass looks like the least informative option and is the
  opposite: it is what makes a later failure interpretable.
- **Every new relationship had to be shown wrong, not argued wrong.** The
  `CONSUMES` regression test was run against the old traversal to confirm it
  actually fails. An edge justified only by an ugly query path would not have
  met the bar row B set by dissolving.
- **New edges must have a reader, not just a writer.** `outputArtefactOf()`
  was repointed at `Computation -[:PRODUCES]->` and the withdrawal reason at
  `EVALUATES`, so neither edge is written-and-never-queried — the shape
  PJ-007 found in `buildAsClause`.
- **`AnalysisRef` still resolves to the `Computation`.** "Analysis" keeps
  behaving like the `EvidenceUnit` — the review endpoint went that way — but
  S-11 passes, and renaming nouns is not a reason to refactor. Flagged in
  code for a later scenario to settle.
- **Row O ships as a live defect.** Multiple reviews of one unit really do
  duplicate a row today. Recording it accurately is better than a fix guessed
  before S-3/S-7 says whether the answer belongs in graph state, event
  history, or both.
