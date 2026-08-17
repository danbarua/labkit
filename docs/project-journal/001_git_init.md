# PJ-001: mkdir labkit && cd labkit && git init

Hello, World.

### What this is and isn't

- **Is:** a research control plane
- **Is not:** an experiment telemetry plane

### Overlap with W&B / MLFLow domains

These concepts overlap heavily:
- computations / runs;
- parameters and configs;
- metrics;
- artifacts;
- run status;
- code/version metadata;
- artifact lineage;
- sweeps / repeated parameterized runs;
- dashboards/comparison of runs.

W&B explicitly models a `Run` as a unit of computation, records config, metrics and outputs, and tracks artifacts as run inputs and outputs. Its artifact lineage is already a DAG connecting runs and artifacts.

W&B's lineage graph is narrower:
```
Artifact → Run → Artifact
```

MLflow occupies essentially the same territory in a more open/self-hostable form: runs record parameters, code versions, metrics and artifacts, with experiments grouping runs; it can use PostgreSQL as its metadata backend and separate object storage for large artifacts.

### LabKit's Graph of Interest

```
Question
   ↓ motivates
Line of enquiry
   ↓ requires
Evidence
   ↓ supports/challenges
Claim

Decision
   ↓ changes
Criterion

Criterion
   ↓ gates
Task / computation

Computation
   ↓ produces
Artifact

Review
   ↓ evaluates
Claim / decision / evidence

Amendment
   ↓ supersedes
Decision
```


W&B can tell you:
> Run `R42` consumed dataset `D3` and produced model `M7` with validation loss `0.064`


LabKit needs to answer:
> Why was R42 run?
> Which `line of enquiry` did it address?
> Which `criterion` was it intended to discharge?
> Was that `criterion` subsequently amended?
> What `evidence` was available when the  `amendment` happened?
> Which `claim` depends on this `result`?
> Is that `claim` exploratory or confirmatory?
> Which unresolved `question` blocks `closure`?
> What `review` challenged the interpretation?
> If this `artifact` is invalidated, which `claims` become unsupported?

---

## LabKit Domain Entitites

Core Domain:

```
Project
Question
LineOfEnquiry
EvidenceUnit
Evidence
Claim
Decision
Criterion
CriterionEvaluation
Gate
Review
Artefact
Computation
Task
```

---

### Computation
`computation` can and should probably be thin:

```
Computation
-----------
id
kind
status
backend
external_run_id
started_at
finished_at
code_revision
environment_ref
```

Then:
```
(:EvidenceUnit)-[:USES]->(:Computation)
OR
(:Computation)-[:EXECUTES_AS_PART_OF]->(:EvidenceUnit)

(:Computation {
    backend: "wandb",
    external_run_id: "abc123"
})
```

---

### Artefact

**Artifacts are the boundary case.** In our domain model, an `artefact` represents **scientific identity**, not necessarily storage implementation.

```
Artifact
--------
id
kind
logical_name
content_hash
uri
external_ref
```

Then an `artefact` is a pointer to:

```
wandb-artifact://...
gs://...
git://...
file://...
```

W&B already versions artifacts and associates them as inputs and outputs of runs, including lineage.

But we need our own artifact identity because a result may matter to the research graph independently of whether it happens to be stored in W&B today.
Otherwise the epistemic model becomes coupled to the telemetry vendor.


#### Domain Context Boundary

> If W&B disappeared tomorrow, would this entity still exist conceptually in the scientific record?

```
Claim                  YES
Question               YES
Line of enquiry        YES
Decision               YES
Criterion              YES
Review                 YES
Evidence unit          YES
Task                   YES
Artifact               YES
```

```
Metric history         probably NO
GPU utilization        NO
epoch loss             NO
run console logs       NO
sweep controller state NO
system telemetry       NO
```

```
Computation            YES, but thin
```

> If the implementation agent disappeared tomorrow, would this entity still belong in the research record?

That helps separate `Task` from the durable epistemic model.

---

### Tasks

```
Task
    maybe operational

Criterion
Decision
Evidence
Claim
Question
    definitely scientific record
```

`Task` may belong in the control plane, but it is worth being explicit that it is orchestration state, not scientific truth.

---

### Evidence / Evidence Units

Superficially similar, semantically different:
```
W&B Run != Evidence Unit
MLFLow Experiment != Investigation
```

One evidence unit might require:
- 3 computational runs;
- a reference implementation run;
- a JAX run;
- an equivalence comparison;
- a diagnostic analysis.

Conversely, one computational run might produce artifacts relevant to several lines of enquiry.

This is modelled explicitly in the LabKit graph:

```
EvidenceUnit
    │
    ├── USES → Computation
    ├── USES → Computation
    ├── PRODUCES → Evidence
    └── PRODUCES → Artefact

Evidence
    └── RECORDED_IN → Artefact
```

Clarification on Evidence vs EvidenceUnit:

```
EvidenceUnit
    planned or executed unit of inquiry

Evidence
    durable result or observation produced by one or more evidence units
```

That distinction matters because evidence can outlive or aggregate multiple computations.

e.g.

```
Evidence:
    evolved_T mean ΔMSE = -0.021
    95% CI [-0.025, -0.017]

Artefact:
    stage2b_confirmatory_results.json
```

The evidence is the proposition/result. The artefact is its durable representation.

That distinction becomes valuable when:
- one artefact contains multiple evidence statements;
- one evidence statement is reproduced in several artefacts;
- an artefact is invalidated but the same evidence is independently reproduced elsewhere.

---

### Criteria, Criterion Evaluations, Gates

**Criterion:** proposition that can be evaluated
**Gate:** policy consequence attached to one or more criterion evaluations

e.g.:

```
Criterion:
    max_prediction_error <= 1e-8

Gate:
    accelerated ridge implementation may be promoted
```

```
CriterionEvaluation
    criterion_id
    value
    outcome
    evaluated_at
    evidence_ref

Criterion
    ↓ EVALUATED_AS
CriterionEvaluation
    ↓ TRIGGERS
Gate
```

This prevents the gate from becoming the place where measurement and policy get conflated.

---

### Decisions and Amdendments

`Decision` and `Amendment` may not need to be separate top-level entity types.
An amendment is really a decision with a specific relation:

```
Decision D2
    └── SUPERSEDES → Decision D1
OR
Decision
    kind: amendment

Decision
    ├── BASED_ON → Evidence
    ├── RESOLVES → Question
    ├── NARROWS → Question
    ├── DEFERS → Question
    └── SUPERSEDES → Decision
```

---

### Dependencies

**Task:** Modelled but expliclity peripheral, outside the scientific dependency chain unless it produces something durable:
```
Task
    ├── IMPLEMENTS → EvidenceUnit
    ├── PRODUCES → Computation
    └── PRODUCES → Artefact
```

**Claim:** Never depends on a `Task`. Operational state may generate scientific state, but scientific truth never depends on operational state.

**Uncertainty as first-class citizen:** Forces the graph to distinguish:
- failed criterion;
- deferred decision;
- blocked computation;
- unresolved review;
- explicit non-closure.

---

## Rough Semantic Boundaries

```
Question
    what is unknown?

LineOfEnquiry
    how are we pursuing that unknown?

EvidenceUnit
    what bounded inquiry is being performed?

Computation
    what execution happened?

Evidence
    what durable observation resulted?

Claim
    what proposition does the project currently assert?

Criterion
    what proposition is mechanically evaluable?

CriterionEvaluation
    what happened when it was evaluated?

Gate
    what policy consequence follows?

Decision
    what did the research process decide, and why?

Review
    what challenged or validated an interpretation?

Artefact
    where is the durable material representation?

Task
    what operational work was assigned?
```



---

## MVP Acceptance Criteria

LabKit should be able to answer the following example questions:

- "Show me the evidence supporting Claim C7, the computations that generated it, and the relevant run metrics."
- "Why does Claim C7 currently count as supported?"
- "If Artefact A12 is invalidated, what claims, decisions, and open lines of enquiry become affected?"
- "Why is this line of enquiry still open?"

### What this is and isn't about

- **Is about:** provenance, justification, dependency propagation, and research state
- **Is not:** metrics and run telemetry

### What this should and should not do

- **Should:** make research state explicit enough that agents can work safely in uncertain or weakly specified scientific domains.
- **Should:** preserve why a claim, decision, criterion, or line of enquiry exists, what evidence it depends on, and what would invalidate or reopen it.
- **Should:** make dependencies and consequences traversable, so invalidating an artefact or evidence item propagates to affected claims, decisions, and open questions.
- **Should:** separate scientific state from execution telemetry, while allowing computations and external run systems to be linked into the research record.
- **Should:** allow exploratory work, failed attempts, amendments, and partial findings without forcing them prematurely into a confirmatory structure.
- **Should:** support formal constraints where they protect a real scientific boundary, such as test-set access, prerequisite evidence, or a promotion criterion.
- **Should:** reduce the amount of global context an implementation agent must understand by presenting it with a narrow, derived task contract.
- **Should:** make it cheap to ask “why?”, “what depends on this?”, “what remains unresolved?”, and “what changed?”.
- **Should:** prefer recording evidence and relationships over inventing process machinery around them.
- **Should:** permit the research process to evolve without erasing the history of earlier decisions or the evidence available when they were made.
- **Should not:** become an experiment tracker, metrics store, dashboard system, or replacement for W&B/MLflow.
- **Should not:** require implementation agents to understand or manually maintain the full research ontology.
- **Should not:** turn every line of enquiry, diagnostic, or implementation detail into a mandatory gate.
- **Should not:** confuse absence of evidence with failure, or a missing evaluation with a pass.
- **Should not:** treat exploratory observations as confirmatory evidence merely because they exist in the graph.
- **Should not:** make operational entities such as tasks, agents, or runs part of the logical support for a scientific claim.
- **Should not:** prevent work simply because the eventual scientific structure is not yet fully known.
- **Should not:** freeze incidental implementation choices that do not affect scientific interpretation.
- **Should not:** require duplicated bookkeeping across LabKit and external execution systems.
- **Should not:** accumulate ceremony merely because a previous project once encountered a particular failure mode.

---

## Design Principles

- LabKit is formal where state and consequences matter; permissive where discovery is still happening.
- A missing structure should be tolerated when the science is genuinely unresolved. A missing dependency, criterion evaluation, or provenance link should not be silently interpreted as satisfied.