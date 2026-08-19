# PJ-016: The standard a finding is held to — clearing row V

**Status: implemented (2026-08-19), on `spike/drizzle-age`. Covers S-3b
(`de94994`, `1d4a9a0`), a scenario authored from story 3 rather than promoted
from §2. Row V resolved; row X widened and left open. Verification at the time
of writing: 145 pass / 0 fail, typecheck clean, `npx depcruise src tests
--output-type err` 0 errors, `bun examples/full-lifecycle.ts` ends `closed
connection cleanly` with no raw graphids.**

## Context

This is the first entry whose scenario was chosen by the ledger rather than by
the corpus. CLAUDE.md's deferral rule says at most one confirmed wrong answer
ships green at a time and clearing it is the next thing built; row V had been
that one since S-3, and its cell named the probe that would settle it — *a
scenario where criteria qualify a finding and gate nothing*.

None of the five unbuilt corpus scenarios is that probe, and the two held-back
stories that come nearest (15, 16) are both promotion-gate mechanics. That
matters more than it looks: a gate anywhere in the scenario contaminates the
discriminating condition, because model (b) — extend `GATES` so a gate can gate
a claim's standing — needs a gate to hang qualification on. So S-3b is S-3's
own conversation with the tertiary model taken away. Same agreed checks, same
significant result, nothing downstream at all.

Authoring a scenario rather than promoting one is a departure, and it is worth
being explicit about what protects it from being a scenario written to justify
a model: the *research shape* is mined, not invented. Prespecified robustness
checks with nothing planned off the back of them is what most confirmatory
analysis looks like; S-3's tertiary model is the addition, not the baseline.

## 1. What the demonstration was

Row V's wrong answer, unchanged since S-3: with two prespecified robustness
checks failed, `whySupported()` reported the finding `supported: true`.
"Supported" meant *some evidence exists*, not *the evidence holds up by the
standard set for it*.

S-3b adds a second, measured before anything was written. To record the agreed
checks at all, the caller had to declare a gate — the only thing
`evaluateCriterion()` would attach a verdict to — and a gate for work that does
not exist is a gate protecting nothing. `gateStatus()` then answered "what is
blocked?" with `state: "blocked"` and `gating: []`: a control-plane object
asserting a consequence for work that was never planned.

Two wrong answers pointing opposite ways — the finding reported as standing,
the non-existent work reported as blocked — from one missing distinction.

## 2. What the model needed, and what decided it

`QUALIFIES: Criterion → EvidenceUnit`, written by `recordAnalysis({ heldTo })`
and read by `whySupported()`. One edge, no new node label, no migration.

Two properties of it were left unpredicted on purpose, and both were settled by
an Afterward bullet rather than by preference:

- **The write moment is forced.** The obvious place to record what a check
  qualifies is when the check is evaluated — that is where
  `BASED_ON: CriterionEvaluation → Evidence` already lives. It cannot work: a
  check nobody ran must still count against the finding, and an edge minted by
  evaluation cannot express one. So the standard is named when the analysis is
  recorded, and evaluation stays the record of a verdict.
- **The endpoint is the evidence unit**, because a prespecified check is agreed
  about a *run* — "the checks we agreed before running it" — and applies to
  what that run concluded. The narrower model, per-conclusion, is not refuted;
  it is undiscriminated, and the case that would discriminate it is one
  analysis whose conclusions are held to different standards. Nothing in the
  corpus does that. Row V's own cell had written model (a) as
  `Criterion -QUALIFIES-> EvidenceUnit` before S-5 derived claim scope by
  traversal, so this was worth re-deciding rather than inheriting.

## 2b. `supported` now has three ways to be false

They are different scientific states and the answer keeps them apart:

| why not supported | what says so |
| --- | --- |
| nothing has been run | `support` empty |
| the interpretation was withdrawn | `withdrawn` (S-12) |
| the evidence fails the standard set for it | `unmet` non-empty (S-3b) |

`support` stays populated in the third case for exactly the reason it does in
the second: the numbers are fine, and blanking them would say the numbers had
gone wrong. Disqualified is not withdrawn, and neither is absent.

`standard: []` — held to no agreed standard — is a fourth state, and the one
every scenario before this is in. It must not read as "met its standard", which
is why it is a list rather than a boolean.

## 3. The phantom gate was closed, not tolerated

`declareGate()` now refuses a gate protecting nothing, alongside its existing
refusal of a gate governed by no condition. `evaluateCriterion()` takes an
optional gate, and refuses an evaluation that neither triggers a gate nor bears
on a finding held to the criterion — the same invariant class as evaluating a
criterion against a gate it does not govern, and refused for the same reason:
it would sit in the graph as durable nonsense that no reader would surface, so
nothing would ever look wrong.

That closure has a cost worth naming. Half of the demonstration is now
unreachable, so it survives only in prose and in the ledger. The other half
survives properly: S-3's assertion of the wrong answer, left in place with a
comment demanding it be updated on purpose, was flipped from `true` to `false`
by the change that fixed it. That is the durable record, and it is the reason
the comment was worth leaving.

## 4. What this did not settle

**Model (b) was closed by argument, not by demonstration.** S-3b shows the
qualification job needs a relationship of its own; it does not show that
extending `GATES` to `Claim` would answer wrongly — under (b), the phantom gate
this scenario had to mint is precisely what the fix would have become. What
closes (b) is S-8: `GATES` is fully occupied with control semantics, and giving
one edge two readings is PJ-012 §1's shape, which has caused every expensive
mistake in this project. A row cleared by argument is weaker than one cleared
by demonstration, and the ledger says so rather than filing them alike.

**Row X is where the pressure went.** Nothing about "a failure sticks" changed,
but its blast radius did: a decisive failure now disqualifies a finding as well
as blocking work, permanently. A check re-run correctly after a coding error
*in the check itself* leaves the finding not standing forever. That is a more
sympathetic case than re-running until green, and it is the same rule. It is
recorded and not fixed — one confirmed wrong answer at a time — and it is
honestly unresolved rather than deferred, because no scenario in the corpus
would settle it.

**No row currently records a confirmed wrong answer shipping green.** That is a
first, and it should not be mistaken for the model being finished: five corpus
scenarios remain unbuilt, and rows E, F, J, K, O, P, S, T and Z are open on
questions nothing has yet asked.

## Judgment calls

- **Authored, not promoted.** §2 is held at its original wording, so S-3b lives
  in §3, which is the living part, with its provenance stated in its first
  line. Numbering it S-19 would have implied a nineteenth mined story; reusing
  15, 16 or 18 would have overwritten what §4 says about them.
- **The scenario was kept minimal deliberately.** It could have carried the
  reproduction-criteria material from story 16 and probably earned two rows at
  once. That would have reintroduced gates and destroyed the discrimination
  this scenario exists for.
- **`checksFrom()` is shared between the two readers.** The alternative was two
  copies of the itemisation logic diverging quietly, which would let one
  condition report `failed` through the gate it governs and `passed` through
  the finding it qualifies. The traversals differ; the report must not.
- **The invalidation filter on the standard was argued from consistency and
  then tested anyway.** `whySupported()` already excludes replaced analyses
  from `restingOn`, which was the reason for writing it; PJ-015's sharpest
  lesson is that an untested branch *inside* a fix survives the sweep that
  fixes everything around it, so the filter has a deletion probe of its own —
  remove it and a superseded analysis's failed check disqualifies the claim its
  replacement supports.
- **Only supporting analyses are qualified.** A challenging analysis held to a
  standard whose checks fail still reads as a live challenge, because
  `challenged` is computed from bearing alone. Recorded in the query's comment
  rather than fixed: nothing in the corpus holds a challenging analysis to a
  prespecified standard, and the scenario that would settle it is a null result
  whose own robustness checks disagree.
