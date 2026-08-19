# PJ-008: User story mining — an interaction corpus for the Domain Service Layer

**Status: accepted requirements (2026-08-18), on `spike/drizzle-age`. Drives
the Domain Service Layer build. §1 and §2 are held at their original wording;
§3's ledger is the living part and gains outcomes as scenarios are built —
S-11, S-17, S-3, S-4 and S-1 so far.**

## Context

The persistence layer is done and layered (PJ-007). What it has never faced
is a real research programme's shape. Every test against it so far has been
one we wrote to exercise a graph feature we had already decided to build —
which proves the graph works, and proves nothing about whether the domain
model is *right*.

This entry mines a real research programme (referred to throughout as
"Bonsai") for interaction patterns. Bonsai is unusually good material
because its trajectory contains far more than "design experiment, run
experiment, record result." It repeatedly moves through uncertainty,
correction, negative findings, narrowed claims, reopened questions,
infrastructure failures, post-lock amendments, and reviewer interventions.

It is mined as **a corpus of interaction patterns, not as an ontology
specification.** Bonsai's own implementation details must not dictate
LabKit's domain model; where a scenario below mentions a solver or a data
split, that is illustrative texture, not a requirement.

### The two questions asked of every scenario

> Can an agent accomplish this through LabKit without knowing the graph
> ontology?

> Afterward, can LabKit answer why the research is in its current state?

### Conversations, not graph fixtures

Scenarios are written as conversations because that is the interface being
designed — the MCP surface an agent talks to. A scenario written as a graph
fixture would smuggle in the answer.

This makes an explicit lint rule for §2: **the Researcher and Agent lines
must never name a node or edge label.** "Create a `Question` node" is the
failure mode — it means the vocabulary leaked and question (a) is already
answered "no". LabKit's own lines may reflect structured state, since that
is LabKit talking. Ordinary English that happens to collide with a label
("this line of enquiry", "that claim") is fine; requiring the caller to know
the label is not. Where a scenario *cannot* be written without naming
ontology, that is itself a finding for §3, not something to paper over.

### Relationship to PJ-001

This corpus extends PJ-001's doctrine rather than replacing it. Several of
its MVP acceptance criteria appear here as fully worked scenarios:

| PJ-001 MVP query | Scenario |
| --- | --- |
| "If Artefact A12 is invalidated, what claims, decisions, and open lines of enquiry become affected?" | S-11 |
| "Why is this line of enquiry still open?" | S-2, S-14 |
| "Why does Claim C7 currently count as supported?" | S-3, S-12 |
| "Show me the evidence supporting Claim C7, the computations that generated it" | S-9, S-10 |

Several PJ-001 "Should not" bullets get their first real test here too —
notably *"Should not: confuse absence of evidence with failure, or a missing
evaluation with a pass"* (S-1, S-3, S-17) and *"Should not: accumulate
ceremony merely because a previous project once encountered a particular
failure mode"* (S-14).

---

## §1 — The eighteen user stories

Source numbering preserved so this can be diffed against the mining notes.
Each story's "As a researcher…" wording is kept verbatim; the gloss is one
or two lines of why it earns a place.

1. **As a researcher, I want to turn a vague observation into progressively
   sharper questions without pretending I knew the final experiment
   structure in advance.**
   Bonsai's dynamics programme eventually separated nonlinear response,
   structured internal transformation, and useful computation — but started
   as one undifferentiated hunch. Tests whether LabKit tolerates genuine
   discovery.

2. **As a researcher, I want a positive result on a weaker proposition to
   coexist with an unresolved stronger proposition.**
   Defends against every computation automatically discharging the question
   that motivated it.

3. **As a researcher, I want a formally significant computation to remain
   insufficient evidence when its own prespecified robustness conditions
   fail.**
   Much richer than a pass/fail happy path: the honest state was neither
   "effect confirmed" nor "null confirmed."

4. **As a researcher, I want a well-supported negative answer to close a
   line of enquiry without marking the research programme as failed.**
   A real null is a substantive closure, not a failed experiment.

5. **As a researcher, I want to ask whether two findings genuinely conflict,
   and have the system trace the distinct questions, evidence and claim
   scopes before answering.**
   Two Bonsai stages looked contradictory until you inspected which endpoint
   each had measured.

6. **As a researcher, I want review to alter questions, criteria and
   interpretation freely before confirmatory evidence exists, while
   retaining why those changes were made.**
   Four review rounds before lock, recorded as history rather than presented
   as though the final design sprang into existence fully formed.

7. **As a researcher, I want to repair a locked experimental procedure when
   feasibility exposes a mechanical defect, without silently mutating
   history or turning every amendment into scientific p-hacking.**
   Flagged in mining as one of the highest-value stories.

8. **As a researcher, I want expensive or information-sensitive experiments
   to advance through cheap feasibility steps, with promotion determined by
   explicit evidence rather than agent enthusiasm.**

9. **As a researcher, I want reconstruction attempts to distinguish exact
   recovery, approximate recovery and unresolved historical provenance.**
   Where `Artefact`/`Evidence`/`Question`/`Decision` should earn their keep
   without inventing a `RecoveredArtefact` type.

10. **As a researcher, I want the system to distinguish reproduction of a
    conclusion from reproduction of an exact execution.**
    Recurs independently with GPU non-bit-reproducibility.

11. **As a researcher, I want to invalidate an analysis without
    automatically invalidating the underlying observations, and see exactly
    which downstream claims need reconsideration.**
    Almost exactly the dependency-propagation MVP.

12. **As a researcher, I want claims to be revisable independently of the
    computations and artefacts from which they were inferred.**
    A particularly strong argument for Evidence and Claim being separate
    objects.

13. **As a researcher, I want surprising follow-up questions spawned by a
    completed experiment to become new work rather than silently widening
    the scope of the completed study.**

14. **As a researcher, I want an unresolved question to be deliberately
    accepted as unresolved, without creating an eternal queue of fake work
    required merely to make everything green.**

15. **As a researcher, I want a candidate optimized implementation to
    coexist with a trusted reference and be promoted only when the required
    equivalence evidence exists.**

16. **As a researcher, I want "same science, new machinery" and "new
    execution of the science" to have different correctness criteria.**

17. **As a researcher, I want a gate's status to depend on evidence that its
    criterion was actually evaluated, not on the presence of something named
    "gate."**

18. **As a researcher, I want low-friction exploration to be captured
    without making ephemeral scratch part of the scientific record by
    accident.**

### The shape these describe

Bonsai did not behave like `Question → Experiment → Result → Claim → done`.
It behaved like:

```
hunch → sharpen question → cheap probe → unexpected result
  → reinterpret question → design → review → revise design → lock
  → feasibility → mechanical failure → diagnose → amend → rerun
  → evidence → claim → robustness check → contradiction
  → narrow/downgrade claim → external review → invalidate one inference
  → recompute → spawn follow-up → explicitly leave something unresolved
```

and sometimes:

```
old result → reconstruct provenance → discover missing information
  → reverify under a new documented condition → downgrade historical confidence
```

Both loops are the thing being designed against.

---

## §2 — Acceptance scenarios

Fourteen of the eighteen are promoted to acceptance scenarios. **Criterion
for promotion: the scenario exercises a control-plane mechanic no other
promoted scenario already covers.** The four held back (§4) are variants of
mechanics promoted elsewhere, not less interesting stories.

Each scenario has three parts. **Conversation** is the interaction, subject
to the no-ontology lint rule above. **Afterward** is the set of questions
LabKit must answer once the conversation has happened, each with a decidable
expected answer — this is what makes these tests rather than vignettes.
**Expressibility** records where the current model is predicted to strain.

Expressibility notes are **predictions to confirm or refute during the
build**, not a schema change-list. Some will dissolve without any change to
`src/db/domain.ts`. The build is what decides; pre-deciding here would
defeat the point of running it.

---

### S-1 — A hunch that is not yet an experiment

**Story 1.** Turn a vague observation into progressively sharper questions
without pretending the final structure was known in advance.

> **Researcher:** The learned topology seems to be doing something
> computationally interesting.
> **Agent:** What do we already know?
> **LabKit:** Nonlinearity is established. Structured transformation is
> unresolved. External task utility has not been tested.
> **Researcher:** Fine. Let's pursue whether different inputs map to
> reproducibly different internal responses.

**Afterward — LabKit must answer:**

- *What is established, what is unresolved, and what is untested?* → three
  distinct answers, not two. "Untested" must not collapse into "unresolved",
  and neither may render as "failed".
- *Where did the current sharper question come from?* → traceable to the
  original vague observation, without that observation having been
  retroactively rewritten to look like it was always this precise.
- *What was the state of knowledge at the moment this question was
  sharpened?* → answerable after later evidence has arrived.

**Expressibility.** Three-way status depends on distinguishing *no evidence
gathered* from *evidence gathered, inconclusive*. Sharpening one question
into three has no lineage edge — there is no `Question`→`Question`
relationship. The available route is a decision that narrows the original
and motivates new work; whether that reads back as lineage is exactly what
the build should establish.

---

### S-2 — Right result, weaker level than hoped

**Story 2.** A positive result on a weaker proposition coexists with an
unresolved stronger one.

> **Agent:** Nonlinearity is unambiguous. The response-map pattern flips
> between initial conditions.
> **Researcher:** So we haven't shown useful structure.
> **LabKit:** Evidence supports nonlinear response. It does not currently
> support reproducible structured transformation. That remains open.

**Afterward — LabKit must answer:**

- *Did this computation discharge the question that motivated it?* → no,
  partially. The motivating question stays open.
- *What would it now take to close it?* → the stronger proposition, still
  unsupported, still named.
- *Why is this line of enquiry still open despite a successful run?* →
  because support for the weaker proposition is not support for the
  stronger one — and that relationship must be visible, not inferred from
  prose.

**Expressibility.** Two propositions at different strengths, one supported
and one not. Nothing currently relates two claims to each other, so
"weaker" and "stronger" may be invisible to the system — they may be two
unrelated claims that happen to hang off one line of enquiry. Whether that
is sufficient is a real open question, not obviously a defect.

---

### S-3 — Significant by the primary test, untrustworthy by its own robustness checks

**Story 3.** A formally significant computation remains insufficient
evidence when its prespecified robustness conditions fail.

> **Agent:** T vs rewired is Holm-significant under the primary test.
> **Researcher:** Great — does that overturn the old null?
> **LabKit:** Not yet. The prespecified robustness criteria disagree.
> Median aggregation is non-significant and seed stability is inadequate.
> **Researcher:** Then record it as inconclusive. Don't fit the tertiary
> model.
> **Agent:** Why not?
> **LabKit:** The design says the tertiary analysis is reached only if the
> preceding checks are consistent.

**Afterward — LabKit must answer:**

- *Is the old null overturned?* → no. Specifically **inconclusive**, which
  is neither "effect confirmed" nor "null confirmed".
- *Why may the tertiary analysis not run?* → naming the unmet condition,
  before anyone spends the compute.
- *Which prespecified checks passed and which failed?* → itemised, with the
  failing ones distinguishable from the ones never run.
- *If seed stability were later established, what becomes reachable?* →
  the tertiary analysis, and nothing else silently.

**Expressibility.** The strongest single prediction in this document: a
criterion evaluation's outcome is currently binary (`pass`/`fail`), and this
scenario's honest state is a third thing. The alternative worth testing is
that inconclusiveness belongs one layer up — the individual checks really
did pass and fail, and it is the *decision* that is inconclusive. If that
holds, no schema change is needed and the service layer carries it.

---

### S-4 — A negative result that closes the question

**Story 4.** A well-supported negative answer closes a line of enquiry
without marking the programme as failed.

> **Researcher:** Is the learned graph special on this internal measure?
> **Agent:** No detectable evidence of that. All five constructions form a
> tight cluster.
> **Researcher:** Then close that question for this endpoint.
> **LabKit:** Closed negatively. Structured transformation itself remains
> supported; specificity to the learned construction does not.

**Afterward — LabKit must answer:**

- *Is this line of enquiry open?* → no, closed.
- *Was it closed because it was answered, abandoned, or deferred?* →
  answered, negatively. These three must not be one state.
- *Did closing it weaken the surrounding programme?* → no; the neighbouring
  supported claim is untouched, and LabKit can say so without a human
  re-reading the prose.
- *What evidence closed it?* → the null result, cited as evidence, not as
  an absence of evidence.

**Expressibility.** A decision resolves a question, but carries no polarity
— nothing distinguishes "closed, answer is no" from "closed, answer is
yes". The reason text presumably says so in prose; whether that is
queryable is the test. Separately: a null result is not the same as evidence
*challenging* a claim, and only the latter has an edge today.

---

### S-5 — Contradiction or dissociation?

**Story 5.** Ask whether two findings genuinely conflict, and have the
system trace the distinct questions, evidence and claim scopes before
answering.

> **Researcher:** Didn't the earlier stage prove the graph choice doesn't
> matter? Why does this one rank them?
> **LabKit:** The earlier stage tested internal mapping strength. This one
> tested external classification utility. Those are distinct claims.
> **Researcher:** So this is a dissociation, not a contradiction.
> **LabKit:** Correct. Evidence supporting equivalence on one endpoint does
> not imply equivalence on another.

**Afterward — LabKit must answer:**

- *Do these two findings conflict?* → no — and the answer must be derived
  from the recorded scope of each claim, not from a human having written
  "these are different endpoints" in a note.
- *What would a genuine contradiction look like here?* → two claims of the
  same scope with opposing support.
- *Which questions do each of these claims answer?* → different ones,
  traceably.

**Expressibility.** A claim currently has a name and an exploratory/
confirmatory kind — no endpoint or scope. Without one, "do these conflict?"
may only be answerable by showing a human the graph, which fails the
Afterward test. The alternative: scope is carried by the line of enquiry the
claim answers and is reachable by traversal rather than stored on the claim.
This scenario is the one most likely to force a real model change.

---

### S-7 — Locked design, then feasibility finds a mechanical defect

**Story 7.** Repair a locked procedure without silently mutating history or
turning every amendment into p-hacking.

> **Agent:** Feasibility failed. The evolved condition doesn't converge at
> the locked iteration limit.
> **Researcher:** Is that evidence against the hypothesis, or an
> implementation constraint?
> **Agent:** Diagnosis points to severe feature multicollinearity.
> Increasing the sample doesn't fix it.
> **Researcher:** Raise the limit to 10,000 and rerun the affected
> feasibility work. Preserve the original setting and this diagnosis.
> **LabKit:** Amendment recorded. The confirmatory boundary is untouched.

**Afterward — LabKit must answer:**

- *What did the design originally say?* → the original value, still
  readable, not overwritten.
- *Why was it changed, and on what evidence?* → the diagnosis, linked, with
  its own provenance.
- *Was any confirmatory result affected?* → no, and LabKit must be able to
  demonstrate that rather than assert it.
- *Is this amendment scientific or mechanical?* → mechanical. The
  distinction has to survive into the record, because it is exactly what
  separates a legitimate repair from p-hacking.
- *What else was rerun as a consequence?* → the affected feasibility work,
  enumerated.

**Expressibility.** Amendment-as-supersession already exists between
decisions, which is the right shape. The strain is "locked": the current
open/closed flag on a decision means "is this decision record still active
in the control process" (PJ-004 #2), which is not obviously the same as "is
this design still freely amendable". S-13 pushes on the same seam from the
other side.

---

### S-8 — Don't spend the whole budget discovering the pipeline is broken

**Story 8.** Expensive or information-sensitive experiments advance through
cheap feasibility steps, promoted by explicit evidence rather than agent
enthusiasm.

> **Researcher:** Run the classification stage.
> **LabKit:** The first feasibility step is ready: 1,000 training images.
> The official test data is not accessible to this task.
> **Agent:** First step passed.
> **LabKit:** Before scaling, the next step must establish throughput and
> solver-health criteria.
> **Researcher:** What's the projected full-run cost?
> **Agent:** [estimate]
> **Researcher:** Approved. Proceed.

**Afterward — LabKit must answer:**

- *Why can't the full run start?* → the unmet advancement condition, named.
- *What is this task allowed to touch?* → a contract narrow enough that the
  agent cannot reach the held-out data even by accident.
- *Which conditions have been evaluated, and which merely declared?* → see
  S-17; this is the same distinction under budget pressure.
- *Who approved the scale-up, and on what projected cost?* → recorded.

**Expressibility.** The evaluation→gate→computation chain looks sufficient
here, and the derived task contract is exactly PJ-001's "reduce the amount
of global context an implementation agent must understand". The thing to
watch is whether "not accessible to this task" is enforceable or merely
advisory.

---

### S-9 — The artefact survived; its provenance didn't

**Story 9.** Reconstruction distinguishes exact recovery, approximate
recovery, and unresolved historical provenance.

> **Researcher:** Can we reproduce this cached construction?
> **Agent:** Three components reproduce byte-exactly. The historical random
> control does not.
> **Researcher:** Can you infer the old algorithm and quietly regenerate it?
> **LabKit:** That would create a new artefact with inferred provenance. The
> historical artefact stays distinct, and its exact generator remains
> unresolved.

**Afterward — LabKit must answer:**

- *Which parts of this artefact are reproducible?* → three named exactly,
  one not.
- *What depends on the unreproducible part?* → the downstream results that
  now carry a provenance caveat.
- *Is the regenerated version the same artefact?* → no. Inferred provenance
  must not silently inherit the original's standing.
- *What would resolve this?* → an open question, still open, not quietly
  closed by the regeneration.

**Expressibility.** Nothing relates two artefacts to each other, so
"reconstructed from" / "distinct from" may not be expressible; content-hash
equality plus an open question is the fallback route. The scenario
deliberately does *not* ask for a recovered-artefact type — if the general
entities can't carry this, that is the finding.

---

### S-10 — Rerunning is not reproducing

**Story 10.** Distinguish reproduction of a conclusion from reproduction of
an exact execution.

> **Agent:** I can rerun the old protocol, but its original initial
> conditions were never recorded.
> **Researcher:** Then don't call this a literal reproduction.
> **LabKit:** Recorded as re-verification under newly specified initial
> conditions — related to the historical claim, but not the same execution
> provenance.

**Afterward — LabKit must answer:**

- *Is the historical result reproduced?* → its conclusion, possibly; its
  execution, no.
- *What differs between the two runs?* → the unrecorded initial conditions,
  named as unrecorded rather than as equal.
- *Does the new run raise or lower confidence in the historical claim?* →
  answerable, and distinct from "confirms it".
- *Can the two be compared numerically?* → no, and LabKit should say so
  before someone plots them together.

**Expressibility.** Nothing links one piece of evidence to another as
"re-verifies", so the relationship may only exist via both supporting the
same claim — which loses the direction and the caveat. Execution identity
itself is well served by the existing code-revision/environment fields.

---

### S-11 — The analysis was wrong; the observations were fine

**Story 11.** Invalidate an analysis without invalidating the underlying
observations, and see exactly which downstream claims need reconsideration.
*This is PJ-001's dependency-propagation MVP query.*

> **Reviewer:** Your bootstrap is centred on the observed effect. It isn't a
> null test.
> **Researcher:** Does that invalidate the underlying per-image results?
> **Agent:** No. The stored observations are fine; the inferential
> computation is wrong.
> **Researcher:** Replace the analysis, mark the prior inference superseded,
> and propagate whatever claims change.
> **LabKit:** Five pairwise conclusions remain strong. One becomes marginal.

**Afterward — LabKit must answer:**

- *What is affected by invalidating this analysis?* → a specific,
  enumerable list of claims — not "everything downstream".
- *What is explicitly not affected?* → the observations and the artefacts
  holding them, still valid, still cited by the replacement analysis.
- *Which conclusions changed, and how?* → five unchanged, one downgraded to
  marginal, each individually attributable.
- *Why does the replacement conclusion count as supported?* → traceable to
  the same observations through a different inference.
- *What did the superseded inference claim?* → still readable.

**Expressibility.** This is the scenario the current model was designed for,
and the one most likely to pass unchanged. Its value is as a control: if
S-11 strains, the problem is deeper than the gaps in §3.

---

### S-12 — The numbers are right; the sentence about them is wrong

**Story 12.** Claims are revisable independently of the computations and
artefacts they were inferred from.

> **Reviewer:** These numbers don't support the sentence you've written.
> **Researcher:** Are the calculations wrong?
> **Reviewer:** No. The interpretation is backwards — both signal types
> attenuate, and the discriminative one attenuates more.
> **LabKit:** Evidence stands. The claim is challenged and superseded by a
> narrower interpretation.

**Afterward — LabKit must answer:**

- *Does this require recomputation?* → no. Nothing about the computations
  or artefacts changed.
- *What does the record now claim?* → the narrower interpretation, with the
  original still readable and marked as superseded.
- *Why was it narrowed?* → the review, linked to the claim it changed.
- *Does anything downstream of the original claim need revisiting?* →
  enumerable, and distinct from S-11's answer even though the trigger looked
  similar.

**Expressibility.** The story asks in as many words for a claim to be
*superseded*, and supersession currently exists only between decisions.
Whether "challenged, plus a new narrower claim, plus a decision recording
the narrowing" reads back as cleanly is the test. Paired with S-11 this is
the sharpest available probe of evidence and claim being separate objects.

---

### S-13 — A follow-up question must not widen a finished study

**Story 13.** Surprising follow-ups become new work rather than silently
widening the scope of a completed study.

> **Researcher:** What if the local encoder alone explains most of this?
> **LabKit:** That was explicitly outside the locked contrast for the
> completed stage.
> **Researcher:** Good. Start that as new work; don't change the completed
> stage.
> **LabKit:** The completed stage stays closed under its original scope. New
> question recorded.

**Afterward — LabKit must answer:**

- *Is the completed study still closed, and under what scope?* → yes, its
  original scope, unmodified.
- *Where did this new question come from?* → the completed study, as
  provenance, without that link reopening it.
- *Does the new question's existence weaken the completed result?* → no.
- *What would it take to reopen the completed study?* → nameable, and not
  something a follow-up question does implicitly.

**Expressibility.** Tests closure stability from the opposite direction to
S-7: there, a locked thing legitimately changed; here, a closed thing must
resist a plausible-looking reason to change. Both lean on whatever "locked"
turns out to mean.

---

### S-14 — Deliberately leaving something unresolved

**Story 14.** An unresolved question is deliberately accepted as unresolved,
without creating an eternal queue of fake work to make everything green.

> **Researcher:** Can we settle this marginal comparison?
> **LabKit:** Further analyses are possible, but the confirmatory dataset
> has already been consumed and there is no larger held-out sample.
> **Researcher:** Then leave it as a permanent limitation unless a genuinely
> new design or data source appears.

**Afterward — LabKit must answer:**

- *Is this question open?* → yes, and *accepted* as open — distinct from
  "awaiting work" and from "closed".
- *Does it block anything?* → no. It must not appear in a to-do list whose
  only purpose is turning everything green.
- *What would change this?* → the named condition (new design or new data),
  not merely more analysis of the same data.
- *Why was it accepted rather than pursued?* → the exhausted-dataset
  reasoning, recorded.

**Expressibility.** A decision can defer a question, which is close — but
"deferred pending work" and "accepted as permanently unresolved" are
different states and may currently be one. This is the scenario that guards
PJ-001's "should not accumulate ceremony" bullet, so a model that can only
express it as an open task is a failure.

---

### S-17 — Does the guard actually guard?

**Story 17.** A gate's status depends on evidence that its criterion was
actually evaluated, not on the presence of something named "gate".

> **Agent:** The verification gate is implemented.
> **Reviewer:** Show me evidence that it fails when the protected artefact
> is wrong.
> **Agent:** …it doesn't. It reports differences and exits successfully.
> **Researcher:** Then the gate does not exist in any meaningful sense.

**Afterward — LabKit must answer:**

- *Is this gate satisfied?* → no — and specifically **never evaluated**,
  not "passed".
- *What evidence exists that its criterion was evaluated?* → none, stated as
  none.
- *What is currently relying on this gate?* → enumerable, so the blast
  radius of a fake guard is visible.
- *Has this gate ever been demonstrated to fail when it should?* → a
  separate question from whether it has ever passed.

**Expressibility.** Predicted to pass: PJ-004 #9 already reshaped this chain
so nothing flows out of a gate that no evaluation triggered, which makes an
unevaluated gate structurally distinguishable from a passed one. S-17 is the
test of whether that reshaping actually bought what it was supposed to.
PJ-001's "should not confuse … a missing evaluation with a pass" is the
doctrine on trial.

---

## §3 — Consolidated design pressure

Where the corpus is predicted to strain the current model
(`src/db/domain.ts`). **Every row started as a prediction to confirm or
refute during the build, not a decision already taken.** Some dissolve
without a schema change; where a plausible no-change route exists it is
named. Rows gain an outcome as scenarios run, and a prediction that fails to
materialise (row **B**) is as much a result as one that is confirmed — rows
are not deleted when that happens. Rows added *by* a scenario rather than by
this document's original analysis are marked as such.

| # | Pressure point | Current state (verified) | Scenarios | Plausible no-change route / outcome |
| --- | --- | --- | --- | --- |
| A | A criterion evaluation has no inconclusive outcome | `outcome: "pass" \| "fail"` | S-3, S-17 | The checks genuinely did pass/fail individually; inconclusiveness belongs to the decision, not the evaluation |
| B | Supersession is decision-only | `SUPERSEDES: [["Decision","Decision"]]` | ~~S-11~~, S-12 | **S-11: not established as a gap.** Invalidating the replaced analysis's output plus the replacement's own support answered every question; an attempt to mint decisions purely to have something supersedable drew zero edges with all assertions passing. That is *not* a finding that invalidation represents supersession — `invalidated = true` means "no longer valid as a source of current inference", and the two merely coincide here. **Open; S-12 discriminates**, since there the numbers stay valid and only the interpretation changes **S-7: confirmed and walked.** `SUPERSEDES` got its first writer and reader. Amendment-to-amendment is exactly the shape it fits, and removing the edge breaks the ordering test — verified by deleting it, not argued |
| C | A claim has no endpoint or scope | `ClaimProps = { name, kind? }` | S-5, S-13 | Scope is carried by the line of enquiry the claim answers, reached by traversal |
| D | No question-to-question lineage | ~~no `Question`→`Question` edge~~ → `MOTIVATES: Decision → Question` | **S-1**, S-13 | **RESOLVED by S-1 — one relationship, no new label, and the predicted no-change route was half right.** A decision does narrow the original, exactly as predicted; what the prediction missed is that nothing attached the *product* of the narrowing to the act, so a question born of sharpening had no path back to the decision that produced it. Demonstrated rather than argued: one hunch sharpened twice with a result landing in between, and `originOf(secondQuestion)` returned the knowledge that existed before the *first* sharpening — populated, plausible, and belonging to a different event. Direct `Question`→`Question` lineage was the other candidate and lost on capability, not taste: it says where a question came from but not what was known when it was asked, because the reason and the frozen evidence set live on the decision. PJ-011's record-both-pick-neither rule needs two models that fit *equally*; these did not |
| E | No evidence-to-evidence lineage | no `Evidence`→`Evidence` edge | S-10 | Both support the same claim; execution differences live on the computation |
| F | No artefact-to-artefact lineage | no `Artefact`→`Artefact` edge | S-9 | Content-hash comparison plus an open question about the generator |
| G | "Locked" is not distinct from "decision record still active" | `Decision.is_open` (PJ-004 #2) | S-7, S-13 | A gate expresses the confirmatory boundary; `is_open` was always meant to carry this **S-7: prediction held, no change.** "Locked" is carried by a gate protecting the work, and "the confirmatory boundary is untouched" is assertable as `gateStatus` being identical either side of the amendment. `Decision.is_open` is still unwalked by the domain layer and was not needed |
| H | Closure carries no polarity | `RESOLVES` edge, no outcome field | S-4 | **REFUTED by S-4 — no polarity field needed.** Answered/abandoned/deferred and yes/no are all derived: `RESOLVES` + cited evidence is *answered*, `RESOLVES` with nothing cited is *abandoned*, `DEFERS` is *deferred*; and the answer is "no" when the cited findings `CHALLENGES` the proposition rather than `SUPPORTS` it. Third prediction to dissolve rather than confirm |
| I | Absence of evidence vs inconclusive evidence | `whySupported().challenged`/`against`; `whatIsKnown()`'s three lists | S-1, S-2, S-3, **S-4** | **HELD, and now tested at both levels.** S-4 found the claim-level instance: a claim refuted by a null result and a claim nobody had examined returned *identical* objects from `whySupported()`. **S-1 raises it to the question level**: `whatIsKnown()` returns `established`/`unresolved`/`untested` as three disjoint lists, so a question nothing has been run against is not a weak kind of unsettled and renders as neither failure nor inconclusive evidence. Both fixes are service-layer reads of structure that already existed — `CHALLENGES` for the first, `ADDRESSES`/`RESOLVES` for the second. No schema change either time |
| J | Deferred vs accepted-as-unresolved | `DEFERS` edge covers both | S-14 | Distinguish by whether an open task exists |
| K | No provisional/scratch standing | `Claim.kind: exploratory \| confirmatory` | S-8, story 18 | `exploratory` already is this distinction |
| L | No execution input lineage | no `Computation`→`Artefact` "read" edge | S-11 | **CONFIRMED — resolved.** Added `CONSUMES: Computation → Artefact`. The old route (`ADDRESSES` to the enquiry, then `REQUIRES`) answered "what observations is this enquiry associated with", not "what did this computation consume". Verified false in practice, not in principle: with two analyses on one enquiry over different inputs, "what does this claim rest on" returned both observation sets |
| M | A review has no analysis to point at | `EVALUATES: Review→Claim\|Decision\|Evidence` | S-11 | **CONFIRMED — resolved.** Added `Review → EvidenceUnit`. Endpoint is the inferential activity, not the `Computation` that executed it: what S-11's reviewer criticises is the method, and nothing ran incorrectly. `Review → Computation` may be earned later by a scenario reviewing an *execution*; S-11 did not earn it |
| N | Claim identity is undefined | one `Claim` created per analysis conclusion; queried by `name` | S-5, S-12 | **NEW OPEN QUESTION.** Two analyses concluding the same proposition currently create two claims. Correct if a claim is an assertion *occurrence*; wrong if it is a proposition, in which case one claim should accumulate evidence. Deliberately not fixed — S-5 and S-12 are what should decide it |
| O | Withdrawal reason is under-determined | `Review→EvidenceUnit` says *who reviewed*, not *which review caused* an invalidation | S-3, S-7 | **NEW, DEFERRED.** Two shapes of the same gap: with no review the reason is manufactured (row **I** again — probably should be null); with several reviews of one unit the causal one is ambiguous. May want no relationship at all, since it describes *why state changed* rather than *what current state is* — which is what the event history is for. Deferred until the event model is under real pressure **S-7: prediction held — did not bite.** An amendment names its own cause, so the ambiguity O describes never arose. Still deferred |
| P | `Evidence` carries two senses | one `EvidenceProps {statement}` for raw measurements and for inferential findings; distinguished only by graph position | S-9, S-10, S-12 | **NEW, from cold review (3 of 4 reviewers, independently).** May be correct minimalism — S-11's premise ("observations fine, inference wrong") is expressed structurally and works. But `recordObservations` makes Evidence with no producing `EvidenceUnit`, which PJ-001 defines as impossible, and `whySupported` structurally cannot count an observation as support |
| Q | Question and LineOfEnquiry are collapsed by the service layer | `pose`/`pursue`/`openEnquiry`; `MOTIVATES` walked in both directions | S-1, S-2, S-13, **S-4** | **RESOLVED by S-4, and now load-bearing beyond closure after S-1.** S-4 showed the split was real: closure attaches to the question, so a closed enquiry went on reporting itself open. That left the two still sharing a name and a lifetime, and this row predicted that "a scenario that sharpens one question into several, or pursues one question two ways, is what would force them apart" — S-1 is that scenario and it did. `pose()` puts a question on the record with no pursuit at all (which is what makes *untested* a state of the record rather than a reader's invention), and `pursue()` opens further lines against a question already held. Identity is the handle throughout: two pursuits worded alike stay one question, two questions worded identically stay two |
| R | Standing is a birth property, not a transition | `Claim.kind` is hardcoded `"confirmatory"` by the only writer; `exploratory` unreachable through research verbs | S-8, S-7, story 18 | **NEW, from cold review (3 of 4).** Ties to rows **G** and **K**: exploratory→confirmatory is plausibly conferred by an event (preregistration, lock, promotion) rather than set at creation. If so G/K/R are one question about how standing changes, not three **RESOLVED by S-7 at the service layer, with the successor question still open.** Predicted as the likeliest wrong answer and it was: with `kind` hardcoded `"confirmatory"`, amending a solver iteration limit reported `nature: "scientific"` and named a convergence diagnosis as a compromised confirmatory result — a false p-hacking alarm, populated and confident. `Conclusion.standing` now defaults to **exploratory**, which makes `exploratory` reachable for the first time and requires confirmatory standing to be claimed deliberately. What S-7 does *not* settle is whether standing should be **conferred by an act** rather than declared at creation; it does rule out the naive gate-conferred model, since S-17 established that declaring a gate does not satisfy it, so a claim behind an unevaluated confirmatory gate would read exploratory and the scientific amendment would go undetected |
| S | No agent, person or role exists in the model | no node label, no property, anywhere | S-8 | **NEW, from cold review.** S-8's Afterward asks "who approved the scale-up, and on what projected cost?" — unanswerable. May legitimately be external metadata rather than domain; S-8 decides |
| T | Edges cannot carry properties | `createEdge(from, edge, to)` is the whole write API; idempotency is `UNIQUE (start_id, end_id)` | S-7, row O | **NEW, from cold review.** "When was this drawn", "by whom", "which review caused this" have no home and cannot be added without reifying to a node or breaking the uniqueness contract. An early commitment made for a good reason (the pglite-age `MERGE` defect) whose cost was never separately weighed **S-7: prediction held — no pressure.** The amendment `Decision` is the reification; reason, evidence and order all have a node to live on. Untested still |
| U | A gate records no condition until it is evaluated | only path `Criterion`→`Gate` ran via `CriterionEvaluation`; `GateProps` is `{consequence}` | S-17 | **CONFIRMED — resolved.** Added `GOVERNS: Criterion → Gate`. PJ-004 #9's chain correctly stops anything flowing out of an untriggered gate, but it also made the governing criterion reachable *only* through an evaluation — so a declared-but-unevaluated gate, which is exactly S-17's subject, recorded no condition at all. Demonstrated: `criterionGoverning()` returned null, so the reviewer's demand ("show me it fails when the artefact is wrong") could not be aimed at anything |
| V | Criteria gate work but do not qualify findings | `Criterion -GOVERNS-> Gate -GATES-> Task\|Computation`; nothing connects a criterion to the analysis it qualifies | S-3 | **NEW, CONFIRMED, deliberately unresolved.** Demonstrated wrong answer: with two prespecified robustness checks failed, `whySupported()` still reports the finding `supported: true` — "some evidence exists" rather than "the evidence holds up by its own prespecified standard". Two plausible models and S-3 does **not** discriminate, because its criteria do both jobs at once: (a) `Criterion -QUALIFIES-> EvidenceUnit`, or (b) extend `GATES` so a gate can gate a `Claim`'s standing. A scenario where criteria qualify a finding but gate nothing — or the reverse — would decide it |
| W | An evaluation record is not evidence of evaluation | `CriterionEvaluation {value, outcome}` can be minted directly; `BASED_ON: CriterionEvaluation → Evidence` exists and is never written | S-17, S-3 | **NEW, DEFERRED.** S-17's motivating failure was a guard that *looked* implemented but had never demonstrated the required behaviour. Recording `outcome: "fail"` with no provenance for how that was reached risks recreating exactly that gap one level up. Two propositions hide here: "the criterion was recorded as failing" and "the criterion was exercised against evidence and failed." A later scenario should say whether an evaluation is itself sufficient durable evidence, or needs provenance through Evidence/EvidenceUnit/Computation |
| X | "Failure sticks" is S-3 policy applied to every gate | `gateStatus()` treats any failing evaluation as permanently decisive | S-3, S-17 | **NEW, DEFERRED.** S-3 earns "re-running a robustness test until green must not erase the earlier failure". It does not earn "any failure blocks every gate forever", which is what is implemented. For S-17's hash check — artefact corrupted, criterion fails, artefact repaired, criterion passes — a permanent block is plausibly wrong. There may eventually be four distinct things here: historical failure evidence, current gate satisfaction, admissible re-evaluation, and superseded evaluation |
| Y | Closure without a cited result is classified by whether anyone worked on it | `whatIsKnown()` buckets an abandoned question under `unresolved` if anything ever addressed it, and a deferred one under `untested` if nothing did | **S-1**, S-14 | **NEW, KNOWN BOUNDARY, deliberately not fixed.** S-1 needs three states and gets them from structure — resolved-on-cited-evidence, worked-on, never-touched. It never poses a question that was abandoned or deferred, so it has no standing to say where those belong, and inventing a fourth and fifth list to hold cases the scenario never exercised is how the survey stops being derived. Row J already owns the deferred-vs-accepted distinction; S-14 should decide both together |
| Z | Chronology exists for evidence but not for status | `Decision` has no time property; the sharpening snapshot (`BASED_ON`) freezes *findings* only | **S-1**, S-7 | **NEW, CHARACTERISED, no change earned.** S-1's hardest Afterward question — what was known when this question was sharpened, asked after later evidence arrived — is answered from durable state, with an empty event log open beside it, because `sharpen()` freezes the standing findings onto the decision when the act is recorded. What that cannot reconstruct is the *survey*: whether a given question was established at that moment needs an ordering between two `Decision`s, and there is none. Natural ids happen to be allocated in order, which is an accident of the sequence and not a modelled fact — CLAUDE.md already forbids reading meaning into their values. So the temporal seam took real pressure and held at the level S-1 asked about; the level above it is a real gap that S-7 (post-lock amendment) is better placed to price, and neither a durable event sink nor a `decided_at` property is earned by a question nobody has yet been unable to answer **S-7: narrowed, as predicted, and the distinction is the result.** In-chain order is structural — `SUPERSEDES` alone orders two amendments to one design, with no timestamp, an empty event log, and natural-id order never consulted. Two decisions on *different* designs remain unordered, and S-7 includes an unrelated sharpening precisely to show that the answer covers one class of history and not chronology in general. Not a partial fix: a smaller true claim |
| AA | `BASED_ON` carries two senses | `closeEnquiry()` writes the one cited finding; `sharpen()` writes every standing finding | **S-1**, S-7, S-12 | **NEW, BOUNDARY LOGGED, deliberately not changed.** "This evidence informed this decision" and "this is what was known when the decision was taken" are different claims, and the same edge now expresses both. S-1 cannot separate them, because the sharpening genuinely was taken in light of everything known — the two sets coincide, which is exactly why the overload is invisible here. What would discriminate: a decision taken on a *specific* subset while other findings stood unconsidered. If that shows the snapshot reading manufacturing a rationale the researcher never had, the contemporaneous set needs its own edge and `BASED_ON` goes back to meaning what it says **S-7: live, characterised, not fixed.** Both senses now have real writers — `amendDesign()` cites one diagnosis specifically, `sharpen()` snapshots everything standing. No mechanical collision: the readers pin different edges. The boundary stands as written |

Two observations across the table. Most rows are *missing relationships*
rather than missing entities — which is mild evidence the entity set from
PJ-001 is about right and the edge schema is where the work is. And row **I**
underlies three scenarios without being a schema question at all: it is a
query-semantics requirement, and the likeliest place for the service layer
to silently get it wrong.

Rows **P**–**T** were added by a cold-context review after S-11 (four
independent reviewers, unprimed). They are *not* scenario outcomes — nothing
has tested them — but three of the five were noticed independently by three
of four reviewers, which is why they are logged rather than left to be
re-derived (differently) by whichever scenario hits them first.

**Status after S-4.** The first scenario outside the control chain, and it
resolved three open rows **without a single schema change** — every fix was
ladder step 1 or 2 (a missing service operation, or an answer derivable from
structure that already existed). Row **Q** resolved: the Question/
LineOfEnquiry split is real, and the service layer was wrong to collapse it.
Row **H** refuted: closure polarity is derived, not stored — the third
prediction to dissolve. Row **I** held and was tested outside gates for the
first time. `CHALLENGES` moved from declared-but-never-walked to live, which
is one fewer empty label on the frontier.

Two bugs S-4 caught that were nothing to do with S-4: a closed enquiry
reporting itself open, and a cross-product in a `whySupported` traversal
where two anonymous `(:EvidenceUnit)` patterns did not have to match the same
unit. The second only surfaced because the scenario had two analyses in
scope — with one it would have passed spuriously.

**Status after S-3.** Row **A** — "the strongest single prediction in this
document" — is **refuted**. No third `outcome` value was needed: each
prespecified check really is binary, and inconclusiveness lives one layer up,
exactly as the row's own no-change route proposed. It is carried by a
four-state gate (`never-evaluated` / `incomplete` / `blocked` / `satisfied`)
plus per-criterion itemisation where `never-run` is a first-class value, and
all of it is derived rather than stored. Row **I** held for the same reason:
absence is a distinct state, not a synthetic failure. Row **V** added — the
one thing S-3 could not express. Row **J** was brushed (deferred vs accepted
-as-unresolved) but not settled; S-14 owns it.

S-3 and S-17 together also forced a distinction neither forces alone:
criterion-scoped state ("has this check ever been shown able to fail?") is
not gate-scoped state ("has this condition been checked *for this gate*?").
Collapsing them made a gate nobody had evaluated report as blocked because
its criterion had failed elsewhere.

**Status after S-17.** Row **U** added and resolved; row **A** took no
pressure here — S-17's outcomes are genuinely binary. (Written before S-3
ran, this originally predicted S-3 would need a third value. It did not; see
the S-3 status above.) Rows **I** and **S** were predicted to feel
S-17 and did not: "never evaluated" turned out to be answerable structurally
(zero evaluations is a distinct state, not a synthetic failure), and nothing
in S-17 asked who evaluated. The prediction that S-17 would pass unchanged
was **wrong** — PJ-008 called it "predicted to pass", and it needed a new
edge.

**Status after S-11** (the control scenario; see `src/domain/`,
`tests/scenarios/s11_invalidate_analysis.test.ts`). The entity inventory did
not move: no row resolved by adding a node label, and rows **L** and **M**
were both found by a service-layer traversal failing to answer a real
question, not by ontology design. Row **B** is the more interesting result —
the predicted gap did *not* materialise, and saying so is as much a finding
as confirming one. Row **I** held: "which conclusions changed" proved cleanly
derivable from before/after findings, with no strength field on `Claim`.

---

### S-7 predictions, recorded before the build

S-7 touches more open rows than any scenario so far, and a prediction is
only worth keeping if it was written down while it could still be wrong.
Recorded 2026-08-19, before a line of the scenario existed.

| Row | Prediction |
| --- | --- |
| B — supersession is decision-only | `SUPERSEDES` gets its first walk and is **enough**. Amendment is decision-to-decision, which is the shape the story's own expressibility note endorses |
| G — "locked" vs "decision record still active" | The no-change route holds. A gate expresses the confirmatory boundary, and "the confirmatory boundary is untouched" is assertable as `gateStatus` being identical either side of the amendment. `Decision.is_open` is not needed and stays unwalked by the domain layer |
| O — withdrawal reason under-determined | Does not bite here. An amendment decision names its own cause, so the ambiguity O describes (several reviews, no way to say which caused it) never arises. Stays deferred |
| R — standing is a birth property | **The likeliest demonstrated wrong answer.** `Claim.kind` is hardcoded `"confirmatory"` by its only writer, so every feasibility claim reads confirmatory and "was any confirmatory result affected?" answers wrongly rather than emptily. Expect a service-layer fix, not a schema one |
| T — edges cannot carry properties | No pressure. The amendment decision *is* the reification; "when, why, by whom" all have a node to live on. Expect T to stay open and untested |
| Z — chronology between decisions | **Narrows rather than disappears.** `SUPERSEDES` gives in-chain order structurally, with no timestamps and no event log. Two unrelated decisions remain unordered. That is a distinction, not a partial fix |
| AA — `BASED_ON` carries two senses | Goes live. The amendment cites one specific diagnosis, so both senses have real writers. No mechanical collision expected — the readers pin different edges — so characterise, do not fix |
| mechanical vs scientific | **Not derivable from the shape of the cited evidence.** A diagnosis gets a `SUPPORTS` edge like any finding, so structurally it is indistinguishable from a scientific result. If a derivation exists it will be about *what the amendment changes*, not what it rests on. Otherwise: two models, record both |
| what else was rerun | Honestly **empty**. Nothing connects an amendment to the work it invalidates. An empty answer earns nothing, and manufacturing a second amendment purely to break it would be manufacturing the wrong answer rather than finding one |

**Outcomes.** Six of nine predictions held. Two are worth reading twice.

*Refuted:* "what else was rerun" was predicted to come back **honestly empty**,
on the grounds that nothing connects an amendment to the work it invalidates.
Wrong — `Gate -GATES-> Task` had connected them since S-17, and the rerun set
enumerates directly. The prediction was made by reasoning from the amendment
outwards and forgetting the control chain already reached in that direction.

*Earned mid-build, and initially skipped:* `IMPLEMENTS: Task → EvidenceUnit`
was declared and never written since PJ-004. `recordAnalysis()` now takes the
work it carries out, because a gate reached the *work* and stopped there —
which is one hop short of the results. This was wired before the wrong answer
was demonstrated, which is the wrong order, so it was demonstrated afterwards
by deleting the edge: with no `IMPLEMENTS`, an amendment that moves the
prespecified comparison to the full sample reports itself **mechanical**. That
is the worst available wrong answer here, since "mechanical" is precisely the
label that says a repair is legitimate rather than p-hacking.

*Held:* mechanical-vs-scientific is not derivable from the shape of the cited
evidence — a diagnosis carries `SUPPORTS` like any finding — but is derivable
from what the amendment *changes*: it is scientific exactly when a confirmatory
result stands in its blast radius. Nobody can set it.

## §4 — Held back as stories, not scenarios

Cut by mechanical overlap with a promoted scenario, not by interest. Each
should be revisited if its promoted counterpart passes too easily.

- **Story 6 (review amends a design before any evidence exists).** Same
  amendment-and-history mechanics as **S-7**, which is the harder case:
  amending *after* lock, with confirmatory boundaries in play. If S-7 works,
  6 is the easy direction of the same machinery.
- **Story 15 (candidate implementation vs trusted reference).** Same
  promotion-gate mechanics as **S-8** — evidence-determined advancement,
  with a reference implementation instead of a data-scale ladder. Worth
  promoting later precisely because it maps onto the acceleratable-
  experiments workflow without needing accelerator-specific entities.
- **Story 16 (infrastructure change vs scientific rerun).** Its distinctive
  content is that *acceptance criteria differ by intent* — byte-identity
  versus reproduction-of-conclusions. That is **S-10**'s conclusion-versus-
  execution distinction applied to a whole programme, plus S-8's gates.
- **Story 18 (scratch work that unexpectedly matters).** Its rule — capture
  cheaply, but promote to durable code before citing — is row **K** plus
  S-8's promotion gate. Held back because the exploratory/confirmatory
  distinction may already cover it; if row K survives the build, promote
  this to a scenario.

---

## Judgment calls

- **Fourteen scenarios, not the eighteen stories.** The mining notes
  suggested twelve to fifteen. Promotion was decided by *distinct control-
  plane mechanic*, so the four held back are the ones whose machinery is
  already under test elsewhere. Interest was explicitly not the criterion —
  story 15 is one of the more compelling stories in the corpus.
- **§3 is phrased as predictions, deliberately.** Writing it as a schema
  change-list would pre-empt the build that exists to decide these
  questions. The user's framing was "exercises the Graph Persistence Layer
  (or invalidates the design!)" — a §3 that already knew the answer would
  guarantee neither outcome, just a self-fulfilling refactor. Each row
  therefore carries a plausible route to needing no change at all.
- **Bonsai specifics are kept as texture, not requirements.** Solver
  iteration limits, aggregation choices and data splits appear because
  concrete conversations are testable and abstract ones aren't. No entity in
  §3 is named after anything Bonsai-specific, and the corpus explicitly must
  not license a `RecoveredArtefact`-style type (S-9) or accelerator-specific
  entities (story 15).
- **The no-ontology lint rule is a real acceptance criterion, not a writing
  style.** It is how test question (a) gets checked. Every promoted
  scenario's Researcher and Agent lines were written to satisfy it; where
  the original mining notes had a caller say "create a follow-up line of
  enquiry", that has been softened to "start that as new work" (S-13),
  because the first version quietly assumes the caller knows the label.
- **S-11 is included even though it is predicted to pass.** It is the
  control. A corpus made only of scenarios expected to strain the model
  would not tell us whether a failure means "this design is wrong" or "this
  scenario is unreasonable".
- **Nothing was implemented when this was written, and `src/db/domain.ts`
  was untouched.** The entry was requirements only; the scenarios that have
  since been built are recorded in §3's ledger rather than by editing §1 or
  §2, so a prediction can still be read in the words it was made in.
