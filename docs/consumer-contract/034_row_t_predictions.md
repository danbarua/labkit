# Row T — predictions

**Written 2026-08-21 against `918f420`, before a line of test.**

Row T claimed edges cannot carry properties. **Refuted earlier today**: every AGE
label is a real Postgres table with a `properties` column, `createEdge()` takes
them, and CLAUDE.md's own AGE notes had said so while the row asserted the
opposite through four cold reviewers and eleven scenarios.

What survives is two narrower facts:

1. An edge property cannot be part of **edge identity** — `UNIQUE (start_id,
   end_id)` means two edges of one label between one pair are one edge.
2. It cannot be **changed** by re-calling the verb that created it;
   `createEdge()` is create-if-absent.

The row is **orphaned**: row O was its only named owner, and closing O took the
owner with it. So a discriminator here is genuinely new.

## The shape I am looking for

A fact that is **intrinsic to a relationship** — never changes, never recurs
between the same pair — where being unable to put it on the edge gives a wrong
answer. Anything that changes or recurs is an *act*, and acts have gone to nodes
three times out of three: S-7's amendment `Decision`, S-12's, and row O's
`INVALIDATED_BY`, which turned out to need no properties at all.

**The candidate: input order on `CONSUMES`.** `recordAnalysis({ from: [a, b] })`
records which artefacts a computation read and not the order it read them in.
Order is intrinsic to that relationship, never changes, and cannot recur — which
is exactly the shape a node would fit badly, since reifying "the second input"
as an entity is worse than a number on an edge.

## Predictions

| | |
| --- | --- |
| **Order is genuinely lost** | `CONSUMES` records no ordinal, so two runs reading the same artefacts in different orders are indistinguishable in durable state |
| **And a read gives a wrong answer because of it** | Predicting `reproducibilityOf()` reports `reproducible: true` for a rebuild that read the same inputs in a different order, and `reproductionOf()` reports the two executions as a reproduction. For an order-sensitive method that is a positive claim of sameness about two runs that are not the same |
| **Whether that is *row T's* wrong answer** | **Predicting not, and this is the load-bearing prediction.** The record does not know a method is order-sensitive, so the wrong answer is available whether the ordinal lives on the edge, on a node, or anywhere else. If a fix requires *also* recording that the method cares about order, the defect is not "edges cannot carry properties" — it is that the model has no concept of an ordered input list at all, and row T would be taking credit for someone else's gap |
| **Outcome** | Predicting row T ends **refuted** or `boundary`, on the grounds that every candidate either wants a node or is not really about edge properties. Four for four against the row |
| **The wrong answer I expect to write** | Building the order case, seeing it fail, and calling it row T's — without asking whether an edge property is what fixes it. That is the trap the third row above exists to name |
| **What would refute all of this** | An ordinal on `CONSUMES` alone, with no other change, turning the wrong answer into a right one. Then edge properties are load-bearing and row T is real |

## Constraint

No noun, edge or property to be added. If the demonstration says one is needed,
that is where this stops and gets reported.
