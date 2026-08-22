# Mapping the blinded clusters onto the domain, and scoring the predictions

**Written 2026-08-20 by the implementing session**, after `020` was committed
and against frozen text. This is the step that requires knowing the model, which
is why it is separate from the clustering — and why the clustering was done cold.

Order followed: cluster (`020`, blinded) → map (here) → paired-world test (here)
→ change bar (**not** applied; nothing is changed by this document).

## Verdict: H1 survives

> **H1.** At least one persistent semantic distinction, required independently
> by two or more designers, cannot be represented faithfully by the current
> domain without conflation, hidden state, or inference from wording.

**Two candidates pass the paired-world test at the two-or-more-designer bar, and
a third passes as a singleton.** H0 does not survive. Details below; nothing is
implemented on this evidence yet.

## Paired-world tests

Each test states two worlds the contract requires to be told apart, then what
LabKit's **durable** state holds. The event stream is not durable state (PJ-009
§3; CLAUDE.md's "don't answer a what-is-true-now question from the event log"),
so it cannot rescue any of these.

### 1. Attribution — PASSES. All three designers.

```
World A:  Alice took the decision to close this enquiry on finding F
World B:  Bob took it
contract: authority must be remembered (clusters 10, 11, 13, 25)
durable:  Decision { reason, invalidation_check, is_open, closed_at } + edges
          — identical in A and B
```

Verified, not recalled: the thirteen node labels are `Question`, `LineOfEnquiry`,
`EvidenceUnit`, `Evidence`, `Claim`, `Decision`, `Criterion`,
`CriterionEvaluation`, `Gate`, `Review`, `Artefact`, `Computation`, `Task`. None
denotes a person, agent or role. `EvidenceUnitRole` is the *kind of enquiry
activity*, not anybody's role.

**This is ledger row S**, open and unowned since S-8 — where it was recorded as
"deliberately not probed", a standing decision that identity is cross-cutting
infrastructure rather than domain. Three cold designers independently disagree,
and not decoratively: they require authority **remembered**, inside three
separate unanimous clusters.

**The instrument nearly missed it.** Attribution is not a cluster of its own —
it is a required *property* distributed across clusters 10 (pre-commitment
revision), 11 (post-lock amendment), 13 (open/closed/accepted stance) and 25
(admission). A synthesis that only read cluster headings would have scored this
prediction as refuted.

### 2. Ordering of belief over time — PASSES. All three designers.

```
World A:  unrelated decision X was taken before Y
World B:  Y before X
contract: "what did we hold in March" (cluster 21, unanimous)
durable:  Decision carries no time property at all — identical in A and B
```

`closed_at` exists only on closed decisions and does not order two open ones.
Natural-id sequence order is an accident of allocation that CLAUDE.md explicitly
forbids reading meaning into.

**This is row Z**, and cluster 21 is unanimous with three different vocabularies
— D1 `as_of`/`believed_at`, D2 "as-of view", D3 "past standing reconstructed at
a time". **Semantic convergence despite lexical disagreement**, which the brief
names as the strong signal.

### 3. Bitemporality — PASSES, and is strictly stronger than row Z. D1 only.

```
World A:  held on 3 March, written down on 3 March
World B:  held on 3 March, written down on 10 March
contract: "recorded by" and "asserted as held on" are separately answerable
durable:  identical — and would remain identical if row Z were fixed with a
          single timestamp
```

Recorded because fixing row Z the obvious way would leave this untouched, and a
single `decided_at` would look like a fix while silently choosing one reading.

### 4. What a reconstruction was reconstructing — PASSES. D2 only.

```
World A:  artefact X was produced as a reconstruction of historical artefact H
World B:  artefact X was produced as fresh work, unrelated to H
contract: D2's "Reconstruction attempt", identified by "its historical target,
          source set, reconstruction method, and time", remembering "Target,
          sources, method, recovered components, conflicts, gaps"
durable:  identical — recordObservations() names nothing historical, and
          reproducibilityOf() is a read that persists nothing
```

**This is row F, and it refutes a preregistered prediction.** PJ-021 stated the
gap in almost these words — *"a reader holding only the regenerated artefact
cannot answer what was this reconstructing?"* — and left it `open` and unowned
because no scenario had demonstrated a wrong answer. A designer who had never
heard of row F required the missing durable act, target and all.

Under the brief's rule that **majority is not the truth criterion**, a singleton
that passes the test counts. Convergence sets priority, not admissibility.

## Prediction scoring, against clusters rather than raw text

| # | Prediction | Outcome |
| --- | --- | --- |
| 1 | Attribution required to persist by ≥2 of 3 | **HELD**, unanimously, and distributed rather than clustered |
| 2 | ≥1 requires ordering across the record, Stage A only | **HELD**, unanimously (cluster 21), uncontaminated |
| 3 | ≥1 asks for a prioritised worklist | **REFUTED** — and inverted |
| 4 | ≥1 asks for free-text search | **REFUTED** — nobody did |
| 5 | Rows F and O not raised | **HALF REFUTED** — row O not raised; **row F raised** (test 4) |

**Prediction 3 failed in the most useful direction available.** I predicted the
tension would be real and preregistered no interpretation, having been told off
for pre-classifying it. All three designers not only declined to ask — they
independently **forbade** it. D1 refuses `what_should_I_run_next`, D2 refuses
`what_should_we_do_next`, D3 refuses "anything that looks like a completion
percentage". That is three cold designers arriving at S-14's decision without
being told it, and it is the strongest evidence in the exercise *for* an existing
choice.

**Prediction 4's negative control returned nothing**, which is worth more than it
looks: three designers built a complete read surface and not one wanted search.

## Where LabKit already holds the position under dispute

`020` §4 lists five genuine disagreements. LabKit has a settled answer to all
five, and in two cases the disagreement is about something LabKit has already
resolved *the richer way*:

- **Gate vocabulary.** D2 wants "partly evaluated" and "indeterminate"; D1's
  vocabulary lacks them. LabKit computes
  `never-evaluated | incomplete | blocked | satisfied` — `incomplete` **is** D2's
  partly-evaluated, and it is derived rather than stored (S-3).
- **Scratch admission.** D1 requires re-execution before scratch can be cited;
  D2 and D3 permit admission by act. LabKit sided with D2/D3 last night —
  `promote()` confers standing with a recorded reason and no re-execution
  (S-18, PJ-023). A cold designer independently took the opposite view, which
  makes the choice contested rather than obvious. Recorded; not reopened.
- **Claim identity, question identity, study/execution cardinality.** LabKit
  aligns with D2 on the first two (a claim is its proposition within a line of
  enquiry, S-5; `sharpen` mints a new question with lineage, S-1) and with D2/D3
  on the third (`EvidenceUnit` is the inferential activity, `Computation` the
  execution). No gap; three-way designer disagreement is itself the finding.

## §5 returned empty, and that is a result

The synthesiser found **no obligation in the source material uncovered by any
design** — all eighteen served. Since the source material is the same corpus the
fifteen scenarios came from, this says the designs are complete against it, not
that LabKit is.

## What this does not license

- **No schema change.** Four candidates pass bar 2; none has been through bar 3,
  which tries query semantics first, then a relationship, then a noun. Row P was
  resolved in the query after two builds predicted it would need structure.
- **This was not the consumer.** It is an ontology-blind contract derivation from
  the same Bonsai-derived corpus. The real pressure is the thin read surface
  implementing this contract and failing to answer something.
- **Read-only.** Authority to approve, assignment and ownership are write-side
  concepts this protocol cannot validate — which is exactly where candidate 1
  lives, so it needs the implementation stage before it earns anything.
- **Stage B is still sealed.** Everything above is Stage A only.

## Next

Stage B (`003_stage_b_packet.md`) to the same three designers, then the revision
documents as `013`/`014`/`015`. The measurement it buys: whether attribution and
temporal survey were reached from researchers' own words — as they were, above —
or would only have appeared once LabKit's design vocabulary was supplied. They
were reached without it, which is the stronger of the two outcomes and is now on
record before Stage B can muddy it.
