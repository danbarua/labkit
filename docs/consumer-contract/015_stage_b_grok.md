# Stage B revision — designer `grok` (`xai-oauth/grok-4.6`)

**Verbatim, unedited.** Everything below the horizontal rule is this
designer's complete stdout. Run 2026-08-20, after `012` was frozen
and committed; `--no-tools`, empty `--cwd`, `--no-session`, stdin detached.

Each designer was given three things and **only its own** Stage A output:
the original Stage A material, its own design reproduced verbatim, and
PJ-001's constraints (`003_stage_b_packet.md`) which it did not have when
designing. Necessary because `--no-session` leaves these processes with no
memory of the earlier run.

Protocol vocabulary was stripped from the prompt: the packet's own heading
read *"The Stage B question"*, which would tell a designer it is inside a
staged experiment and invite a performed revision. It reads "Your task",
and the instruction states that no change is a legitimate answer and more
useful than a manufactured one.

---

The original contract still holds. PART 3 does not ask for a metrics store, a workflow engine, or a thinner ontology. It does force a few places where the read surface was too absolute, too uniform, or missing a question the authors treat as MVP.

# Revision document

Only deltas. Unmentioned operations, refusals, and glossary entries stay as they were.

---

## What PART 3 actually conflicts with

Three tensions, not a rewrite:

1. The original refusal of *all* run-metric questions collides with the MVP prompt “show me … the relevant run metrics,” and with “link computations and external run systems” / “do not duplicate bookkeeping.” LabKit still must not *store* telemetry. It must be able to *point at* it.
2. Every criterion was treated alike: named ≠ evaluated, missing evaluation ⇒ **cannot tell**. That correctly blocks fake passes. It also turns every diagnostic into a gate, which PART 3 forbids. Formal *boundary* constraints (test-set access, prerequisite evidence, promotion) stay strict; optional diagnostics must not.
3. Blast radius named claims (and observations). The MVP names **claims, decisions, and open lines**. Decision is not a claim. Open-line effect is not “claim standing becomes unsettled.”

A fourth gap is not a contradiction so much as a missing read: agents must not be handed the ontology. The original surface assumed a caller who already knew which object to ask about.

---

## 1. Operations revised

### `invalidation_blast`

**Changed.** Downstream set is now **claims, decisions, and open lines of enquiry** (plus observations that still stand). “Anything whose standing becomes unsettled” is too vague: it hid decisions inside claims, and hid “line stays open / reopens” inside claim mood.

**Caused by.** MVP: “If Artefact A12 is invalidated, what claims, decisions, and open lines of enquiry become affected?” Also: preserve why a *decision* exists and what would invalidate or reopen it.

**Glossary.** Adds **Decision**. Does not split Claim.

### `stance` (when the thing is a line of enquiry)

**Changed.** **Open** is no longer only “work may still be done.” For a line, the answer must include *why it is still open*:

- never closed and never accepted as unresolved
- what, if recorded, would close it or accept it as unresolved
- attempts that did not close it (and that those failures are not programme failure)
- that absence of evidence is not a negative closure

**Caused by.** MVP: “Why is this line of enquiry still open?” plus “do not confuse absence of evidence with failure.”

**Glossary.** No new concept. Stance already existed; **open** gains a recorded-or-derived reason, not a new identity.

### `claim_versus_source` and `evidential_status`

**Changed.** Alongside evidence and computations, return **links to external runs/telemetry** for those computations — handles, not numbers. The numbers are not LabKit objects. The link is. Logical support remains: counted evidence, not the run.

**Caused by.** MVP question 1; “separate scientific state from execution telemetry, while allowing … external run systems to be linked”; “should not require duplicated bookkeeping”; “should not make … runs part of the logical support for a scientific claim.”

**Glossary.** Splits **Computation** from **Run link** (below).

### `criterion_evaluation`, `evidential_status`, `promotion`

**Changed.** Missing evaluation is not one status for every criterion.

- **Boundary constraint** (test-set access, prerequisite evidence, promotion criterion, prespecified robustness): missing evaluation ⇒ **cannot tell**, never a pass, and that fact *does* bear on whether evidence counts or promotion is earned.
- **Diagnostic / non-boundary criterion**: missing evaluation is **not evaluated, and that does not gate standing**. It is not a pass either.

**Caused by.** “Support formal constraints where they protect a real scientific boundary” vs “should not turn every … diagnostic, or implementation detail into a mandatory gate.” Also the design principle: tolerate missing *structure* when discovery is unresolved; do not treat a missing *required* evaluation as satisfied.

**Glossary.** Splits **Criterion** (below).

### `conflict` / Finding as used there

**Changed.** A finding may be **partial**. Missing question, evidence, or scope still yields **cannot tell** for conflict; it does not mean the offering was invalid or must be upgraded into a confirmatory package.

**Caused by.** “Allow exploratory work, failed attempts, … and partial findings without forcing them prematurely into a confirmatory structure.” “Should not treat exploratory observations as confirmatory evidence merely because they exist in the graph.”

**Glossary.** Revises **Finding**; does not add a second type.

### Meaning of **cannot tell** on every operation that already used it

**Changed.** Split the *reported* failure, not the stored ontology:

- **not yet structured** — discovery still open; missing study / lock / strength relation / complete finding is tolerated; not a defect; not a queue.
- **required link missing** — a dependency, boundary-criterion evaluation, or provenance link that *would* have to exist for the asked consequence to be drawn. Not a pass. Not a fail.

The original single **cannot tell** collapsed “we have not yet shaped the science” with “the record cannot support this consequence.” PART 3 treats those as opposite errors.

**Caused by.** “A missing structure should be tolerated when the science is genuinely unresolved. A missing dependency, criterion evaluation, or provenance link should not be silently interpreted as satisfied.” “Should not prevent work simply because the eventual scientific structure is not yet fully known.”

**Glossary.** Adds **Absence kind** (derived on the read, not a stored entity).

---

## 2. Operations added

### Why does this claim currently count as supported?
**`why_supported`**

**Caller passes:** a claim.

**Comes back:** the live statement and scope; the evidence *offered*; which robustness/boundary conditions were prespecified; which were evaluated and held; that those offerings are on the record (scratch cannot appear); the computations they came from; **run links** for those computations; the interpretation step that takes counted evidence to the claim. If it does *not* count: which condition failed, was not evaluated, or was never offered — not a mood.

This is the MVP question “Why does Claim C7 currently count as supported?” The original surface could assemble it from `standing` + `evidential_status` + `claim_versus_source`. That is navigation. Restated as the question asked.

**Serves:** MVP; shoulds on justification and “make it cheap to ask why?”

**Glossary.** None new. Uses Claim, Evidence, Evidential status, Computation, Run link, Interpretation, Scientific record.

### What would unseat this?
**`unseating`**

**Caller passes:** a claim, decision, criterion, or line of enquiry.

**Comes back:** the recorded dependencies whose loss would unsettle or reopen it; **cannot tell (required link missing)** where dependence was never recorded; **not yet structured** if the object is still exploratory and has no such links *because none were required yet*.

This is the inverse of `invalidation_blast` (“what depends on this?” vs “what does this depend on?”). PART 3 asks for both, cheaply. Blast was only downstream.

**Caused by.** “what would invalidate or reopen it”; “make it cheap to ask why? / what depends on this?”

**Glossary.** Uses Dependency, Decision. No new stored kind.

### What changed?
**`what_changed`**

**Caller passes:** a programme, line, study, claim, decision, or procedure, and a time (or “since this decision / since this stance”).

**Comes back:** changes to claims, decisions, criteria, evidence-countings, stances, admissions, locks/amendments — with the evidence available *when the change was made*. Not a file diff. Not a metrics timeline.

Object-local history already existed (`question_formation`, `locked_amendment`, …). A programme-level “what changed?” was missing, and PART 3 lists it with why / depends / unresolved.

**Glossary.** None. Derived over remembered revision histories.

### What may this agent do without swallowing the ontology?
**`task_contract`**

**Caller passes:** a piece of intended work (a proposed execution, evaluation, repair, promotion check, or exploratory note) — or enough of an occasion to identify it.

**Comes back:** a **narrow derived contract**: the question or defect in scope; what would count as evidence vs scratch; boundary constraints that *must* be evaluated; diagnostics that must not be treated as gates; what would earn promotion if relevant; what this work is *not* allowed to widen (completed study scope, locked scientific content vs incidental machinery); that runs/tasks/agents are not support for claims. Omits the rest of the programme.

**Caused by.** “Reduce the amount of global context an implementation agent must understand by presenting it with a narrow, derived task contract.” “Should not require implementation agents to understand or manually maintain the full research ontology.” “Should not make operational entities such as tasks, agents, or runs part of the logical support for a scientific claim.”

**Glossary.** Adds **Task contract** (derived read, same honesty class as Standing).

---

## 3. Refusals revised or added

### Revised: “How did this job perform? …”

**Was.** LabKit does not record how work performed. Ask the metrics system.

**Now.** LabKit still will not answer with runtime, loss, or sweep winner as *its* objects, and still will not be W&B. It **will** return the **run links** attached to the computations behind a claim or execution, so the caller does not have to re-find them. “Show me the relevant run metrics” ⇒ here are the linked runs; go there for numbers. “Is the claim supported because the run finished / the loss is low?” remains refused: a run is not support.

**Caused by.** MVP question 1 vs “should not become an experiment tracker” vs “should not duplicate bookkeeping.”

### Added: “Is it supported? The training run exists / the agent completed the task.”

Operational entities are not logical support. Point at the evidence that *counts*, or say none does.

### Added: “Give me the programme ontology so I can decide what to do.”

Refused as a substitute for `task_contract`. The system will derive a narrow contract. It will not require the caller to maintain or understand the full graph.

### Added: “This diagnostic was not run, so the claim cannot stand.” / “This diagnostic was not run, so we are fine.”

Neither. Non-boundary diagnostics do not gate standing. Their absence is not a pass. Boundary constraints remain **cannot tell**, not a pass.

### Added: “We cannot proceed until the eventual study structure is known.”

The read surface does not prevent work. **Not yet structured** is not a lock. Exploratory capture remains scratch until admitted.

### Unchanged refusals worth naming so they are not “fixed”

Correspondence truth, electing a winner among conflicts, progress bars, prescriptions (“should we promote?”), p-hacking verdicts, invented intent, plausible reconstruction, merged weaker/stronger propositions, scratch-as-grounds, named-gate-as-pass, “better” as performance, conclusion-match as execution reproduction, discarding observations with an analysis, counterfactual un-amended claims, confidence numbers, literature/credit — all stay refused. PART 3 does not soften them.

---

## 4. Glossary

### Added: Decision

**Definition.** A recorded commitment the research made — lock, admission, promotion, closure, accept-as-unresolved, scope declaration — as opposed to a claim about the world.

**Required by.** `invalidation_blast`, `unseating`, `what_changed`, `task_contract`.

**Identity.** This commitment, at this time, on this object. Same one a year later. Reversal is a new decision, not an edit that erases it. Distinct from any claim that justified it.

**Remembered.** What was decided, why, on what evidence, what would reopen it.

**Derived.** Whether it is currently in force; blast if its grounds are untrusted.

**If absent.** (a) Artefact A12 underwrote the *decision* to promote implementation I2; invalidating A12 reopens promotion while the scientific claim “the method is equivalent on this suite,” if any, is a separate object. (b) Invalidating A12 is reported only as “some claims need reconsideration,” and the promotion is left looking like a fact about the world — or silently undone with the claim. Commitment and belief coincide.

**Caused by.** MVP blast question; “preserve why a claim, *decision*, criterion, or line of enquiry exists.”

This is not decoration. Claim cannot absorb it.

### Added: Run link

**Definition.** A pointer from a computation (or execution) into an external telemetry system. Not metrics, not evidence, not a LabKit run object.

**Required by.** `why_supported`, `claim_versus_source`, `occasion` (as a returned handle only).

**Identity.** This link, to that external run, from this computation. Same a year later if the pointer still denotes that run; LabKit does not own the run’s identity.

**Remembered.** The pointer and that it is *not* support. Not the metric values.

**Derived.** Nothing scientific. The metrics system answers performance.

**If absent.** (a) Claim C7 rests on computation K; W&B run R holds the loss curve; LabKit can hand you R. (b) Either LabKit ingested the loss curve (it became a metrics store) or there is no way to find R without duplicate bookkeeping. PART 3 forbids both.

**Caused by.** MVP question 1; link-don’t-duplicate; runs are not support.

### Split: Computation vs Run link

**Computation** stays: a formal procedure that was run; output is not automatically evidence.

**What changed in Computation.** It must not be identified with an operational run. Identity remains the scientific performance/procedure-run in *this* record. Telemetry is the link, if any.

**If the split is absent.** (a) The statistical computation’s output is offered and counts as evidence for C7. (b) A training run finished, so C7 “has a computation.” Support and telemetry coincide.

### Split: Criterion → Boundary constraint vs Diagnostic criterion

**Boundary constraint.** A criterion that protects a real scientific boundary (test-set access, prerequisite evidence, promotion, prespecified robustness). Missing evaluation: **required link missing**, never a pass, and it *does* bear on counting/promotion.

**Diagnostic criterion.** A recorded check that does not gate standing. Missing evaluation: not evaluated, not a pass, **not a gate**.

Both remain **Criteria** in the sense that naming ≠ status. The split is *whether absence is allowed to affect standing*.

**Identity.** Same as Criterion, plus this class as declared — not inferred from the name “gate.”

**Remembered.** The class. Guessing “calibration sounds boundary” is how diagnostics become ceremony.

**If absent.** (a) No leftover-plot was generated; C7 still stands or not on its robustness conditions. (b) The leftover-plot was not generated, so C7 is **cannot tell** — every diagnostic is now a mandatory gate. Or the reverse: test-set access was never evaluated, treated like a skipped plot, and the confirmatory claim stands.

**Caused by.** Formal-where-boundaries / permissive-where-discovery; “should not turn every diagnostic into a mandatory gate”; “should not accumulate ceremony.”

**Removed?** Nothing. Generic Criterion remains the parent; Evaluation still required for status. This is a split, not a new parallel ontology.

### Added: Absence kind *(derived on the read; not stored)*

**Definition.** Whether a gap is **not yet structured** (discovery; tolerated) or **required link missing** (dependency / boundary evaluation / provenance; not a pass).

**Required by.** Any operation that used to return a single **cannot tell**.

**Identity.** Not an object. A classification of a particular answer.

**Remembered.** The underlying presence or absence of structure vs of required links — not a stored flag that can drift.

**Derived.** The two-way answer.

**If absent from the read surface.** (a) No study has been scoped yet because the question is still vague. (b) The confirmatory claim has no recorded dependency on its evidence. Both are “cannot tell,” so either work is blocked until ceremony appears, or missing provenance is tolerated as if it were discovery.

Same honesty note as Standing: not a stored entity. Its absence from *storage* loses nothing if the required links and the exploratory gaps are themselves recorded as such. Its absence from the *read* loses the distinction above.

### Added: Task contract *(derived read; not stored)*

**Definition.** A narrow, derived set of permissions and tests for one piece of work, so an agent need not hold the programme ontology.

**Required by.** `task_contract`.

**Identity.** Snapshot for that work at that time. Not a ticket. Not support for any claim. A year later it is whatever the live state derives.

**Remembered.** Nothing extra — derived from occasion, scope, boundary constraints, lock vs incidental, record membership.

**Derived.** The contract itself.

**If absent from the read surface.** (a) The agent is told: evaluate robustness R3 on execution E12; do not admit scratch; do not widen study S; do not treat the run as evidence. (b) The agent is given the graph and infers a job. PART 3 treats those as different systems.

**Decoration as a stored kind.** Yes, if persisted as ontology. Kept only as a derived read, parallel to Standing.

**Caused by.** Agent-context should; “should not require implementation agents to understand or manually maintain the full research ontology.” Operational tasks remain *out* of logical support — the contract is a view, not a node claims rest on.

### Revised: Finding

**What changed.** A finding need not be a complete confirmatory package. Partial offerings are findings. Completeness is required only to *decide conflict*; incompleteness is **not yet structured** or **cannot tell**, not a demand to invent question/evidence/scope.

**If we keep the old complete-package definition.** (a) An exploratory partial result sits in the graph without locking a confirmatory structure. (b) The same offering is treated as defective until it is upgraded into question+evidence+claim+scope — forcing confirmatory shape. PART 3 forbids (b).

### Revised: Procedure / Amendment *(load-bearing vs incidental)*

**What changed.** Amendments and locks apply to **scientifically load-bearing** content. Incidental implementation choices (logging library, non-interpretive plumbing) must be readable as *not frozen* even when they sit inside a locked procedure’s repo.

Not a new identity. A declared property of a change (or of a part of a specification): **load-bearing** vs **incidental**. Unclassified is not default-incidental (that would hide scientific edits) and not default-load-bearing (that would freeze plumbing).

**Caused by.** “Should not freeze incidental implementation choices that do not affect scientific interpretation.”

**If absent.** (a) The randomisation specification is locked; swapping a log formatter is not an amendment of the science. (b) Every commit after lock is an `locked_amendment`, so incidental machinery is either ceremony or silent mutation.

This is adjacent to **Amendment class** (mechanical feasibility vs scientific change) but not the same split. Mechanical repair is “the locked science could not be executed as written.” Incidental is “this never was the science.” Do not fold them: (a) fencepost in locked randomisation, repaired before unblinding; (b) swapped the JSON logger. Those are not one distinction.

No extra glossary name unless we must: call it **load-bearingness** on amendments and on specification parts. I am not adding a new object.

### Not added

- **Task, Agent, Run** as scientific entities — PART 3 forbids them as support. Run *link* is the only new handle.
- **Progress, recommendation, confidence** — still out.
- **Partial finding** as a separate type — would duplicate Finding once Finding is allowed to be partial.
- **Failed attempt** as a type — already an Occasion. PART 3’s “allow failed attempts” is already served if occasion + scratch/record + non-confirmatory findings work. No new identity.

### Not removed

Nothing in the original glossary lost its distinction under PART 3. “Prefer recording evidence and relationships over inventing process machinery” is a warning against *new* ceremony, not a licence to drop Lock, Amendment class, Reproduction kind, Reconstruction grade, or Scratch — those still separate the PART 1 situations. Stage remains the cheap/expensive distinction for `promotion`, not a workflow engine.

Standing and Work stay in the same honesty class as before (derived read; handle).

---

## 5. What did not change, on purpose

- LabKit is still not a metrics store, experiment tracker, or W&B replacement. The MVP metrics clause is satisfied by **Run link**, not by ingesting loss curves.
- Still no prescriptions, no progress bar, no merging weaker/stronger propositions, no scratch-as-grounds, no named-gate-as-pass.
- Exploratory work still need not wait for a study structure (`record_membership`, Formulations, confirmatory commitment). PART 3 restates that; it does not add a concept.
- Formal-where-consequences / permissive-where-discovery is implemented by the **Criterion split** and **Absence kind**, not by a stored “mode” flag. A mode flag would be process machinery: (a) this line is still discovery so missing study scope is fine; (b) someone set `mode=exploratory` on a confirmatory claim so missing robustness evaluations are “tolerated.” Those must not coincide.

---

## Summary table

| Change | Constraint that caused it | Glossary |
|---|---|---|
| `invalidation_blast` includes decisions and open lines | MVP blast; decisions as first-class | **Added Decision** |
| `stance` explains why a line is still open | MVP “why is this line still open?”; absence ≠ failure | Stance revised, not split |
| Evidence/computation reads return run links, not metrics | MVP metrics clause; link don’t duplicate; runs ≠ support | **Added Run link; split from Computation** |
| `why_supported` | MVP “why does C7 count as supported?” | None |
| `unseating` | what would invalidate/reopen; cheap why/depends | None |
| `what_changed` | cheap “what changed?”; history of evidence-at-the-time | None |
| `task_contract` | narrow derived contract; agents must not hold the ontology | **Added Task contract (derived)** |
| Criterion evaluation depends on boundary vs diagnostic | formal boundaries vs no mandatory diagnostic gates | **Split Criterion** |
| Single **cannot tell** → not-yet-structured vs required-link-missing | tolerate missing structure; never treat missing required link as satisfied | **Added Absence kind (derived)** |
| Findings may be partial | no forced confirmatory structure | **Revised Finding** |
| Lock/amendment distinguish load-bearing vs incidental | do not freeze incidental implementation choices | Property on amendment/spec; not a new object |
| Refusal of metrics softened to “no numbers, yes links” | same as run-link row | — |
| New refusals: run-as-support; ontology dump; diagnostic-as-gate; structure-required-to-proceed | corresponding should-nots | — |

If PART 3 had only restated “not a metrics dashboard” and “absence of evidence is not failure,” the original contract could have stood. It did more than that: it named decisions in the blast radius, demanded run *linkage*, forbade uniform gating, and required an agent-facing derived contract. Those four are the load-bearing revisions; the rest are the minimum read-surface consequences of them.
