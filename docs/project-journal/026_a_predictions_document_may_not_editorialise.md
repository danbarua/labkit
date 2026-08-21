# 026 — A predictions document may not say which outcome would be more impressive

**2026-08-21, after row F.** The predictions protocol is the most valuable thing
this project has built, and it has one failure mode that is invisible from
inside it. `027` demonstrated it, on me, in the document written to prevent it.

## What the protocol is for

Predictions are recorded before a build so that a refutation survives as a result
rather than being edited into hindsight. Rows A and B are the precedent: PJ-008
called row A its strongest single prediction and S-3 refuted it, and the row was
kept rather than deleted. Five of the six builds before row Z had at least one
prediction refuted, and the refutations were consistently worth more than the
hits.

The protocol works because it fixes what a build's outcome *means* before the
outcome is known. That is the whole mechanism.

## The failure

`docs/consumer-contract/027` predicted row F would end reclassified `boundary`,
and then wrote:

> **Saying so would be a bigger result than an edge**, because it converts the
> oldest unowned row in the ledger from a standing debt into a decision.

The prediction was honest. The second sentence is the defect: it says in advance
which outcome would be *impressive*, and a document that does that has leant on
the scale it exists to hold level.

It nearly worked. On finishing the build I drafted the boundary reclassification,
and it was wrong on two independent grounds — it contradicts `023`, which scores
row F's contract necessity **strong** (a row cannot be both a requirement of the
frozen contract and a limit nobody claims should be fixed), and row Z is the
direct precedent against it, having earned `Decision.decided_at` on bar 4 without
ever clearing §5. Neither ground is subtle. Both were available before the build.

## Why the ordinary defence does not catch it

The obvious guard is "do not predict the outcome you want", and it does not
apply: I did not want `boundary` when I wrote the prediction, and would have
recorded the same prediction without the editorial. **The prediction was not
corrupted. The reading of the prediction was.**

That is what makes this worth a rule rather than a note. Every other safeguard in
the protocol operates on the *prediction* — record it early, keep refutations,
state the refutation condition. This one operates on everything else in the
document, and none of those safeguards touch it.

It also explains why it is invisible from inside. Writing "this outcome would be
the bigger result" feels like *stakes-setting* — it tells the reader why the
build matters. It reads as motivation and functions as a thumb.

## The rule

> A predictions document states what will happen and what would refute it. It
> does **not** rank the outcomes by how interesting, impressive, cheap or
> satisfying they would be.

Two clarifications, because the rule is narrower than it sounds.

**Stating consequences is allowed and required.** *"If rung 1 suffices, no
property is earned"* is a consequence. *"That would be the cheaper outcome for
the model"* — which `025` wrote — is borderline and acceptable, because cost is a
fact about the change rather than a judgment about the result. *"That would be a
bigger result"* is not, because "bigger" is a judgment about which finding the
author would prefer to have made.

**A success and failure section is still required.** `027` had one and it was
correct — it named the failure that would still count as a result. The rule bans
ranking, not the recording of what each outcome would mean.

## The generalisation, which is why this is an entry and not a comment

The same shape has now appeared three times in this project, in three registers:

- **A predictions document that ranks its outcomes** — this entry.
- **An instrument that inherits its author's model of the defect.** Both checks
  written on 2026-08-21 had the blind spot of the class they closed (PJ-025).
- **A verification that only re-checks what its author already believed.** The
  first draft of the consumer slice's probes 2 and 3 would have stayed green
  after their own defects were fixed, and only injection proved it — including
  to the reviewer who had reached the finding by reading and said re-running
  would not matter.

In all three the author is doing the checking, and the thing being checked is the
author's own frame. The countermeasure is not more care; it is arranging for the
frame to be checkable by someone who does not hold it, which is what recording
predictions *before* a build does for a builder, and what an external reviewer
does for a document.

`027` is left unedited, with the offending sentence in place. Rewriting it would
destroy the evidence for this entry, which is the same reason PJ-021's wrong
claim about reconstruction direction was left visible.
