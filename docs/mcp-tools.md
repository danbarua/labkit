# LabKit — the tools

Generated from the server's own tool declarations. Served live at
`labkit://docs/tools`, and checked in at `docs/mcp-tools.md` — the two are
held identical by a test, so neither can disagree with the tools.

LabKit records **why** a piece of research was done and what rests on it:
questions, the lines of enquiry pursuing them, what was measured, what was
concluded, and what any of it is holding up. Work through it rather than
through notes, and the record can answer questions notes cannot.

## Recording work

These change the record.

- [`pose`](#pose) — Ask a question
- [`pursue`](#pursue) — Open a line of enquiry on an existing question
- [`open_enquiry`](#open-enquiry) — Ask a question and start on it
- [`record_observations`](#record-observations) — Record what was measured
- [`record_analysis`](#record-analysis) — Record a computation and what it concluded
- [`close_enquiry`](#close-enquiry) — Close a line of enquiry
- [`sharpen`](#sharpen) — Narrow a question into a more precise one
- [`record_review`](#record-review) — Record a verdict on an analysis
- [`plan_work`](#plan-work) — State an objective and what would count as meeting it
- [`state_criterion`](#state-criterion) — State a condition, before anything is run
- [`declare_gate`](#declare-gate) — Bind conditions to the work they gate
- [`evaluate_criterion`](#evaluate-criterion) — Record a check's outcome
- [`reverify`](#reverify) — Re-run a historical analysis under current observations
- [`accept_as_unresolved`](#accept-as-unresolved) — Leave a question open on purpose
- [`promote`](#promote) — Make a finding citable
- [`amend_design`](#amend-design) — Change a locked condition, and say what it costs
- [`replace_analysis`](#replace-analysis) — Supersede a defective analysis
- [`reinterpret`](#reinterpret) — Narrow what a claim is taken to mean

## Asking about the record

These change nothing.

- [`known`](#known) — What the programme knows
- [`why_supported`](#why-supported) — Why a conclusion counts as supported
- [`what_depends_on`](#what-depends-on) — What rests on a record
- [`enquiry_status`](#enquiry-status) — Whether a line of enquiry is open
- [`design_history`](#design-history) — How a gate's conditions were amended
- [`interpretation_history`](#interpretation-history) — How a claim's reading was narrowed
- [`reproduction_of`](#reproduction-of) — Whether a re-run reproduced its original
- [`claims_asserting`](#claims-asserting) — Which claims assert a proposition
- [`pursuits_of`](#pursuits-of) — The lines of enquiry under a question
- [`origin_of`](#origin-of) — Where a question came from
- [`contract_for`](#contract-for) — What a piece of planned work is for
- [`criteria_governing`](#criteria-governing) — Which conditions a gate is bound to
- [`gate_status`](#gate-status) — Whether a gate is satisfied, and on what
- [`do_these_conflict`](#do-these-conflict) — Whether two conclusions actually disagree
- [`reproducibility_of`](#reproducibility-of) — Whether an analysis could be rebuilt from what it read

---

## known

*What the programme knows* — read-only

What this research programme currently knows, partitioned by how well each answer is held up: established, provisional, accepted as unresolved, unresolved, untested. Given `at` (an ISO instant) it answers as of that moment instead, from durable state rather than a log — but the historical form cannot split `open` into worked-on and untouched, because nothing records when work began.

**Takes**

- `at?`: string — ISO instant, e.g. 2026-08-21T09:00:00.000Z

**Returns** one of two shapes, depending on whether `at` was given.

*Without `at` — what is known now:*

- `established`: object[]
  - `question`: object
    - `kind`: "question"
    - `id`: string
  - `asks`: string
- `unresolved`: object[]
  - `question`: object
    - `kind`: "question"
    - `id`: string
  - `asks`: string
- `untested`: object[]
  - `question`: object
    - `kind`: "question"
    - `id`: string
  - `asks`: string
- `provisional`: object[]
  - `question`: object
    - `kind`: "question"
    - `id`: string
  - `asks`: string
- `accepted`: object[]
  - `question`: object
    - `kind`: "question"
    - `id`: string
  - `asks`: string

*With `at` — what was known then:*

- `at`: string
- `established`: object[]
  - `question`: object
    - `kind`: "question"
    - `id`: string
  - `asks`: string
- `provisional`: object[]
  - `question`: object
    - `kind`: "question"
    - `id`: string
  - `asks`: string
- `accepted`: object[]
  - `question`: object
    - `kind`: "question"
    - `id`: string
  - `asks`: string
- `open`: object[]
  - `question`: object
    - `kind`: "question"
    - `id`: string
  - `asks`: string

---

## why_supported

*Why a conclusion counts as supported* — read-only

Why a proposition counts as supported (or does not): the findings resting under it, the findings bearing against it, the prespecified standard it is held to and which checks are unmet, what re-checked it, and what has been superseded. Three states share `supported: false` and the answer keeps them apart — nothing has examined it, evidence bears against it (`challenged`), or the record no longer asserts this wording (`withdrawn`, with `replacedBy`). Refuses when the same sentence is asserted in more than one line of enquiry: pass `analysis` to say which one, rather than retrying the bare proposition. A claim is identified by its proposition within an enquiry, never by wording alone.

**Takes**

- `claim`: string — the claim's id, e.g. CLM_4 — from record_analysis

**Returns**

- `proposition`: string
- `supported`: boolean
- `standing`: "exploratory" | "confirmatory"
- `promotedBecause?`: string
- `support`: object[]
  - `finding`: string
  - `evidence`: object
    - `kind`: "evidence"
    - `id`: string
  - `method`: string
  - `analysis`: object
    - `kind`: "analysis"
    - `id`: string
- `reverifiedBy`: object[]
  - `analysis`: object
    - `kind`: "analysis"
    - `id`: string
  - `method`: string
- `standard`: object[]
  - `criterion`: object
    - `kind`: "criterion"
    - `id`: string
  - `proposition`: string
  - `state`: "passed" | "failed" | "never-run" | "no-standing-verdict"
  - `evaluations`: object[]
    - `evaluation`: object
      - `kind`: "evaluation"
      - `id`: string
    - `criterion`: object
      - `kind`: "criterion"
      - `id`: string
    - `value`: string
    - `outcome`: "pass" | "fail"
    - `at`: string
    - `withdrawn?`: true
    - `basis`: object[]
      - `evidence`: object
      - `states`: string
  - `decidedBy?`: object
    - `evaluation`: object
      - `kind`: "evaluation"
      - `id`: string
    - `criterion`: object
      - `kind`: "criterion"
      - `id`: string
    - `value`: string
    - `outcome`: "pass" | "fail"
    - `at`: string
    - `withdrawn?`: true
    - `basis`: object[]
      - `evidence`: object
      - `states`: string
- `unmet`: object[]
  - `criterion`: object
    - `kind`: "criterion"
    - `id`: string
  - `requires`: string
- `restingOn`: object[]
  - `part`: object
    - `kind`: "observations"
    - `id`: string
  - `name`: string
- `superseded`: object[]
  - `finding`: string
  - `evidence`: object
    - `kind`: "evidence"
    - `id`: string
  - `method`: string
  - `analysis`: object
    - `kind`: "analysis"
    - `id`: string
  - `reason`: string
  - `bearing`: "supports" | "challenges"
- `challenged`: boolean
- `against`: object[]
  - `finding`: string
  - `evidence`: object
    - `kind`: "evidence"
    - `id`: string
  - `method`: string
  - `analysis`: object
    - `kind`: "analysis"
    - `id`: string
- `withdrawn`: boolean
- `replacedBy?`: object
  - `claim`: object
    - `kind`: "claim"
    - `id`: string
  - `asserts`: string

---

## what_depends_on

*What rests on a record* — read-only

What would be affected if a record turned out to be wrong: the claims and lines of enquiry reached from it, walking the pipeline downstream through every analysis built on top of it. Takes an artefact's logical name, or its id when a name identifies more than one. The answer is a lower bound and says so: anything connected by a route not listed is absent from the lists, not thereby unaffected.

**Takes**

- `artefact`: string — logical name, or an ART_… id

**Returns**

- `claims`: object[]
  - `claim`: object
    - `kind`: "claim"
    - `id`: string
  - `asserts`: string
- `enquiries`: object[]
  - `enquiry`: object
    - `kind`: "enquiry"
    - `id`: string
  - `pursuing`: string
- `routesWalked`: string[]
- `complete`: false

---

## enquiry_status

*Whether a line of enquiry is open* — read-only

Whether a line of enquiry is still open, and if not how it closed — answered, abandoned, or deliberately left open — with the answer and the evidence behind it.

**Takes**

- `enquiry`: string — enquiry id, e.g. LOE_7

**Returns**

- `enquiry`: object
  - `kind`: "enquiry"
  - `id`: string
- `pursuing`: string
- `contributed`: object[]
  - `evidence`: object
    - `kind`: "evidence"
    - `id`: string
  - `states`: string
- `question`: object | null
  - `question?`: object
    - `kind`: "question"
    - `id`: string
  - `asks?`: string
  - `open?`: boolean
  - `closure?`: "answered" | "abandoned" | "accepted-as-unresolved" | null
  - `answer?`: "yes" | "no" | null
  - `reopensIf?`: string
  - `acceptedBecause?`: string
  - `restsOn?`: "exploratory" | "confirmatory"
  - `evidence?`: object[]
    - `evidence`: object
      - `kind`: "evidence"
      - `id`: string
    - `states`: string

---

## design_history

*How a gate's conditions were amended* — read-only

How the conditions on a gate reached their current wording: each amendment, its reason, and whether it was mechanical or substantive. Ordered from the record itself rather than from timestamps. Takes the gate's id — the conditions belong to the gate, so that is the handle, not the design's name.

**Takes**

- `gate`: string — gate id, e.g. GATE_1

**Returns**

- `gate`: object
  - `kind`: "gate"
  - `id`: string
- `originally`: object
  - `criterion`: object
    - `kind`: "criterion"
    - `id`: string
  - `requires`: string
- `nowRequires`: object
  - `criterion`: object
    - `kind`: "criterion"
    - `id`: string
  - `requires`: string
- `criterion`: object
  - `kind`: "criterion"
  - `id`: string
- `amendments`: object[]
  - `amendment`: object
    - `kind`: "decision"
    - `id`: string
  - `replaced`: object
    - `criterion`: object
      - `kind`: "criterion"
      - `id`: string
    - `requires`: string
  - `nowRequires`: object
    - `criterion`: object
      - `kind`: "criterion"
      - `id`: string
    - `requires`: string
  - `reason`: string
  - `citing`: object[]
    - `evidence`: object
      - `kind`: "evidence"
      - `id`: string
    - `states`: string
  - `rerun`: object[]
    - `work`: object
      - `kind`: "work"
      - `id`: string
    - `objective`: string
  - `nature`: "mechanical" | "scientific"

---

## interpretation_history

*How a claim's reading was narrowed* — read-only

How a claim's current reading was arrived at: each earlier wording, the decision that narrowed it and why. Takes the proposition as currently worded and walks backwards.

**Takes**

- `claim`: string — the claim's id, e.g. CLM_4

**Returns**

- `originally`: string
- `nowClaims`: string
- `revisions`: object[]
  - `revision`: object
    - `kind`: "decision"
    - `id`: string
  - `previously`: string
  - `nowClaims`: string
  - `reason`: string
  - `restingOnTheOldReading`: object[]
    - `question`: object
      - `kind`: "question"
      - `id`: string
    - `asks`: string

---

## reproduction_of

*Whether a re-run reproduced its original* — read-only

What a verifying analysis re-checked and whether it reproduced the original — derived from what each run recorded consuming, not from a stored flag, so there is no value anyone can set to `reproduced`. Takes the id of the analysis that did the verifying, not the one being verified.

**Takes**

- `analysis`: string — id of the verifying analysis, e.g. COMP_5

**Returns**

- `verification`: object
  - `kind`: "analysis"
  - `id`: string
- `verificationMethod`: string
- `of`: object
  - `kind`: "analysis"
  - `id`: string
- `ofMethod`: string
- `conclusion`: "agrees" | "disagrees"
- `execution`: "reproduced" | "not-reproduced"
- `differs`: object[]
  - `what`: object
    - `part`: object
      - `kind`: "observations"
      - `id`: string
    - `name`: string
  - `standing`: "unrecorded-in-the-original" | "changed" | "not-used-by-the-re-run"
- `bearing`: "raises" | "lowers"
- `comparable`: boolean
- `incomparableBecause?`: string

---

## claims_asserting

*Which claims assert a proposition* — read-only

The claims asserting a sentence. **The one place wording is resolved**: every other tool takes a claim id, and this is how a caller holding only text finds one. Returns all matches rather than picking — two lines of enquiry can assert the same sentence about different endpoints, and they are two claims (S-5). `record_analysis` hands back claim ids directly, so an agent that recorded the work never needs this.

**Takes**

- `proposition`: string — the sentence, as worded

**Returns**

- `claims`: object[]
  - `claim`: object
    - `kind`: "claim"
    - `id`: string
  - `asserts`: string

---

## pursuits_of

*The lines of enquiry under a question* — read-only

Every line of enquiry pursuing a question. This is how a caller that did not open an enquiry itself finds one to work in: `known` gives question ids, this gives the enquiry ids beneath them, and every recording verb takes an enquiry. An empty list means the question is on the books and nothing has been started on it.

**Takes**

- `question`: string — question id, e.g. Q_12

**Returns**

- `enquiries`: object[]
  - `kind`: "enquiry"
  - `id`: string

---

## origin_of

*Where a question came from* — read-only

Where a question came from, when it came from sharpening an earlier one — the question it narrowed, why, and **what was known at that moment**, frozen when the sharpening was recorded rather than recomputed now. `origin` is null for a question somebody simply asked, which is most of them; that is an answer, not a failure.

**Takes**

- `question`: string — question id, e.g. Q_12

**Returns**

- `origin`: object | null
  - `from?`: object
    - `kind`: "question"
    - `id`: string
  - `fromAsks?`: string
  - `reason?`: string
  - `knownAtTheTime?`: object[]
    - `evidence`: object
      - `kind`: "evidence"
      - `id`: string
    - `states`: string

---

## contract_for

*What a piece of planned work is for* — read-only

A planned piece of work's objective, what would count as meeting it, and what it may read. `enforced` is always false and says so: the record states what the work may look at, and nothing stops a computation reading elsewhere.

**Takes**

- `work`: string — work id, e.g. TASK_1

**Returns**

- `work`: object
  - `kind`: "work"
  - `id`: string
- `objective`: string
- `acceptance`: string
- `mayRead`: string[]
- `enforced`: false

---

## criteria_governing

*Which conditions a gate is bound to* — read-only

The prespecified conditions a gate is governed by. Pair it with `gate_status` to get their current standing; this answers only which conditions apply.

**Takes**

- `gate`: string — gate id, e.g. GATE_1

**Returns**

- `criteria`: object[]
  - `kind`: "criterion"
  - `id`: string

---

## gate_status

*Whether a gate is satisfied, and on what* — read-only

A gate's state, itemised per condition: which checks passed, which failed, which were never run, and which have no standing verdict. **Computed, never stored** — there is no value anyone can set to `satisfied`, and `everFailed` survives a later pass, so a gate that failed and was re-checked does not read as though it never failed.

**Takes**

- `gate`: string — gate id, e.g. GATE_1

**Returns**

- `gate`: object
  - `kind`: "gate"
  - `id`: string
- `consequence`: string
- `state`: "never-evaluated" | "incomplete" | "blocked" | "satisfied"
- `checks`: object[]
  - `criterion`: object
    - `kind`: "criterion"
    - `id`: string
  - `proposition`: string
  - `state`: "passed" | "failed" | "never-run" | "no-standing-verdict"
  - `evaluations`: object[]
    - `evaluation`: object
      - `kind`: "evaluation"
      - `id`: string
    - `criterion`: object
      - `kind`: "criterion"
      - `id`: string
    - `value`: string
    - `outcome`: "pass" | "fail"
    - `at`: string
    - `withdrawn?`: true
    - `basis`: object[]
      - `evidence`: object
      - `states`: string
  - `decidedBy?`: object
    - `evaluation`: object
      - `kind`: "evaluation"
      - `id`: string
    - `criterion`: object
      - `kind`: "criterion"
      - `id`: string
    - `value`: string
    - `outcome`: "pass" | "fail"
    - `at`: string
    - `withdrawn?`: true
    - `basis`: object[]
      - `evidence`: object
      - `states`: string
- `unmet`: object[]
  - `criterion`: object
    - `kind`: "criterion"
    - `id`: string
  - `requires`: string
- `evaluations`: object[]
  - `value`: string
  - `outcome`: "pass" | "fail"
  - `at`: string
- `gating`: object[]
  - `work`: object
    - `kind`: "work"
    - `id`: string
  - `objective`: string
- `everFailed`: boolean

---

## do_these_conflict

*Whether two conclusions actually disagree* — read-only

Whether two conclusions contradict each other, are about different things (`dissociation`), or agree. Two analyses reaching opposite-sounding results are not in conflict if they asked about different endpoints, and this is what tells them apart. Each side is named by its analysis and proposition, because a claim is identified by its proposition within a line of enquiry and never by wording alone.

**Takes**

- `a`: string — the first claim's id, e.g. CLM_4
- `b`: string — the second claim's id, e.g. CLM_7

**Returns**

- `conflict`: boolean
- `relation`: "contradiction" | "dissociation" | "corroboration"
- `differsBy`: "scope" | null
- `sides`: object[]
  - `claim`: object
    - `kind`: "claim"
    - `id`: string
  - `question`: object
    - `kind`: "question"
    - `id`: string
  - `proposition`: string
  - `asks`: string
  - `supportedBy`: object[]
    - `evidence`: object
      - `kind`: "evidence"
      - `id`: string
    - `states`: string
  - `challengedBy`: object[]
    - `evidence`: object
      - `kind`: "evidence"
      - `id`: string
    - `states`: string

---

## reproducibility_of

*Whether an analysis could be rebuilt from what it read* — read-only

Whether an analysis's inputs can be accounted for, given hashes of whatever you have rebuilt. Each input lands in one of four buckets: rebuilt and identical, rebuilt and different, **unverifiable** (the record kept no hash, so nothing can be said), or not rebuilt at all. `unverifiable` is deliberately not a failure — it is the record admitting it cannot answer, which is different from answering no.

**Takes**

- `analysis`: string — analysis id, e.g. COMP_3
- `rebuilt?`: object[] — what you rebuilt, and its hash — omit to ask what the record can account for
  - `part`: string — the input's id, ART_…
  - `hash`: string — the hash of your rebuilt copy

**Returns**

- `exact`: object[]
  - `part`: object
    - `kind`: "observations"
    - `id`: string
  - `name`: string
- `differing`: object[]
  - `part`: object
    - `kind`: "observations"
    - `id`: string
  - `name`: string
- `unverifiable`: object[]
  - `part`: object
    - `kind`: "observations"
    - `id`: string
  - `name`: string
- `notRebuilt`: object[]
  - `part`: object
    - `kind`: "observations"
    - `id`: string
  - `name`: string
- `reproducible`: boolean

---

## pose

*Ask a question* — **changes the record**

Put a question on the record without starting work on it. It appears in `known` as untested — on the books, never pursued, which is not a failure and not an inconclusive result. Use `open_enquiry` instead to ask and start in one act.

**Takes**

- `question`: string — the question, as asked

**Returns**

- `kind`: "question"
- `id`: string

---

## pursue

*Open a line of enquiry on an existing question* — **changes the record**

Start work on a question already on the record, naming the approach. A question may be pursued more than once, by different approaches, and they stay distinct.

**Takes**

- `question`: string — question id, e.g. Q_12
- `approach`: string — how this line of enquiry means to answer it

**Returns**

- `kind`: "enquiry"
- `id`: string

---

## open_enquiry

*Ask a question and start on it* — **changes the record**

Ask and pursue in one act — the usual way work begins. Records one event, not two: a researcher who opened an enquiry did one thing.

**Takes**

- `question`: string — the question, as asked

**Returns**

- `kind`: "enquiry"
- `id`: string

---

## record_observations

*Record what was measured* — **changes the record**

Put measurement on the record without analysing it. This is the cheap act: capture first, and promote later if something ends up resting on it. `content_hash` is what makes a later re-run comparable — without it the record cannot say whether two runs read the same data.

**Takes**

- `enquiry`: string — enquiry id, e.g. LOE_7
- `name`: string — what these observations are, in the researcher's words
- `finding`: string — what was observed
- `content_hash?`: string — a hash of the underlying data, if there is one

**Returns**

- `kind`: "observations"
- `id`: string

---

## record_analysis

*Record a computation and what it concluded* — **changes the record**

The compound act: a computation, what it read, and one claim per conclusion. `from` takes observation ids or the ids of earlier analyses whose output this one read — a two-stage pipeline records the second stage as consuming the first, never by re-entering the intermediate as if it were fresh measurement. `held_to` names prespecified checks the conclusions must answer to; a check nobody runs still counts against the finding, so it is named here and not at evaluation time.

**Takes**

- `enquiry`: string — enquiry id, e.g. LOE_7
- `method`: string — what was done
- `from`: string[] — ids this run read — ART_… or COMP_…
- `concludes`: object[] — one entry per conclusion
  - `proposition`: string — the claim, as a sentence
  - `finding`: string — what was found, in this analysis's own words
  - `bearing?`: "supports" | "challenges" — whether the finding supports or challenges the proposition (default: supports)
  - `standing?`: "exploratory" | "confirmatory" — confirmatory means it was prespecified; exploratory is the default
- `implementing?`: string — id of the planned work this carries out
- `held_to?`: string[] — ids of prespecified criteria the conclusions are held to

**Returns**

- `analysis`: object
  - `kind`: "analysis"
  - `id`: string
- `claims`: object[]
  - `claim`: object
    - `kind`: "claim"
    - `id`: string
  - `asserts`: string

---

## close_enquiry

*Close a line of enquiry* — **changes the record**

Close an enquiry, answered or abandoned. Give `answered_by` — the analysis and the proposition it concluded — to close it as answered; omit it to abandon. Closing an already-closed enquiry is refused rather than recorded twice.

**Takes**

- `enquiry`: string — enquiry id, e.g. LOE_7
- `answered_by?`: string — id of the claim that answers it, e.g. CLM_4 — from record_analysis

**Returns**

- `ok`: true
- `acted`: string

---

## sharpen

*Narrow a question into a more precise one* — **changes the record**

Replace a broad question with a sharper one, recording why. The sharper question is new; the original stays on the record, and the act freezes the findings it was taken in light of — so asking later what was known at the moment of sharpening gets the answer as it stood then, not as it stands now.

**Takes**

- `from`: string — id of the question being sharpened, e.g. Q_1
- `into`: string — the sharper question, as asked
- `because`: string — why it was sharpened

**Returns**

- `kind`: "question"
- `id`: string

---

## record_review

*Record a verdict on an analysis* — **changes the record**

Put a review of an analysis on the record. A retraction later rests on the review that justified it, so this is what `replace_analysis` cites.

**Takes**

- `of`: string — id of the analysis reviewed, e.g. COMP_3
- `verdict`: string — what the review found

**Returns**

- `kind`: "review"
- `id`: string

---

## plan_work

*State an objective and what would count as meeting it* — **changes the record**

Record planned work: what it is for, and what acceptance looks like. `may_read` names what the work is allowed to look at — a contract, not an enforcement: nothing stops a computation reading elsewhere, and the record says so rather than implying otherwise.

**Takes**

- `objective`: string — what the work is for
- `acceptance`: string — what would count as meeting it
- `may_read?`: string[] — what this work may look at — recorded, not enforced

**Returns**

- `kind`: "work"
- `id`: string

---

## state_criterion

*State a condition, before anything is run* — **changes the record**

Put a prespecified condition on the record. Stating it separately is what makes it prespecified: a criterion named at evaluation time cannot express the case that matters, which is a check nobody ran still counting against the finding it qualifies.

**Takes**

- `proposition`: string — the condition, as a sentence

**Returns**

- `kind`: "criterion"
- `id`: string

---

## declare_gate

*Bind conditions to the work they gate* — **changes the record**

Declare that some work is gated on some criteria, and say what the gate is for. The gate's state is computed from its criteria's evaluations, never stored — there is no value anyone can set to `satisfied`.

**Takes**

- `governed_by`: string[] — criterion ids, e.g. CRIT_1
- `consequence`: string — what this gate decides
- `protecting`: string[] — work ids, e.g. TASK_1

**Returns**

- `kind`: "gate"
- `id`: string

---

## evaluate_criterion

*Record a check's outcome* — **changes the record**

Record that a prespecified condition was checked and what it gave. Cite the analysis and proposition the verdict rests on where there is one; a verdict citing nothing is recorded as such rather than as resting on something unnamed.

**Takes**

- `criterion`: string — criterion id, e.g. CRIT_1
- `value`: string — what the check gave, in the checker's words
- `outcome`: "pass" | "fail" — whether the condition was met
- `gate?`: string — gate id this evaluation is for, e.g. GATE_1
- `citing?`: string — id of the claim the verdict rests on, e.g. CLM_4

**Returns**

- `ok`: true
- `acted`: string

---

## reverify

*Re-run a historical analysis under current observations* — **changes the record**

Record that an earlier analysis was checked again against observations available now. This is **not** reproduction: reproduction asks whether the same inputs give the same answer, and this asks whether the finding still holds under different ones. Use `reproduction_of` to ask the other question.

**Takes**

- `historical`: string — id of the analysis being re-verified, e.g. COMP_1
- `enquiry`: string — enquiry id this re-verification belongs to, e.g. LOE_7
- `method`: string — what was done this time
- `under`: string[] — observations read this time, ART_… ids
- `concludes`: object — the single conclusion this re-verification reached
  - `proposition`: string — the claim, as a sentence
  - `finding`: string — what was found, in this analysis's own words
  - `bearing?`: "supports" | "challenges" — whether the finding supports or challenges the proposition (default: supports)
  - `standing?`: "exploratory" | "confirmatory" — confirmatory means it was prespecified; exploratory is the default

**Returns**

- `at`: string
- `verification`: object
  - `kind`: "analysis"
  - `id`: string
- `of`: object
  - `kind`: "analysis"
  - `id`: string
- `claims`: object[]
  - `claim`: object
    - `kind`: "claim"
    - `id`: string
  - `asserts`: string

---

## accept_as_unresolved

*Leave a question open on purpose* — **changes the record**

Close a line of enquiry as deliberately unresolved: worked on, not settled, and left that way with the condition that would reopen it. Its own state, not an abandonment and not a failure — a reader scanning for what still needs doing must not find it under unresolved work.

**Takes**

- `enquiry`: string — enquiry id, e.g. LOE_7
- `because`: string — why it is being left
- `until`: string — what would reopen it
- `in_light_of`: string — id of the claim this rests on, e.g. CLM_4

**Returns**

- `ok`: true
- `acted`: string

---

## promote

*Make a finding citable* — **changes the record**

Move a finding from scratch to citable, recording why it was promoted. Until this happens a question answered on that finding reports as `provisional` rather than `established` — settled as far as anyone has taken it, but resting on something nobody has vouched for. Capture cheaply; promote before citing.

**Takes**

- `claim`: string — id of the claim being promoted, e.g. CLM_4
- `because`: string — what justifies promoting it

**Returns**

- `ok`: true
- `acted`: string

---

## amend_design

*Change a locked condition, and say what it costs* — **changes the record**

Reword a prespecified criterion after work has begun, citing what prompted it. The answer says whether the change was **mechanical** (a repair that moves nothing) or **scientific** (one that does), and names the confirmatory results affected — the difference between a legitimate repair and p-hacking, decided from the record rather than from the author's account of it.

**Takes**

- `criterion`: string — criterion id, e.g. CRIT_1
- `now_requires`: string — the new wording
- `because`: string — why it is being amended
- `citing`: string — id of the claim prompting the amendment, e.g. CLM_4

**Returns**

- `at`: string
- `amendment`: object
  - `kind`: "decision"
  - `id`: string
- `replaced`: object
  - `criterion`: object
    - `kind`: "criterion"
    - `id`: string
  - `requires`: string
- `nowRequires`: object
  - `criterion`: object
    - `kind`: "criterion"
    - `id`: string
  - `requires`: string
- `rerun`: object[]
  - `work`: object
    - `kind`: "work"
    - `id`: string
  - `objective`: string
- `confirmatoryAffected`: object[]
  - `claim`: object
    - `kind`: "claim"
    - `id`: string
  - `asserts`: string
- `nature`: "mechanical" | "scientific"

---

## replace_analysis

*Supersede a defective analysis* — **changes the record**

Record a corrected analysis in place of a defective one, citing the review that justified the retraction. The superseded output is invalidated and the checks that cited it are withdrawn, in one transaction with the replacement — a failure between the halves would leave an earlier failure no longer deciding its check and no corrected check in existence. The answer says what changed and what did not.

**Takes**

- `supersedes`: string — id of the analysis being replaced, e.g. COMP_2
- `because`: string — id of the review justifying it, e.g. REV_1
- `enquiry`: string — enquiry id, e.g. LOE_7
- `method`: string — what the replacement did
- `from`: string[] — observations the replacement read, ART_… ids
- `concludes`: object[] — one entry per conclusion
  - `proposition`: string — the claim, as a sentence
  - `finding`: string — what was found, in this analysis's own words
  - `bearing?`: "supports" | "challenges" — whether the finding supports or challenges the proposition (default: supports)
  - `standing?`: "exploratory" | "confirmatory" — confirmatory means it was prespecified; exploratory is the default

**Returns**

- `at`: string
- `replacement`: object
  - `kind`: "analysis"
  - `id`: string
- `claims`: object[]
  - `claim`: object
    - `kind`: "claim"
    - `id`: string
  - `asserts`: string
- `affected`: string[]
- `unaffected`: object[]
  - `what`: object
    - `kind`: "observations"
    - `id`: string
  - `named`: string
  - `why`: string
- `changed`: object[]
  - `proposition`: string
  - `before`: string
  - `after`: string
- `unchanged`: string[]

---

## reinterpret

*Narrow what a claim is taken to mean* — **changes the record**

Record that a claim's reading has been narrowed — the evidence is unchanged, what it is taken to show is not. The answer says whether anything resting on the old reading needs recomputing. Takes the claim's id, so there is nothing to disambiguate: two lines of enquiry asserting the same sentence are two claims and this names one.

**Takes**

- `claim`: string — the claim's id, e.g. CLM_4 — from record_analysis
- `as`: string — the narrower reading
- `because`: string — why it is being narrowed

**Returns**

- `at`: string
- `previously`: string
- `nowClaims`: string
- `evidenceStanding`: object[]
  - `evidence`: object
    - `kind`: "evidence"
    - `id`: string
  - `states`: string
- `restingOnTheOldReading`: object[]
  - `question`: object
    - `kind`: "question"
    - `id`: string
  - `asks`: string
- `requiresRecomputation`: boolean
