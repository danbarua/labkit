# Row F — predictions for the verdict

**Written 2026-08-21 against `b5256bd`, before a line of test.**

Row F has bitten three times, all in **reporting**: S-9c (`reproducibilityOf`
put one name in `exact` and `differing` at once), S-9d (`restingOn` collapsed two
inputs into one), and neither touched the model. Three is a pattern. The row
should be settled by an argument, not accumulated to.

Orientation done first, which is not testing: I enumerated every read on
`ReadSurface` and read `reproductionOf()`'s construction of `differs`.

## Predictions

| | |
| --- | --- |
| **A fourth bite exists, in `reproductionOf().differs`** | It keys by `natural_id` internally and reports `what` as a bare `logical_name`. Predicting a re-run that swapped an original control for its regeneration produces **two entries under one name** with contradictory standings — `changed` and `not-used-by-the-re-run` — and no way to tell which artefact is which. Same construction as S-9c and S-9d, third function |
| **The remedy is rung 1 again** | Carry `IdentifiedArtefact`. No noun, no edge, no property. Fourth time |
| **The structural argument holds** | Predicting that **every** read touching an artefact either takes a reference, or takes a name and *refuses* when it is ambiguous, or returns identity. If so, no read on the surface ever needs to know that two artefacts are versions of one thing — the caller always holds the identity already |
| **Therefore the verdict is `boundary`** | Predicting the four bites are evidence **against** row F rather than for it: each was fixed by carrying `natural_id`, which already existed. A version-of relationship would have fixed **none** of them. The model was never missing identity; the reads were not using it |
| **What I expect to be unable to settle** | *"Show me the history of this control series"* — a reader asking for versions as a sequence. No verb asks it, and under PJ-011 §5 a question the model has never been asked earns nothing. Predicting I record that as the condition that would reopen the row rather than pretending it is settled |
| **The wrong answer I expect to write** | Concluding `boundary` from the count. Four instances of one defect is still one defect; the verdict has to rest on the enumeration — *why* no read needs versioning — not on the tally |
| **What would refute all of this** | A read that needs to distinguish two versions and cannot get identity from its caller. If one exists, row F is real and the enumeration is wrong |

## Constraint

No noun, edge or property. If the verdict says one is needed, that is where this
stops and gets reported.
