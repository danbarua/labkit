# PJ-010: A cold-context review checkpoint after the first scenario

**Status: review complete (2026-08-18), on `spike/drizzle-age`. One defect
fixed; five ledger rows added; no open question resolved.**

## Context

One scenario had been built (PJ-009), and it was the one PJ-008 predicted
would pass. That is a narrow warrant: everything the project "knows" about
its own model had been established by people who already believed the model.
Before putting real pressure on it with S-17, the question worth asking was
whether an outsider could reconstruct the domain at all, and what they would
notice that we had stopped seeing.

Four reviewers inspected the repository **cold and unprimed** — no mention of
the open ledger rows, the known-suspect areas, or what we expected them to
find. They were given the same five questions but deliberately different
vantage points, because convergence across *differing* lenses is much stronger
evidence than agreement between identical briefs:

| Lens | Method |
| --- | --- |
| Docs-first | README/CLAUDE.md, then PJ-001→009 in order, then code |
| Code-first | `src/` and `tests/` first, understanding written down *before* opening any doc |
| Research practice | Judge the model against how empirical work actually behaves, not whether the code is good |
| Evidence archaeology | Git history, journal chronology and test coverage, to separate what the repo has *demonstrated* from what it *asserts* |

All four were told the docs, model, service layer and tests are provisional
hypotheses rather than a specification — that an inconsistency may indicate a
defect *or* that the model is wrong — and all four were told to preserve
uncertainty rather than convert it into recommendations.

**The review was not premature.** It found one live defect and five gaps
absent from the ledger, three of which three separate reviewers found
independently.

## 1. What converged

Ranked by independent rediscovery, not by severity.

**`Evidence` carries two senses (3 of 4).** `recordObservations` mints
Evidence for a raw measurement; `recordAnalysis` mints it for an inferential
finding. One label, one `{ statement }`, distinguished only by position in
the graph. As the research-practice reviewer put it: data survive reanalysis,
findings do not — and S-11's whole premise is that distinction. Two
consequences none of us had noticed: observation-Evidence has **no producing
`EvidenceUnit`**, which PJ-001 defines as impossible; and `whySupported`'s
query structurally requires one, so **an observation can never count as
support for a claim**. Logged as row **P**.

**Question and LineOfEnquiry are collapsed by the service layer (3 of 4).**
`openEnquiry(question: string)` creates a `LineOfEnquiry` named with the
question text. `Question` and `MOTIVATES` appear nowhere in `src/domain/`.
The minimalism is documented and defensible; the consequence was not
recorded anywhere: PJ-001's own MVP question *"why is this line of enquiry
still open?"* derives openness through `Question`, so it is currently
unanswerable for anything the service layer creates. Row **Q**.

**`Claim.kind` is hardcoded `"confirmatory"` (3 of 4).** Row K's stated
no-change route is that `exploratory` already carries the distinction — but
the only verb that writes claims can never produce one. Row **R**.

**The control chain and `Task` are inherited and untested (4 of 4).**
`Criterion`/`CriterionEvaluation`/`Gate`/`Task` have zero service-layer
surface. The archaeologist sharpened this: PJ-004 #9 *reshaped* that chain by
argument, never by demonstration, so S-17 is about to test a design
correction that was itself never tested.

**Five edge labels are entirely dead** — `CHALLENGES`, `CHANGES`, `NARROWS`,
`DEFERS`, `IMPLEMENTS` — while being materialised into every tenant graph on
every resolve. `CHALLENGES` is the one that bites soon: `supported` is
`support.length > 0`, i.e. challenge-blind, and both S-4 and S-12 need it.

Also flagged twice each: `Decision.invalidation_check` (required,
undocumented, always `"n/a"` in every test); `whatDependsOn` keying on a
non-unique, machine-generated `logical_name`; `REQUIRES` meaning "rests on"
rather than "needs"; and chronology having no durable home.

## 2. Where reviewers disagreed

**`src/domain/events.ts` — a genuine three-way split, unresolved.**
Code-first called it *"the one place the project broke its own rule and
hasn't noticed"*, and explicitly could not discriminate between that and
PJ-009's defence that API discipline is what cannot be retrofitted.
Research-practice held the seam is right but routes several *acceptance*
questions to a store that does not exist. Docs-first accepted the defence.
Code-first added the sting: **row O's fate depends on which reading is
correct**, because we have routed O toward an event model that isn't built.
Recorded, not settled.

**Row G — a reviewer disagreed with the ledger, not with the other
reviewers.** Docs-first argues our row G is itself the premature pin: PJ-004
#2 explicitly forbade `Decision.is_open` acquiring a second meaning and
argued that from a distinction, whereas row G asserts *"`is_open` was always
meant to carry this"* without one. Locking a confirmatory design is a
scientific boundary, not administrative liveness. This is persuasive and has
deliberately **not** been acted on — S-7 should be allowed to earn a separate
representation rather than have one assumed for it.

**Question/LineOfEnquiry — two live readings.** Either the graph's split is
real and the service layer has not reached it, or the split is the redundancy
and S-1 will collapse it in the graph too. Both survive the current evidence.

**Evidence without a unit.** Code-first finds the *code* more plausible than
PJ-001's definition — observations genuinely are not inferences — but then
PJ-001 needs amending and observations need a provenance story of their own.

## 3. The one change made

`Artefact.invalidated` is optional, so "not invalidated" has two spellings —
absent, and explicitly `false` — and the two branches of `whySupported()`
disagreed about which counted. One partitions on JS truthiness (absent and
`false` alike); the other filtered with a bare `IS NULL` (absent only).

Reproduced before touching anything: `restingOn` went `["obs"] → []` while
`supported` stayed `true`. A claim reporting **supported, resting on
nothing**, with no error. The db layer's own fixtures use the explicit-`false`
spelling, so the two layers of this codebase already disagreed.

The regression test is in `tests/domain-session.test.ts`, not
`tests/scenarios/`: it needs a raw property write to reach the state, which
makes it persistence-adjacent rather than an acceptance scenario. A verb was
briefly drafted to reach it from a scenario and then discarded — that would
have been inventing API to satisfy a test, which is the failure mode the
project's own bar exists to prevent.

Nothing else was changed. Known doc defects were left alone rather than
bundled into a review commit: `CLAUDE.md` says "~14 entities" and then lists
13, and it claims `closeDecision` is *"the only sanctioned way"* to set
`Decision.is_open`, which is true as intent and false as guarantee —
`graph.query()` is public and the domain layer already uses it to mutate node
properties.

## 4. What was logged, not resolved

Rows **P**–**T**, marked in the ledger as review findings rather than
scenario outcomes, since nothing has tested them:

| Row | Finding |
| --- | --- |
| P | `Evidence` carries two senses (measurement vs inferential finding) |
| Q | Question/LineOfEnquiry collapsed by the service layer |
| R | Standing is a birth property, not a transition |
| S | No agent, person or role anywhere in the model |
| T | Edges cannot carry properties at all |

Row **T** deserves its own note. `createEdge(from, edge, to)` is the entire
write API and idempotency is a real `UNIQUE (start_id, end_id)` index, so
"when was this drawn", "by whom", and "which review caused this" have no home
and cannot be given one without either reifying the edge to a node or
breaking the uniqueness contract. That commitment was made for a good reason
— the pglite-age `MERGE` defect (PJ-006) — but its *cost* was never
separately weighed. Row O and S-7 both want exactly what it forbids.

Research-practice offered the most useful reframing of the whole set: rows
**G**, **K** and **R** are plausibly one question — is standing
(exploratory/confirmatory, locked/amendable) a property a thing is born with,
or something conferred by an event? If so, three ledger rows collapse to one.

## 5. Proposed fan-out for parallel discovery

All four converged on the same shape, and on reusing the machinery the
project already has rather than inventing process for it.

**Partition by ledger-row cluster, not by scenario number:**

| Cluster | Scenarios | Rows |
| --- | --- | --- |
| Claim semantics | S-5, S-12 | B, C, N |
| Control chain | S-3, S-17, S-8 | A, I, S |
| Closure / lock / amendment | S-4, S-7, S-13, S-14 | G, H, J, R, T |
| Lineage & reproduction | S-9, S-10 | E, F, P |
| Question lifecycle | S-1, S-2 | D, Q |

**Frozen and shared across all agents:** `src/db/domain.ts` as the single
ontology, with agents proposing diffs and never forking it; PJ-008 §3 as the
append-only merge point; PJ-009's bar verbatim — *shown wrong, not argued
wrong*, and *a reader, not just a writer*; the two dependency-cruiser
layering rules; the no-ontology lint on scenario prose.

Docs-first named why that bar is the actual coordination mechanism rather
than a quality standard: it is what stops N agents each adding "the obvious
missing edge", because an agent must land a regression test that fails
against the *existing* traversal before it may propose one.

**Hazards all four flagged independently:**

- **S-12 settles both row B and row N.** It cannot be split across agents.
- **`Decision` is a hub.** Polarity, lock, deferral and any attribution all
  land on it from three different clusters, and it sits in the untested set.
  It needs a single owner or an explicit merge gate.
- **`Evidence`/`Claim` identity is upstream of two clusters.** Settled twice
  independently, the two settlements will not agree.

The recommendation, which this entry adopts but does not act on yet: sequence
row N (claim identity) and row P (Evidence's two senses) *before* fanning
out. One round's cost, and it removes the main ontology-divergence risk.

## Judgment calls

- **Nothing the reviewers surfaced as an open question was resolved here.**
  Five rows were added to the ledger and one defect was fixed. Converting
  review findings into changes would have been exactly the self-fulfilling
  refactor PJ-008 was built to avoid — the scenarios are what decide.
- **Reviewers were not primed, at real cost.** Not naming the known rows
  meant three of them spent effort rediscovering rows A, B, I and N. That
  rediscovery *is* the result: it calibrates how much of the ledger a cold
  reader would find unaided, and it is why rows P–R carry weight.
- **The disagreements were preserved as disagreements.** `events.ts` and
  row G are both recorded with competing readings and no adjudication,
  because the evidence does not currently discriminate.
- **"Earned" is a narrower warrant than it looks.** Three reviewers noted
  independently that it currently means *survived one scenario chosen
  because it was predicted to pass*. The methodology drew praise from all
  four — predictions written before the build, row B preserved as a failed
  prediction, rules watched to fail — but the control chain S-17 is about to
  exercise has never met a scenario at all.
