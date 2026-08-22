# Synthesis — blinded semantic concept map over the three Stage A designs

**Verbatim, unedited.** Everything below the horizontal rule is the complete
stdout of a fourth cold process, committed before it was read through.

Run 2026-08-20, `openai-codex/gpt-5.6-terra`, `--thinking high`, `--no-tools`,
`--cwd` an empty scratch directory, `--no-session`, stdin detached.

**What it was given:** the three Stage A outputs below their provenance headers,
labelled *Designer 1 / 2 / 3* with model identity withheld (verified: no
provider or model string survives in its prompt). Mapping, recorded here and not
given to it — 1 = `claude-opus-5`, 2 = `gpt-5.6-sol`, 3 = `grok-4.6`.

**What it was not given:** the design brief, the preregistered predictions,
LabKit's ontology, this repository, or any statement of what the map is for. It
was told what to produce, not why.

**Why blinded and cold.** The clustering step is where this session is the least
trustworthy reader available — it knows the thirteen node labels, the §3 ledger
and every prediction, so "cluster semantically" is exactly where three phrasings
could be nudged into the bucket that confirms H1. Mapping clusters onto the
domain, and the paired-world tests, come next and do need someone who knows the
model; clustering does not.

**Known weakness.** Only three model providers are authenticated on this
machine and all three are designers, so the synthesiser necessarily shares a
family with Designer 2 (`sol` and `terra` are both GPT-5.6). Blinding means it
does not know which output that is, but style is recognisable and a nudge toward
that framing cannot be ruled out. Recorded rather than papered over.

---

## 1. Clusters

### 1. **Actual evaluation, not merely named conditions** — Designers 1, 2, 3

An evaluable requirement has no outcome merely because it exists; the record must distinguish that it was checked, what was checked, and what happened. This supports a three-way distinction between passed, failed, and never evaluated rather than treating absence as a pass or a generic pending state.

- **Terms:** D1 **“Evaluation record”**; D2 **“Evaluation”**; D3 **“Evaluation.”**
- **Distinguishes:**
  - D1: “**a criterion nobody ever ran**” / “**evaluated on the held-out cohort and passed**.”
  - D2: “a criterion named `robustness_passed`” / “the robustness analysis was actually run and failed.”
  - D3: “**Criterion not run**” / “**Criterion failed**” / “**Criterion passed**.”
- **Remembered or derived:** The occurrence, inputs, evaluator, time, and outcome are remembered. Criterion and gate status are derived from those records; D1 and D3 state this most directly.

### 2. **Prespecified conditions determine whether a result counts as evidence** — Designers 1, 2, 3

A formally computed or statistically significant result is not automatically admissible support for a claim. Its evidential standing depends on conditions specified before its evidential use and on evaluations of those conditions.

- **Terms:** D1 **“Criterion”** and derived **“Evidential standing”**; D2 **“Criterion,” “Evidence,”** and **“Assessment”**; D3 **“Robustness condition”** and derived **“Evidential status.”**
- **Distinguishes:**
  - D1: “**The number came out significant. Does that count?**” / “**prespecified robustness condition failed**.”
  - D2: “The significant result is evidence for a narrow average-effect claim” / “the same result is sufficient evidence for the stronger all-subgroups claim.”
  - D3: “**p < 0.01, but the prespecified leave-one-site-out check failed**” / “p < 0.01 treated as evidence because nothing beyond the computation exists.”
- **Remembered or derived:** Conditions and their evaluations are remembered; whether evidence “counts” is derived. All three agree that a stored Boolean such as `supported=true` would be the wrong primitive.

### 3. **Separate standings for weaker and stronger propositions** — Designers 1, 2, 3

A broad question can contain propositions at different logical strengths, and support for the weaker one must not silently answer the stronger one. The surface must therefore show each proposition’s standing independently and preserve recorded implication relations.

- **Terms:** D1 **“Proposition”** and **“Strength ordering”**; D2 **“Question relation”** and implicit proposition-level relation in `explain_this_question` / `compare_these_questions`; D3 **“Proposition”** and **“Strength relation.”**
- **Distinguishes:**
  - D1: “**effect is non-zero**” / “**whether it reaches the threshold that would matter is still open**.”
  - D2: “**The method helps on average**” / “**the method helps every important subgroup**.”
  - D3: “**Better than placebo**” / “**better than standard of care**.”
- **Remembered or derived:** The propositions and justified stronger/weaker links must be remembered. A question’s partial-answer profile is derived.

### 4. **Explicit scope prevents false conflict and over-generalisation** — Designers 1, 2, 3

Claims, questions, evidence uses, and criteria apply only within stated populations, conditions, endpoints, or quantifiers. Scope overlap can be derived only after those asserted bounds are remembered.

- **Terms:** D1 **“Scope”**; D2 **“Scope”**; D3 **“Claim scope.”**
- **Distinguishes:**
  - D1: “**present below 30 °C and absent above 45 °C**” / “**the effect is present and the effect is absent**.”
  - D2: “**No effect in adults under protocol A**” / “**no effect in children under protocol B**.”
  - D3: “**Effect in adults 18–65 at this dose**” / “**effect in humans**.”
- **Remembered or derived:** The asserted scope and its revisions are remembered. Overlap, containment, and applicability are derived, subject to the shared vocabulary being sufficient.

### 5. **Conflict is an adjudication of question, scope, and grounds—not wording or numbers** — Designers 1, 2, 3

Two statements only genuinely conflict when they answer the same or overlapping question, apply over overlapping scope, and are incompatible within that overlap. Different questions, disjoint scope, or unequal evidential standing can yield an apparent conflict without a scientific contradiction.

- **Terms:** D1 derived **“Tension”** and `do_these_conflict`; D2 `do_these_claims_genuinely_conflict`; D3 **“Finding”** and `conflict`.
- **Distinguishes:**
  - D1: “**genuine conflict**” / “**apparent only — different questions**” and “**apparent only — disjoint scopes**.”
  - D2: “**Genuine conflict**” / “**Apparently conflicting but differently scoped**.”
  - D3: “**same … question, incompatible claims, overlapping scope**” / “**different questions, disjoint scopes, or one does not count as evidence**.”
- **Remembered or derived:** The question bindings, scopes, evidence links, and any human adjudication are remembered. A candidate tension or conflict verdict is derived unless someone has recorded an adjudicative judgement.

### 6. **Claims remain distinct from computations, results, and artefacts** — Designers 1, 2, 3

What the research holds can change even if its calculations and stored outputs have not changed. Conversely, an artefact may remain available after the claim formerly inferred from it is withdrawn or narrowed.

- **Terms:** D1 **“Claim,” “Claim status,” “Claim revision,”** and **“Inference link”**; D2 **“Claim,” “Assessment,” “Result,”** and **“Evidence”**; D3 **“Claim,” “Computation,” “Artefact,”** and **“Interpretation.”**
- **Distinguishes:**
  - D1: “**We now interpret the 2024 data as showing saturation rather than decline**” / “**the 2024 data changed**.”
  - D2: “**The computation produced \(p<0.05\)**” / “**the intervention is effective in the target population**.”
  - D3: “**The fitted model artefact is still in the archive, but we no longer claim the effect is real**” / “**We lost the model**.”
- **Remembered or derived:** Claims, revisions, interpretations, and source links are remembered. Current support or contestedness is derived partly from those links, although D1 and D2 retain explicitly attributed claim assessments/statuses that cannot be fully inferred.

### 7. **Recorded support and dependency paths support bounded invalidation** — Designers 1, 2, 3

The system must know which claims, decisions, and gates rely on which observations, analyses, results, evidence, and implementations. With those links, invalidation can weaken only the affected paths while retaining independently supported claims and intact upstream material.

- **Terms:** D1 **“Inference link,” “Invalidation,”** and derived **“Reconsideration set”**; D2 **“Dependency”** and `what_would_need_reconsideration_if_this_were_unusable`; D3 **“Dependency”** and `invalidation_blast`.
- **Distinguishes:**
  - D1: “**claims that depended on it but retain independent sufficient support**” / “**claims whose only support ran through the invalidated thing**.”
  - D2: “**The claim must be reconsidered because its only analysis failed**” / “**the claim remains supported by an independent experiment**.”
  - D3: “**Claim C rests on analysis A**” / “**Claim C was filed the day after A and rests on something else**.”
- **Remembered or derived:** Direct, typed dependencies are remembered; transitive blast radius and independent remaining support are derived. D1 explicitly limits answers to “recorded dependence,” while D2 and D3 make the same limitation through “cannot determine” where the link was never recorded.

### 8. **An invalid analysis is not automatically invalid observation** — Designers 1, 2, 3

The record distinguishes raw observations or measurements from their analytic treatment and from the claims inferred from that treatment. Invalidating an analysis may require reconsidering claims while leaving the observations available for a different analysis.

- **Terms:** D1 implicitly requires **observations** through `what_needs_reconsideration`: “**invalidating an analysis leaves the observations it consumed intact**”; D2 **“Observation,” “Analysis or computation,”** and **“Result”**; D3 **“Observation,” “Analysis,” “Computation,”** and **“Artefact.”**
- **Distinguishes:**
  - D1: “**Invalidating an analysis leaves the observations it consumed intact**” / “**Invalidating observations propagates further**.”
  - D2: “**The raw observations remain usable but their regression analysis was invalid**” / “**the underlying measurements themselves were corrupted**.”
  - D3: “**We throw out a buggy t-test and keep the spectrophotometer traces**” / “**We treat the traces as invalid because the t-test was**.”
- **Remembered or derived:** Observations, analyses, computations, and their provenance are remembered. What remains usable after a particular invalidation is derived from the invalidated item’s recorded scope and dependencies.

### 9. **Question formation is historical, not retrofitted foresight** — Designers 1, 2, 3

A question may begin vague and become sharper through documented reformulation, branching, or review. The past wording, reason for change, and relation to available confirmatory evidence must remain legible rather than being overwritten by the final formulation.

- **Terms:** D1 **“Question,” “Refinement,”** and **“Question origin”**; D2 **“Question,” “Question relation,” “Version,”** and **“Change event”**; D3 **“Question”** and **“Formulation.”**
- **Distinguishes:**
  - D1: “**does temperature matter?**” / “**does the effect vanish above 38 °C in the B-strain?**”
  - D2: “**The question was sharpened through documented review**” / “**the historical question was silently overwritten to match the eventual experiment**.”
  - D3: “**we noticed ‘the traces look periodic’**” / “**we always planned the frequency experiment**.”
- **Remembered or derived:** Historical formulations, origins, relations, reasons, and timing are remembered. Current wording and a lineage view are derived.

### 10. **Pre-commitment revision differs from post-lock amendment** — Designers 1, 2, 3

Design work may legitimately revise questions, procedures, criteria, or interpretations before confirmatory commitment. Once a lock or commitment exists, changes need an amendment history rather than being represented as ordinary editing.

- **Terms:** D1 **“Lock”** and **“Mode”**; D2 **“Commitment or lock,” “Version,”** and **“Change event”**; D3 **“Lock”** and **“Confirmatory commitment.”**
- **Distinguishes:**
  - D1: “**rewrote the analysis plan three times while still exploring, then locked it and ran**” / “**rewrote the analysis plan three times, one of them mid-study**.”
  - D2: “**specified before confirmatory data**” / “**added after the primary result was inspected**.”
  - D3: “**Outcome definition changed during design**” / “**Outcome definition changed after lock**.”
- **Remembered or derived:** The lock/commitment event, its authority, the exact committed form, and evidence availability are remembered. Whether a later change was pre- or post-commitment is derived from that history.

### 11. **Post-lock amendments have scientific meaning and exposure context** — Designers 1, 2, 3

A change after commitment may be a mechanical repair, a machinery-only change, or a change to the scientific question, endpoint, or criterion. Its classification and whether outcome or confirmatory evidence had been seen matter, but they do not establish intent or misconduct.

- **Terms:** D1 **“Amendment”** and **“Exposure state”**; D2 **“Amendment,” “Change classification,”** and **“Change event”**; D3 **“Amendment”** and **“Amendment class.”**
- **Distinguishes:**
  - D1: “**corrected a transposed reagent volume**” / “**changed the primary endpoint after seeing the interim analysis**.”
  - D2: “**A broken file path was repaired while preserving the estimator**” / “**the estimator was changed after seeing an unfavourable result**.”
  - D3: “**A fencepost error … fixed before unblinding**” / “**The primary outcome changed after a look at the data**.”
- **Remembered or derived:** The pre- and post-change forms, reason, classification, attribution, and exposure assertion are remembered. Effective procedure and consequences for prior criteria are derived; no designer permits intent to be inferred from the classification.

### 12. **Bounded study scope and spawned follow-up work** — Designers 1, 2, 3

A completed study has a declared question and claim scope that cannot silently absorb later surprises. New questions prompted by a result remain linked follow-up work, not retroactive expansion of what the completed study tested.

- **Terms:** D1 **“Question origin”** and `what_this_study_spawned`; D2 **“Study,” “Line of enquiry,”** and `what_new_work_came_from_this_study`; D3 **“Study,” “Study scope,”** and **“Follow-up work.”**
- **Distinguishes:**
  - D1: “**Study S-31 answered its prespecified question and, incidentally, raised a new one**” / “**Study S-31 investigated both questions**.”
  - D2: “**A surprising result led to a separate follow-up study**” / “**the original study silently expanded its confirmatory scope after seeing the result**.”
  - D3: “**The study asked Q1; Q2 was noticed afterwards and filed as new work**” / “**the study is now remembered as having been about Q1 and Q2**.”
- **Remembered or derived:** Declared study scope, completion, follow-up links, and question origins are remembered. Whether a question lies within the completed study is derived.

### 13. **Open, closed, and deliberately unresolved are different stances** — Designers 1, 2, 3

The system must distinguish active open work, supported positive or negative closure, supersession or abandonment, and deliberate acceptance of an unresolved question. An accepted unresolved question is not automatically a neglected backlog item or a programme failure.

- **Terms:** D1 **“Closure”** and **“Acceptance of unresolved”**; D2 **“Disposition”**; D3 **“Stance”** and **“Negative closure.”**
- **Distinguishes:**
  - D1: “**We have decided this is not worth resolving and it is fine as it is**” / “**this is on the list and nobody has got to it**.”
  - D2: “**Nobody has yet worked on this question**” / “**the programme deliberately accepts that this question will remain unresolved**.”
  - D3: “**Causal mechanism deliberately left unresolved**” / “**The mechanism question sits in a queue generating fake tasks**.”
- **Remembered or derived:** The stance/disposition decision, closure grounds, rationale, authority, and reopening conditions are remembered. Current programme and line summaries are derived.

### 14. **Programme identity is not the fate of one question or line** — Designers 1, 2, 3

A programme is a long-lived bounded endeavour that can contain multiple questions and, for D2 and D3, multiple lines of enquiry. A negative result can close a line without constituting programme-level failure.

- **Terms:** D1 **“Programme”**; D2 **“Research programme”**; D3 **“Programme.”**
- **Distinguishes:**
  - D1: “**Claim A … and Claim B … both concern ‘stability at 40 °C’ and are unrelated**” / “**two answers to the same question and one of them is wrong**.”
  - D2: “**This line produced a strong negative answer**” / “**the entire research effort failed**.”
  - D3: “**does this assay detect X in saliva?**” closes negatively / “**The programme is written off because that assay failed**.”
- **Remembered or derived:** Programme identity and evolving membership/boundary are remembered. Current questions, claims, and overall standing are derived.

### 15. **A procedure, its executions, and its machinery are not interchangeable** — Designers 1, 2, 3

The specified scientific method, an occasion on which it was carried out, and the implementation or instrument that realised it answer different questions. Keeping them distinct permits independent executions, faithful reconstructions, and machinery changes without silently changing the science.

- **Terms:** D1 **“Procedure,” “Study,”** and **“Implementation role”**; D2 **“Procedure,” “Execution,”** and **“Implementation”**; D3 **“Procedure,” “Execution,”** and **“Implementation.”**
- **Distinguishes:**
  - D1: “**three independent executions**” / “**one execution that was written up three times**.”
  - D2: “**The same committed analysis was run on new hardware**” / “**a different estimator was substituted after results were seen**.”
  - D3: “**We re-ran the science on new samples**” / “**We reimplemented the analysis**.”
- **Remembered or derived:** Procedure forms, carrying-outs, implementations, inputs, and outputs are remembered. Similarity and the scientific implications of a change are derived from them.

### 16. **Promotion requires evaluated criteria, not enthusiasm or object existence** — Designers 1, 2, 3

Stage advancement and implementation promotion are governed by explicit criteria and the evaluations against them. Calculated eligibility is distinct from a recorded human or organisational promotion decision where the design represents one.

- **Terms:** D1 **“Stage,” “Promotion,”** and **“Gate”**; D2 **“Stage,” “Gate,” “Decision,”** and **“Role assignment”**; D3 **“Stage,” “Promotion criterion,” “Promotion,”** and **“Implementation role.”**
- **Distinguishes:**
  - D1: “**advanced to full study because gate G-4 was evaluated and passed**” / “**an agent decided it was ready and moved it**.”
  - D2: “**The candidate satisfied all promotion criteria**” / “**the candidate was actually designated as the new reference**.”
  - D3: “**Feasibility done, expensive run not earned**” / “**Someone named the stage ‘ready’**.”
- **Remembered or derived:** Criteria, evaluations, role assignments, and promotion decisions are remembered. Eligibility or “earned” status is derived.

### 17. **Reconstruction is graded recovery, never plausible fabrication** — Designers 1, 2, 3

Recovery of a past execution, procedure, artefact, or environment must distinguish exact recovery, bounded approximation, and unresolved provenance. Unknown pieces must remain explicit rather than being filled with a likely substitute and presented as the original.

- **Terms:** D1 **“Environment fingerprint,” “Provenance record,”** and **“Reconstruction grade”**; D2 **“Reconstruction attempt”** and **“Fidelity level”**; D3 **“Reconstruction grade.”**
- **Distinguishes:**
  - D1: “**identity pinned and verified**” / “**The container was probably the 2024-03 image**.”
  - D2: “**recovered byte-for-byte**” / “**a modern reimplementation produces roughly similar plots**.”
  - D3: “**Original container digest in hand**” / “**A rewrite from memory that ‘should be close’**.”
- **Remembered or derived:** Surviving ingredient identities, provenance assertions, sources, and comparison evidence are remembered. The grade is derived and can change as new material is recovered.

### 18. **Reproduction of a conclusion differs from reproduction of an execution** — Designers 1, 2, 3

Independent confirmation of a scientific conclusion and faithful rerunning of a prior execution require different targets and criteria. A result in one category cannot silently be reported as success in the other.

- **Terms:** D1 **“Replication attempt, and replication kind”**; D2 **“Reproduction attempt”** and **“Fidelity level”**; D3 **“Reproduction attempt”** and **“Reproduction kind.”**
- **Distinguishes:**
  - D1: “**same conclusion, independent execution**” / “**same execution, same result**.”
  - D2: “**A new independent execution reached the same conclusion**” / “**the old output file was opened again and gave the same displayed number**.”
  - D3: “**Another lab reached the same conclusion with a different pipeline**” / “**We bit-reproduced the original job**.”
- **Remembered or derived:** Attempt target, kind, comparison criteria, later execution, and evaluations are remembered. Success is derived relative to the declared kind.

### 19. **Same science/new machinery has equivalence obligations** — Designers 1, 2, 3

Replacing or accelerating an implementation is not a new scientific execution, and its correctness is judged against a trusted reference under declared equivalence criteria. A performance improvement alone cannot confer scientific trust or promotion.

- **Terms:** D1 **“Implementation role”** and **“Equivalence requirement and equivalence evidence”**; D2 **“Implementation,” “Role assignment,”** and **“Criterion”**; D3 **“Correctness kind,” “Implementation role,”** and **“Equivalence evidence.”**
- **Distinguishes:**
  - D1: “**swapping machinery under a fixed science**” / “**running the science again**.”
  - D2: “**The trusted algorithm was rerun with a faster but unvalidated implementation**” / “**the trusted implementation itself was rerun on new data**.”
  - D3: “**Ported the analysis to a new language**” / “**Ran the procedure on new samples**.”
- **Remembered or derived:** Reference/candidate role assignments, equivalence criteria, and their evaluations are remembered. Whether a candidate has earned promotion is derived.

### 20. **Scientific-record membership separates captured scratch from citable grounds** — Designers 1, 2, 3

Exploration may be retained and discoverable without becoming evidence for standing or claims. Membership in the scientific record must therefore be explicit and must not be inferred from an item’s existence.

- **Terms:** D1 **“Mode”** (`scratch`) and the non-citability boundary in `what_is_not_in_the_record`; D2 **“Record status”**; D3 **“Scientific record,” “Scratch,”** and **“Admission.”**
- **Distinguishes:**
  - D1: “**throwaway plots**” / “**nothing returned here may be cited as support**.”
  - D2: “**A disposable exploratory notebook happened to mention an idea**” / “**the notebook was deliberately admitted as evidence for a claim**.”
  - D3: “**Captured, not admitted**” / “**On the record**.”
- **Remembered or derived:** Capture/status/admission and restrictions on use are remembered. Whether ordinary standing operations may cite an item is derived from that status.

### 21. **Historical views require retained temporal history** — Designers 1, 2, 3

A past view must be reconstructed from records, versions, assessments, and decisions available under its stated temporal interpretation. It must not import later knowledge or silently collapse when something was believed with when it was recorded.

- **Terms:** D1 **“Record time and event time”** and `as_of` / `believed_at`; D2 **“As-of view”**; D3 **“Belief / standing (aggregate)”** reconstructed “at a time.”
- **Distinguishes:**
  - D1: “**Recorded by 3 March**” / “**Asserted as held on 3 March but written down later**.”
  - D2: “**before the robustness failure was discovered**” / “**what they believe now after reassessment**.”
  - D3: “**past standing is reconstructed from what claims held at that date**” / current standing.
- **Remembered or derived:** Underlying event/effective times and changes are remembered. The historical view itself is derived; only D1 requires the additional record-time versus believed-at dual reading.

### 22. **Answers expose grounds, gaps, and limits rather than manufacture certainty** — Designers 1, 2, 3

A read answer must show the evidence and reasoning it used, disclose missing or disputed information, and say when it cannot determine the requested fact. The system reports recorded belief and governance state, not world truth, intent, forecasts, rankings, or an invented probability.

- **Terms:** D1 **“basis,” “outstanding,”** and its refusal set; D2 **“determined, partly determined, or cannot determine”**; D3 **“cannot tell”** and its refusal set.
- **Distinguishes:**
  - D1: “**The record cannot say whether this is true**” / “**the research currently holds it**.”
  - D2: “**Nothing is recorded, so this was never tried, correct?**” / refusal of that bundled premise.
  - D3: “**Correspondence truth is not a LabKit object**” / “**what the research currently holds and on what grounds**.”
- **Remembered or derived:** Grounds, reasons, and known gaps are remembered where recorded. Answer completeness, unresolvedness, and refusal are derived properties of the available record.

### 23. **No programme health score, completion queue, or recommendation is derivable** — Designers 1, 2, 3

Programme state is a structured epistemic view, not a score or progress bar, and open questions are not automatically defects. The read surface may expose gates, unresolved questions, and criteria, but it must not convert them into a recommendation about what to do.

- **Terms:** D1 **“no score, index, or health rating”** and `what_should_I_run_next` refusal; D2 **“not a dashboard or aggregate success metric”** and `what_should_we_do_next` refusal; D3 **“nothing that looks like a completion percentage”** and `promotion` without prescription.
- **Distinguishes:**
  - D1: “**fourteen open questions**” / “**three**” open questions, neither being “worse.”
  - D2: “**unresolved work expected to continue**” / “**unresolved work deliberately not queued**.”
  - D3: “**accepted as unresolved**” / “**a queue of remaining greens**.”
- **Remembered or derived:** No separate score or recommendation is remembered or derivable. The underlying state—stances, gates, criteria, and evidence—is remembered or derived under the preceding clusters.

---

## 2. Two-designer clusters

### 24. **A line of enquiry is distinct from both programme and individual question** — Designers 2, 3

A line of enquiry is a coherent thread that may contain branches and several questions, and may close without ending its programme. It provides a unit of standing and closure larger than one question but smaller than the whole endeavour.

- **Terms:** D2 **“Line of enquiry”**; D3 **“Line of enquiry.”** D1 does not require a separate such entity: `what_closed_this_line` accepts “**a closed question**,” and D1’s lineage is expressed through questions/refinements instead.
- **Distinguishes:**
  - D2: “**A negative answer closed the specific calibration enquiry**” / “**the negative answer terminated the whole programme**.”
  - D3: “**a thread of questions that can be closed**” / “**the programme**.”
- **Remembered or derived:** D2 and D3 remember opening, constituent questions, branch relations, and closure/continuation. Current line standing is derived.

### 25. **Admission is an explicit transition from captured work to record-bearing material** — Designers 2, 3

An item can be captured or retained without being admitted as scientific grounds, and later admission must itself be attributable. This is stronger than simply displaying a scratch/non-scratch label at read time.

- **Terms:** D2 **“Record status”**; D3 **“Admission.”** D1 has a scratch/citability boundary but requires re-execution under a recorded procedure before scratch can support a claim, rather than describing admission of the same scratch item.
- **Distinguishes:**
  - D2: “**a disposable exploratory notebook**” / “**deliberately admitted as evidence for a claim**.”
  - D3: “**captured, not admitted**” / “**on the record**.”
- **Remembered or derived:** D2 and D3 remember status/admission, its effective time, rationale, and authority. Current membership is derived.

---

## 3. Singletons

### 26. **Bitemporal belief versus recording chronology** — Designer 1 only

A historical answer may ask either what had been written into the record by a date or what researchers asserted they believed at that date, even if recorded later. These are separately answerable readings, not a generic as-of view.

- **Term:** D1 **“Record time and event time,”** exposed as `as_of` and `believed_at`.
- **Distinguishes:** “**Recorded by 3 March: claims A and B**” / “**Asserted as held on 3 March but written down later: claim C**.”
- **Memory:** Both timestamps and the provenance of backfilled entries must be remembered; each temporal reading is derived. D2 and D3 require historical views but do not require this explicit dual interpretation.
- **What it buys / absence costs:** It prevents a backfilled September record from being silently represented as knowledge recorded in March.

### 27. **Programme-wide candidate-tension discovery** — Designer 1 only

The system can scan a programme for possible tensions and return them as candidates for later adjudication rather than declaring them conflicts. This is different from comparing a caller-supplied pair of claims.

- **Term:** D1 derived **“Tension”** in `where_the_record_disagrees`.
- **Distinguishes:** “**candidate tensions**” caused by “**overlapping scope with opposing direction**” / an adjudicated **“genuine conflict.”**
- **Memory:** The underlying claims, scopes, support, and invalidation links are remembered; the candidate list is derived.
- **What it buys / absence costs:** It makes quiet contradictions discoverable without pretending a broad scan can decide them. D2 and D3 provide pairwise conflict adjudication and programme standing, but not this explicit candidate-discovery operation.

### 28. **One universal response envelope for basis and outstanding evidence** — Designer 1 only

Every answer carries a uniform `basis` and `outstanding` field rather than leaving each operation to describe provenance and missing information differently. This makes “what was read?” and “what would change this answer?” stable questions across the surface.

- **Terms:** D1 **“basis”** and **“outstanding.”**
- **Distinguishes:** “**which records were read and the as-of used**” / “**what evidence, evaluation, or judgement is absent that would change this answer**.”
- **Memory:** Read records and missing underlying evidence are remembered where available; the envelope is derived per answer.
- **What it buys / absence costs:** D2 and D3 require grounds and indeterminacy, but neither requires one common returned shape. Without that requirement, callers must learn operation-specific ways to discover provenance and gaps.

### 29. **Scratch must be declared at creation and has retention state** — Designer 1 only

Scratch is not only non-citable; its mode is fixed when created so that later relabelling cannot erase inconvenient outcomes. Scratch also has explicit retention states rather than merely current record membership.

- **Terms:** D1 **“Mode”** and scratch **“retention state (kept / expiring / expired).”**
- **Distinguishes:** “**Scratch must be declared at creation**” / “**retroactive scratch-marking is how inconvenient results disappear**.”
- **Memory:** Scratch mode at creation and retention state are remembered.
- **What it buys / absence costs:** It prevents post hoc removal of adverse work from the evidential boundary and makes retained exploratory material findable. D2 and D3 protect admission and non-citability but do not require this creation-time rule or retention lifecycle.

### 30. **Partly evaluated and indeterminate gate states** — Designer 2 only

A multi-criterion gate may be neither wholly evaluated nor simply unevaluated, and may be indeterminate because available evidence cannot resolve an applicable criterion. These are distinct from passed and failed.

- **Term:** D2 derived gate states **“partly evaluated”** and **“indeterminate.”**
- **Distinguishes:** “**not evaluated**” / “**partly evaluated**” / “**indeterminate**.”
- **Memory:** Individual criterion evaluations and applicability facts are remembered; the richer composite gate state is derived.
- **What it buys / absence costs:** It avoids collapsing a partially assessed gate into either no progress or failure. D1’s and D3’s stated gate vocabularies explicitly foreground passed/failed/unevaluated or earned/not-earned/cannot-tell rather than this separate partial state.

### 31. **A generic, attributable assessment as a first-class historical judgement** — Designer 2 only

D2 requires one semantic category for time-bounded judgements across claim support, evidence integrity, conflict, equivalence, fidelity, and amendment classification. The category preserves disagreement and reassessment without asserting that any one such judgement is a raw fact.

- **Term:** D2 **“Assessment.”**
- **Distinguishes:** “**the analysis artefact has not changed, but reviewers no longer consider it sufficient**” / “**the analysis itself was rerun and produced a different result**.”
- **Memory:** Subject, criteria, evidence, outcome, assessor, time, rationale, and disagreement are remembered.
- **What it buys / absence costs:** D1 and D3 retain individual judgements—claim status, amendment class, evaluations, adjudications—but do not require a single cross-cutting assessment requirement. Without D2’s generic requirement, those common historical properties must be reproduced separately for each judgement kind.

### 32. **The recorded occasion for doing work** — Designer 3 only

Two otherwise similar runs can be distinct epistemic events because they were undertaken for different reasons: feasibility, repair, confirmation, follow-up, or equivalence validation. The reason must be recorded as the work’s occasion, not inferred from later usefulness.

- **Term:** D3 **“Occasion.”**
- **Distinguishes:** “**A cheap run done to show a locked procedure is executable**” / “**The same run offered as confirmatory evidence for the scientific claim**.”
- **Memory:** The stated reason for the work is remembered; no important part of it is safely derivable later.
- **What it buys / absence costs:** It prevents a feasibility run from being retrospectively treated as confirmatory evidence. D1 and D2 record purpose in narrower places—question origins, study purpose, stages, evidence role—but do not name this general requirement for every work item.

### 33. **No unrun counterfactual claims about amendments** — Designer 3 only

The record may expose the locked original, the amendment, and the claim that was actually made, but it does not simulate the claim that would have resulted without the amendment. A counterfactual execution is not recoverable from the historical log.

- **Term:** D3 refusal of “**What would we have claimed if we had not amended the procedure?**”
- **Distinguishes:** “**the original procedure, the amendment, and the claim that was actually made**” / “**the unrun counterfactual**.”
- **Memory:** The actual history is remembered; the unrun alternative is neither remembered nor derivable.
- **What it buys / absence costs:** It prevents an apparently authoritative reconstruction of a study that never happened. D1 and D2 refuse other forms of fabrication but do not expressly state this counterfactual boundary.

### 34. **External literature, priority, and credit are outside the programme record unless entered** — Designer 3 only

The surface does not infer what the wider literature says, who deserves credit, or whether work has been scooped. Those may be represented only if this programme has actually recorded them as observations or claims.

- **Term:** D3 refusal: “**LabKit is not a citation graph, a priority tribunal, or a search engine**.”
- **Distinguishes:** “**entered as observations or claims in this programme**” / “**what the literature already say[s]**.”
- **Memory:** Any entered observation or claim is remembered; the unrecorded external world is not derivable.
- **What it buys / absence costs:** It prevents the record from claiming external completeness or adjudicating priority from internal material. D1 and D2 set other scope boundaries, especially metrics and advice, but do not state this one.

---

## 4. Genuine disagreements

### Claim identity under substantive revision

- **D1:** A claim remains the same when its scope narrows: “**a narrowed scope is a revision of the same claim**.”
- **D2:** A materially revised proposition or scope is “**a new linked claim**.”
- **D3:** A revised statement is ordinarily “**history of the same claim**,” unless there is “**an explicit split**.”

These cannot all govern the same revision. What turns on it is whether a reader follows one continuing claim’s revision history or sees a chain of distinct claims, and therefore how support, withdrawal, and dependency histories attach across the change.

### Question identity under strengthening or scope change

- **D1:** A question persists where “**subject matter is continuous**,” even after sharpening, unless a recorded decision says the narrowing means the original is no longer being asked.
- **D2:** A “**materially stronger, weaker, differently scoped, or newly motivated proposition is a distinct linked question**.”
- **D3:** A question persists across reformulation, while “**a split or a surprising follow-up is a new question**.”

D1 and D3 permit more continuity than D2’s stated strengthening/scope rule. What turns on it is whether a stronger or narrower formulation is one historical question with refinement links or a separately identified question whose answer must never be reported as the earlier question’s answer.

### The study/execution cardinality

- **D1:** “**Study: A single execution of a procedure**”; rerunning produces “**a different study, always**.”
- **D2:** A study is a bounded undertaking that “**may have several stages and executions**.”
- **D3:** A study is a bounded investigation, while **“Execution”** is a distinct performance of its procedure.

D1 identifies a study with one execution, while D2 and D3 distinguish the study-level scientific undertaking from its executions. What turns on it is whether multiple performances under one governed design are represented as one study’s executions or as multiple studies.

### Whether captured scratch can later become evidential without re-execution

- **D1:** “**That work is scratch and cannot support a claim. To make it citable it must be re-executed under a recorded procedure.**”
- **D2:** A notebook may be “**deliberately admitted as evidence for a claim**.”
- **D3:** “**Same item can later be admitted; it is then on the record**.”

D1 requires a new recorded execution before scratch can become citable, whereas D2 and D3 permit an explicit admission path for the retained item itself. What turns on it is whether historical exploratory material can ever become grounds by governance/admission alone.

### Gate-state vocabulary for incomplete evidence

- **D1:** Gate verdicts are “**passed, failed, or unevaluated**.”
- **D2:** Adds “**partly evaluated**” and “**indeterminate**.”
- **D3:** Uses pass/fail/**“not evaluated”**, and uses **“cannot tell”** more generally.

D2 asserts that partial coverage and indeterminacy are distinct gate outcomes; D1’s declared gate result vocabulary does not include them. What turns on it is whether a gate with some evaluated conditions but unresolved others is reported in its own category or collapsed into a broader unevaluated/unknown result.

---

## 5. What none of them asked for

I find no uncovered obligation in the source material as quoted through the three designs’ “Serves statement(s)” references.

The source obligations numbered **1–18** all have coverage: historical question formation; strength ordering; prespecified evidential conditions; negative closure; scoped conflict; pre-commitment revision; post-lock amendment classification; promotion gates; graded reconstruction; reproduction kinds; bounded invalidation; claim/source separation; spawned follow-up work; accepted unresolved questions; implementation equivalence; distinction between new science and new machinery; actual evaluations; and the scratch/scientific-record boundary.
