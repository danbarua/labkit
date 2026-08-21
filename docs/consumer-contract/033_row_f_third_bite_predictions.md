# Row F, third attempt — predictions

**Written 2026-08-21 against `b71b2be`, before a line of test.**

Row F: an artefact has no identity apart from its content. Three attempts so
far — S-9 answered with a refusal, S-9b left an absence, S-9c bit the *report*
and was fixed at rung 1. The row stayed open each time.

## Where I am looking, and why

`whySupported().restingOn` is built as
`[...new Set(resting.map((r) => r.a.logical_name))]` — deduplicated **by name**.

That is the same asymmetry S-9c exposed: `reproducibilityOf()` took parts by
reference on the way in, argued for it in a comment, and reported bare names on
the way out. This is the same shape in the most-used read on the surface.

## Predictions

| | |
| --- | --- |
| **`restingOn` collapses two same-named artefacts into one entry** | A claim resting on the original control *and* its regeneration reports `restingOn: ["control series"]`. Populated, confident, short — a reader auditing what a conclusion depends on cannot see the second input exists, and specifically cannot see that one of them has inferred provenance. §5, not bar 4 |
| **The remedy is rung 1 again** | Report identity alongside the name, as `ReproducedPart` already does. **No noun, no edge, no property** |
| **Row F still does not close** | Predicting this is the *third* instance of one reporting defect rather than a model defect, and that the versioned-entity question — can two artefacts be two versions of one thing — remains untouched and unbitten |
| **What I expect that to mean** | Three reporting bites and no model bite is evidence about where the defect lives. Predicting the honest end state for row F is `boundary`, and that I will not be able to justify closing it on this scenario alone |
| **The wrong answer I expect to write** | Asserting the collapse from the return value only. `restingOn` is a `string[]`; if I assert `length === 1` without checking *which* artefacts the graph actually holds, I have asserted that a Set deduplicates, which is not a fact about the model |
| **What would refute all of this** | `restingOn` turns out unreachable for two same-named inputs — because `recordAnalysis` refuses them, or because the traversal never returns both rows. Then there is no wrong answer here and the row is one attempt closer to `boundary` on different grounds |

## Bar

PJ-011 §5: a confidently incorrect answer. An absence earns nothing. Asserted
twice — from the return value and from `scenario.current()` — because "the
record says this" is the claim, not "this function returned that".

## Constraint

**No noun, no edge, no property.** If the demonstration says one is needed, that
is where this stops and gets reported, not built.
