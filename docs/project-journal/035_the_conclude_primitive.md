# 035: the conclude primitive

Dated 2026-09-01.

`recordAnalysis` took an array of conclusions and wrote all of them in one act.
Bonsai's researchers wrote `FINDINGS.md` over days, one conclusion at a time.
This records what changed when the model was made to match that, and the five
things the change turned up — four of which were wrong answers the record was
already giving.

The tell was on the surface before anyone looked at the model: exactly **three
of eighteen** CLI commands took a JSON argument, and they were exactly the three
that mint conclusions. A caller had to serialise a tree through flat flags to
reach something the domain could have exposed directly.

## 1. One act is the caller's, not the graph's

`conclude` is the primitive: one conclusion, one call, one event.
`recordAnalysis`, `replaceAnalysis` and `reverify` compose it.

The rule this appears to strain — *a verb that composes others records one
event, not one per step* — is not strained, and getting that wrong cost a
commit. The rule is about **aspects of one act**: `openEnquiry` is `pose` plus
`pursue` and emits once because posing and pursuing are two halves of asking.
Concluding four things is four things a researcher did. A composition that
batches them must record what the CLI records when a person makes the same four
calls, or the same research action leaves a different log for having been
written through a different tool — and the Explorer's traces, built from
compositions, would then disagree with the live record about identical arcs.

## 2. A nested event does not add, it takes

The first attempt at the above suppressed the inner event, and the finding
underneath it was real.

`emit` drains the ids and edges `TenantGraph` has minted since the last event,
which is what lets an act report what it brought into existence without a caller
listing it. `drainMinted` splices the whole list. So a composition that called a
verb which emits had its **own** already-minted ids and edges carried off into
the child's event: `recordAnalysis` wrote a computation, an evidence unit and an
output artefact, then called `conclude` per conclusion, and its event came out
reporting a computation with no `PRODUCES`, no `RECORDED_IN` and no `SUPPORTS`.
Most of what an analysis is.

`tests/event-store.test.ts` is what noticed, which is the case for asserting on
the edges column at all: every node was present and the graph was right. Only
the description of the act was wrong.

The fix is `TenantGraph.inMintScope` — a closure with its own mint list, handing
back up whatever it did not claim. Suppression fixed the symptom and moved the
grain; scoping fixes the mechanism and leaves the grain alone.

## 3. Supersession is not a narrowing

`Decision -[:CHANGES]-> Claim` already meant *this decision changed which claim
stands*, and `MOTIVATES` already named the successor. The argument for reusing
it was that per-finding supersession is one reading of that edge, not two — and
that argument was written into a PR body before it was tested.

It is false, and a reader that already existed refuted it.
`interpretationHistory` walks `MOTIVATES → Claim` plus `CHANGES → Claim` to
reconstruct how a claim's reading was narrowed. Supersession writing the
identical pattern made the history loop.

The distinction, in Dan's words:

> supersedes is a substitution of one record for another; the research journey
> follows a different fork in the road. changes = looking back at the map — same
> thing, interpreted differently from a perspective further down the road.

So `SUPERSEDES` gained `Decision → Claim` and `Decision → Computation`, and
`MOTIVATES` gained the `Decision → Computation` half that pairs with it.
Removing the `CHANGES → Computation` pair without restoring that pairing took
the suite from 23 failures to 30, which is how the pairing was found rather than
reasoned about.

## 4. The flag was the wrong grain, and five readers went through it

This is #132, and it was found by hand at a terminal transcribing Bonsai's real
Stage 1A re-verification — not by a test.

That run produced one analysis with four conclusions. A log-scale re-analysis
resolved three and deliberately excluded the fourth; Bonsai's own text says *"T
vs lattice is excluded from this iteration… the v1 result for T-vs-lattice
stands as final."* Asking why that fourth finding was supported reported it
retracted, citing a review whose verdict never mentions it. Populated,
plausible, and wrong — which is the bar, not an absence.

The cause was grain. `replaceAnalysis` set `invalidated = true` on the
superseded **output artefact**: one flag over every finding that analysis
produced. Five readers of standing went through it, and each had to move down a
grain — `whySupported`'s superseded branch, `verdictsWhere`, `artefactsConsumedBy`,
`whySupported().restingOn`, and `replaceAnalysis`'s own report.

The replacement notion is `retractedArtefacts`, and its one word is the whole
issue: an artefact is retracted when **every** finding recorded in it has been
superseded. Every, not any. Replacing one conclusion leaves the rest standing,
so the artefact remains a live record someone may rest on; an artefact holding
no findings at all is not retracted, because there is nothing to have fallen.

The flag is now written by nothing and read by nothing.

### Two rules that fell out of it

**A finding falls once.** Naming what a conclusion supersedes exempts the call
from the withdrawn-proposition guard — the act that supersedes a finding is the
act allowed to restate it — and that exemption reached findings somebody else
had already withdrawn. Two decisions would stand instead of one claim, each
naming a different successor, and the reader picks whichever row it sees first.
A refusal, not a resolution.

**An ambiguous match is refused, not picked.** Pairing a replacement's
conclusions to the ones they supersede falls back to matching by proposition
when the caller does not name one. Two conclusions of one analysis may assert
the same sentence about different endpoints, so the match can name two, and
taking the first is a coin toss recorded as a fact. That fallback is also
composition-only: at the CLI or over MCP the proposition is the agent's own
sentence, and matching it would be guessing at someone else's words.

## 5. Which review retracted it, one grain lower

`INVALIDATED_BY` was `Artefact → Review`, which can answer *why was this
analysis replaced?* and nothing narrower. After the grain change a partial
replacement has no single answer to that question. It gained `Decision →
Review`, written on the per-finding decision, so *why is this finding no longer
standing?* is answered where it is asked. Both endpoints stay; the artefact edge
remains the honest answer to the question it can answer.

## 6. A doc comment naming a check that did not exist

`ResearchWrites` — the write verbs a research move calls — carried a sentence
saying that naming the dependency there is *"what lets `ResearchSession` be
checked against it (see `./session.ts`)"*. `session.ts` had no reference to the
type.

The check is now a type-level assertion, and it failed the moment it was
written: **`ResearchSession` had no `conclude` delegate at all.** The primitive
this whole change is about was unreachable from the class every scenario writes
through, and the suite was green throughout, because no scenario had called the
new verb on a session directly. Nothing else in the repository would have said
so.

A type rather than a test, because the claim is about signatures: a runtime
check could only see that the properties exist, and the drift worth catching is
a delegate that still exists and no longer matches.

## 7. What this does not settle

`reverify` keeps its single conclusion on the verb and is the last compound
shape on the surface. It cannot become a composition as things stand: it writes
`REVERIFIES` from the new evidence to the original, and nothing on the surface
exposes that edge.

The name `replace` is itself under question — *"'replacement' smells like a data
storage operation. It is."* Nobody replaces a claim; they revise a conclusion.
That thread has its own issue and is deliberately not decided here.
