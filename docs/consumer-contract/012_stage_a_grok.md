# Stage A output — designer `grok` (`xai-oauth/grok-4.6`)

**Verbatim, unedited.** Everything below the horizontal rule is this
designer's complete stdout, committed before any output was read and before
any cross-reading. Run 2026-08-20:

```
omp -p --no-session --no-title --auto-approve --no-tools \
  --model xai-oauth/grok-4.6 --thinking high \
  --cwd <empty scratch dir> --max-time 20m --mode text \
  -- @<stage A packet, 73 lines>
```

Input was `002_stage_a_packet.md` **below its horizontal rule only** — the
preamble is repo commentary and names terms the packet exists to withhold.
No repository access, no tools, no knowledge that other designers exist.

---

# LabKit read surface

LabKit answers questions about **what the research currently holds, on what grounds, and what remains unsettled**. It does not answer how a job ran. Every operation below is read-only: it reports recorded epistemic state, or reports that the record cannot support an answer.

Operations are named as the question a researcher would ask. The short identifier is for an agent calling on their behalf.

---

## 1. The read operations

### Standing

#### Where does the research stand?
**`standing`**

**Caller passes:** a programme, a line of enquiry, or a question. Omitting a focus means the programme as a whole.

**Comes back:**
- what is currently held, each with the grounds it depends on
- what is still unsettled
- what has been **accepted as unresolved** (and is therefore not a backlog)
- which lines have **closed**, including well-supported negative closures, without any implication that the programme has failed
- nothing that looks like a completion percentage or a queue of remaining greens

**Serves:** 2, 4, 14, and the purpose of the system.

---

#### Is this open work, closed, or accepted as unresolved?
**`stance`**

**Caller passes:** a question, proposition, or line of enquiry.

**Comes back:**
- **open** — work may still be done
- **closed**, and whether the closure was positive or negative
- **accepted as unresolved** — deliberately left unsettled, with the recorded reason
- for a line: that status, independently of the programme
- an explicit statement that accepted-unresolved items are not work remaining

**Serves:** 4, 14.

---

#### What is the status of this proposition, among weaker and stronger ones?
**`proposition_standing`**

**Caller passes:** a proposition.

**Comes back:**
- this proposition’s own standing (supported / not supported / unresolved / negatively resolved)
- related weaker and stronger propositions, each with **their own** standing
- no collapsed summary such as “the effect is confirmed” when only a weaker cousin is supported

A positive result on a weaker proposition and an unresolved stronger one are returned as two facts.

**Serves:** 2.

---

### Formation and revision

#### How did this question take its present form?
**`question_formation`**

**Caller passes:** a question.

**Comes back:**
- the observation or noticing it began from
- each successive formulation, in order
- why each sharpening was made
- whether a change happened **before confirmatory evidence existed** (review) or after
- any questions **split off** as new identities, as opposed to new wordings of this one

The original vague form remains visible. The record does not back-date the sharp question as if it had been the plan.

**Serves:** 1, 6.

---

#### What did review change before confirmatory evidence existed?
**`preconfirmatory_revision`**

**Caller passes:** a question, procedure, criterion, or study.

**Comes back:**
- changes to questions, criteria, and interpretation while revision was still free
- the recorded reason for each change
- the point, if any, after which confirmatory evidence existed and free revision ended

Absence of confirmatory evidence is reported as such; the operation will not infer a lock from the mere existence of a procedure.

**Serves:** 6.

---

#### What was repaired after the procedure was locked?
**`locked_amendment`**

**Caller passes:** a procedure.

**Comes back:**
- the locked formulation, preserved
- each later amendment
- whether the amendment was recorded as a **mechanical feasibility repair** or a **scientific change**
- the reason given
- whether confirmatory evidence already existed at the time of the amendment

The current procedure and the locked original are both returned. History is not silently replaced.

**Serves:** 7.

---

### Evidence, claims, and dependence

#### Why was this work done, and what came of it?
**`occasion`**

**Caller passes:** a study, execution, analysis, or other piece of work.

**Comes back:**
- the question or defect it was meant to address (feasibility unstick, confirmatory test, follow-up, candidate-equivalence, …)
- what was produced
- what, if anything, the research now holds as a result
- what those holdings depend on
- what that work left unsettled

Two runs that look alike in a metrics system are distinguishable here if they were done for different reasons.

**Serves:** 1, 8, 13, and the purpose of the system.

---

#### Does this result count as evidence for this claim?
**`evidential_status`**

**Caller passes:** a computation or execution, and the claim it is being offered for.

**Comes back:**
- the robustness conditions that were **prespecified** as required for it to count
- whether each was **evaluated** (not merely named)
- whether each held
- therefore: **counts as evidence**, **does not count**, or **cannot tell** (conditions or evaluations missing)

A formally significant computation that fails its own robustness conditions is returned as **not evidence**. Significance is not standing.

**Serves:** 3, 17.

---

#### Was this criterion actually evaluated?
**`criterion_evaluation`**

**Caller passes:** a criterion and the work it constrains.

**Comes back:**
- whether an evaluation exists
- what that evaluation inspected
- pass / fail / **not evaluated**
- the evidence the evaluation produced

The presence of something named “gate”, “check”, or “criterion” is irrelevant. Status is the evaluation, or the lack of one.

**Serves:** 17.

---

#### What do we currently claim, as against what was computed or stored?
**`claim_versus_source`**

**Caller passes:** a claim, or a computation or artefact.

**Comes back:**
- the live claim (statement, scope, standing)
- the computations and artefacts it was inferred from, unchanged
- the interpretation history that now separates them
- earlier statements of the same claim, if it was revised

Revising a claim does not rewrite the computation. Keeping an artefact does not mean the claim still stands.

**Serves:** 12.

---

#### If we no longer trust this, what else needs reconsideration?
**`invalidation_blast`**

**Caller passes:** an analysis, claim, computation, or other item whose trust is in question.

**Comes back:**
- **observations that still stand** (invalidating an analysis does not invalidate them)
- claims that depend on the untrusted item and therefore need reconsideration
- claims that do not
- anything whose standing becomes unsettled as a result
- **cannot tell** where dependence was never recorded

This is not a graph dump. It is the downstream epistemic consequence of withdrawing trust.

**Serves:** 11, 12.

---

#### Do these two findings genuinely conflict?
**`conflict`**

**Caller passes:** two findings, or two claims offered as findings.

**Comes back,** before any yes/no:
- the **question** each answers
- the **evidence** each rests on, and whether that evidence counts
- the **scope** of each claim

Then one of:
- **conflict** — same (or overlapping) question, incompatible claims, overlapping scope
- **compatible** — different questions, disjoint scopes, or one does not count as evidence
- **cannot tell** — question, evidence, or scope missing from the record

The operation will not answer from numeric disagreement alone.

**Serves:** 5.

---

### Boundaries of work

#### What belongs to this study, and what did it spawn?
**`study_scope`**

**Caller passes:** a study.

**Comes back:**
- the questions and claims inside its declared scope
- whether the study is complete
- follow-up questions spawned by it, each as **new work** with its own identity
- confirmation that those follow-ups did not widen the completed study’s scope

A surprising question noticed after completion is not retroactively “what the study was about.”

**Serves:** 13.

---

#### Is this on the scientific record?
**`record_membership`**

**Caller passes:** a note, execution, artefact, question, or analysis.

**Comes back:**
- **on the record** — it may bear on standing
- **scratch** — captured so it is not lost, but not part of the scientific record
- **captured, not admitted** — exists, has not been admitted
- what admission would require, if that was recorded

Scratch cannot be used as grounds for a claim. Capture is not admission.

**Serves:** 18.

---

### Fidelity, sameness, and promotion

#### How faithfully can this be reconstructed?
**`reconstruction`**

**Caller passes:** a study, procedure, computation, artefact, or execution.

**Comes back:** one of:
- **exact recovery** — what would be recovered, and on what identifying grounds
- **approximate recovery** — what would be recovered, and in what respect it is not exact
- **unresolved provenance** — what is missing; no reconstructed object is invented

The three grades are not collapsed into “source available.”

**Serves:** 9.

---

#### Was the conclusion reproduced, or the execution?
**`reproduction`**

**Caller passes:** a reproduction attempt, or an original claim/execution plus a later attempt.

**Comes back:**
- which kind of reproduction was **attempted**
- the criteria that kind requires
- which of those criteria were evaluated, and whether they held
- therefore: conclusion reproduced, execution reproduced, both, neither, or cannot tell

A matching conclusion is not reported as reproduction of the execution.

**Serves:** 10, 16.

---

#### Which correctness criteria does this re-run answer to?
**`correctness_kind`**

**Caller passes:** a port, reimplementation, re-instrumentation, or new execution.

**Comes back:**
- **same science, new machinery** — correctness is equivalence to the trusted reference (and any other recorded criteria for that kind)
- **new execution of the science** — correctness is the scientific claim’s own criteria, not bit-identity with a prior run
- each applicable criterion, whether it was evaluated, and the result

The two kinds are never given one shared “rerun passed” status.

**Serves:** 16, 17.

---

#### What is the trusted reference, and has the candidate earned promotion?
**`reference_and_candidate`**

**Caller passes:** an implementation, a pair, or the method they realise.

**Comes back:**
- which implementation is the **trusted reference**
- which is a **candidate**
- the equivalence evidence required for promotion
- whether that evidence exists and counts
- promotion state: candidate still candidate, promoted, or cannot tell

Coexistence is normal. Presence of a faster implementation is not promotion.

**Serves:** 15.

---

#### Has this work earned the next expensive or sensitive step?
**`promotion`**

**Caller passes:** a proposed experiment, study stage, or candidate implementation.

**Comes back:**
- current stage (e.g. cheap feasibility vs expensive/sensitive)
- the **explicit** promotion criteria
- whether each was evaluated, and the evidence
- **earned** / **not earned** / **cannot tell**

Enthusiasm, completeness of a plan, or the existence of a stage named “ready” does not appear in the result.

**Serves:** 8, 15, 17.

---

## 2. Questions the system should refuse

Each refusal says what it will not pretend, and what it *will* answer instead. Hardness is not a reason to drop the question; several of these are unanswerable even with a perfect record.

---

**“How did this job perform? What was the runtime, the loss, the sweep winner?”**

LabKit does not record how work performed. Ask the metrics system that sits alongside it. Here you can ask what the research concluded from work, why the work was done, and whether the result **counts as evidence**.

---

**“Is this claim true of the world?”**

The record can say what the research currently holds and on what grounds. It cannot say whether nature agrees. Correspondence truth is not a LabKit object.

---

**“Which of these conflicting findings is the right one?”**

If they conflict under traced questions, evidence, and scopes, that conflict is the answer. The record does not elect a winner. Further work would have to; this system will not mint one.

---

**“Are we done? What percent of the programme is complete? Show me everything that is still red.”**

Completion is not a property of a programme. Lines can close; questions can be accepted as unresolved. Neither is a remaining ticket. There is no progress bar, and accepted-unresolved items will not be listed as work to make green.

---

**“Should we promote this? Should we run the expensive experiment? What should we do next?”**

The system will not prescribe. It will report whether promotion criteria were evaluated and whether they held, and which questions are open rather than accepted-unresolved. It will not turn that into a recommendation.

---

**“Did we p-hack?”**

The record can show whether a procedure was locked, whether it was later amended, whether that amendment was mechanical or scientific, and whether confirmatory evidence already existed. It cannot return a verdict of misconduct. Asking it to do so is asking it to moralise the amendment log.

---

**“What did we really intend? What would X have thought?”**

Only recorded reasons are recoverable. Unrecorded intent is **unresolved provenance**, not a prompt for reconstruction of a mind. The system will not guess.

---

**“Give me the exact original artefact / the exact execution.”** (when reconstruction is not exact)

If provenance is approximate or unresolved, the system will say so and stop. It will not emit a plausible substitute as if it were the original.

---

**“Summarise these related propositions as one result.”**

A supported weaker proposition and an unresolved stronger one are different facts. The system will not merge them into “the hypothesis was confirmed” or “mixed evidence.”

---

**“Does this scratch support the claim? Include the notebook tangent as grounds.”**

Scratch is not on the scientific record. Capture is not admission. Until it is admitted, it cannot bear on standing. The system will not quietly let it.

---

**“What is the status of gate G? The calibration gate is present, so we are fine.”**

Gates are not status-bearing. Ask whether the **criterion** was evaluated and what the evaluation showed. A named gate with no evaluation is **not evaluated**, not a pass.

---

**“Is the optimized implementation better?”**

“Better” as performance belongs to the metrics system. Here the question is whether **equivalence evidence** required for promotion exists and counts. A candidate can be faster and still untrusted.

---

**“The conclusion matched, so we reproduced the execution.”**

Those are different reproductions, with different criteria. Matching conclusions will not be reported as exact execution identity.

---

**“The analysis is invalid, so discard the observations.”**

Invalidating an analysis leaves observations standing. The system will report which **claims** need reconsideration. It will not treat the noticing as tainted because a treatment of it was.

---

**“What would we have claimed if we had not amended the procedure?”**

The record has the original procedure, the amendment, and the claim that was actually made. It does not contain the unrun counterfactual. The system will not simulate one.

---

**“Is this the same scientific question / the same experiment as that other one?”** (no shared lineage, no shared procedure identity)

Sameness is not inferred from similar wording. Without recorded lineage or procedure identity, the answer is that they cannot be shown to be the same, not that they look alike.

---

**“How confident are we, as a number?”**

Standing is not a hidden probability. If a degree of belief was itself claimed, that claim can be read. The system will not invent a confidence from the existence of evidence, a p-value, or the number of supporting artefacts.

---

**“Did this negative result mean the phenomenon does not exist?”**

A well-supported negative can **close a line**. That is not a metaphysical claim that the phenomenon is absent, and not a failure of the programme. The system will report the closed line and refuse the leap.

---

**“What is the real question we would have asked if we had known where this was going?”**

The system keeps the vague origin and the later sharpenings. It will not replace them with a back-dated sharp question. That pretence is exactly what the record exists to prevent.

---

**“Who deserves credit? Have we been scooped? What does the literature already say?”**

Unless those things were entered as observations or claims in this programme, they are not in the record. LabKit is not a citation graph, a priority tribunal, or a search engine.

---

**“Will this feasibility step succeed? Is this line worth pursuing?”**

Those are predictions and value judgements. The system can report recorded occasion, cost-sensitivity of the next stage, and whether cheap criteria have been evaluated. It will not forecast or appraise.

---

**“Make every question green. What work is required so nothing is left unresolved?”**

That request is how accepted-unresolved is destroyed. The system will refuse to generate a fake queue. Unresolved-on-purpose is a finished stance, not a defect.

---

## 3. Glossary

Every concept the operations rely on. The last bullet is the distinction the concept exists to protect.

---

### Programme

**Definition.** The long-lived research endeavour whose shape is not known at the start, and whose record must survive people forgetting, disagreeing, and being wrong.

**Required by.** `standing`, `stance`.

**Identity.** The named endeavour. It is still the same programme a year later if it is the same ongoing effort, even if people, questions, procedures, and beliefs have all changed. Two programmes are distinct even when they study similar questions.

**Remembered.** That the endeavour exists as the container; that it is not identical with any one line of enquiry.

**Derived.** Current standing (held claims, grounds, unsettled remainder, closed lines).

**If absent.** (a) A well-supported negative closes “does this assay detect X in saliva?” and the programme continues. (b) The programme is written off because that assay failed. Both look like “the research failed.”

---

### Line of enquiry

**Definition.** A thread of questions that can be closed — including negatively — without being the programme.

**Required by.** `standing`, `stance`, `occasion`.

**Identity.** Assigned when the line is opened. Persists through studies and reformulated questions inside it. Still the same line a year later if it is that thread, even after negative closure. Distinct from neighbouring lines in the same programme.

**Remembered.** Opening, the questions it comprises, its stance, the reason if closed or accepted-unresolved.

**Derived.** Aggregated standing of its propositions.

**If absent.** Same pair as programme: a closed negative line versus a failed programme cannot be told apart.

---

### Question

**Definition.** Something asked. It may start vague. It can be sharpened, split, or spawned from; it is not the experiment that was eventually run.

**Required by.** `standing`, `stance`, `question_formation`, `occasion`, `conflict`, `study_scope`, `preconfirmatory_revision`.

**Identity.** Assigned when first posed, even if the wording is clumsy. Persists across reformulation of **this** question. A split or a surprising follow-up is a **new** question. Same one a year later: same identity, possibly a new formulation.

**Remembered.** Identity, origin, lineage to parent/spawn, current formulation pointer, stance.

**Derived.** Present wording (from current formulation); whether it is in a completed study’s scope.

**If absent.** (a) We noticed “the traces look periodic” and only later asked a testable frequency question. (b) We always planned the frequency experiment and the vague noticing is colour. The record can no longer stop us pretending we knew the final structure.

---

### Formulation

**Definition.** A dated wording of a question. Successive formulations are how a question gets sharper without erasing the earlier form.

**Required by.** `question_formation`, `preconfirmatory_revision`.

**Identity.** This wording, at this time, of this question. A year later it is still that past wording; it is not replaced by the current one.

**Remembered.** The text, when it was adopted, why it replaced the previous one, whether confirmatory evidence already existed.

**Derived.** Nothing important; the chain is the history.

**If absent.** (a) The question was sharpened in review and we can still read the vague form. (b) The question’s text was edited in place and now reads as if it had always been sharp. Indistinguishable.

---

### Observation

**Definition.** A recorded noticing. It is not a claim, not an analysis, and not the numbers an analysis emits.

**Required by.** `question_formation`, `invalidation_blast`, `claim_versus_source`.

**Identity.** This recorded noticing, not “the fact in the world.” Same one a year later even if files moved (that is reconstruction). Two noticings of the same phenomenon are two observations.

**Remembered.** What was noticed, when, by what occasion; that it is an observation rather than an analytic product.

**Derived.** Current interpretations that treat it; whether any live claim depends on it.

**If absent.** (a) We throw out a buggy t-test and keep the spectrophotometer traces. (b) We treat the traces as invalid because the t-test was. Both read as “the result is invalid.”

---

### Proposition

**Definition.** A statement that can be held, denied, or left unresolved, and that can stand in a weaker/stronger relation to other propositions.

**Required by.** `proposition_standing`, `standing`, `stance`.

**Identity.** The statement as a distinct resolvable content, not “the topic.” Same one a year later if it is that statement; a stronger cousin is a different proposition.

**Remembered.** The statement, its strength relations, its own standing.

**Derived.** Relative strength if an ordering was recorded; not inferred from wording alone.

**If absent.** (a) “Better than placebo” is supported and “better than standard of care” is unresolved. (b) “Whether the drug works” has mixed evidence. One programme state, two scientific situations.

---

### Strength relation

**Definition.** A recorded weaker/stronger link between propositions, so their standings cannot be collapsed.

**Required by.** `proposition_standing`.

**Identity.** The ordered pair (weaker, stronger). Persists even when standings change.

**Remembered.** The link itself. Standing of each end is remembered on the propositions.

**Derived.** The coexistence pattern (weak supported, strong open, etc.).

**If absent.** Same pair as proposition: independent standings collapse into a topic-level mood.

---

### Claim

**Definition.** A living assertion the research does or did hold, with scope and standing, revisable without altering the computations or artefacts it was inferred from.

**Required by.** `standing`, `claim_versus_source`, `evidential_status`, `invalidation_blast`, `conflict`, `study_scope`.

**Identity.** The position on this matter in this programme. Same one a year later through revision of its statement. A superseded statement is history of the same claim, not a different claim — unless an explicit split is recorded.

**Remembered.** Current statement, scope, standing, revision history, recorded dependencies on evidence/analyses/computations.

**Derived.** Whether it currently counts as part of standing; blast radius if something it depends on is untrusted.

**If absent.** (a) The fitted model artefact is still in the archive, but we no longer claim the effect is real. (b) We lost the model. No claim and no artefact look the same.

---

### Claim scope

**Definition.** What the claim is actually about: population, conditions, precision, time, instruments — the bounds within which it is offered.

**Required by.** `conflict`, `claim_versus_source`, `proposition_standing`.

**Identity.** The bounds attached to a particular statement of a claim. Revising scope is a revision of the claim, remembered as such.

**Remembered.** The bounds, and that they were declared (not inferred from the data set that happened to be used).

**Derived.** Overlap with another claim’s scope, for conflict.

**If absent.** (a) “Effect in adults 18–65 at this dose” versus “effect in humans” — compatible or nested. (b) Two opposite headlines treated as a direct clash. Conflict cannot be traced.

---

### Finding

**Definition.** A packaged offering: we asked this question, we offer this evidence, we claim this with this scope. Conflict is judged between findings, not between numbers.

**Required by.** `conflict`.

**Identity.** This offering-as-a-unit. Same finding a year later if it is that package, even if the claim inside was later revised (the revision is visible). A claim, some evidence, and a question that merely coexist in the programme are not a finding.

**Remembered.** That these were offered together.

**Derived.** Whether two findings conflict, given their questions, evidence, and scopes.

**If absent.** (a) Two papers answering different questions whose claim texts look opposite. (b) Two offerings on the same question with overlapping scope that actually conflict. You only have “two claims that disagree in wording.”

---

### Evidence

**Definition.** Something offered as grounds for a claim. A computation or execution may fail to **be** evidence even if it ran and was significant.

**Required by.** `evidential_status`, `conflict`, `standing`, `occasion`, `claim_versus_source`.

**Identity.** This offering, for this claim, from this source. Same one a year later if it is that offering; a later run is different evidence (or a reproduction attempt).

**Remembered.** What is offered, for which claim, which robustness conditions were prespecified.

**Derived.** Whether it **counts** (from evaluations of those conditions).

**If absent.** (a) A significant computation offered as grounds. (b) The same computation sitting in the run log with no evidential role. Standing cannot be distinguished from “we ran something.”

---

### Evidential status

**Definition.** Whether offered evidence **counts**: robustness conditions prespecified, evaluated, and held.

**Required by.** `evidential_status`, `conflict`, `standing`.

**Identity.** Not a separate object: the derived standing of a particular offering. Recalculated when evaluations change.

**Remembered.** Prespecified conditions and their evaluations (see below). Not a stored “counts=true” flag that can drift from them.

**Derived.** Counts / does not count / cannot tell.

**If absent.** (a) p < 0.01, but the prespecified leave-one-site-out check failed, so it is not evidence. (b) p < 0.01 treated as evidence because nothing beyond the computation exists. Both look like “we have a significant result.”

---

### Robustness condition

**Definition.** A criterion prespecified as required for a computation or execution to count as evidence. Not an optional extra analysis.

**Required by.** `evidential_status`, `criterion_evaluation`.

**Identity.** This condition, on this offering or procedure, as specified before the result was used as evidence. Same one a year later if it is that requirement; adding a new check later is a new condition (and a revision).

**Remembered.** The requirement, that it was prespecified, when.

**Derived.** Pass/fail from its evaluation.

**If absent.** Same pair as evidential status: failed-own-protocol versus never-had-a-protocol.

---

### Computation

**Definition.** A formal procedure that was run. Its output is not automatically evidence, a claim, or an observation.

**Required by.** `evidential_status`, `claim_versus_source`, `reproduction`, `reconstruction`, `occasion`.

**Identity.** This run of this procedure. Same one a year later if it is that run (reconstruction may or may not recover it). A later run is a different computation.

**Remembered.** That it occurred, which procedure, occasion, outputs as artefacts, link to any evidential offering.

**Derived.** Significance in the statistical sense, if that was recorded as an output — but not evidential status.

**If absent.** (a) We have a claim inferred from a computation we later disavow, computation still in the archive. (b) We have only the claim. Claims cannot be revised independently of computations because they are the same object.

---

### Artefact

**Definition.** A produced object (dataset, figure, implementation, container) that can outlive the claim made from it.

**Required by.** `claim_versus_source`, `reconstruction`, `reference_and_candidate`, `record_membership`.

**Identity.** This object in this role. Content-addressed copies are reconstruction aids, not additional artefacts unless separately admitted. Same one a year later through location changes if identity was recorded.

**Remembered.** Identity, role, whether it is on the record, links to computations/implementations.

**Derived.** Reconstruction grade; whether any live claim currently depends on it.

**If absent.** Same pair as claim: abandoned interpretation versus lost file.

---

### Analysis

**Definition.** An interpretive treatment of observations (or of other artefacts). It can be untrusted without untrusting the observations it treated.

**Required by.** `invalidation_blast`, `claim_versus_source`, `occasion`.

**Identity.** This treatment. Same one a year later even if marked untrusted. A replacement analysis is a new identity, not an edit that erases this one.

**Remembered.** What it treated, what it produced, its trust standing, occasion.

**Derived.** Claims that depend on it (from recorded dependencies).

**If absent.** (a) Reject the t-test, keep the traces, reconsider claims that used the t-test. (b) Treat the traces as fabricated. “The result is invalid” covers both.

---

### Interpretation

**Definition.** The step that takes counted evidence to a claim. It can be revised without changing the evidence.

**Required by.** `claim_versus_source`, `preconfirmatory_revision`.

**Identity.** This reading, of this evidence, as supporting this claim. A later reading is a revision (same claim) or a new claim, as recorded.

**Remembered.** The reading and why it changed, if it did.

**Derived.** Current claim text from the live interpretation.

**If absent.** (a) Same traces, we no longer read them as evidence of periodicity. (b) The traces themselves changed. Data change and mind change coincide.

---

### Dependency

**Definition.** A recorded link: this claim or holding **rests on** this observation, analysis, evidence, or other claim. Not a timestamp.

**Required by.** `invalidation_blast`, `standing`, `occasion`.

**Identity.** The directed pair. Persists until explicitly withdrawn. Same dependence a year later even if both ends were revised.

**Remembered.** The link. Must not be inferred from “entered on the same day.”

**Derived.** Blast radius; the grounds half of standing.

**If absent.** (a) Claim C rests on analysis A. (b) Claim C was filed the day after A and rests on something else. Withdrawing trust in A either panics the whole day’s work or misses C.

---

### Criterion

**Definition.** A requirement that must be **evaluated**. It has no status by being named.

**Required by.** `criterion_evaluation`, `evidential_status`, `promotion`, `correctness_kind`, `reproduction`.

**Identity.** This requirement on this work or offering. Same one a year later if it is that requirement; renaming it does not create a new criterion, changing its content does (as a revision).

**Remembered.** The requirement, what it constrains, when it was adopted, whether before confirmatory evidence.

**Derived.** Status, solely from evaluations.

**If absent.** (a) A checklist item called “calibration” exists. (b) Calibration was done and failed. Presence of a “gate” looks like progress.

---

### Evaluation

**Definition.** The record that a criterion was actually checked, and what that check showed.

**Required by.** `criterion_evaluation`, `evidential_status`, `promotion`, `reproduction`, `correctness_kind`.

**Identity.** This checking, of this criterion, on this work. A year later it is still that check; repeating the check is a new evaluation.

**Remembered.** That it occurred, of which criterion, the outcome (pass/fail), the evidence it produced.

**Derived.** Nothing about occurrence — occurrence is the point.

**If absent.** (a) Criterion not run. (b) Criterion failed. (c) Criterion passed. All three collapse to “there is a gate named X.”

---

### Procedure

**Definition.** The experimental or analytic method as specified. Distinct from any execution of it, and from implementations that realise it.

**Required by.** `locked_amendment`, `preconfirmatory_revision`, `reproduction`, `correctness_kind`, `reconstruction`, `occasion`.

**Identity.** This method in this programme. Same one a year later through amendments; the locked original remains that procedure’s past, not a different procedure.

**Remembered.** Current specification, lock point if any, amendment history.

**Derived.** Whether a given execution followed it (if that was evaluated).

**If absent.** (a) Same science, new machinery (new implementation of this procedure). (b) New execution of the science (new run of this procedure on new material). There is no “the science” to be the same or new.

---

### Lock

**Definition.** The point after which a procedure is no longer freely revisable, typically when confirmatory commitment begins.

**Required by.** `locked_amendment`, `preconfirmatory_revision`.

**Identity.** This commitment, on this procedure. Same lock a year later; unlocking is an event that must be remembered, not a vanished lock.

**Remembered.** When, why, which formulation was frozen.

**Derived.** Whether a later change is an amendment (from time relative to the lock).

**If absent.** (a) Outcome definition changed during design. (b) Outcome definition changed after lock, with the original silently replaced. Both are “the procedure says X.”

---

### Amendment

**Definition.** A recorded change to a locked procedure, which does not replace the locked original.

**Required by.** `locked_amendment`.

**Identity.** This change, at this time. Same one a year later; further changes are further amendments.

**Remembered.** The diff in scientific meaning, the reason, the class (below), whether confirmatory evidence already existed.

**Derived.** The current specification, by applying amendments to the lock.

**If absent.** (a) Original and current both visible. (b) Only current exists. Silent mutation versus documented repair coincide.

---

### Amendment class

**Definition.** Whether an amendment was a **mechanical feasibility repair** (the specification could not be carried out as written) or a **scientific change** (the question, outcome, or criteria changed).

**Required by.** `locked_amendment`.

**Identity.** The classification of that amendment. Unclassified is its own recorded state, not a default to mechanical.

**Remembered.** The class, as declared — not inferred from the diff.

**Derived.** Nothing. Guessing class from the patch is how mechanical repair becomes a cover story.

**If absent.** (a) A fencepost error in locked randomization code, fixed before unblinding. (b) The primary outcome changed after a look at the data, stored as “another edit.” Every repair looks like p-hacking, or none does.

---

### Confirmatory commitment

**Definition.** Whether confirmatory evidence already exists for this question or procedure — the fact that makes free review end and later change into amendment.

**Required by.** `preconfirmatory_revision`, `locked_amendment`, `question_formation`.

**Identity.** This commitment event (or its recorded absence). Same a year later.

**Remembered.** That it exists or does not, and when it began. Not inferred from “we have some results.”

**Derived.** Whether a given revision was pre- or post-commitment.

**If absent.** (a) Criteria changed in review, before any confirmatory run. (b) Criteria changed after the confirmatory run existed. Both are “the criteria were updated.”

---

### Study

**Definition.** A bounded piece of work with a declared scope. It can complete. Completing it is not closing a line, and is not a licence to absorb later questions.

**Required by.** `study_scope`, `occasion`, `standing`.

**Identity.** This bounded investigation. Same one a year later after completion. A follow-up study is a new identity.

**Remembered.** Scope, occasion, completion, spawned questions as links not as scope edits.

**Derived.** Whether a question is inside scope or is spawned work.

**If absent.** (a) The study asked Q1; Q2 was noticed afterwards and filed as new work. (b) The study is now remembered as having been about Q1 and Q2. Completed work silently widens.

---

### Study scope

**Definition.** The questions and claims the study is answerable for. Not “everything we happened to notice while doing it.”

**Required by.** `study_scope`.

**Identity.** The declared bounds of that study. Changing them after completion is a revision that must be visible, not a quiet expansion.

**Remembered.** The declaration, and when it was last legitimately changed (before completion, or as recorded amendment).

**Derived.** Membership of a given question.

**If absent.** Same pair as study.

---

### Follow-up work

**Definition.** New work spawned by a completed study (or by a result), with its own question identity, not an expansion of the completed study.

**Required by.** `study_scope`, `question_formation`, `occasion`.

**Identity.** The new question/study. Same one a year later as that new work. Link to the spawner is remembered.

**Remembered.** The spawn link, that it is not in the parent’s scope.

**Derived.** Parent’s scope remaining unchanged.

**If absent.** Same pair as study: surprise question versus original scope.

---

### Occasion

**Definition.** The recorded reason a piece of work was done — which question, defect, feasibility bind, or equivalence need it was for.

**Required by.** `occasion`, `promotion`, `locked_amendment`.

**Identity.** This reason, on this work. Same a year later. Two otherwise identical executions with different occasions are different epistemic events.

**Remembered.** The reason. Must not be inferred from what the work later became useful for.

**Derived.** Nothing that should be.

**If absent.** (a) A cheap run done to show a locked procedure is executable. (b) The same run offered as confirmatory evidence for the scientific claim. Motive is lost; promotion and evidential status cannot be judged.

---

### Stage

**Definition.** A recorded cheap-versus-expensive (or insensitive-versus-sensitive) step in a line of work. Advancement is not a feeling.

**Required by.** `promotion`.

**Identity.** This step, in this proposed work. Same a year later.

**Remembered.** The stage, and which promotion criteria lead to the next.

**Derived.** Whether advancement has been **earned** (from evaluations).

**If absent.** (a) Feasibility done, expensive run not earned. (b) Someone named the stage “ready.” Enthusiasm and evidence coincide.

---

### Promotion criterion

**Definition.** An explicit criterion whose evaluation is the only way work advances a stage or a candidate is promoted.

**Required by.** `promotion`, `reference_and_candidate`.

**Identity.** A criterion (see above) used for advancement. Same rules: naming is not evaluation.

**Remembered.** The criterion, that it governs promotion.

**Derived.** Earned / not earned / cannot tell.

**If absent.** Same pair as stage.

---

### Reconstruction grade

**Definition.** How faithfully a later attempt can recover a past object or execution: **exact recovery**, **approximate recovery**, or **unresolved provenance**.

**Required by.** `reconstruction`.

**Identity.** The grade of a particular reconstruction attempt (or of current recoverability). A year later, recoverability may have changed; past grades remain.

**Remembered.** Identifying grounds for exactness (digests, procedure identity, etc.); what is missing if unresolved. The grade of an attempt.

**Derived.** The grade, from what was remembered versus what is absent — never a default “we have files.”

**If absent.** (a) Original container digest in hand. (b) A rewrite from memory that “should be close.” (c) A figure with no known method. All become “source available” or “not.”

---

### Execution

**Definition.** A performance of a procedure: a running of the science, not the procedure itself and not an implementation of it.

**Required by.** `reproduction`, `correctness_kind`, `occasion`, `reconstruction`, `evidential_status`.

**Identity.** This performance. Same one a year later if it is that performance. A later performance is a new execution.

**Remembered.** Which procedure, when, occasion, artefacts produced, whether it is on the record.

**Derived.** Reproduction relations to other executions (from recorded attempts and evaluations).

**If absent.** (a) We re-ran the science on new samples. (b) We reimplemented the analysis. There is no “run of the science” to tell from “new machinery.”

---

### Reproduction attempt

**Definition.** A recorded attempt to reproduce either a **conclusion** or an **execution**, with the kind declared in advance so success cannot be swapped.

**Required by.** `reproduction`.

**Identity.** This attempt. Same a year later. Another attempt is another identity.

**Remembered.** Kind (conclusion vs execution), original, later work, criteria for that kind, evaluations.

**Derived.** Success/failure per kind.

**If absent.** (a) Another lab reached the same conclusion with a different pipeline. (b) We bit-reproduced the original job. Both are “it reproduced.”

---

### Reproduction kind

**Definition.** Whether the attempt is answerable to **reproduction of a conclusion** or **reproduction of an exact execution**.

**Required by.** `reproduction`, `correctness_kind`.

**Identity.** The declared kind of that attempt. Changing kind after seeing the result is a revision, not a silent swap.

**Remembered.** The declaration.

**Derived.** Which criterion set applies.

**If absent.** Same pair as reproduction attempt.

---

### Correctness kind

**Definition.** Whether later work is **same science, new machinery** (re-instrumentation; equivalence to a reference) or **new execution of the science** (a new performance; scientific criteria).

**Required by.** `correctness_kind`, `reproduction`, `reference_and_candidate`.

**Identity.** The declared kind of that later work. Same a year later.

**Remembered.** The kind, and the criterion set that kind requires.

**Derived.** Pass/fail from those evaluations.

**If absent.** (a) Ported the analysis to a new language; must show equivalence to the trusted reference. (b) Ran the procedure on new samples; must meet the claim’s scientific criteria. Both are “the rerun passed.”

---

### Implementation

**Definition.** A realisation of a procedure or computation — code, apparatus, pipeline — which may be trusted, candidate, or neither.

**Required by.** `reference_and_candidate`, `correctness_kind`, `reconstruction`.

**Identity.** This realisation. Same one a year later through edits if identity is maintained; a fork is new if recorded as such.

**Remembered.** Identity, what it realises, role.

**Derived.** Promotion state from equivalence evaluations.

**If absent.** (a) Fast implementation beside the slow trusted one. (b) A new scientific procedure. Machinery and science collapse.

---

### Implementation role

**Definition.** Whether an implementation is the **trusted reference**, a **candidate**, or has no such role.

**Required by.** `reference_and_candidate`.

**Identity.** The role of that implementation at a time. Promotion is a recorded change of role, not a side effect of being faster.

**Remembered.** Current role, history of promotion.

**Derived.** Whether promotion has been earned (from equivalence evidence).

**If absent.** (a) Candidate still untrusted, reference still trusted. (b) The fast one has replaced the slow one as what we trust. Coexistence and replacement coincide.

---

### Equivalence evidence

**Definition.** The specific evidence required before a candidate may take the reference’s role. Not general “looks good” and not a performance win.

**Required by.** `reference_and_candidate`, `promotion`, `correctness_kind`.

**Identity.** This requirement, for this promotion. Same a year later.

**Remembered.** What equivalence means here, and the evaluations of it.

**Derived.** Whether promotion is earned.

**If absent.** (a) Candidate faster, equivalence not shown. (b) Candidate promoted. Enthusiasm and evidence coincide again.

---

### Stance

**Definition.** Whether a question, proposition, or line is **open**, **closed** (positively or negatively), or **accepted as unresolved**.

**Required by.** `stance`, `standing`.

**Identity.** The current stance of that object. History of stance changes is remembered.

**Remembered.** Current stance, reason especially for accepted-unresolved and for negative closure.

**Derived.** Nothing that should override the recorded stance (in particular, not “still open because not green”).

**If absent.** (a) Causal mechanism deliberately left unresolved; no further work is required. (b) The mechanism question sits in a queue generating fake tasks so the board can go green. Unresolved-on-purpose and unfinished-work coincide.

---

### Negative closure

**Definition.** A well-supported no that ends a line of enquiry. It is a success of the record, not a failure of the programme.

**Required by.** `stance`, `standing`.

**Identity.** This closure event. Same a year later. Reopening is a new event.

**Remembered.** That it was negative, the evidence that counts, that the programme is not thereby failed.

**Derived.** Line stance; programme stance remains independent.

**If absent.** Covered under programme / line of enquiry: closed-no versus programme-failed.

---

### Scientific record

**Definition.** The admitted corpus that may bear on standing. Not everything that was captured.

**Required by.** `record_membership`, `standing`, `evidential_status`.

**Identity.** Membership is a state of particular items. The record as a whole is the programme’s admitted set.

**Remembered.** Admission (below). Contents are the admitted items.

**Derived.** Current standing, which may only use admitted grounds.

**If absent.** (a) A notebook tangent captured so it is not lost. (b) That tangent now supports a claim. Exploration and record coincide.

---

### Scratch

**Definition.** Captured exploration that is not on the scientific record. Capture is allowed to be low-friction; it does not admit.

**Required by.** `record_membership`.

**Identity.** This captured item in the scratch state. Same item can later be admitted; it is then on the record, with the admission remembered. It is still the same object, different membership.

**Remembered.** The capture, that it is scratch, enough identity that it can be admitted later without being reinvented.

**Derived.** That it must not appear in grounds for standing.

**If absent.** Same pair as scientific record.

---

### Admission

**Definition.** The act that moves captured scratch onto the scientific record, after which it may bear on standing.

**Required by.** `record_membership`.

**Identity.** This act, on this item. Same a year later. There is no silent admission.

**Remembered.** When, why, by what criterion if any.

**Derived.** Current membership.

**If absent.** (a) Captured, not admitted. (b) On the record. The accident the want forbids.

---

### Belief / standing (aggregate)

**Definition.** What the research currently holds: live claims, their grounds, the unsettled remainder, and what has been accepted as unresolved. Not a separate stored manifesto.

**Required by.** `standing`.

**Identity.** Derived snapshot of the programme (or focus) at a time. A year later, standing is whatever the live claims say then; past standing is reconstructed from what claims held at that date, if revisions were remembered.

**Remembered.** The claims, stances, dependencies, admissions — not a parallel “beliefs” table that can disagree with them.

**Derived.** The aggregate the researcher reads.

**If absent.** Operations would still have parts, but “where do we stand?” would have to be assembled by the caller from navigation. That is a storage interface. The concept earns its keep as the **question**, even though it is derived. Without it as a first-class read, (a) a researcher asks what we hold, and (b) an agent walks nodes and infers a mood — and those cannot be told apart in the interface.

*(Honest note: standing is not a stored entity. It is a derived read. Its absence from storage loses no distinction if claims, stances, and dependencies are present. Its absence from the **read surface** loses the distinction above.)*

---

### Work (piece of work)

**Definition.** A study, execution, analysis, or other activity that has an occasion and an outcome. Only needed as the handle `occasion` takes.

**Required by.** `occasion`.

**Identity.** Delegated to study / execution / analysis. “Work” is not a further identity.

**Remembered.** Nothing beyond what those types remember.

**Derived.** —

**If absent as a separate type.** No distinction is lost, provided study, execution, and analysis exist. **Decoration as a stored kind.** Kept here only as the caller-facing handle for `occasion`.

---

Those last two notes are the honest ones. Standing is a derived read, not a stored object. Generic “work” is a handle, not a further identity. Everything else in this glossary exists because dropping it makes two concrete research situations look like one.
