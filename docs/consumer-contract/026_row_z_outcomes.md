# Row Z — outcomes

**Implemented 2026-08-21, `3531541`.** 200 pass / 0 fail, typecheck clean,
depcruise 0 errors, `check:migrations` OK. Predictions were recorded in `025`
against `9d41c0e`, before a line of test or source.

## Every prediction held, and that is the least trustworthy part of this entry

| Prediction | Outcome |
| --- | --- |
| Rung 1 fails demonstrably | **held**, twice over |
| Rung 2 not needed | **held**, but by *argument* — see below |
| `Decision.decided_at`, six sites, no migration | **held**, exactly |
| Reading must be named as record time | **held** |
| I would leak current state via `Claim.kind` | **held** — probe 7 exists because of it |
| The as-of survey needs states recomputed, not filtered | **held, and sharper than predicted** |
| Refutation: rung 1 suffices | not met |

Five of the last six builds had at least one prediction refuted, and the
refutations were worth more than the hits. **A clean sweep is a signal to
distrust, not to celebrate**, so the reason is worth naming: these predictions
were written *after* probe 5 had already measured which clock reads reach durable
state. That measurement is what made rung 1's failure foreseeable. Predictions
made downstream of the hard measurement are cheaper than S-18's were, and their
holding is correspondingly weaker evidence about the model.

The one that would have been expensive to get wrong — the `Claim.kind` leak — was
a prediction about **my own error**, not about the domain. It held because I then
went looking for it.

## Rung 1: built, and failed twice

The best ordering a consumer can derive: a closure citing a finding held to an
evaluated criterion is no earlier than that evaluation.

- **No anchor in the ordinary case.** A closure with no prespecified check
  returns `standard: []`. Forty days between analysis and closure, nothing
  recorded either instant.
- **An anchor that still cannot order.** With checks on both questions, two
  programmes whose closures fall sixty days apart *in opposite orders* produce
  identical bounds. The bound records when the evidence was **checked**, not when
  the question was **settled**, and a programme can sit on checked evidence for
  months.

The second test initially passed for the wrong reason and had to be rebuilt:
winding the clock before each closure also delayed the *next question's
evaluation*, so the worlds differed in evidence times as well as order, and the
bounds duly differed. Confounded. Both worlds now evaluate at the same two
instants and differ only in which question is closed first.

## Rung 2: declined by argument, and labelled

Sequence is a property of each act, not a relation between two. An `AFTER` edge
would have to be written at every decision against some prior decision, and a
reader would still be rebuilding a total order from pairs.

This is an **argument, not a demonstration** — the weaker move, and the ledger
has a vocabulary for it (`resolved (argued)`, PJ-017). Recorded as such rather
than dressed up: nothing was built and shown to fail here.

## Rung 3: one property

`Decision.decided_at`, **required rather than optional**, because an ordering
with holes is precisely what row Z already had — `evaluated_at` bounded some
closures and left the rest unplaceable. Six creation sites. **No migration**:
twenty-five journal entries and still zero.

Making it required broke four persistence-test fixtures at compile time, which is
the type doing its job rather than a cost.

**Record time, and the property says so.** `023` demoted bitemporality for want
of a source obligation; `024` warned that a single timestamp "would look like a
fix while silently choosing one reading". The comment names the reading so the
next reader does not assume the other.

## What the as-of view refuses to answer

`whatWasKnown(at)` is a **narrower shape** than `whatIsKnown()`. `EvidenceUnit`
carries no instant, so *whether anyone had yet worked on a question* cannot be
placed in time. The present-tense survey splits that into `unresolved` and
`untested`; the historical one collapses both into `open`.

That collapse is the finding, not a shortcut. Splitting it would mean reading
today's evidence units to answer a question about March — the same current-state
leak that makes a survey report a question `established` before the promotion
that established it. It also names where the next instant would go if the split
is ever required, and says it should be earned the way this one was.

## Row Z's condition, met on its own terms

The ledger entry had closed: *"neither a durable event sink nor a `decided_at`
property is earned by a question nobody has yet been unable to answer."*

Three cold designers required historical ordering independently; probe 5
demonstrated the gap against running code; probe 6 showed the cheap route
insufficient. **Second time a condition recorded deep in a document has fired and
had to be noticed by someone re-reading it** — row K was the first, and it sat
fired through three external reviews.

## Standing after this build

| Candidate | Bar | Status |
| --- | --- | --- |
| Historical ordering (Z) | 4 | **closed** — one property, no migration |
| Reconstruction target (F) | 4 | open |
| Attribution / authority (S) | 4 | open |
| Bitemporality (Z+) | — | candidate extension, not contract-required |
| Unqualified `unaffected` | 3, tier 1 | open |

Row Z took **one property and no noun**, which is the outcome the change bar
exists to produce. The noun inventory is unmoved at thirteen through fifteen
scenarios, a consumer probe, and now a closed row.
