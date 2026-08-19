# PJ-015: Claims and amendment — identity by wording, and the limits of a good remedy

**Status: implemented (2026-08-19), on `spike/drizzle-age`. Covers S-7
(`563f812`, `49160e9`, `4a7dbc1`), S-12 (`89ae5da`, `80da2f7`, `a97231e`) and
S-5 (`0aaa3e4`, `8aaa17c`, `51b70d6`), plus `d8134d2` and `af5a1d2`. Rows B, C,
N and R resolved; rows AA, AB, AC added; rows V, W, X still open. Verification
at the time of writing: 130 pass / 0 fail, typecheck clean, `npx depcruise src
tests --output-type err` 0 errors.**

## Context

PJ-014 covered the question side. These three scenarios cover what happens to
a *claim* — how a locked design is amended (S-7), how an interpretation is
withdrawn without touching the numbers (S-12), and what a claim's scope
actually is (S-5).

PJ-012 had named claim identity as "where an entity change would first become
plausible". It didn't become plausible. All three scenarios resolved without a
single new node label, and S-5 — which PJ-008's own §2 called "the one most
likely to force a real model change" — forced none at all.

What they found instead was one defect class, appearing four times in
structurally unrelated regions.

## 1. The finding: identity by wording

Every one of these was a confidently wrong answer, not an empty one:

- **`gateStatus()`** aggregated by proposition *text*, so two distinct criteria
  worded identically collapsed into one check (`9804de5`, pre-dating this arc).
- **Every claim read verb** addressed a claim by its sentence. Two lines of
  enquiry asserting the same words about different endpoints reported one claim
  **simultaneously supported and challenged**, resting on only one side's
  observations — when each claim separately had a clean, uncontested answer.
  And `reinterpret()` withdrew both, silently retracting an unrelated line of
  work with no decision anywhere saying so (`8aaa17c`).
- **`decidedOnTheStrengthOf()`** was *still* keyed on wording alone **inside
  S-5's own fix** (`51b70d6`) — a question closed in one enquiry reported as
  resting on an identically worded reading in another.
- **`interpretationHistory()`** remains keyed by wording. Logged as a named
  boundary rather than fixed, because its distinct-decisions guard already
  refuses when two scopes narrow to the same words, rather than following
  whichever row came back first.

The third of those is the one worth dwelling on. It survived the first sweep
because **the scenario as first written never closed a question**, so the field
was empty whether or not the bug was present. A deletion probe only proves an
edge is load-bearing *for what the scenario happens to exercise*. That is the
sharpest methodological lesson of the arc.

The resolution, row C and row N together: **scope is derived by traversal and a
claim is identified by its proposition within a line of enquiry.** Nothing was
added to `Claim`. The path — `Claim <-SUPPORTS- Evidence <-PRODUCES-
EvidenceUnit -ADDRESSES-> LineOfEnquiry <-MOTIVATES- Question` — already
existed and was already walked. The node stays an assertion *occurrence*:
duplicates inside one scope merge on read, duplicates across scopes must never
merge.

Text remains the handle while a sentence is asserted once, which is the
ordinary case and every scenario before S-5. When it is not, LabKit **refuses
and says how many** rather than picking. That is S-7's principle — a command
that declines beats an answer about something the caller did not mean — and it
is now used in three places.

## 2. act→product: the same omission three times, three different remedies

A consequential act recorded what it acted **on** and not what it brought into
existence. S-1 found it in question sharpening; S-7 in design amendment; S-12
in interpretation narrowing.

The remedies did not converge:

| Where | Remedy |
| --- | --- |
| S-1, sharpening | `MOTIVATES: Decision → Question` — nothing else could reach the reason and frozen evidence |
| S-7, amendment | **none needed** — a gate contains its design conditions, so the current one is derivable as the unchanged member |
| S-12, narrowing | `MOTIVATES: Decision → Claim` — an interpretation has no container |

S-12's prediction was explicitly that S-7's remedy would transfer. It was
**refuted**, and the reason is structural rather than incidental: containment.
Where the products of successive acts sit in a set that something else already
identifies, the current one is derivable; where they float free, it is not.

Row AB therefore records act→product as a **review heuristic** — a question to
ask of every verb that mints something — and explicitly *not* as a domain
relationship. Three instances and three answers is an argument against a
blanket rule, not for one.

**The tension that leaves, named rather than resolved:** `MOTIVATES` now
carries three endpoint pairs and is generalising into exactly the "gave rise
to" relation row AB argues should not exist as a blanket rule. A fourth pair
should have to argue against this paragraph.

## 3. Row B resolved, and further than expected

Supersession between claims is not real — and decision-level supersession was
not needed for interpretations either. With `CHANGES` recording what a decision
withdrew and `MOTIVATES` recording what replaced it, the revision chain already
walks claim-to-claim; a `SUPERSEDES` edge would have been a writer with no
reader.

That is a genuine contrast with S-7's design amendments, where `SUPERSEDES`
**is** load-bearing and was proven so by deletion. There each step records only
what it changed, and the gate supplies the rest. Same abstract relationship,
opposite verdicts, for a reason the model can state.

## 4. Chronology: narrowed twice, still open

Row Z started as "there is no ordering between decisions". S-1 narrowed it to
"evidence-level history is answerable, status-level is not" (PJ-014 §5). S-7
narrowed it again: `SUPERSEDES` orders one design's amendments structurally,
with no timestamps, an empty event log, and natural-id order never consulted.

S-7 deliberately includes an unrelated sharpening elsewhere in the programme to
show the shape of what remains: **in-chain order is modelled, cross-chain order
is not.** That is a smaller true claim, not a partial fix.

## 5. Row R resolved at the service layer, with its successor still open

`Claim.kind` was hardcoded `"confirmatory"` by its only writer, which made
`exploratory` unreachable through any research verb. The wrong answer that
exposed it: amending a solver iteration limit reported `nature: "scientific"`
and named a convergence diagnosis as a compromised confirmatory result — a
false p-hacking alarm.

`Conclusion.standing` now defaults to **exploratory**; confirmatory standing is
claimed deliberately or not at all.

What S-7 also did, in passing, is rule out the tempting alternative: standing
cannot be conferred by gate state, because S-17 established that declaring a
gate does not satisfy it — so a claim behind an unevaluated confirmatory gate
would read exploratory and the scientific amendment would go undetected. Rows
G, K and R remain one question about *how standing changes*; S-7 removed one
candidate answer without supplying the final one.

## 6. Two edges that had never been written

`SUPERSEDES` and `IMPLEMENTS` were both declared in PJ-004 and walked by
nothing until S-7. Both were verified load-bearing by deletion rather than
argument — remove the write, watch the wrong answer return, restore.

`IMPLEMENTS` produced the arc's most alarming failure. Without it the blast
radius of an amendment reaches the *work* and stops one hop short of the
*results*, so an amendment that moves a prespecified comparison to the full
sample reports itself **mechanical** — the label that certifies a repair as
legitimate rather than p-hacking, applied exactly backwards.

It was also wired **before** the wrong answer was demonstrated, which is the
wrong order. The rule that came out of it, now in CLAUDE.md:

> A relationship can still be earned after being implemented prematurely — but
> the evidential sequence has to be reconstructed explicitly, by deleting the
> edge and demonstrating the wrong answer that returns. Implementing first is
> the wrong order; leaving the evidence unreconstructed is the actual defect.

## 7. A third state for claims, and a door that had to be shut

`withdrawn` joins `supported` and `challenged`. Three distinct things —
nobody asserts this any more, evidence bears against this, nothing supports
this — and S-12 asserts all three separately, because a narrowing where no
measurement contradicted anything must not read as a refutation.

`support` stays populated underneath a withdrawn reading. The findings were
always fine, and blanking them would say the numbers had gone wrong, which is
the one thing the scenario exists to deny.

The door: recording an analysis that concluded a withdrawn proposition minted a
fresh claim node and flipped `withdrawn` back to `false` — the record
un-retracting itself while the reviewer's objection still stood. Now refused.
Row AC names what that leaves missing: the *legitimate* case, new evidence
genuinely re-opening a settled reading, which needs a deliberate verb rather
than a side effect. Not built, because S-12 does not contain one.

## 8. The read side that was built before its reader

Not a scenario finding, but it belongs in this entry because it is the same
mistake in the opposite direction. Every tenant was provisioned with one SQL
view per node label, reconciled on every `resolveTenantContext()`. After eight
scenarios nothing had ever read one, and nothing could — `TenantGraph` has no
raw-SQL escape hatch by design.

Removed (`af5a1d2`). This is not a reversal of the no-cull policy: that policy
protects unused **labels and edges**, because a declared-but-unwalked edge is a
claim about the domain and a computable map of what the model asserts but
nothing has tested. A view asserts nothing about the domain. What would bring
them back is the MCP/CLI read layer, where a relational projection actually
pays.

## Judgment calls

- **Row V is still open, and is the only confirmed wrong answer shipping
  green.** `whySupported()` reports `supported: true` for a finding whose own
  prespecified robustness checks failed. Two models fit and S-3 cannot
  discriminate. This is now governed by a stated trigger rather than by
  everyone remembering — see CLAUDE.md, "Changing the graph model".
- ~~**`incomplete` is still the one gate state no test forced.**~~ **Cleared by
  S-8.** PJ-012 flagged it against itself, PJ-013 kept it flagged, and this
  entry repeated it. S-8's advancement gate — throughput established, solver
  health never run — forces the state from a scenario rather than from an
  argument.
- **`interpretationHistory()` keeps its wording key.** It refuses on ambiguity
  rather than guessing, and no scenario has produced a wrong answer through it.
  Scoping it speculatively would be building for a model nobody has tested.
