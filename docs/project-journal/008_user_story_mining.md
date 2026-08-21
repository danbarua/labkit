# PJ-008: User story mining — an interaction corpus for the Domain Service Layer

**Status: accepted requirements (2026-08-18), on `spike/drizzle-age`. Drives
the Domain Service Layer build. §1 and §2 are held at their original wording;
§3's ledger is the living part and gains outcomes as scenarios are built —
S-11, S-17, S-3, S-4, S-1, S-7, S-12, S-5, S-8 and S-3b so far. S-3b is the one
scenario not promoted from §2: it was authored from story 3 to settle row V,
and it lives in §3 with the rest of the living material.**

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

| # | Pressure point | Scenarios | Status |
| --- | --- | --- | --- |
| A | A criterion evaluation has no inconclusive outcome | S-3, S-17 | refuted |
| B | Supersession is decision-only | ~~S-11~~, S-12 | resolved |
| C | A claim has no endpoint or scope | S-5, S-13° | resolved |
| D | No question-to-question lineage | **S-1**, S-13° | resolved |
| E | No evidence-to-evidence lineage | **S-10** | resolved |
| F | No artefact-to-artefact lineage | **S-9** | open |
| G | "Locked" is not distinct from "decision record still active" | S-7, S-13° | resolved |
| H | Closure carries no polarity | S-4 | refuted |
| I | Absence of evidence vs inconclusive evidence | S-1, S-2°, S-3, **S-4** | resolved |
| J | Deferred vs accepted-as-unresolved | **S-14** | resolved |
| K | No provisional/scratch standing | S-8, **S-18** | resolved |
| L | No execution input lineage | S-11 | resolved |
| M | A review has no analysis to point at | S-11 | resolved |
| N | Claim identity is undefined | S-5, S-12 | resolved |
| O | Withdrawal reason is under-determined | S-3, S-7 | open |
| P | `Evidence` carries two senses | **S-9**, S-10, S-12 | resolved |
| Q | Question and LineOfEnquiry are collapsed by the service layer | S-1, S-2°, S-13°, **S-4** | resolved |
| R | Standing is a birth property, not a transition | S-8, S-7, **S-18** | resolved |
| S | No agent, person or role exists in the model | S-8 | open |
| T | Edges cannot carry properties | S-7, row O | open |
| U | A gate records no condition until it is evaluated | S-17 | resolved |
| V | Criteria gate work but do not qualify findings | S-3, S-8, **S-3b** | resolved (argued) |
| W | An evaluation record is not evidence of evaluation | S-17, S-3, S-8 | resolved |
| X | "Failure sticks" is S-3 policy applied to every gate | S-3, S-17, S-3b, **S-3c** | resolved |
| Y | Closure without a cited result is classified by whether anyone worked on it | **S-1**, **S-14** | boundary |
| Z | Chronology exists for evidence but not for status | **S-1**, S-7, consumer probe | resolved |
| AA | `BASED_ON` carries two senses | **S-1**, S-7, S-12 | boundary |
| AB | A consequential act records what it acted **on**, not what it brought into existence | **S-1**, **S-7**, S-12, **S-3c** | resolved |
| AC | A withdrawn interpretation has no way back | **S-12** | resolved |

**Status vocabulary.** `open` — still exerting pressure. `resolved` — settled,
with or without a model change. `refuted` — the predicted gap turned out not to
be one. `resolved (argued)` — settled, but the closing move was an argument
rather than a demonstrated wrong answer; weaker, and scannable as such rather
than distinguished only in the prose below. `deferred` — real, deliberately not
acted on, **and with a scenario named that would settle it**. `boundary` — a
known limit of the current model, recorded rather than fixed.

**Ownership, and the `°` marker.** A scenario in the Scenarios column marked
`°` has **not been built**. That one mark is what makes ownership scannable,
because `open` alone conflates two different situations and reading them apart
otherwise requires knowing the whole build state by heart. Row K was misread as
unowned in a review handoff, by an agent that had just read this table; an
external reviewer caught it. The marker exists so the next reader does not have
to be that well informed:

| Kind | Means | Rows today |
| --- | --- | --- |
| `open` + owned | an unbuilt discriminator is named (`°` present) | **none** — K was the last, built as S-18 |
| `open` + unowned | every named probe is built; a **new** discriminator is needed | F, O, S, T |
| `boundary` | a limit characterised on purpose; no claim it should be fixed | Y, AA |

Only the middle kind is a gap in the *method* — CLAUDE.md's deferral rule says
a row that cannot name a scenario is unresolved and unowned rather than
`deferred`, and those rows say so in their own section. The first kind is
ordinary backlog. Keeping the three apart is what stops "we haven't decided"
collapsing into one undifferentiated pile.

`°` is a fact about build state, not about the row: when a scenario is built,
clear its `°` everywhere in this table **and update the Rows-today column above**
in the same change — both are derived, and both go stale silently. An owner need not be
a corpus scenario — row K's *was* **story 18**, a §4 story held back, and row
T's is **row O**. An owner from §4 is a live claim that the story would settle
the row, and story 18 did: it was promoted and built as S-18. And an owner being built is not the same as it returning a verdict —
row K's owner S-8 *was* built and gave none, which is recorded as a verdict in
its own right rather than left as an omission.

Each row's narrative is below, oldest verdict first. A row's `Status` is taken
from its **latest** dated verdict; earlier verdicts are kept verbatim, because
a prediction that failed is a result about the model.

---

### Row A — A criterion evaluation has no inconclusive outcome

**Scenarios:** S-3, S-17 · **Status:** refuted

**Current state (verified):** `outcome: "pass" \| "fail"`

The checks genuinely did pass/fail individually; inconclusiveness belongs to the decision, not the evaluation

### Row B — Supersession is decision-only

**Scenarios:** ~~S-11~~, S-12 · **Status:** resolved

**Current state (verified):** `SUPERSEDES: [["Decision","Decision"]]`

**S-11: not established as a gap.** Invalidating the replaced analysis's output plus the replacement's own support answered every question; an attempt to mint decisions purely to have something supersedable drew zero edges with all assertions passing. That is *not* a finding that invalidation represents supersession — `invalidated = true` means "no longer valid as a source of current inference", and the two merely coincide here. **Open; S-12 discriminates**, since there the numbers stay valid and only the interpretation changes

**S-7: confirmed and walked.** `SUPERSEDES` got its first writer and reader. Amendment-to-amendment is exactly the shape it fits, and removing the edge breaks the ordering test — verified by deleting it, not argued

**S-12: RESOLVED — claim-level supersession is not real, and decision-level supersession was not needed either.** An interpretation is withdrawn by a `Decision` that `CHANGES` it and `MOTIVATES` the reading that replaced it. Because both halves of every step are recorded, the revision chain already walks claim-to-claim and a `SUPERSEDES` edge between the decisions would have been a writer with no reader. Note the contrast with S-7, where `SUPERSEDES` *is* load-bearing: there each step records only what it changed, and the container (the gate) supplies the rest

### Row C — A claim has no endpoint or scope

**Scenarios:** S-5, S-13 · **Status:** resolved

**Current state (verified):** `ClaimProps = { name, kind? }`

Scope is carried by the line of enquiry the claim answers, reached by traversal

**S-5: RESOLVED, no-change route held, nothing added to `Claim`.** Scope is reached by traversal — `Claim <-SUPPORTS- Evidence <-PRODUCES- EvidenceUnit -ADDRESSES-> LineOfEnquiry <-MOTIVATES- Question` — and every edge on that path already existed and was already walked. Two claims worded identically now answer different questions traceably, and "do these conflict?" is derived from scope and bearing without either sentence being compared to the other. Note what this cost: **zero schema changes**, against S-5's own §2 note calling it "the one most likely to force a real model change"

### Row D — No question-to-question lineage

**Scenarios:** **S-1**, S-13 · **Status:** resolved

**Current state (verified):** ~~no `Question`→`Question` edge~~ → `MOTIVATES: Decision → Question`

**RESOLVED by S-1 — one relationship, no new label, and the predicted no-change route was half right.** A decision does narrow the original, exactly as predicted; what the prediction missed is that nothing attached the *product* of the narrowing to the act, so a question born of sharpening had no path back to the decision that produced it. Demonstrated rather than argued: one hunch sharpened twice with a result landing in between, and `originOf(secondQuestion)` returned the knowledge that existed before the *first* sharpening — populated, plausible, and belonging to a different event. Direct `Question`→`Question` lineage was the other candidate and lost on capability, not taste: it says where a question came from but not what was known when it was asked, because the reason and the frozen evidence set live on the decision. PJ-011's record-both-pick-neither rule needs two models that fit *equally*; these did not

### Row E — No evidence-to-evidence lineage

**Scenarios:** **S-10** · **Status:** resolved

**Current state (verified):** `Evidence -[:REVERIFIES]-> Evidence`, written by `reverify()`, read by `reproductionOf()` and `whySupported()`

Both support the same claim; execution differences live on the computation

**S-10: earned, and the no-change route was the thing that failed.** The
predicted fallback — both runs supporting the same claim, execution differences
read off the computations — is exactly what the model already did, and it
produced a confidently wrong answer rather than a thin one: `whySupported()`
reported a proposition resting on **two independent findings** when it rested on
one, checked twice, by a run whose initial conditions the original never
recorded. A historical claim reporting itself independently corroborated by an
execution nobody reproduced.

What the shared-claim encoding cannot carry is **direction** and **caveat**:
which run re-checked which, and that the two executions are not the same. Two
genuinely independent analyses in one line of enquiry are indistinguishable from
a re-verification without the edge, and those are different scientific
situations — which is what makes this a wrong answer rather than a missing
feature.

*Deletion-verified*: remove the write and all five Afterward assertions fail,
`whySupported()` among them, reverting to two independent supports.

*What was deliberately not done.* `recordAnalysis()` still accepts the old
shape. Recording two analyses over one proposition is a claim of two independent
results, which is real and sometimes true; what was missing was a way to say the
*other* thing, not a way to stop saying this one. Contrast with S-3b, where
`declareGate()` was made to refuse — there the shape being refused asserted
something that could not be true

### Row F — No artefact-to-artefact lineage

**Scenarios:** S-9 · **Status:** open

**Current state (verified):** no `Artefact`→`Artefact` edge

> **No scenario currently named would settle this.** Every scenario in
> its row has been built. Under CLAUDE.md's deferral rule that makes it
> unresolved and unowned rather than deferred — recorded here rather than
> left to look like a decision.

Content-hash comparison plus an open question about the generator

**S-9 (2026-08-20): refuted, then reopened by review the same day — half
settled, and the row stays `open` and now unowned.** This verdict was missing
for four commits; PJ-024 §5 found the hole and it is filled here rather than
left to PJ-021 alone.

*What S-9 settled: identity.* Two artefacts may legitimately share a
`logical_name`, and a regenerated part naturally carries the name of the part it
replaces. Refusing an ambiguous name — S-5's decline-rather-than-guess, reaching
artefacts for the first time — is enough to stop the regenerated one inheriting
the historical one's dependants, which is the Afterward bullet *"inferred
provenance must not silently inherit the original's standing"* word for word. No
lineage edge was needed for that, and the caveat has a home: `whatIsKnown()`
keeps the question in `untested` rather than letting a workaround close it.

*What it did not settle: direction — and the first write-up claimed otherwise.*
PJ-021 argued no edge was needed because *"direction is in the act: a
regeneration knows what it regenerates."* **There is no such act.** The
regenerated part is written by an ordinary `recordObservations()` naming nothing
historical, and `reproducibilityOf()` is a *read* that takes the historical
parts as arguments and persists nothing. A reader holding only the regenerated
artefact cannot answer *what was this reconstructing?* External review caught it;
the claim is left visible in PJ-021 rather than rewritten, because how the
conclusion was reached is the part worth keeping.

*Why no edge was added anyway.* Nothing has demonstrated a **wrong** answer
requiring one — the gap is an unanswerable question, and under PJ-011 §5 that
earns nothing. The contrast with row E, earned by S-10 one scenario earlier on
the same test, is the sharpest available illustration that the bar discriminates:
there a shared claim could carry neither direction nor caveat and the wrong
answer was demonstrable; here the caveat has a home and the direction gap is so
far only an absence.

*The discriminator, named as the deferral rule requires:* a scenario in which a
reader must **recover** what a reconstruction was reconstructing, and gets a
confidently wrong answer without it. Nothing named would settle it, which is
what the marker above records. See PJ-021 and PJ-024 §5.

### Row G — "Locked" is not distinct from "decision record still active"

**Scenarios:** S-7, S-13 · **Status:** resolved

**Current state (verified):** `Decision.is_open` (PJ-004 #2)

A gate expresses the confirmatory boundary; `is_open` was always meant to carry this

**S-7: prediction held, no change.** "Locked" is carried by a gate protecting the work, and "the confirmatory boundary is untouched" is assertable as `gateStatus` being identical either side of the amendment. `Decision.is_open` is still unwalked by the domain layer and was not needed

### Row H — Closure carries no polarity

**Scenarios:** S-4 · **Status:** refuted

**Current state (verified):** `RESOLVES` edge, no outcome field

**REFUTED by S-4 — no polarity field needed.** Answered/abandoned/deferred and yes/no are all derived: `RESOLVES` + cited evidence is *answered*, `RESOLVES` with nothing cited is *abandoned*, `DEFERS` is *deferred*; and the answer is "no" when the cited findings `CHALLENGES` the proposition rather than `SUPPORTS` it. Third prediction to dissolve rather than confirm

### Row I — Absence of evidence vs inconclusive evidence

**Scenarios:** S-1, S-2, S-3, **S-4** · **Status:** resolved

**Current state (verified):** `whySupported().challenged`/`against`; `whatIsKnown()`'s three lists

**HELD, and now tested at both levels.** S-4 found the claim-level instance: a claim refuted by a null result and a claim nobody had examined returned *identical* objects from `whySupported()`. **S-1 raises it to the question level**: `whatIsKnown()` returns `established`/`unresolved`/`untested` as three disjoint lists, so a question nothing has been run against is not a weak kind of unsettled and renders as neither failure nor inconclusive evidence. Both fixes are service-layer reads of structure that already existed — `CHALLENGES` for the first, `ADDRESSES`/`RESOLVES` for the second. No schema change either time

### Row J — Deferred vs accepted-as-unresolved

**Scenarios:** **S-14** · **Status:** resolved

**Current state (verified):** `acceptAsUnresolved()` writes `DEFERS`; `enquiryStatus()` reports `accepted-as-unresolved`, open, with reason and reopening condition

Distinguish by whether an open task exists

**S-14: resolved, and this row's own fallback was the thing the scenario
forbids.** "Distinguish by whether an open task exists" has been recorded here
since the document was written, and §2 says plainly that *"a model that can only
express it as an open task is a failure"*. External review set the same
constraint independently. No `Task` was created and none was needed.

**The wrong answer was reachable, not missing.** `closeEnquiry()` with nothing
cited reports the question `abandoned` — nobody worked on it, no result behind
it. That was the only thing a researcher could do to record "we are leaving
this", and it misreads a deliberate decision as neglect.

**Two defects surfaced only by making the branch reachable.** The unreachable
`deferred` branch reported `open: false`, so a question left open on purpose
read as shut; and the token itself named a state nothing could produce. Both had
been sitting in a branch no verb could enter. That is the no-cull policy paying
out exactly as intended — declared-but-unwalked structure is *a computable map
of where the model has untested claims*, and this claim turned out to be wrong
in two ways.

**Deferred-pending-work was not built.** Only one of the row's two states has
ever been needed. If a scenario needs "parked until someone gets to it", the
distinction gets earned then

### Row K — No provisional/scratch standing

**Scenarios:** S-8, S-18 · **Status:** resolved

**Current state (verified):** `Claim.kind: exploratory \| confirmatory`

`exploratory` already is this distinction

**S-8: no verdict — the row was not probed, and saying so is the verdict.**
S-8 is one of K's two named scenarios and it was built without this row being
revisited, which is an omission rather than a finding. What S-8 *did* change
sits next door: S-7 made `Conclusion.standing` default to `exploratory`, so the
value is reachable through a research verb for the first time and K's original
line — "`exploratory` already is this distinction" — is now testable rather
than merely asserted. What S-8 did **not** do is exercise a *transition*:
nothing in it promotes an exploratory claim to confirmatory, so whether
standing is conferred by an act (rows G, K, R are one question) is exactly as
open as it was. Story 18 remains the probe, and K stays `open` with story 18 as
its only unbuilt owner.

**S-18: resolved, and the row's original line was right — but incomplete.**
"`exploratory` already is this distinction" was true about the *state* and said
nothing about the *transition* or about any reader that respects it, which is
where the whole verdict turned out to live. `Claim.kind` had exactly one reader
(`confirmatoryResultsBehind()`, S-7), so a question closed on a lunchtime
notebook sweep landed in `whatIsKnown().established` beside a confirmatory
result — populated, confident and wrong, and story 18's own sentence about
scratch entering the record by accident. Resolved with a reader
(`established` requires promotion; a new `provisional` bucket takes the rest;
`enquiryStatus().restsOn` says which) and one new edge, `PROMOTES` — which the
build predicted would be unnecessary and was refuted by demonstration. See
PJ-023.

### Row L — No execution input lineage

**Scenarios:** S-11 · **Status:** resolved

**Current state (verified):** no `Computation`→`Artefact` "read" edge

**CONFIRMED — resolved.** Added `CONSUMES: Computation → Artefact`. The old route (`ADDRESSES` to the enquiry, then `REQUIRES`) answered "what observations is this enquiry associated with", not "what did this computation consume". Verified false in practice, not in principle: with two analyses on one enquiry over different inputs, "what does this claim rest on" returned both observation sets

### Row M — A review has no analysis to point at

**Scenarios:** S-11 · **Status:** resolved

**Current state (verified):** `EVALUATES: Review→Claim\|Decision\|Evidence`

**CONFIRMED — resolved.** Added `Review → EvidenceUnit`. Endpoint is the inferential activity, not the `Computation` that executed it: what S-11's reviewer criticises is the method, and nothing ran incorrectly. `Review → Computation` may be earned later by a scenario reviewing an *execution*; S-11 did not earn it

### Row N — Claim identity is undefined

**Scenarios:** S-5, S-12 · **Status:** resolved

**Current state (verified):** one `Claim` created per analysis conclusion; queried by `name`

**NEW OPEN QUESTION.** Two analyses concluding the same proposition currently create two claims. Correct if a claim is an assertion *occurrence*; wrong if it is a proposition, in which case one claim should accumulate evidence. Deliberately not fixed — S-5 and S-12 are what should decide it

**S-12: NARROWED, prediction half refuted, still not resolved.** Predicted that duplicate `Claim` nodes would produce the wrong answer and force proposition identity. They did not: every operation keys by proposition, and `withdrawalOf()` requires *every* node asserting a sentence to have been withdrawn before it reports the record as no longer claiming it — so two nodes behave as one. Claim is therefore **operationally a proposition** while being **stored as an occurrence**, and the duplication is redundancy rather than a defect. What would break it is standing (row **R**): two nodes for one sentence, one `exploratory` and one `confirmatory`, gives two answers to "is this confirmatory?". S-12 never creates that, so it is not demonstrated. Row C is the other side — merging by name would conflate two enquiries asserting the same sentence about different scopes

**S-5: RESOLVED.** Identity for reading is a proposition **within a scope**. The node stays an assertion occurrence — duplicates inside one line of enquiry remain harmless and merge on read, exactly as S-12 found; duplicates across lines are two different claims that happen to share wording, and must never merge. That is the distinction S-12 could not draw, because it only ever had one scope **Boundary S-5 did not test, named rather than left implicit:** the scoped `withdrawalOf()`/`reinterpret()` lookups reach a claim through `<-[:SUPPORTS]-` only, so a proposition that exists *solely* as something an analysis concluded against cannot be reinterpreted or read as withdrawn — it reports "nothing on the record claims it". Probably right, since nobody is claiming a sentence they concluded against, but it is untested. `interpretationHistory()` is still keyed by wording alone; it does not need scoping because its distinct-decisions guard already refuses when two scopes narrow to the same words, rather than following whichever came first

### Row O — Withdrawal reason is under-determined

**Scenarios:** S-3, S-7 · **Status:** open

**Current state (verified):** `Review→EvidenceUnit` says *who reviewed*, not *which review caused* an invalidation

> **No scenario currently named would settle this.** Every scenario in
> its row has been built. Under CLAUDE.md's deferral rule that makes it
> unresolved and unowned rather than deferred — recorded here rather than
> left to look like a decision.

**NEW, DEFERRED.** Two shapes of the same gap: with no review the reason is manufactured (row **I** again — probably should be null); with several reviews of one unit the causal one is ambiguous. May want no relationship at all, since it describes *why state changed* rather than *what current state is* — which is what the event history is for. Deferred until the event model is under real pressure

**S-7: prediction held — did not bite.** An amendment names its own cause, so the ambiguity O describes never arose. Still deferred

**S-12: still does not bite.** A reinterpretation mints both the review and the decision that acted on it, so which review caused the change is recorded rather than inferred. Note what this establishes in passing: a review is *not* a retraction — reviews also confirm, and distinguishing them from a free-text verdict would be text-matching. That is why the `Decision` exists at all here

### Row P — `Evidence` carries two senses

**Scenarios:** S-9, S-10, S-12 · **Status:** open

**Current state (verified):** one `EvidenceProps {statement}` for raw measurements and for inferential findings; distinguished only by graph position

**NEW, from cold review (3 of 4 reviewers, independently).** May be correct minimalism — S-11's premise ("observations fine, inference wrong") is expressed structurally and works. But `recordObservations` makes Evidence with no producing `EvidenceUnit`, which PJ-001 defines as impossible, and `whySupported` structurally cannot count an observation as support

**S-10: predicted to fire, and it did not.** The prediction was that a re-run
"under newly specified initial conditions" would force an observation to stand
as evidence — the conditions are a *result* of the new run in a way the model
had no place for. It did not: `reproductionOf()` reads what each run consumed as
**artefacts**, through `CONSUMES`, and never needs the observation's `Evidence`
node at all. The two senses stayed apart without being told to.

Both cold-review claims are still true of the code, verified at `7e36b31`. What
S-10 removes is one of the two routes by which they were expected to become a
wrong answer. The row stays open with S-9 as its only unbuilt owner, and that
scenario — where an artefact's provenance is partly unrecoverable — is now the
one that has to produce it or leave the row where it is

**S-9: it fired, against the prediction made for that build too.** Both S-10's
and S-9's predictions said this row would not move. It moved.

`whatDependsOn()` walked only `Evidence -RECORDED_IN-> Artefact`, which reaches
an analysis **output**. Aimed at an **input** — which is what "what depends on
the unreproducible part?" asks — it returned `claims: []` while still naming the
enquiry: populated, confident, and wrong. The same verb answered one question
two incompatible ways depending on which end of a computation it was pointed at,
and S-11 never noticed because S-11 only ever asks about outputs.

**Resolved in the query, not in the model.** The fix walks the consumer route as
well; no label was split, no property added. That is the outcome this row's own
note allowed for — "may be correct minimalism" — with the correction that the
minimalism was correct about *storage* and wrong about *reading*.

**What is not resolved, and is now recorded rather than carried as a
prediction:** `recordObservations()` still creates `Evidence` with no producing
`EvidenceUnit`, which PJ-001 defines as impossible, and `whySupported()` still
cannot count an observation as support. Three of four cold reviewers flagged
that independently and it remains true. What has changed is that it is no longer
*owned*: three scenarios have now been pointed at it and the harm they found was
a reader's, not a structure's. If it is a defect, something else will have to
demonstrate it

### Row Q — Question and LineOfEnquiry are collapsed by the service layer

**Scenarios:** S-1, S-2, S-13, **S-4** · **Status:** resolved

**Current state (verified):** `pose`/`pursue`/`openEnquiry`; `MOTIVATES` walked in both directions

**RESOLVED by S-4, and now load-bearing beyond closure after S-1.** S-4 showed the split was real: closure attaches to the question, so a closed enquiry went on reporting itself open. That left the two still sharing a name and a lifetime, and this row predicted that "a scenario that sharpens one question into several, or pursues one question two ways, is what would force them apart" — S-1 is that scenario and it did. `pose()` puts a question on the record with no pursuit at all (which is what makes *untested* a state of the record rather than a reader's invention), and `pursue()` opens further lines against a question already held. Identity is the handle throughout: two pursuits worded alike stay one question, two questions worded identically stay two

### Row R — Standing is a birth property, not a transition

**Scenarios:** S-8, S-7, S-18 · **Status:** resolved

**Current state (verified):** `Claim.kind` is hardcoded `"confirmatory"` by the only writer; `exploratory` unreachable through research verbs

**NEW, from cold review (3 of 4).** Ties to rows **G** and **K**: exploratory→confirmatory is plausibly conferred by an event (preregistration, lock, promotion) rather than set at creation. If so G/K/R are one question about how standing changes, not three **RESOLVED by S-7 at the service layer, with the successor question still open.** Predicted as the likeliest wrong answer and it was: with `kind` hardcoded `"confirmatory"`, amending a solver iteration limit reported `nature: "scientific"` and named a convergence diagnosis as a compromised confirmatory result — a false p-hacking alarm, populated and confident. `Conclusion.standing` now defaults to **exploratory**, which makes `exploratory` reachable for the first time and requires confirmatory standing to be claimed deliberately. What S-7 does *not* settle is whether standing should be **conferred by an act** rather than declared at creation; it does rule out the naive gate-conferred model, since S-17 established that declaring a gate does not satisfy it, so a claim behind an unevaluated confirmatory gate would read exploratory and the scientific amendment would go undetected

**S-18: the successor question answered — both, and the discriminator is
foresight.** The prediction recorded before the build was "standing becomes
conferred by an act", and it is **half refuted**. `promote()` confers it, but
declaring at creation was not removed and should not be: declaring *before the
run* is what prespecification is, and it is the thing a locked design locks
(S-7). Declaring it *afterwards* is the p-hacking that lock exists to prevent,
and no path allows it. So the two are not competing spellings of one mechanism —
they are separated by whether the standing was knowable in advance, and work
that could not have declared it pays for the lateness with a recorded reason. A
reader can tell them apart: `whySupported().promotedBecause` is present only for
the conferred kind. G/K/R were indeed one question; the answer is a disjunction,
not a winner.

### Row S — No agent, person or role exists in the model

**Scenarios:** S-8 · **Status:** open

**Current state (verified):** no node label, no property, anywhere

**NEW, from cold review.** S-8's Afterward asks "who approved the scale-up, and on what projected cost?" — unanswerable. May legitimately be external metadata rather than domain; S-8 decides

**S-8: deliberately not probed, which is a decision rather than an
oversight.** S-8 was this row's only named scenario and its Afterward list
includes "who approved the scale-up?". LabKit has no concept of user identity,
and that is a standing decision: it is a cross-cutting infrastructure,
persistence and API concern rather than a domain one, and every "who" waits
until the domain model is complete and consolidated. The scenario records the
bullet as out of scope with its reason instead of asserting an empty answer,
because an Afterward question quietly left untested is the S-17 shape applied
to our own corpus. The *other* half of the same bullet — "on what projected
cost" — needed nothing new: a cost projection is a finding with provenance like
any other. This row therefore has no owner again until identity work begins.

### Row T — Edges cannot carry properties

**Scenarios:** S-7, row O · **Status:** open

**Current state (verified):** `createEdge(from, edge, to)` is the whole write API; idempotency is `UNIQUE (start_id, end_id)`

> **No scenario currently named would settle this.** Every scenario in
> its row has been built. Under CLAUDE.md's deferral rule that makes it
> unresolved and unowned rather than deferred — recorded here rather than
> left to look like a decision.

**NEW, from cold review.** "When was this drawn", "by whom", "which review caused this" have no home and cannot be added without reifying to a node or breaking the uniqueness contract. An early commitment made for a good reason (the pglite-age `MERGE` defect) whose cost was never separately weighed

**S-7: prediction held — no pressure.** The amendment `Decision` is the reification; reason, evidence and order all have a node to live on. Untested still

### Row U — A gate records no condition until it is evaluated

**Scenarios:** S-17 · **Status:** resolved

**Current state (verified):** only path `Criterion`→`Gate` ran via `CriterionEvaluation`; `GateProps` is `{consequence}`

**CONFIRMED — resolved.** Added `GOVERNS: Criterion → Gate`. PJ-004 #9's chain correctly stops anything flowing out of an untriggered gate, but it also made the governing criterion reachable *only* through an evaluation — so a declared-but-unevaluated gate, which is exactly S-17's subject, recorded no condition at all. Demonstrated: `criterionGoverning()` returned null, so the reviewer's demand ("show me it fails when the artefact is wrong") could not be aimed at anything

### Row V — Criteria gate work but do not qualify findings

**Scenarios:** S-3, S-8, S-3b · **Status:** resolved (argued)

**Current state (verified):** `Criterion -GOVERNS-> Gate -GATES-> Task\|Computation`; nothing connects a criterion to the analysis it qualifies

**NEW, CONFIRMED, deliberately unresolved.** Demonstrated wrong answer: with two prespecified robustness checks failed, `whySupported()` still reports the finding `supported: true` — "some evidence exists" rather than "the evidence holds up by its own prespecified standard". Two plausible models and S-3 does **not** discriminate, because its criteria do both jobs at once: (a) `Criterion -QUALIFIES-> EvidenceUnit`, or (b) extend `GATES` so a gate can gate a `Claim`'s standing. A scenario where criteria qualify a finding but gate nothing — or the reverse — would decide it

**S-8: half-discriminated, exactly as predicted, and still open.** S-8's
criteria gate expensive work and qualify no finding — the reverse case row V
asked for. It establishes that the two jobs are **separable**: promoting work
through a gate leaves the standing of every finding involved untouched
(asserted directly), and `GATES` is fully occupied with control semantics,
which is an argument against extending it to `Claim` (model b). But an argument
is not this project's bar. S-8 produces no wrong answer on the qualification
side, so it cannot select model (a) either. **What remains named:** a scenario
where criteria qualify a finding and gate nothing. Until one exists row V stays
the one confirmed wrong answer shipping green, and under CLAUDE.md's deferral
rule that makes clearing it the next thing built.

**S-3b: RESOLVED, model (a), and the wrong answer flipped in the test that
recorded it.** S-3b is S-3's conversation with the tertiary model taken away —
the same agreed checks, the same significant result, nothing downstream — so
qualification is the only job left. `QUALIFIES: Criterion → EvidenceUnit`,
written by `recordAnalysis({ heldTo })` and read by `whySupported()`, which now
itemises the standard and reports `supported: false` when it is unmet.

Two things the scenario decided rather than assumed. The **endpoint** is the
evidence unit because a prespecified check is agreed about a *run* — "the checks
we agreed before running it" — and the discriminating case (one analysis whose
conclusions are held to different standards) does not exist anywhere in the
corpus; that is named here so the choice can be revisited on evidence. The
**write moment** is not a choice at all: a check nobody ran must still count
against the finding, so the edge cannot be minted by evaluation, which is what
an earlier reading of row V's model (a) would have done.

What the scenario does **not** do is mechanically refute model (b) — predicted,
and it held. Under (b) the fix is a gate on a claim's standing, which is what
the phantom gate this scenario had to mint would have become. Model (b) is
closed by S-8 rather than by S-3b: `GATES` is fully occupied with control
semantics, and giving one edge two readings is PJ-012 §1's shape. That is the
ledger deciding, and it is worth saying plainly, because a row cleared by
argument is weaker than one cleared by demonstration and should not be filed as
though it were the same thing.

### Row W — An evaluation record is not evidence of evaluation

**Scenarios:** S-17, S-3, S-8 · **Status:** resolved

**Current state (verified):** `CriterionEvaluation {value, outcome}` can be minted directly; `BASED_ON: CriterionEvaluation → Evidence` exists and is never written

**NEW, DEFERRED.** S-17's motivating failure was a guard that *looked* implemented but had never demonstrated the required behaviour. Recording `outcome: "fail"` with no provenance for how that was reached risks recreating exactly that gap one level up. Two propositions hide here: "the criterion was recorded as failing" and "the criterion was exercised against evidence and failed." A later scenario should say whether an evaluation is itself sufficient durable evidence, or needs provenance through Evidence/EvidenceUnit/Computation

**S-8: RESOLVED, and the declared edge finally walked.** `BASED_ON:
CriterionEvaluation → Evidence` had been declared since PJ-004 and never
written. Demonstrated wrong answer, captured before the fix: with one condition
established by a real throughput measurement and another asserted as "looked
fine", `gateStatus()` returned **identical** evaluation records for both — the
same identical-objects-for-distinct-states shape rows I and R were fixed for,
and precisely the "promoted by explicit evidence rather than agent enthusiasm"
distinction S-8 exists to make. `evaluateCriterion()` now takes an optional
`citing: ConclusionRef`, validated the same way `closeEnquiry()` and
`amendDesign()` validate theirs, and `EvaluationRecord.basis` reads it back.
Verified load-bearing by deleting the write. Note what is *not* claimed: an
uncited evaluation is still permitted, because a condition can legitimately be
checked by inspection — the point is that the record says which happened.

### Row X — "Failure sticks" is S-3 policy applied to every gate

**Scenarios:** S-3, S-17, S-3b, **S-3c** · **Status:** resolved

**Current state (verified):** `gateStatus()` treats any failing evaluation as permanently decisive

> **Owned, then cleared, in one sitting.** This row spent four scenarios
> unowned — every named scenario built, nothing that would settle it — then
> gained S-3c as a discriminator and was closed by it the same day. The history
> is kept because "unowned for four scenarios" is a fact about how long the
> model went without a probe for this, and the speed of the close once one
> existed is a fact about what was actually missing: a scenario, not a model.

**NEW, DEFERRED.** S-3 earns "re-running a robustness test until green must not erase the earlier failure". It does not earn "any failure blocks every gate forever", which is what is implemented. For S-17's hash check — artefact corrupted, criterion fails, artefact repaired, criterion passes — a permanent block is plausibly wrong. There may eventually be four distinct things here: historical failure evidence, current gate satisfaction, admissible re-evaluation, and superseded evaluation

**S-3b: unchanged in kind, larger in blast radius, and now the likeliest next
row to produce a demonstrated wrong answer.** The same decisive-failure rule
that blocks work now also disqualifies a finding, permanently: a check that
failed and was then re-run correctly after a coding error *in the check* leaves
the finding not standing forever. That is a more sympathetic case than
re-running until green, and it is the same rule. Still not demonstrated, and
still nothing in the corpus names the scenario that would settle it — so it
stays unresolved and unowned, exactly as its own note above says

**S-3c — the discriminator, specified and not yet built.** Proposed by external
review, and taken over S-13 as the next build: S-13 revisits productive ground
(question lineage, closure stability, act->product), whereas X attacks a live
global policy already known to have spread from gate *control* into epistemic
*standing*. The shipped rule is

```text
any historical failure -> criterion stays failed -> gate stays blocked
                       -> qualified finding stays disqualified
```

while S-3 earned only *do not let someone re-run the same robustness check until
they happen to obtain green*.

Construct two cases **indistinguishable to the current gate logic**:

1. an honestly failed robustness check, re-run unchanged until it passes;
2. a failed evaluation later shown to come from a defect **in the check
   itself**, followed by a corrected evaluation.

(1) must remain failed. (2) may legitimately supersede the earlier evaluation.
**Do not pre-add** evaluation supersession, timestamps, status fields or a new
node. Afterward: what is the criterion's current standing; which historical
evaluations remain readable; why is one later pass admissible and the other not;
does correcting the evaluation restore only the affected gate and finding; can
LabKit reconstruct that distinction from existing state? The target is row X,
**not a generic retry mechanism** — if the two cases stay indistinguishable,
demonstrate the wrong answer first.

Two things this brief does not settle. The name `S-3c` is a provisional handle,
not a claim of corpus membership: like S-3b it would be **authored rather than
mined**, and PJ-016's precedent for that is the most contested decision in the
arc — whoever builds this has to face that question rather than inherit it.
And a specified discriminator is not a built one; X is owned, not resolved

**S-3c: built, demonstrated, resolved.** The wrong answer was confidently
wrong, which is what this row had never managed to show: with a robustness
check reviewed, replaced and re-run correctly, `whySupported()` returned
`supported: false` and `gateStatus()` returned `blocked` — populated, plausible,
and about a finding nothing was wrong with. Indistinguishable from re-rolling
the dice, which is the one case S-3 existed to prevent.

The narrowing is one clause: a verdict decides its check only if it still
stands, and a verdict whose entire basis has been withdrawn does not. It stays
in `evaluations`, marked `withdrawn`, because erasing it would leave no record
of why the finding was ever in doubt.

**Verified in both directions, which is what makes it a narrowing rather than a
removal.** Delete the filter and exactly the three defective-check assertions
fail. Widen it to "the last verdict wins" and S-3's own two tests fail with it.
The rule is as narrow as it has to be, and the second check is the one that
matters — a fix that cleared this case while also clearing S-3's would have
looked green on this scenario alone.

*What it did not need:* no new node label, no new edge, no migration, no new
verb. Three consecutive scenarios have now moved nothing in `NODE_TYPES`.

*The authored-versus-mined question is still open.* S-3c is the second authored
scenario and nothing here settles PJ-016's precedent; it is now a pattern rather
than an exception, which raises the stakes on that question rather than
answering it

### Row Y — Closure without a cited result is classified by whether anyone worked on it

**Scenarios:** **S-1**, **S-14** · **Status:** boundary (accepted half settled)

**Current state (verified):** `whatIsKnown()` buckets an abandoned question under `unresolved` if anything ever addressed it, and a deferred one under `untested` if nothing did

**NEW, KNOWN BOUNDARY, deliberately not fixed.** S-1 needs three states and gets them from structure — resolved-on-cited-evidence, worked-on, never-touched. It never poses a question that was abandoned or deferred, so it has no standing to say where those belong, and inventing a fourth and fifth list to hold cases the scenario never exercised is how the survey stops being derived. Row J already owns the deferred-vs-accepted distinction; S-14 should decide both together

**S-14: half of it settled, and the half that remains is still a boundary
rather than a defect.** An **accepted** question is no longer classified by
whether anyone worked on it — it has its own `accepted` bucket, written by
`acceptAsUnresolved()`, and the survey reaches it through the deciding act
rather than through activity. An **abandoned** one still is: `closeEnquiry()`
with nothing cited reports `abandoned`, and `whatIsKnown()` still places it by
whether an `EvidenceUnit` ever addressed the enquiry. S-14 asserts that
directly, as the contrast that gives accepting its meaning, so the remaining
half is exercised rather than merely unvisited. It stays `boundary` on the same
grounds as before: no scenario has yet wanted an abandoned question to sit
anywhere in particular, and a fifth bucket built for nobody is the ceremony
S-14 itself declined a field over. *(This verdict was written two builds late —
the `°` on S-14 was cleared here rather than when S-14 was built, which is the
staleness the legend above warns about, happening to the person who wrote it.)*

### Row Z — Chronology exists for evidence but not for status

**Scenarios:** **S-1**, S-7, the consumer probe · **Status:** resolved

**Current state (verified):** `Decision` has no time property; the sharpening snapshot (`BASED_ON`) freezes *findings* only

> **No scenario currently named would settle this.** Every scenario in
> its row has been built. Under CLAUDE.md's deferral rule that makes it
> unresolved and unowned rather than deferred — recorded here rather than
> left to look like a decision.

**NEW, CHARACTERISED, no change earned.** S-1's hardest Afterward question — what was known when this question was sharpened, asked after later evidence arrived — is answered from durable state, with an empty event log open beside it, because `sharpen()` freezes the standing findings onto the decision when the act is recorded. What that cannot reconstruct is the *survey*: whether a given question was established at that moment needs an ordering between two `Decision`s, and there is none. Natural ids happen to be allocated in order, which is an accident of the sequence and not a modelled fact — CLAUDE.md already forbids reading meaning into their values. So the temporal seam took real pressure and held at the level S-1 asked about; the level above it is a real gap that S-7 (post-lock amendment) is better placed to price, and neither a durable event sink nor a `decided_at` property is earned by a question nobody has yet been unable to answer

**S-7: narrowed, as predicted, and the distinction is the result.** In-chain order is structural — `SUPERSEDES` alone orders two amendments to one design, with no timestamp, an empty event log, and natural-id order never consulted. Two decisions on *different* designs remain unordered, and S-7 includes an unrelated sharpening precisely to show that the answer covers one class of history and not chronology in general. Not a partial fix: a smaller true claim

**RESOLVED by the consumer probe (2026-08-21), on this row's own stated
condition.** The entry above ended *"neither a durable event sink nor a
`decided_at` property is earned by a question nobody has yet been unable to
answer."* Someone was then unable to answer it: three cold designers required
historical ordering independently (cluster 21, in three vocabularies), and the
vertical slice demonstrated it against running code. The second time a condition
recorded deep in a document has fired and had to be noticed by a re-reader; row K
was the first.

The change bar was walked rather than skipped. **Rung 1 was built and shown to
fail twice** — a closure with no prespecified check has no temporal anchor at all,
and even with checks on both, two programmes closing sixty days apart in opposite
orders produce identical bounds, because the bound records when the evidence was
*checked* rather than when the question was *settled*. **Rung 2 was declined by
argument** — sequence is a property of each act, not a relation between two — and
that is the weaker move, recorded as such. **Rung 3 is one property**:
`Decision.decided_at`, required, six creation sites, no migration.

It is **record time, not belief time**, and the property says so — a single
timestamp otherwise looks like a fix while silently choosing a reading, which
PJ-024's successor documents warned about. Bitemporality stays a candidate
extension: real, unrepresentable, and required by no source obligation.

What is **not** closed, and is now precisely stated: `EvidenceUnit` carries no
instant, so worked-on and untouched cannot be told apart as-of. `whatWasKnown()`
collapses them into `open` rather than splitting them by reading today's evidence
units. If that split is ever needed, `EvidenceUnit` is where the instant goes,
and it should be earned the same way. See `docs/consumer-contract/025` and `026`.

### Row AA — `BASED_ON` carries two senses

**Scenarios:** **S-1**, S-7, S-12 · **Status:** boundary

**Current state (verified):** `closeEnquiry()` writes the one cited finding; `sharpen()` writes every standing finding

> **No scenario currently named would settle this.** Every scenario in
> its row has been built. Under CLAUDE.md's deferral rule that makes it
> unresolved and unowned rather than deferred — recorded here rather than
> left to look like a decision.

**NEW, BOUNDARY LOGGED, deliberately not changed.** "This evidence informed this decision" and "this is what was known when the decision was taken" are different claims, and the same edge now expresses both. S-1 cannot separate them, because the sharpening genuinely was taken in light of everything known — the two sets coincide, which is exactly why the overload is invisible here. What would discriminate: a decision taken on a *specific* subset while other findings stood unconsidered. If that shows the snapshot reading manufacturing a rationale the researcher never had, the contemporaneous set needs its own edge and `BASED_ON` goes back to meaning what it says

**S-7: live, characterised, not fixed.** Both senses now have real writers — `amendDesign()` cites one diagnosis specifically, `sharpen()` snapshots everything standing. No mechanical collision: the readers pin different edges. The boundary stands as written

### Row AB — A consequential act records what it acted **on**, not what it brought into existence

**Scenarios:** **S-1**, **S-7**, S-12, **S-3c** · **Status:** resolved

**Current state (verified):** `sharpen()` wrote `NARROWS` to the original question; `amendDesign()` wrote `CHANGES` to the replaced condition

**NEW, CROSS-SCENARIO, established as a failure shape rather than a relationship.** Two unrelated scenarios exposed the same structural omission, in regions that share no labels. S-1 found it in question sharpening, S-7 in design amendment. **The remedies differed**, which is the interesting part: S-1 needed `Decision -MOTIVATES-> Question`, because the reason and the frozen evidence live on the decision and nothing else could reach them; S-7 needed nothing, because the amended product is recoverable from the `SUPERSEDES` chain and the criteria governing the gate. That argues *against* a generic act-produces-thing relationship for decisions. Treat act→product as a **review heuristic** — a question to ask of every new verb that mints something — not as a domain relationship

**S-12: third instance, and the prediction that S-7's remedy transfers was REFUTED.** S-7 needed no act→product edge because a gate contains its design conditions, so the current one is derivable as the unchanged member. An interpretation has no container, so from a narrowed claim there was no route back to the act that narrowed it, and `MOTIVATES: Decision → Claim` was earned. Three instances, three different resolutions — one new edge, one derivation, one new edge again. The shape recurs; the remedy does not generalise, which is still the argument against a blanket rule

**S-3c: fourth instance, first one that blocks a scenario outright.** The three
before it degraded an answer — a query returned something wrong or something
less than it could have. This one stopped the conversation: `replaceAnalysis()`
recorded what it replaced and what that cost, and returned no handle on the
analysis it had just created, so a researcher who corrects a defective check
cannot then cite the correction. The scenario could not be written without
fixing it.

The remedy is the smallest of the four — a field on the return type, no edge,
no derivation — which is the heuristic behaving exactly as row AB says it
should. Four instances, four different remedies, still no relationship. What
the fourth adds is a sharper trigger for the review question: **ask it of a
verb's return type, not only of its writes.** `replaceAnalysis()` wrote the
replacement into the graph correctly; what it withheld was the reference

### Row AC — A withdrawn interpretation has no way back

**Scenarios:** **S-12** · **Status:** resolved

**Current state (verified):** `recordAnalysis()` refuses to conclude a proposition the record has withdrawn

**NEW, from review of the finished scenario, and a real wrong answer before it was guarded.** `withdrawalOf()` reports a sentence withdrawn only when *every* node asserting it has been changed, so a colleague who had not read the review could record an analysis concluding it again and the record would silently un-retract itself — objection still standing, `withdrawn` back to `false`, `replacedBy` gone. Demonstrated before fixing. Now refused, on the same principle as S-7's design fork: a command that declines beats state that reads back wrong. What that leaves missing is the legitimate case — new evidence genuinely re-opening a settled reading — which needs a **deliberate** verb rather than a side effect of recording work. Not built, because S-12 does not contain one **S-5 found this guard had the same defect it was fixing.** `recordAnalysis()`'s withdrawal check was unscoped, so a sentence withdrawn in one line of enquiry would have blocked legitimate work concluding the same words in another. Now scoped to the enquiry being recorded


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

*Follow-ups, from review of the finished scenario:* amending a setting that
had *already* been amended was accepted and forked the design — two conditions
in force at once, and a history that threw on read. Refused at the write
instead, because state that cannot be read back is the one outcome with nothing
to recommend it. `designHistory()` now also refuses to render a history whose
amendments do not form one chain, rather than silently dropping the ones it
cannot reach; an audit trail that quietly omits an entry is worse than one that
declines. Both verified by removing the guard.

*Held:* mechanical-vs-scientific is not derivable from the shape of the cited
evidence — a diagnosis carries `SUPPORTS` like any finding — but is derivable
from what the amendment *changes*: it is scientific exactly when a confirmatory
result stands in its blast radius. Nobody can set it.

### S-12 predictions, recorded before the build

Recorded 2026-08-19, before the scenario existed. S-12 is the first probe of
what a `Claim` actually *is*, which is the least settled part of the noun
inventory after six scenarios in which the rest of it has held.

| Row / question | Prediction |
| --- | --- |
| B — supersession is decision-only | **Resolves as "claim-level supersession is not real."** S-7 built the machinery: a decision that `CHANGES` the thing it replaces, chained to the previous decision by `SUPERSEDES`, with the current version derived as the one nothing changed. Expect that shape to transfer from a design condition to an interpretation, needing one endpoint pair (`CHANGES: Decision → Claim`) and no `Claim → Claim` edge |
| N — claim identity undefined | **The demonstrated wrong answer, and the point of the scenario.** Two analyses concluding one proposition mint two `Claim` nodes today, while `whySupported()` matches by `name` and so silently treats them as one. Withdraw one and the other still stands: "what does the record claim now" returns the retracted interpretation. Expect a service-layer fix — reuse the existing node for a proposition already asserted — and expect it to sit uneasily against row **C**, since two enquiries asserting the same sentence about different scopes would then share a claim |
| O — withdrawal reason under-determined | Does not bite. The reinterpretation names the review that caused it. Still deferred |
| act→product (row AB) | **No new edge.** Predicting S-7's remedy transfers: the narrower interpretation is recoverable as the claim no decision has changed, exactly as the current design condition is. If that fails, row AB gets a third instance and starts to look like a relationship after all |
| does this require recomputation? | **No, and demonstrably.** Nothing invalidated, no artefact touched, and the observations still reachable underneath the narrower claim. This is the assertion that keeps reinterpretation from quietly becoming `replaceAnalysis` |
| what downstream depends on the old interpretation? | **Answerable, not empty.** `Decision -BASED_ON-> Evidence -SUPPORTS-> Claim` already exists, so a question closed on the old reading is reachable. Expect that to be the enumerable answer, and expect it to be a genuinely different answer from S-11's, which was about invalidated inputs |

**Outcomes.** The wrong answer was where it was predicted to be, but not for
the predicted reason. With the reinterpretation recorded as a `Review` only,
`whySupported()` went on reporting the retracted sentence as **supported** —
the record confidently asserting something the reviewer had just withdrawn.
Fixed with two endpoint pairs and no new label: `CHANGES: Decision → Claim`
says which reading was withdrawn, `MOTIVATES: Decision → Claim` says which
replaced it. Both verified load-bearing by deletion; each takes three tests
down.

*Refuted:* duplicate `Claim` nodes were predicted to be the thing that broke.
They were not — see row N. And S-7's `SUPERSEDES` machinery was predicted to
transfer; it did not, and writing it here would have produced an edge with no
reader.

*Tension worth naming:* `MOTIVATES` now carries three pairs — `Question →
LineOfEnquiry`, `Decision → Question` (S-1), `Decision → Claim` (S-12). The
first widening was defended on capability grounds and the second on the same,
but three pairs is the point at which "gave rise to" starts becoming the
generic act→product edge that row AB argues against as a blanket rule. The
tension is real: row AB says the *remedy* does not generalise, while
`MOTIVATES` is generalising anyway. A fourth pair should have to argue against
this paragraph.

*New state, not a new label:* `withdrawn` joins `supported` and `challenged` in
`SupportExplanation`. Three distinct things — nobody asserts this any more,
evidence bears against this, and nothing supports this — and S-12 asserts all
three separately, because a narrowing where no measurement contradicted
anything must not read as a refutation. `support` stays populated under a
withdrawn reading: the findings were always fine, and blanking them would say
the numbers had gone wrong, which is the one thing this scenario exists to
deny.

### S-5 predictions, recorded before the build

Recorded 2026-08-19. PJ-008 called S-5 "the one most likely to force a real
model change". The prediction is the opposite: **no schema change at all**,
and the damage is in the service layer's addressing scheme rather than the
graph.

| Row / question | Prediction |
| --- | --- |
| C — a claim has no endpoint or scope | **No-change route holds.** Scope is already reachable: `Claim <-SUPPORTS- Evidence <-PRODUCES- EvidenceUnit -ADDRESSES-> LineOfEnquiry <-MOTIVATES- Question`. Every edge on that path exists and is already walked by something. Expect scope to be *derived* and no property added to `Claim` |
| N — proposition identity vs assertion occurrence | **Resolves.** Identity for reading is proposition **within a scope**, not proposition alone and not the node. Duplicate nodes inside one scope stay harmless, exactly as S-12 found; duplicates *across* scopes are two different claims that happen to share wording. The node remains an assertion occurrence |
| the S-12 revision path | **The demonstrated wrong answer, and the serious one.** `reinterpret()`, `withdrawalOf()`, `whySupported()` and `interpretationHistory()` are all keyed by proposition **text**. Two enquiries asserting the same sentence about different endpoints means withdrawing one interpretation silently retracts the other, in an unrelated line of work, with no decision saying so. That is worse than the S-12 bug it descends from |
| what the fix looks like | Not a new signature everywhere. Text is the right handle when a sentence is asserted in one scope, which is the common case and every prior scenario. Expect: accept a `ConclusionRef` where the caller can name one, and **refuse** — not guess — when a bare proposition is ambiguous across scopes. Same principle as S-7's fork guard: a command that declines beats state that reads back wrong |
| do these findings conflict? | Derived from scope plus bearing, never from wording. Same scope + opposing bearings = contradiction; different scope = dissociation whatever the sentences say |

**Outcomes.** Every prediction held, including the headline one: **no schema
change**. §2's own expressibility note called S-5 "the one most likely to force
a real model change" and it forced none — the graph already carried scope, and
what was wrong was the service layer's addressing scheme.

The wrong answer was worse than predicted. With two lines of enquiry asserting
the same sentence about different endpoints, `whySupported()` did not merely
merge them: it reported one claim **simultaneously supported and challenged**,
resting on only one side's observations, when each claim separately had a
clean, uncontested answer. And `reinterpret()` withdrew both — an unrelated
line of work silently retracted, with no decision anywhere saying so. Both
captured against the shipped code before anything was changed.

The fix is a resolution step, not a new signature everywhere: text remains the
handle while a sentence is asserted once, which is the ordinary case and every
scenario before this one. When it is asserted twice, LabKit **refuses and says
how many**, rather than picking. Same principle as S-7's design fork — a
command that declines beats an answer about something the caller did not mean.

*Found in passing:* S-12's re-assertion guard had the very defect S-5 is about.
See row AC.

*Three leaks survived the first sweep, and one of them was S-5's own defect
inside S-5's own fix.* `decidedOnTheStrengthOf()` was still keyed on wording
alone, so a question closed in one line of enquiry was reported as resting on
an identically worded reading in another. It was invisible to the scenario as
first written, because nothing there ever closed a question — the field was
empty whether or not the bug was present. Fixed, both bearings, with a test
that builds the closure. Two smaller ones with it: the `recordAnalysis`
withdrawal guard had no covering test at all, so scoping it could have been
reverted silently; and a `ConclusionRef` was accepted without checking the
cited analysis had concluded that proposition, which resolved to the right
scope and then answered about a different analysis's claim.

### S-8 predictions, recorded before the build

Recorded 2026-08-19. S-8 is the *reverse* of row V: criteria that gate work
and qualify no finding. The honest expectation is that it **narrows row V
rather than settling it**.

| Row / question | Prediction |
| --- | --- |
| V — criteria gate work but do not qualify findings | **Half-discriminated, not settled.** S-8's criteria gate expensive work and qualify nothing, which shows the two jobs are *separable* and that `GATES` is fully occupied with control semantics — an argument against extending it to `Claim` (model b). It produces no wrong answer on the qualification side, so by this project's own bar it cannot select model (a) either. Expect row V to keep status `open` with what remains named: a scenario where criteria qualify a finding and gate nothing |
| W — an evaluation record is not evidence of evaluation | **S-8 owns this, and it is the likeliest thing to be earned.** `BASED_ON: CriterionEvaluation → Evidence` is declared in `EDGE_SCHEMA` and has never been written — the same shape `SUPERSEDES` and `IMPLEMENTS` were in before S-7. S-8's story is explicitly *"promoted by explicit evidence rather than agent enthusiasm"*, so the feasibility step should produce a real analysis and the throughput evaluation should cite its conclusion. Predicted wrong answer: without it, an evidence-backed promotion and a bare assertion return **identical** records — the same identical-objects-for-distinct-states shape rows I and R were fixed for. Wire the reader in the same commit, and demonstrate by deletion in the right order this time |
| `incomplete` — the gate state no test forced | **Earned at last, or the flag stands.** PJ-012 flagged it against itself, PJ-013 kept it flagged, PJ-015 repeated it. S-8 creates it naturally: an advancement gate governed by throughput *and* solver-health, one evaluated pass, the other never run. That is "why can't the full run start?" answered by machinery that already exists. If it lands, clear the flag in PJ-015's judgment calls rather than leaving it flagged out of habit |
| "what is this task allowed to touch?" | **Recordable, not enforceable.** `TaskProps.inputs`/`outputs` exist and are hardcoded `""` by `planWork()` — another declared-but-unwalked structure. Recording the contract is a service-layer parameter on existing fields, zero schema change. *Enforcing* it is the advisory boundary the story's own expressibility note concedes, and S-8 should record that rather than pretend otherwise |
| "who approved the scale-up?" | **Out of scope by policy, not skipped.** LabKit has no user identity, deliberately: it is a cross-cutting infrastructure, persistence and API concern, and every "who" waits until the domain model is consolidated. S-8 does not probe it and does not assert an empty answer; it records the bullet as a standing decision with its reason. The *"on what projected cost"* half is different — a cost projection is a finding, and a decision resting on it is `BASED_ON`. Probe that half |
| the rest of the chain | The evaluation→gate→computation chain is expected sufficient. No new node label, no migration |

**Outcomes.** Every prediction held, including the deliberately unglamorous
headline: **S-8 narrows row V and does not settle it.** The two jobs are shown
separable — gating work leaves every finding's standing untouched — and that is
an argument against model (b), not a demonstration. Row V stays open with its
remaining probe named.

The catch was where it was predicted: **row W**, resolved. See that row.

*`incomplete` is earned.* PJ-012 flagged it against itself — "the one gate
state no test forced. I reasoned it should exist. By this project's own bar
that is a weaker warrant than everything around it" — and PJ-013 and PJ-015
kept the flag. S-8's advancement gate is governed by throughput *and* solver
health; the feasibility step establishes the first and nothing has run the
second, so "why can't the full run start?" is answered by a state that now has
a scenario behind it rather than an argument. The flag is cleared.

*Two more declared-but-unwalked structures got their first walk.*
`TaskProps.inputs` had been hardcoded `""` by `planWork()` since it was
written; it now carries the task contract. The contract is deliberately
**closed-world** — `mayRead` is the whole of it, and "the official test data is
not accessible to this task" is answered from an absence rather than from a
second list nobody could keep complete. It is also explicitly **advisory**:
`TaskContract.enforced` is `false` and says so, because nothing in LabKit stops
a process reading whatever it likes, and the story's own expressibility note
conceded exactly this. A scenario that implied otherwise would be describing a
guarantee the system cannot give.

*One bullet was declined rather than answered* — see row S.

---

### S-3b — the same design with nothing downstream

Authored 2026-08-19, from **story 3**, and deliberately not from §2. Ledger row
**V** names the probe that would settle it: *a scenario where criteria qualify
a finding and gate nothing*. S-8 supplied the reverse case and, exactly as
predicted, could only narrow the row. §1 and §2 are held at their original
wording, so this scenario lives here in §3's living part, with its provenance
stated plainly: it is S-3's conversation with the tertiary model taken away.
Nothing else changes — the same prespecified checks, the same significant
primary result, the same robustness check that disagrees. Removing the second
of the two jobs S-3's criteria do at once is the whole experiment.

**Conversation.**

> **Agent:** T vs rewired is Holm-significant under the primary test.
> **Researcher:** And the checks we agreed before running it?
> **Agent:** Median aggregation is non-significant. Seed stability was never
> run.
> **Researcher:** Nothing is waiting on this — there's no further model to
> fit. I only want to know whether the finding stands.
> **LabKit:** Not by the standard you set for it. One agreed check disagrees,
> one was never performed, and the significant result is what they were agreed
> about.

**Afterward — LabKit must answer:**

- *Does the finding stand?* → no — and specifically not because evidence is
  missing. The evidence exists, says what it always said, and fails the
  standard it was held to.
- *By what standard?* → the prespecified checks, itemised, with the
  disagreeing one distinguishable from the one never run. S-3's third
  Afterward bullet, asked of the finding instead of the work.
- *What is waiting on those checks?* → nothing. The answer must say nothing
  rather than name work that does not exist.
- *Are the numbers still good?* → yes. Disqualified is not withdrawn, which is
  S-12's distinction: the primary result is still evidence, still supports what
  it supports, and nothing about it has been retracted.

**Expressibility.** The agreed checks cannot be recorded at all without first
declaring a gate, because a gate is the only thing `evaluateCriterion()` will
attach a verdict to. Whether that is a defect or the model correctly insisting
that a standard is a control object is what this scenario exists to decide.

### S-3b predictions, recorded before the build

Recorded 2026-08-19. Row V has been the one confirmed wrong answer shipping
green since S-3, and CLAUDE.md's deferral rule makes clearing it the next thing
built. Unlike S-8, this scenario is expected to **settle the row or refute the
attempt** — there is no half available, because the qualification job is now
the only job left in the scenario.

| Row / question | Prediction |
| --- | --- |
| V — criteria gate work but do not qualify findings | **Settled, model (a).** The demonstration is a *pair* of wrong answers, both measured against today's code before this was written, using a gate declared with nothing to protect: `gateStatus()` returns `state: "blocked"` with `gating: []` — blocked, naming nothing blocked — and `whySupported()` returns `supported: true` for a finding one of whose own prespecified checks failed against it. Expect the fix to be (a)-shaped: a relationship from the criterion to the thing it qualifies |
| what this scenario does *not* do | **It does not mechanically refute model (b)**, and the write-up must say so. Under (b) the fix is a gate on a claim's standing, which is exactly what the phantom gate above would become. What closes (b) is this scenario *plus* S-8: `GATES` is already fully occupied with control semantics, and giving one edge two readings is the "two things treated as one" shape PJ-012 §1 names as the source of every expensive mistake in this project. That is the ledger deciding, not the demonstration |
| the endpoint of the new relationship | **Deliberately not predicted.** Row V wrote model (a) as `Criterion -QUALIFIES-> EvidenceUnit`, which was recorded before S-5 derived claim scope by traversal. `EvidenceUnit`, `Evidence` and `Claim` are all live candidates; the Afterward bullets should pick, and whichever endpoint answers "does the finding stand?" without introducing a second identity rule is the right one. Naming it here would be the self-fulfilling refactor §3's judgment calls warn about |
| the API shape | **Also deliberately not predicted.** Recording a qualification-only check either makes `gate` optional on `evaluateCriterion()` or earns its own verb. Expect the choice to be forced by whether `gateStatus()` stays coherent for a gate that gates nothing — if it does not, that is itself the argument that the gate should never have been there |
| X — "failure sticks" is S-3 policy applied to every gate | **Bites harder, and still not settled.** In S-3 a stuck failure blocks work someone can re-run; qualification makes it mark a finding as not standing permanently, and "the median check was re-run after a coding error in the check itself" is a far more sympathetic case than re-running until green. Expect to record that and leave it, since clearing V is what licenses shipping anything at all here |
| the rest of the chain | No new node label and no migration, consistent with every scenario since S-11. One edge in `EDGE_SCHEMA`, provisioned by reconciliation, with its reader written in the same commit — row W's lesson, applied in the right order this time |

**Outcomes.** Every prediction held. Row **V** is resolved by `QUALIFIES:
Criterion → EvidenceUnit`, and the write-up says out loud that the
demonstration selected model (a) while S-8's argument is what closed model (b)
— see the row. The endpoint and the API shape were both left unpredicted and
both were decided by an Afterward bullet rather than by preference: a check
nobody ran must still count against the finding, which rules out minting the
edge at evaluation time, and "nothing is waiting on this" must be expressible
without a gate, which made `gate` optional on `evaluateCriterion()`.

*The phantom gate was closed rather than tolerated.* `declareGate()` now
refuses a gate protecting nothing, next to its existing refusal of a gate
governed by no condition, so `blocked` with an empty `gating` list is no longer
reachable. That half of the demonstration therefore survives only in prose and
in this ledger — which is the right trade, but it is a trade: the durable
record of the *other* half is S-3's own assertion, flipped from `true` to
`false` by whoever fixed it, exactly as the comment left on it demanded.

*Row X is where the pressure went.* Nothing about "failure sticks" changed, but
its blast radius did: a decisive failure now disqualifies a finding as well as
blocking work. Recorded, not fixed — one confirmed wrong answer at a time, and
this one is not yet demonstrated.

*No new node label, no migration, and one edge with a reader in the same
commit.* The check-itemisation logic is now shared between the two readers, so
a condition cannot report one state through the gate it governs and another
through the finding it qualifies.

### S-3c predictions, recorded before the build

Recorded 2026-08-19, against `d9e1180`, before a line of test or source was
written. S-3c is row X's discriminator (specified under Row X above). The
headline prediction is again **no schema change**: the state that tells the two
cases apart is already in the graph and simply never consulted.

The rule under test is one line, `checksFrom()` in `src/domain/session.ts`:

```ts
const decisive = ordered.find((e) => e.outcome === "fail") ?? ordered[0];
```

| Question | Prediction |
| --- | --- |
| Is the wrong answer *demonstrated* or merely empty? | **Demonstrated, and confidently so.** Case 2 will report `state: "failed"`, `gateStatus.state: "blocked"` and `whySupported.supported: false` — populated, plausible and wrong — not an empty result. This is the bar row X has never yet cleared |
| What distinguishes the two cases? | **The standing of the failing evaluation's own basis.** Since S-8, `CriterionEvaluation -BASED_ON-> Evidence`. In case 1 that basis still stands; in case 2 the analysis that produced it was reviewed and replaced, so its output artefact carries `invalidated = true`. `checksFrom()` reads `ev.outcome` and never asks. The path is `CriterionEvaluation -BASED_ON-> Evidence <-PRODUCES- EvidenceUnit -USES-> Computation -PRODUCES-> Artefact` and every hop already exists |
| New node or edge? | **Neither.** Predicting zero additions to `NODE_TYPES` and `EDGE_SCHEMA`, and zero migrations — the same result S-5 produced against a louder prediction |
| New verb? | **None.** The scenario should be expressible with `recordReview` + `replaceAnalysis` (S-11) to retire the defective check, and `evaluateCriterion({ citing })` (S-8) to record the corrected verdict. If a new verb turns out to be needed, the interesting finding is *which* act had no home |
| Where does the fix land? | **The read side**, per "prefer structure in the query over structure in the stored model". `checksFrom()` is pure and shared, so the basis-standing must arrive through *both* feeding queries — `gateStatus()` and `whySupported()`. One rule, two readers: exactly row X's stated blast radius |
| Does case 1 stay failed? | **Yes, untouched.** Re-running a check unchanged leaves the original failing evaluation's basis standing, so nothing about S-3's earned policy changes. If this prediction breaks, the fix is too broad and has eaten the rule it was meant to narrow |
| Row X's status afterward | `resolved` if the wrong answer is demonstrated and cleared; **`refuted` is a live possibility** and would be a real result — it would mean "failure sticks" is correct as shipped and the sympathetic case was an illusion |

**Two things deliberately not predicted.** Whether the corrected evaluation
should *supersede* the earlier one or merely outrank it while both stay
readable — the Afterward bullet "which historical evaluations remain readable"
is there to decide that, not preference. And whether an invalidated basis
should make the check `passed` or return it to `never-run`; both are defensible
and the scenario should pick the one it can justify.

**The known hazard.** This makes "the check was defective" a lever anyone can
pull to clear an inconvenient failure. That the lever requires a recorded
`Review` with a verdict, and a replacement analysis, is the audit trail — but
whether that is *enough* is a question about authority, and LabKit has no actor
model by decision. Expect to record this rather than solve it; if it wants an
actor it belongs with the deferred identity work, not here.

**Outcomes.** The headline prediction held — **no schema change, no new verb,
no migration** — and so did the one that mattered most: the wrong answer was
*demonstrated* and confidently wrong, which is the bar row X had never cleared
in four scenarios of being open. Case 1 stayed failed, confirmed by deliberately
over-broadening the rule and watching S-3's own tests break.

Two predictions were wrong in detail, and both were wrong in the same
direction — I predicted a harder mechanism than the one that existed:

- **The path was one hop, not three.** I predicted reaching the basis's standing
  via `Evidence <-PRODUCES- EvidenceUnit -USES-> Computation -PRODUCES->
  Artefact`. `whySupported()` already had the idiom for this —
  `Evidence -RECORDED_IN-> Artefact` — and had been using it since S-11 to
  filter superseded findings. Predicting a traversal the code was already
  performing next door is a reading failure, not a modelling one.
- **"Through both feeding queries" was right; the route between them was not.**
  Both readers did change, as predicted. But the implementation detoured through
  a separate helper query for a while on a **wrong diagnosis** — see below.

*One prediction was under-specified rather than wrong.* "No new verb" held, but
`replaceAnalysis()` had to start **returning** the analysis it created, without
which the scenario cannot cite the corrected check at all. See row AB.

**The two deliberately-unpredicted questions, decided by the scenario.** The
corrected case reports `passed`, not `never-run`: a check *was* run, twice, and
one of those verdicts stands. And both evaluations stay readable, the withdrawn
one marked — asked directly by the brief's "which historical evaluations remain
readable", and the answer is all of them.

*Found in passing, and the most portable thing here.* A camelCase `RETURN` name
decodes as `null` for every row, silently, because the AS clause AGE requires is
unquoted SQL and Postgres folds it. It cost a wrong diagnosis — I blamed AGE's
`OPTIONAL MATCH`, restructured the query around a limitation that does not
exist, and only found the real cause after probing six `OPTIONAL MATCH` shapes
directly and watching all six bind. `buildAsClause()` now refuses such a name,
and on its first run the guard found a live instance that predated this work:
`enquiryStatus()` returned a `forClaim` column that had been decoding as null
since it was written, harmless only because nothing read it. Removed as dead —
PJ-007's shape, exactly.

**The hazard was recorded, not solved, as expected.** Nothing here decides who
may declare a check defective.

### S-10 predictions, recorded before the build

Recorded 2026-08-19, against `7e36b31`, before a line of test or source. S-10 is
**mined**, not authored — chosen over S-13 because after S-3b and S-3c the
corpus is due a turn as the independent check rather than the ledger, and
because it solely owns an open row (E).

*Corrected after the build:* this section first said S-10 was the **only**
unbuilt scenario solely owning an open row. It was not — row F is solely owned
by S-9, equally unbuilt. The choice was a judgment between two candidates, and
stating it as forced made it unauditable. S-9 is next.

**The trap this scenario has to avoid, stated first.** Row E's natural failure
is an **empty** answer: "what re-verifies this claim?" has no edge to walk and
returns nothing. Under PJ-011 §5 that earns no edge — unanswerable is what every
question the model has never been asked looks like. If every probe comes back
empty rather than wrong, the honest outcome is **row E stays open with no edge
added**, and this section says so before the build rather than after.

| Question | Prediction |
| --- | --- |
| Where the *wrong* answer lives, if it exists | **Both runs supporting the same proposition in the same line of enquiry.** Under S-5's scope rules they resolve to one claim, so the re-run joins the original as ordinary support and `whySupported()` reports two independent findings behind a proposition that has been established once and re-checked under *different* initial conditions. That is a historical claim reporting itself strengthened by an execution nobody reproduced — populated, plausible, and wrong in the direction that matters |
| Row E — evidence-to-evidence lineage | **Genuinely uncertain, and I am not predicting resolution.** It turns entirely on whether the above materialises as a wrong answer or merely a thin one. Direction and caveat are the two things a shared-claim encoding loses; if losing them cannot be made to produce a confidently wrong report, no edge is earned |
| Row P — `Evidence` carries two senses | **Likely to fire, and it is a finding rather than an obstacle.** Verified still true at `7e36b31`: `recordObservations()` mints `Evidence` with `RECORDED_IN` and `REQUIRES` but **no** producing `EvidenceUnit`, which PJ-001 defines as impossible, and `whySupported()` traverses `Claim <-SUPPORTS- Evidence <-PRODUCES- EvidenceUnit`, so an observation structurally cannot count as support. A re-verification whose initial conditions were *newly specified* is exactly the case that might need an observation to stand as evidence |
| "Can the two be compared numerically?" | **A refusal, not a field** — S-5's refuse-rather-than-guess shape, which is now the established answer to "the caller asked something the record cannot honestly answer". Predicting the one-bullet-one-return-type rule puts it on the verb, because the bullet says LabKit should say so *before* someone plots them together, and a field on a report only speaks when asked |
| "Does the new run raise or lower confidence?" | **Answerable without new structure**, from bearing plus the caveat. The prediction that would falsify this is needing a third bearing beyond `SUPPORTS`/`CHALLENGES` |
| Schema change overall | **No new node label.** Four scenarios running (S-5, S-8, S-3b, S-3c) have added none, and the noun inventory has not moved in eleven. Predicting an edge is a coin-flip; predicting a *node* is not |
| Regression pressure | S-3c's narrowing is hours old and S-10's assertions run through the same support/standing machinery. Expect this scenario to exercise it incidentally; a break there would be the most valuable thing it finds |

**What would make this scenario a failure of the corpus rather than of the
model.** If every Afterward bullet is answerable today, S-10 is a control like
S-11 and that is a result — but it would be the second consecutive scenario to
tell us nothing new about the nouns, and the question in PJ-018's closing
section ("is the entity set well chosen, or is the corpus not pressing?") would
get sharper rather than answered.

**Outcomes.** The trap was avoided: the failure was **not** empty. The wrong
answer named in the table is the one that materialised, in the reader predicted
— `whySupported()` listing a re-run as a second independent finding. Row E
resolved with `REVERIFIES: Evidence → Evidence`, written and read in the same
commit, deletion-verified.

**Two predictions wrong, one of them squarely.**

- **Row P was predicted "likely to fire" and did not.** `reproductionOf()` reads
  each run's inputs as artefacts through `CONSUMES` and never touches the
  observation's `Evidence` node, so the two senses never collided. The
  prediction assumed the new run's *conditions* would have to stand as evidence;
  they are an input, and the model already had a place for inputs. Row P stays
  open with S-9 as its only unbuilt owner.
- **The refusal prediction was wrong in kind, not degree.** "Can these be
  compared numerically?" was predicted to land as a refusing verb, S-5's shape.
  It landed as two fields on the report, because LabKit has nothing that plots
  or compares numbers — a `compareNumerically()` existing only to reject its
  arguments would be a feature invented to manufacture a wrong answer, which is
  PJ-011 §5 read from the other side. **A refusal needs something real to
  refuse.** That is the generalisable half of this scenario, and it is a limit
  on the S-5 pattern that nothing had previously stated.

*Held:* no new node label (twelve scenarios, still none), no migration, and the
bearing question needed no third bearing beyond `SUPPORTS`/`CHALLENGES`.

*The incidental regression pressure found nothing.* S-3c's narrowing was hours
old and S-10 runs through the same support machinery; 159 pass, 0 fail.

### S-9 predictions, recorded before the build

Recorded 2026-08-20, against `c2d9828`, before a line of test or source. S-9 is
**mined**, and the last unbuilt scenario owning any open row outright — it
solely owns F, and is row P's only unbuilt owner.

| Question | Prediction |
| --- | --- |
| Where the wrong answer lives | **`whatDependsOn()`, keyed on `logical_name`.** S-9 regenerates an artefact, and a regenerated artefact naturally carries the name of the thing it regenerates. Two artefacts, one name — so "what depends on the unreproducible part?" answers with the *union*, and the third Afterward bullet ("inferred provenance must not silently inherit the original's standing") describes a defect that is already present rather than a risk to avoid. **Sixth region** for identity-by-wording, after claims, interpretations, criteria, evaluations and execution inputs |
| Row F — artefact-to-artefact lineage | **Predicting `refuted`, and this is the interesting one.** The ledger's fallback — content-hash equality plus an open question — is not obviously insufficient the way S-10's shared-claim encoding was. What S-10 could not carry was direction and caveat; here direction is *recorded in the act* (a regeneration knows what it regenerates) and the caveat is the open question. If fixing identity is enough, no edge is earned and row F joins A and H as a refuted prediction |
| `content_hash` | **Gets its first reader, or the row moves.** It has been written and never read since PJ-004 — a writer without a reader, which rule 3 forbids for edges and which nothing has yet forced for a property. S-9's whole fallback route runs through it. If it still has no reader after this scenario, that is a finding about the property, not about S-9 |
| Row P — `Evidence` carries two senses | **Predicting it does not fire, again.** "Three components reproduce byte-exactly" is a statement about artefacts and their hashes, not about findings. If P survives S-9 untouched it has no unbuilt owner left, and it should be re-classified `open` + unowned rather than left looking like it has a probe coming |
| "What would resolve this?" | **Expressible today.** `pose()` plus `whatIsKnown()`. The requirement is that the regeneration must *not* close it — a question quietly closed by a workaround is the failure, and nothing currently closes a question as a side effect |
| A new node label | **No**, and the scenario says so itself: it deliberately does not ask for a recovered-artefact type. If the general entities cannot carry this, that is the finding and it should be recorded rather than designed around |
| Halfway through / second half fails | Per PJ-020: a regeneration interrupted after the new artefact exists but before its provenance is recorded would leave an artefact indistinguishable from the original. If that is reachable, it wants `inTransaction` like the others |

**What would make this a failure of the corpus rather than the model.** S-9 is
the last mined scenario owning an open row. If it too produces nothing but a
service-layer identity fix, then five consecutive scenarios will have pressed
only on relationships and query semantics, and the question PJ-018/019/020 all
close on — *is the entity set well chosen, or is the corpus not pressing?* —
stops being answerable by building more of this corpus.

**Outcomes.** Four predictions held, one was wrong, and the wrong one is the
useful one.

*Held.* The wrong answer lived where predicted, in `whatDependsOn()` keyed on
`logical_name` — sixth region for identity-by-wording, and the refusal follows
S-5. `content_hash` gained its first reader. No new node label. "What would
resolve this?" needed nothing new.

*Held, and this was the interesting call:* **row F is refuted.** The ledger's
own fallback held, and no `Artefact → Artefact` edge was earned. One scenario
after row E *was* earned on the same test, which is the sharpest available
illustration that the bar is doing work rather than rubber-stamping: direction
and caveat had homes here and did not there.

> **Superseded the same day, kept verbatim above.** External review found that
> *"direction had a home"* was false — the home was an act that does not exist.
> **Row F is `open`, not refuted**, and the status column has said so since;
> what was missing until now was this pointer, so a reader arriving here from
> the index hit "refuted" with nothing adjacent to correct it. The later verdict
> is under `### Row F`. Only the identity half was settled.

*Wrong.* **Row P was predicted not to fire, for the second build running, and it
fired.** Both S-10's predictions and these said the two senses of `Evidence`
would stay apart. They did in storage; they did not in reading. That is a better
outcome than a lucky hit — a row two consecutive builds expected to be inert
turned out to hold a confidently wrong answer, and only asking it a *third*
question found it.

*The corpus-exhaustion claim in the first write-up was simply false*, and
contradicted by this document's own ownership table in the same commit. **S-14
still owns row J**, and **story 18 still owns row K** — with a promotion
condition recorded in §4 from the beginning: *"if row K survives the build,
promote this to a scenario."* Row K survived S-8, so that condition has fired
and has been sitting fired since. Two probes remain named and unbuilt; the
corpus is not exhausted.

*(Both were built immediately after: S-14 cleared row J, and story 18, promoted,
became **S-18** and cleared row K. No row now names an unbuilt owner — see the
ownership table above, which is the authoritative one. The paragraph is kept as
written because the false claim and its correction are the record.)*

What is true, and survives the correction: five consecutive scenarios have
pressed only on relationships, query semantics and identity, and the noun
inventory has not moved in thirteen. That is a reason to expect the *next* kind
of pressure to come from somewhere else — but it is not a licence to stop
building the probes this document has already named.

### S-14 predictions, recorded before the build

Recorded 2026-08-20, against `0dd0d2d`, before a line of test or source. S-14 is
**mined**, and owns row J outright. It is also the scenario PJ-008 nominated to
guard PJ-001's "should not accumulate ceremony" bullet.

**Row J's own fallback is the thing this scenario forbids.** The row records the
no-change route as *"distinguish by whether an open task exists"* — and §2 says
plainly that *"a model that can only express it as an open task is a failure"*.
So the route the ledger has carried since it was written is ruled out by the
scenario that owns it, which is worth noticing before the build rather than
discovering during it. External review independently set the same constraint:
S-14 must not derive scientific standing from `Task` presence.

| Question | Prediction |
| --- | --- |
| Where the wrong answer lives | **`enquiryStatus()` and `whatIsKnown()`, reporting acceptance as pending work.** With no verb for it, a question deliberately accepted as unresolved is left open, and both readers then classify it exactly as one nobody has got to: `open: true, closure: null`, and a slot in the survey that means "still being worked". That is a confident misclassification of a *decision* as an *absence*, not an empty result |
| `DEFERS` | **Gets its first writer.** `enquiryStatus()` has been able to report `closure: "deferred"` since it was written and no verb has ever produced that state — the reader-without-writer that CLAUDE.md's no-cull policy holds up as its current example. This is the scenario that either makes the branch reachable or shows it should not exist |
| Deferred vs accepted — one state or two? | **Genuinely uncertain, and the crux.** Row J says `DEFERS` covers both. Two things could distinguish them without a second edge: `Decision.invalidation_check` already exists and is *exactly* "what would change this", and a deferral pending work has no such condition while an acceptance names one. Predicting that carries it, and that no new property or edge is needed — but if "parked until someone gets to it" and "accepted permanently" need different structure, that is a real model change and the interesting outcome |
| A `Task` | **None, and this is the acceptance criterion rather than a preference.** The Afterward bullet "does it block anything? → no" is not satisfied by a task nobody intends to do. If the build finds itself creating one to make a query answer correctly, the model has failed the scenario |
| A new node label | **No.** Fourteen scenarios, none so far |
| Halfway / second half fails | Per PJ-020: accepting a question is compound — a `Decision`, an edge, and possibly a bearing on the enquiry. It wants `inTransaction` like the others, and the failure mode is a decision that exists while the question still reads as merely open |

**What would refute the prediction usefully.** If `invalidation_check` cannot
carry the condition — because the condition is about *the world* ("a new data
source appears") rather than about the decision's own evidence — then the
distinction needs somewhere else to live, and that is a finding about the
`Decision` shape rather than about deferral.

**Outcomes.** Every prediction held, including the uncertain one:
`invalidation_check` carried the reopening condition with no new property, and
no `Task`, edge or node label was added. The wrong answer was where predicted
and was *reachable* rather than missing — `closeEnquiry()` reporting a
deliberately-accepted question as `abandoned`.

*The two findings nobody predicted came from entering an unreachable branch.*
`DEFERS` had a reader and no writer, and when `acceptAsUnresolved()` finally
produced the state, the branch waiting for it was wrong twice over: it reported
`open: false` for a question deliberately left open, under a `deferred` token
naming a state nothing could produce. Both had been sitting unexecuted since
the reader was written. This is the strongest evidence so far for the no-cull
policy: unwalked structure is a map of untested claims, and this claim was
false.

*Deferred-pending-work was not built.* Row J named two states; only one has ever
been needed. The other gets earned when a scenario needs it, which is the same
answer S-10 gave about unit-level re-verification.

*One drafted field was removed rather than shipped.* `EnquiryStatus.blocking`
would have made "does it block anything? → no" directly assertable, and its only
consumer would have been that assertion. Inventing a to-do list in order to
report it empty is the ceremony the scenario exists to forbid — the same shape
as S-10's `compareNumerically()`, and the second time this session that a
refusal-or-report was declined for having nothing real to describe.

### S-18 predictions, recorded before the build

Recorded 2026-08-20, against `4988938`, before a line of test or source.

**S-18 is a promotion, not an authored scenario.** §4 has carried its condition
since this document was written — *"held back because the exploratory/confirmatory
distinction may already cover it; if row K survives the build, promote this to a
scenario."* Row K survived S-8, which gave it no verdict. The condition fired
then and sat unnoticed through three external reviews until the fourth found it.
So unlike S-3b and S-3c this needs no authored-versus-mined defence: the corpus
nominated it in advance and named the trigger.

Story 18: *low-friction exploration captured without making ephemeral scratch
part of the scientific record by accident.* Its rule is **capture cheaply, but
promote before citing.**

| Question | Prediction |
| --- | --- |
| Where the wrong answer lives | **`enquiryStatus()` and `whatIsKnown()`, which never consult standing at all.** A question closed on the strength of an exploratory finding reports `closure: "answered"` and lands in `established`, identically to one closed on a confirmatory result. That is scratch entering the scientific record by accident, which is the story's own words, and it is a confident answer rather than an empty one |
| `Claim.kind` / `Conclusion.standing` | **Has exactly one reader today** — `confirmatoryResultsBehind()`, deciding whether an amendment is scientific or mechanical (S-7). Everything else ignores it. Expect the first cut to be a *reader* problem, as row P was, before anything about the model changes |
| Row K — provisional/scratch standing | **Predicting `resolved`, and that `exploratory` really was the distinction all along** — as row K's original line said. What was missing is not a state but the *transition* and any reader that respects it |
| Rows G, K, R as one question | **This is the discriminator, and I am predicting standing becomes conferred by an act.** The whole point of story 18 is that scratch is captured *before* anyone knows it matters, so confirmatory standing cannot be declared at birth — the researcher does not yet have the information the declaration would encode. If that holds, R's successor question is answered: conferred, not declared |
| New structure | **None.** A promotion is a decision that changes a claim's standing, and `CHANGES: Decision → Claim` already exists and is walked (S-12). Predicting reuse, no new edge, no new node, no migration |
| The alternative that would refute it | `closeEnquiry()` **refusing** to close on exploratory evidence, with no promotion verb at all — S-5's decline-rather-than-guess. That would settle the reader defect without answering whether standing is conferred by an act, and would leave rows G/K/R exactly where they are. If the scenario can be satisfied that way, the act-confers model has *not* been earned |
| Halfway / second half fails | Promotion is compound — a decision, an edge, a property change. It wants `inTransaction`, and the failure mode is a claim promoted with no decision explaining why |

**The trap to avoid, stated before the build.** It would be easy to make
promotion a *gate* — declare a criterion, evaluate it, call the claim
confirmatory. S-17 already established that declaring a gate does not satisfy
it, so a claim behind an unevaluated confirmatory gate would read exploratory
and the S-7 amendment check would miss a scientific change. Row R's note says
this outright. Promotion must be an act with a reason, not a gate state.

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
  **Promoted, and built as S-18** (2026-08-20). Row K survived S-8, which gave
  it no verdict — so the condition fired at S-8 and then sat unnoticed through
  three external reviews until the fourth read this line. The distinction did
  *not* already cover it: the state existed and the transition did not, and
  nothing but `confirmatoryResultsBehind()` read the state. This is the one
  §4 condition that has fired, and the lesson is that a condition nobody
  re-reads is not a mechanism. See PJ-023.

---

## Judgment calls

- **Fourteen scenarios, not the eighteen stories.** *(Fifteen as built, and not the
  same fifteen: twelve of the fourteen were built — S-2 and S-13 own nothing
  outstanding and never needed to be — plus two authored discriminators, S-3b
  and S-3c, and story 18 promoted as S-18. The reasoning below is why fourteen
  was the right starting number, not a claim about the final count.)* The mining notes
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
