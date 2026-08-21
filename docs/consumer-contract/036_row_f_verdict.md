# Row F — verdict: `boundary`

**2026-08-21.** Four bites, one enumeration, and a condition that would reopen
it. Predictions in `035`, recorded before the fourth test.

## Predictions

| Prediction | Outcome |
| --- | --- |
| A fourth bite exists in `reproductionOf().differs` | **held**, and it was hiding somewhere worse than predicted |
| The remedy is rung 1 again | **held** — `IdentifiedArtefact`, fourth caller |
| Every read takes a reference, refuses an ambiguous name, or returns identity | **held**, enumerated and asserted in S-10c |
| Therefore `boundary` | **held**, and the argument rather than the count is what carries it |
| I could not settle *"show me the history of this series"* | **held** — recorded as the reopening condition |
| The wrong answer I expected to write: concluding from the tally | **avoided**, because it was named first |

## The argument

Row F said: an artefact has no identity apart from its content, so there is
nothing two artefacts can be two *versions of*.

The first half is false. Artefacts have `natural_id`. What the four bites showed
is that **the reads were not using it**:

| | function | what it did |
| --- | --- | --- |
| S-9c | `reproducibilityOf()` | one name in `exact` and `differing` at once |
| S-9d | `whySupported().restingOn` | two inputs deduplicated into one |
| S-10c | `reproductionOf().differs` | two entries under one name, contradicting |

Each was fixed by carrying identity that already existed. **A version-of
relationship would have fixed none of them.** They are evidence against the row,
not for it.

And no read needs one. Every read on `ReadSurface` that touches an artefact
either takes a **reference**, or takes a name and **refuses** when it is
ambiguous, or **returns** identity. S-10c's third test asserts that rather than
leaving it as prose: a name is never enough, and a reference always is.

So the model was never missing identity, and nothing on the surface has to know
that two artefacts are versions of one thing.

## What would reopen it

*"Show me the history of this control series"* — versions as an ordered
sequence, asked of the name rather than of one artefact. No verb asks it. Under
PJ-011 §5 a question the model has never been asked earns nothing, so this is
recorded as the condition rather than treated as settled.

If that question arrives, the enumeration above is what breaks: it would be the
first read needing identity its caller does not hold.

## The method finding, which is not row F's

The fourth bite was in S-10's **own test**. Its comment reads *"Identical names,
two artefacts, two differences"* — and the assertion below compared the two
entries by their identical names, eleven scenarios ago.

That is the third instance of one shape, in three unrelated places:

- `reproducibilityOf()` argued in a comment for taking parts by reference, then
  reported bare names;
- `wrap-hook.sh` carried a comment calling a branch unreachable insurance, and a
  fork reaches it;
- S-10's test named the collapse and asserted it as correct.

**A guard stated in prose beside code that does not honour it.** Prose is where
this project keeps its reasoning, which is exactly why prose agreeing with
itself is not evidence that the code agrees with the prose. Flagged for a
journal entry — it constrains how the project writes rather than what the model
holds, which is PJ-025 and PJ-026's territory.

## Standing

Row F moves from `open` to **`boundary`** — a characterised limit, recorded on
purpose, with no claim it should be fixed. Rows Y and AA are the precedent.

Node labels thirteen. No noun was added, and row F was the only candidate in the
project's history that would have been the first.
