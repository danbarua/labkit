# `reproducibilityOf()` answers "yes" about nothing — predictions

**Written 2026-08-21 against `57656b4`, before a line of test.** Found by the
deliberate PJ-027 sweep, demonstrated in a scratch run before this was written:
both cases return `{"exact":[],"differing":[],"unverifiable":[],"notRebuilt":[],"reproducible":true}`.

Not a §3 row. `labkit-dev` corrected an over-classification of mine: §3 rows are
claims about the *model* — a missing noun, edge or property. `reproducible` is a
computed field and the fix is a predicate, so this is a plain defect and the
one-demonstrated-wrong-answer-at-a-time rule does not engage.

## The two cases are not one case

| | what the caller did | what the record holds |
| --- | --- | --- |
| **empty** | asked about a real analysis that consumed nothing | a genuine, answerable absence |
| **ghost** | named an analysis that does not exist | nothing at all — the subject is fiction |

Predicting they need **different answers**, and that treating them alike is what
produced one wrong answer twice.

## Predictions

| | |
| --- | --- |
| **The ghost case must refuse, and has something real to refuse** | `COMP_999999` names nothing. Every other read on this surface throws when its subject is absent — `no enquiry`, `no planned work`, `no gate`, `re-verifies nothing`, `no artefact named`. This one returns a green report. Predicting a throw is the right answer and that it clears S-10's bar: the refusal is not manufactured, because a caller genuinely named a nonexistent analysis |
| **The empty case must report `reproducible: false`** | Not a throw. An analysis that consumed nothing is a legitimate record, and the docstring already settles the verdict — *"anything differing, unverifiable or not attempted leaves the construction unshown"*. Nothing was attempted, so nothing is shown. Predicting `false` with all four lists empty, which is *unshown*, not *refuted* |
| **The remedy is a predicate, not structure** | No noun, no edge, no property, no new field on the report. Predicting the fix is one existence check and one conjunct |
| **`reproductionOf()` needs no change** | It already carries the rule — `provenanceMissing = theirs.size === 0`, with the comment saying comparing two empty sets *"reported `reproduced`, contradicting the premise the scenario exists for"*. Predicting the asymmetry is one-directional: the rule was written there and never travelled here. If `reproductionOf()` turns out to have the ghost hole too, that is a second instance and I will say so |
| **What I expect to be unable to settle** | Whether an analysis with zero inputs should be *creatable* at all. `recordAnalysis({ from: [] })` is legal today and no scenario has asked whether it should be. Predicting I leave that alone rather than tightening a write verb to make a read easier |
| **The wrong answer I expect to write** | Making both cases throw, because the ghost case is the more obviously broken one and a single guard is tidier. That would turn a legitimate empty record into an error, which is manufacturing a refusal — the thing S-10 forbids, in the same commit that fixes a real one |
| **What would refute this** | A caller that legitimately asks about an analysis it has not created — then the ghost case is a normal empty result and a throw is wrong |

## Constraint

No noun, edge or property, and no new field on `ReproducibilityReport`. If the
fix needs one, that is where this stops and gets reported.

## Deletion check

After the fix, both assertions get inverted against the old predicate to confirm
the wrong answer returns.
