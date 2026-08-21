# Row F — outcomes

**Built 2026-08-21, `46b87aa` and `fa3d2f6`.** `tests/scenarios/s9b_rebuild_or_fresh_work.test.ts`,
seven tests, 207 pass / 0 fail, typecheck clean, depcruise 0 errors.
Predictions were recorded in `027` against `2ca30d7`, before a line of test.

**Nothing in `src/` changed.** Row F is not closed and no rung above 2 was
climbed.

## The build found two things, and only one of them is row F's

| | |
| --- | --- |
| **Row F** | Ladder paused at rung 3. Rung 2 holds for a rebuild that concludes something and refuses the case the contract actually requires |
| **A confirmed wrong answer** | Work recorded as observations makes a question read `untested` — *"one nothing has ever been run against"*. Not row F's, clears §5, and under CLAUDE.md's rule 1 clearing it is the next thing built |

## Predictions

| Prediction | Outcome |
| --- | --- |
| Rung 1 fails by **refusal**, not by a wrong answer | **held** — a reconstruction and independent fresh work leave records identical in every field a reader can ask for. Bar 4, not §5 |
| F bites on the **question** side, not the artefact side | **held on the claim, refuted on the mechanism** — see below |
| Rung 2: `reverify()` refuses and no existing edge fits | **refuted**, and it is this build's most useful result |
| Rung 3: the remedy is not on the artefact, and may be no model change at all | **undecided.** The ladder is paused here, not walked past |
| Rung 4: no new noun | **held so far** — nothing was added |
| The wrong answer I expected to write: keying on `logical_name` | **avoided**, and naming it in advance is why |
| Second-order risk: recording against the wrong enquiry | **refuted** — the miscount happens when the work is recorded against the *right* enquiry |
| Refutation: a wording-independent derivation recovers the target | not met |

Three refutations out of eight, which is the ordinary rate for this project and
the opposite of row Z's clean sweep. `026` explained why a clean sweep was the
weaker signal; this is the shape that carries more.

## Rung 2 held, and that is worth more than an edge

`reverify()` already records a rebuild as **an act with a target**. Recorded that
way, `whySupported()` reports the proposition resting on one finding with
`reverifiedBy` naming the method; recorded as an ordinary analysis, it reports
**two independent findings** supporting a proposition that rests on one, rebuilt.
That is S-10's demonstrated wrong answer at the artefact level, and the verb that
prevents it has existed since S-10.

Two entries in `support` is **correct in one world and wrong in the other**, and
nothing but the researcher's choice of verb distinguishes them. The record cannot
check the choice. That is a real limit and it is not the same thing as a missing
relationship: S-10 earned `REVERIFIES` because there was *no* way to say it.

## Where rung 2 stops, and why that keeps row F open rather than closing it

`reverify()` re-checks a **conclusion**. It looks up the finding by which the
historical analysis concluded a proposition and refuses when there is none.

Designer 2's requirement is a researcher who rebuilt an **input** and concluded
nothing — the control was regenerated so that later work could proceed. There is
no proposition to name, the verb declines, and the act has nowhere to be
recorded. So:

> rung 2 holds for the case that could produce a wrong answer, and refuses the
> case the contract requires.

## The boundary reading, considered and rejected

`027` predicted this build would end with row F reclassified `boundary` — a
characterised limit with no claim it should be fixed — and called that "a bigger
result than an edge". **Recorded because it nearly happened.** A prediction that
frames one outcome as the impressive one is a thumb on the scale, and the
evidence pointed the other way.

Two things rule it out:

1. **It contradicts `023`.** That table scores row F's contract necessity
   **strong**. A row cannot simultaneously be a requirement of the frozen
   contract and a limit nobody claims should be fixed. Demoting it out of H1
   would have to come first, and this build produced no argument for that — it
   produced the opposite.
2. **Row Z is the precedent against it.** Z never cleared §5 either; its rung-1
   failures were absences, and it earned `decided_at` on bar 4 plus a
   demonstrated rung-1 failure. F is at the same position on the same ladder.

Row F stays **`open`**, now with its discriminator built rather than named, and
rung 3 gated on the adapter phase's reconstruction-provenance read — which is
`023`'s own sequencing: *let the four reads fail against real state first*.

## The wrong answer this probe actually found

`027` predicted the confident wrong answer would be on the question side. It is.
The predicted mechanism — a researcher recording work against the wrong enquiry —
is refuted: the miscount happens when the work is recorded against the **right**
one.

A researcher opens *"what generated the historical random control?"* and works on
it: three candidate algorithms tried, none reproduces the recorded series. A
negative result is a result. `whatIsKnown()` reports the question `untested`.

The cause is `recordObservations()` creating `Evidence` with no producing
`EvidenceUnit`, which PJ-001 defines as impossible. `whatIsKnown()`'s `worked`
test walks `EvidenceUnit -ADDRESSES-> LineOfEnquiry`, so observation-only work is
invisible to it and analysis work is not. The same survey in the same test
classifies the sibling question `unresolved`, which isolates the cause rather
than alleging it.

**Three cold reviewers flagged the missing unit independently and three scenarios
were pointed at it without finding harm beyond a reader's.** This is the fourth,
and the first to produce a wrong answer instead of an untidy one. The rule that
kept it deferred was right each of those three times, and it is what makes the
fourth mean something.

## What this changes about the queue

CLAUDE.md permits **one** confirmed wrong answer shipping green, and requires
that clearing it be the next thing built. There is now exactly one:

1. `recordObservations()` produces an `EvidenceUnit` — with S-9b's seventh test
   **inverted**, not deleted. It touches every read that walks the unit
   (`whatIsKnown`, `whySupported`, `reproductionOf`), so it is a real build, and
   S-9b's shape-detectors run after it.
2. Row O's discriminator, as a hypothesis with predictions recorded first.
3. Row S, last and deliberately.

Row T is orphaned: if O is settled by a plain `Decision → Review` edge, T
contributes nothing to it and loses its only named owner.

## Standing after this build

| Candidate | Bar | Status |
| --- | --- | --- |
| Historical ordering (Z) | 4 | closed — one property, no migration |
| Reconstruction target (F) | 4 | **open, discriminator built, ladder at rung 3** |
| Attribution / authority (S) | 4 | open |
| Observation-only work reads as no work | **§5** | **confirmed wrong, green, next to build** |
| Unqualified `unaffected` | 3, tier 1 | open |

The noun inventory is unmoved at thirteen through fifteen scenarios, a consumer
probe, a closed row and now a probed one.
