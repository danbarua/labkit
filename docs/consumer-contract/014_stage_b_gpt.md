# Stage B revision — designer `gpt` (`openai-codex/gpt-5.6-sol`)

**Verbatim, unedited.** Everything below the horizontal rule is this
designer's complete stdout. Run 2026-08-20, after `011` was frozen
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

# Revision document

Yes. The additional constraints require several focused revisions. They do not change the central separation between observations, computations, results, evidence, assessments, claims, gates, and decisions.

No existing glossary concept is removed. One concept is split in two, and five concepts are added.

## 1. Expose linked run telemetry without making LabKit a metrics system

### What changed

Amend **R6 `why_is_this_claim_currently_held`** so the caller may request linked execution telemetry.

The evidential trace should now identify:

- the computation events that produced each supporting or challenging result;
- the analysis specification and implementation used by each computation;
- references to corresponding runs in external systems such as W&B or MLflow;
- the externally owned metric names or selectors recorded as relevant to that computation;
- when an integration is available, a clearly partitioned projection of those external metrics, labelled with its source and retrieval time;
- otherwise, a deep link or external query reference through which the metrics can be inspected.

The operation must phrase the relationship accurately: computations generate results that may be used as evidence; they do not directly “generate a claim.”

External telemetry remains outside the LabKit scientific record unless a particular value is deliberately admitted as an observation and used through an evidence relationship. Merely linking a run does not make its metrics support a claim.

The existing refusal of **“Which run performed best?”** remains, but its response should now add that LabKit can return the external runs and metric references associated with relevant computations. It still does not rank operational performance or become the system of record for those metrics.

An as-of query applies to the LabKit linkage as of that time. Historical external telemetry can only be returned when the external system supports the requested historical view or an immutable value was admitted into the scientific record. A current external read must not be presented as historical telemetry.

### Constraint causing the revision

- The MVP question asking for evidence, generating computations, and relevant run metrics.
- Scientific state must remain separate from execution telemetry.
- External run systems should be linked without duplicated bookkeeping.
- Runs and other operational entities must not become logical support for claims.

### Glossary effect

- **Split:** `Analysis or computation` becomes **Analysis specification** and **Computation**.
- **Added:** **External execution reference**.

---

## 2. Make impact propagation open-world unless dependency coverage is known

### What changed

Amend **R17 `what_would_need_reconsideration_if_this_were_unusable`** so its output explicitly includes:

- affected claim assessments;
- decisions whose recorded basis used the item;
- questions whose answer status may change;
- lines of enquiry whose reason for remaining open may change;
- closed questions or lines for which a recorded reopening condition may now apply;
- criteria, evaluations, and gates whose outcomes depended on the item.

A historical decision is not retroactively erased when its basis is compromised. The operation should instead report whether:

- the historical rationale is still accurately represented;
- the decision’s current force requires reconsideration;
- a new evaluation or decision would be needed;
- the impact cannot be determined.

Replace the unqualified `unaffected` category with:

- `unaffected within a declared dependency boundary`;
- `no recorded dependency found; exhaustiveness unknown`;
- `potentially affected because provenance or dependency coverage is incomplete`.

An absent dependency path must never be treated as proof of independence. “Unaffected” is defensible only when the relevant dependency set is known to be complete for the stated subject and relationship types.

The same caveat should appear in R6 whenever it describes evidence as independent.

### Constraint causing the revision

- Invalidation must propagate to affected claims, decisions, and open lines of enquiry.
- Dependencies and consequences must be traversable.
- A missing dependency or provenance link must not be silently interpreted as satisfied.
- Absence of evidence must not be confused with failure—or with independence.

### Glossary effect

- **Added:** **Dependency coverage assertion**.

---

## 3. Answer why a line is still open and what could reopen settled work

### What changed

Amend **R2 `where_does_this_line_of_enquiry_stand`** to return the basis of its current openness, distinguishing:

- an explicit decision to keep the line active;
- exact questions that remain unanswered;
- stronger questions left unresolved by narrower findings;
- declared closure conditions that have not been met;
- evidence, provenance, or dependency gaps preventing closure;
- a recorded reopening condition that has been triggered;
- absence of any defensible disposition decision.

The last case must be reported as `disposition indeterminate`, not silently interpreted as an active line.

Add **R21 `what_could_invalidate_or_reopen_this`**.

**Caller passes**

- A claim, assessment, decision, criterion, gate, question, line of enquiry, or study.
- Optionally, a scope or intended use.
- Optionally, an as-of time.

**Returns**

- Explicitly recorded defeaters, expiry conditions, review triggers, and reopening conditions.
- Dependency failures that would undermine the subject’s current standing.
- Scope changes under which the current conclusion or decision would cease to apply.
- Evaluations whose reversal or invalidation would require reconsideration.
- Whether each condition:
  - automatically changes a derived state;
  - merely requires reassessment;
  - requires a new authorized decision;
  - has already been triggered;
  - cannot be evaluated from the record.
- Derived candidate failure conditions, kept separate from conditions explicitly anticipated and recorded.
- A dependency-coverage warning indicating whether the list can be treated as exhaustive.

For a criterion, the operation should discuss loss of applicability, supersession, or need for review rather than claiming that a criterion itself became scientifically false.

Also amend the existing explanation operations so that rationale for existence is visible separately from current standing:

- R5 returns why the claim was introduced, separately from why it is currently supported.
- R10 returns why each gate and criterion was introduced, separately from its evaluation outcome.
- Every operation returning a decision includes the decision’s recorded rationale.
- R11 accepts decisions and protected constraints as subjects of change history.

### Constraint causing the revision

- The explicit MVP question, “Why is this line of enquiry still open?”
- The requirement to preserve why a claim, decision, criterion, or line exists.
- The requirement to preserve what would invalidate or reopen it.
- The goal of making “why?” and “what depends on this?” cheap to ask.

### Glossary effect

- **Added:** **Reconsideration condition**.
- Existing **Rationale** is expanded to include the reason a subject was created or adopted, not only later assessments, changes, and decisions.

---

## 4. Treat stages, gates, commitments, and confirmatory structure as optional

### What changed

Amend R1, R8, R10, and R12 so they do not imply that every study must have stages, gates, a locked procedure, or confirmatory criteria.

Whenever one of these structures is absent, the read surface must distinguish:

- `explicitly not applicable`;
- `not declared and no recorded requirement found`;
- `required but missing`;
- `applicability cannot be determined`.

Only the first state supports a conclusion that the structure is unnecessary. Mere absence does not.

Specific changes:

- **R1** reports stages only for studies that declare them.
- **R8** presents gates, commitments, and promotion structure as optional sections rather than required components of every study.
- **R10** remains applicable when an identified gate exists; it must not be used to manufacture a gate for work that has none.
- **R12** returns `indeterminate: no declared transition contract` when asked about promotion without applicable criteria or a recorded statement that no criteria are required. It must not return either eligible or ineligible merely because no gate exists.
- Exploratory questions and observations may be represented before a study, criterion, or gate exists.

### Constraint causing the revision

- LabKit must be permissive while discovery is still taking shape.
- Missing structure should be tolerated when the science is genuinely unresolved.
- Not every line, diagnostic, or implementation detail should become a mandatory gate.
- The system should prefer evidence and relationships over process machinery.
- It should not accumulate ceremony based on failures encountered in unrelated projects.

### Glossary effect

- **Added:** **Protected scientific constraint**.
- Existing **Stage**, **Gate**, **Commitment**, and **Criterion** remain, but their applicability is explicitly optional.
- This does **not** split Criterion: a criterion judges a property or evidence set, whereas a protected constraint restricts what may be accessed, changed, or executed.

---

## 5. Represent real scientific boundaries independently of gates

### What changed

R8, R11, R12, R17, and R21 should expose applicable protected constraints, including:

- test-set or information-access restrictions;
- prerequisite evidence;
- scientific invariants an implementation must preserve;
- restrictions on changing endpoints, populations, decision rules, or tolerances;
- conditions under which an implementation or procedure may be promoted or used.

A protected constraint need not be wrapped in a stage or gate. Conversely, incidental implementation choices must not be reported as protected constraints unless the record establishes their scientific relevance.

A violation is not inferred from missing evidence of compliance. The result should instead state that compliance is unevaluated or indeterminate.

### Constraint causing the revision

- Formal constraints should be supported where they protect real scientific boundaries.
- The system must not freeze incidental implementation choices.
- Missing evaluation must not be interpreted as a pass.
- Formality should follow scientific consequence rather than process habit.

### Glossary effect

- Uses the newly added **Protected scientific constraint** concept.

---

## 6. Add a narrow derived contract for implementation work

### What changed

Add **R22 `derive_the_contract_for_this_work`**.

**Caller passes**

- The scientific subject or subjects affected by the proposed work.
- A description of the intended change or outcome.
- The intended use and scope.
- Optionally, an as-of time.

The proposed work does not need to be a persisted LabKit task.

**Returns**

A narrow, derived contract containing only the context needed to perform the work safely:

- the recorded objective and in-scope scientific subject;
- exact applicable procedure, analysis, criterion, and implementation versions;
- protected scientific constraints and access restrictions;
- invariants that must be preserved;
- implementation choices explicitly known to be incidental;
- prerequisite evidence and actual evaluation status;
- required outputs, comparisons, or evidence;
- affected dependencies and impact warnings;
- relevant artefacts, computations, and external execution references;
- unresolved assumptions and incomplete provenance;
- facts that could not be safely narrowed;
- the as-of time and interpretation policy used to derive the contract.

The operation must not:

- create or assign a task;
- approve the proposed work;
- infer permission from an omitted constraint;
- make the assigned agent, task, or external run part of a claim’s support;
- conceal uncertainty merely to produce a smaller contract.

If the record is insufficient to separate fixed scientific boundaries from incidental choices, the contract is `partly determined` or `cannot determine`, with the missing distinctions listed.

### Constraint causing the revision

- Implementation agents should receive a narrow derived task contract rather than needing the full ontology and global project context.
- Agents must be able to work safely in uncertain or weakly specified domains.
- Agents and tasks must remain operational entities rather than logical support for scientific claims.
- Incidental implementation choices should not be frozen.

### Glossary effect

- **Added:** **Derived implementation contract**.

---

## 7. Expose failed and partial work without treating it as evidence

### What changed

Amend **R8 `explain_this_study`** to include:

- executions that started but failed or were aborted;
- partial outputs and diagnostics;
- failed feasibility attempts;
- exploratory work admitted to the record without an evidential target;
- what, if anything, was learned from each attempt;
- whether any output was subsequently used as evidence.

Amend **R20 `is_this_part_of_the_scientific_record`** to state explicitly that:

- admission to the scientific record does not itself make an item evidence;
- an exploratory observation does not become confirmatory evidence merely because it is retained;
- a failed attempt can be retained without being assigned a claim, criterion, or gate;
- diagnostic or operational telemetry remains external unless deliberately admitted for a scientific purpose.

The definition of **Execution** is broadened to include a carrying-out that began but terminated unsuccessfully or produced only partial output. A merely planned task is still not an execution.

The definition of **Evidence** is clarified: evidential standing requires an explicit bearing on a scoped target and an assessment of that use. Existence, admission, proximity in the dependency graph, or an “exploratory” label is insufficient.

### Constraint causing the revision

- Exploratory work, failed attempts, amendments, and partial findings must be allowed without premature confirmatory structure.
- Exploratory observations must not become confirmatory evidence merely because they exist.
- Operational tasks, agents, and runs must not enter the logical support chain.

### Glossary effect

- **No concept added, removed, or split.**
- **Execution**, **Evidence**, **Record status**, and **Role assignment** receive narrower boundary clarifications.

---

# Glossary additions and split definitions

## Analysis specification

- **Definition:** A versioned specification of a scientifically meaningful transformation from identified kinds of input to result, including the model, method, definitions, and parameters that affect interpretation. It describes what is to be computed, not a particular carrying-out.
- **Required by:** Revised R6, R8, R9, R15, R17, and R22.
- **Identity:** Distinguished by exact method version, input and output semantics, scientifically material parameters, and intended use. Editorial or implementation-only changes may preserve identity; changing the estimator, endpoint definition, or decision rule creates a new version or specification.
- **Remember:** Exact definition, version history, purpose, required inputs, output semantics, scientifically material parameters, and relation to procedures and implementations.
- **Derive:** Which computations used it, differences between versions, and whether a proposed implementation purports to realize it.
- **Without it:** “The same analysis was independently recomputed using another implementation” and “a different model happened to produce the same numerical answer” would be indistinguishable.

## Computation

- **Definition:** One actual application of an analysis specification to identified inputs using a particular implementation, producing results, artefacts, or diagnostics. It is not itself a claim or an evidential judgment.
- **Required by:** Revised R6, R8, R9, R15, R17, and R22.
- **Identity:** Every invocation is distinct, even when its inputs and outputs are equal. It is identified by analysis-specification version, inputs, implementation, scientifically relevant configuration, time, and produced outputs.
- **Remember:** Specification, implementation, inputs, outputs, diagnostics, provenance, execution context where scientifically relevant, and external execution references.
- **Derive:** Result lineage, repeated-computation relationships, reproducibility comparisons, and external telemetry queries.
- **Without it:** “A stored result was opened and cited twice” and “the analysis was independently run twice and produced matching results” would be indistinguishable.

## External execution reference

- **Definition:** A stable locator connecting a LabKit computation or study execution to an operational run in an external system. It supplies access to telemetry but is not itself scientific evidence or a dependency supporting a claim.
- **Required by:** Revised R6, R8, R9, R15, and R22.
- **Identity:** Distinguished by external provider, namespace or project, external run identifier, and provider-specific identity semantics. A mutable display name or URL alone is insufficient.
- **Remember:** Provider, external identifier, associated computation or execution, effective time, relevant metric selectors, and any known immutability or retention properties.
- **Derive:** Current external links, available telemetry, and metric projections when the external integration is accessible.
- **Without it:** “These metrics came from the exact run that produced the cited result” and “these metrics came from an unrelated run with the same display name” would be indistinguishable.

## Dependency coverage assertion

- **Definition:** A bounded, attributable assertion that the recorded dependency set is complete for specified subjects, relationship types, scope, and time. Without such an assertion, dependency traversal is open-world.
- **Required by:** Revised R6 and R17, plus R21 and R22.
- **Identity:** Distinguished by covered subjects, dependency types, boundary, effective time, assertion source, and version.
- **Remember:** The completeness claim, its scope, authority or production method, known exclusions, effective interval, and later challenges.
- **Derive:** Whether the absence of a dependency path can support an `unaffected` or `independent` conclusion.
- **Without it:** “No dependency exists within a checked and complete boundary” and “no dependency appears because nobody recorded the link” would be indistinguishable.

## Reconsideration condition

- **Definition:** A recorded condition under which a claim assessment, decision, criterion applicability, question disposition, or line of enquiry should be reviewed, invalidated, superseded, or reopened. It may trigger review without automatically changing state.
- **Required by:** Revised R2, R5, R10, and R17, plus R21.
- **Identity:** Distinguished by subject, exact condition, scope, consequence type, effective interval, and source. Revising the condition creates a new version.
- **Remember:** Predicate, rationale, subject and scope, whether its effect is automatic or deliberative, required evidence, authority, and effective time.
- **Derive:** Whether the condition appears satisfied and which assessments or decisions would then require attention.
- **Without it:** “This line was closed subject to reopening if the holdout audit failed” and “this line was closed with no recorded reopening policy” would be indistinguishable.

## Protected scientific constraint

- **Definition:** A scoped rule restricting access, change, execution, or use because violating it could alter scientific interpretation or evidential validity. Unlike a criterion, it need not judge an evidence set or produce a pass/fail evaluation.
- **Required by:** Revised R8, R11, R12, R17, and R21, plus R22.
- **Identity:** Distinguished by exact rule version, protected subject, intended use, scope, effective interval, and authority.
- **Remember:** Rule, scientific rationale, applicability, prohibited and permitted actions, exceptions, authority, effective time, and consequences of violation.
- **Derive:** Applicable constraints for proposed work and, where evidence permits, whether a constraint was respected.
- **Without it:** “The agent was prohibited from inspecting the holdout set before commitment” and “the agent merely happened not to inspect it” would be indistinguishable.

## Derived implementation contract

- **Definition:** An as-of projection that narrows recorded scientific objectives, constraints, prerequisites, dependencies, and permitted variation to a proposed piece of implementation work. It is guidance derived by the read surface, not a task, approval, or scientific event.
- **Required by:** R22.
- **Identity:** Identified by the target subjects, proposed work description, intended use, as-of time, and interpretation-policy version. It has no independent enduring scientific identity unless separately retained as an admitted artefact.
- **Remember:** Nothing independently for ordinary derivation; the underlying versions, constraints, evaluations, rationales, dependencies, and provenance must persist. If the exact contract issued to an agent must later be audited, that issued document would need to be retained separately.
- **Derive:** The entire contract, its applicability status, and its warnings from the underlying record.
- **Without it:** To an implementation agent, “this component was omitted because it is explicitly free to change” and “this component was omitted because a relevant scientific constraint was missed” would be indistinguishable.

## Unchanged boundaries

The new constraints do not justify changing these parts of the original contract:

- a missing evaluation is still not a pass;
- a significant computation is still not automatically sufficient evidence;
- telemetry remains external unless deliberately admitted for scientific use;
- eligibility remains distinct from approval;
- absence of an admitted record still cannot prove that scratch work never occurred;
- tasks, agents, and operational runs do not become links in the logical support chain merely because they performed or hosted work.
