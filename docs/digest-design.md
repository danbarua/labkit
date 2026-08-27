# `labkit digest` and the list-shaped queries — a design, for review

**Draft, 2026-08-27, for Dan to review.** Nothing is built. Every claim about
what LabKit does today was run against a real record on that date; the
transcripts below can be re-run in about a minute each.

Input from Grok (a proposed verb set) and from `labkit-review`, who **refuted
this document's first central argument** and supplied the two that replaced it.
Both replacements were re-verified here rather than taken on report — §2 and §3
are this session's transcripts, not their claims.

---

## 1. What was asked, and what this concludes

> `labkit digest`: everything I need for my daily standup. We have no **list**
> views. Not just `digest` but the list-shaped queries users will need.

**The conclusion is not the one this document set out to reach.** Two real
defects were found on the way, and neither of them is *"we lack list views"*:

1. **§2 — `whatIsKnown()` and `gateStatus()` contradict each other**, and the
   reassuring one is the verb a researcher reads for orientation. A demonstrated
   wrong answer. **It earns a fix, and the fix is not `digest`.**
2. **§3 — `GOVERNS` is written and read in one direction only.** A researcher
   can hold a criterion, be told it is unmet, and have no verb that answers
   *"what does this block?"* The record knows. It is unreachable.

`digest` itself is then argued **as a convenience** (§5), honestly, because the
attempt to earn it as a gap failed and is written up in §4 rather than deleted.

---

## 2. The demonstrated wrong answer: `established` over a blocked gate

`promote()` (`src/domain/write.ts`) consults **no gate at all** — verified by
reading it: the strings `gate` and `blocked` do not occur in its body. It writes
a `Decision`, a `PROMOTES` edge, and sets `kind = 'confirmatory'`
unconditionally. `whatIsKnown()` buckets on two facts and no others
(`src/domain/read.ts:291`) — is the answer cited, and is it promoted.

So this sequence is available today, and was run:

```
labkit criterion "held-out loss must beat baseline"          → CRIT_1
labkit plan --objective "run the 8k-step ablation"           → TASK_1
labkit declare --governed-by CRIT_1 --protecting TASK_1 \
       --consequence "the result may not be built on until this holds"  → GATE_1
labkit evaluate CRIT_1 --gate GATE_1 --outcome fail \
       --value "loss 4.1 vs 3.8 baseline"
labkit observe LOE_1 --name "8k-step run logs" …             → ART_1
labkit analyse LOE_1 --from ART_1 --held-to CRIT_1 …         → COMP_1, CLM_1
labkit promote CLM_1 --because "we are relying on this to ship"   (accepted)
labkit close LOE_1 --answered-by CLM_1                            (accepted)
```

Then, in the same record:

```
$ labkit gate GATE_1
GATE_1 — blocked  (has failed at least once)
  consequence: the result may not be built on until this holds

$ labkit known
Established
  - does the new sampler converge?
```

**`established` is a positive assertion** that the answer rests on promoted,
confirmatory work — made about a claim the record separately says may not be
built upon. That is not an absence and not a scope boundary: two verbs give
contradictory answers about one claim's standing, and the *reassuring* one is
what a person reads at standup.

### Why this does not earn `digest`, which is the important part

`labkit-review`'s point, and it is the most likely way this design goes wrong in
review:

> That wrong answer earns a fix, and the fix is not digest. If you spend it on
> digest, digest becomes a workaround for a live defect — and the defect stays,
> because something now papers over it.

### The fix: the survey, not `promote()`

**Recommended: `whatIsKnown()` consults the check state when bucketing. Do not
make `promote()` refuse over a blocked gate.** This is not a preference between
two defensible positions — a write-time refusal *cannot hold the property*, and
that was demonstrated rather than argued.

`Gate.state` is computed, never stored (S-3), re-evaluation is modelled
(`GateStatus.evaluations`, `everFailed`), and `reverify()` exists. So run the
sequence a refusing `promote()` would permit:

```
T1  evaluate CRIT_1 --outcome pass    → GATE_1 satisfied
    promote CLM_1                       (a refusing promote allows this — correctly)
    close --answered-by CLM_1
    labkit known                      → Established        ✓ right
T2  evaluate CRIT_1 --outcome fail    → GATE_1 blocked
    labkit known                      → Established        ✗ wrong
```

Run 2026-08-27; both lines are transcript. **The wrong answer returns and the
refusal bought nothing.** It catches only the case where the gate was already
blocked at the instant of promotion — a subset — and does something worse than
missing the rest: it creates the appearance of an invariant that does not hold,
so the next reader of `whatIsKnown()` has *more* reason to trust a bucket that
is still wrong.

Two further reasons, both pointing the same way:

- **The read side already has the fact in hand.** `whySupported` computes
  `standard[].state = "failed"` for the claim's own report — one hop from the
  survey. A fix in `promote()` would add a new *write-time* consultation for
  something the read side is already carrying.
- **It is the repo's stated preference**: structure in the query over structure
  in the stored model. Stored shape is where change gets expensive; queries are
  free to be wrong and re-run.

**Which bucket is deliberately left open.** `provisional` means "resting on work
nobody promoted", and a promoted claim behind a blocked gate *is* promoted — so
the existing definition does not fit, and widening it is a real decision about
what the word means. A new bucket is the alternative, and row Y is the standing
warning against one: *a fifth bucket built for nobody is the ceremony S-14
declined a field over.* **The scenario picks it, not this document.**

**And the cost is not free**, which the recommendation should not hide: the
survey buckets *questions*, so consulting check state means walking question →
cited claim → criterion → state. A query change, not a field read.

**Sequencing consequence, and it is a rule rather than a preference.**
CLAUDE.md: *at most one confirmed wrong answer ships green at a time, and
clearing it is the next thing built.* §2 is now a demonstrated wrong answer, and
no row in PJ-008 §3 is currently `demonstrated` — the three unfinished rows
(AH, AI, AJ) are `open` and `open, unowned`, which is a different state. So §2
becomes the one, and the rule says clearing it is next.

Independently: shipping `digest` on a survey that contradicts `gateStatus` means
two of `digest`'s own sections would disagree with a third about the same claim.

---

## 3. `GOVERNS` has a writer and a one-directional reader

A researcher's actual route into a record, run cold with no handles:

```
$ labkit claims "the sampler converges"        → CLM_1
$ labkit why CLM_1 --json
  "unmet": [ { "criterion": "CRIT_1", "requires": "held-out loss must beat baseline" } ]
  "standard": [ { "criterion": "CRIT_1", "state": "failed", … } ]
```

So they hold `CRIT_1` and have been told it **failed**. The natural next
question is *"what does that block?"* — and there is no verb that takes it:

```
$ labkit affects CRIT_1        labkit: no artefact named "CRIT_1"
$ labkit criteria CRIT_1       gate handle expected a Gate id
$ labkit gate CRIT_1           gate handle expected a Gate id
$ labkit design CRIT_1         gate handle expected a Gate id
$ labkit contract CRIT_1       work handle expected a Task id
```

**No read verb on either surface accepts a `CriterionRef`.**
`criteriaGoverning(gate) → CriterionRef[]` walks `GOVERNS` from the gate; nothing
walks it back. The record knows the answer — `GOVERNS` is written, `gateStatus`
reads it, and the `consequence` text exists for no other purpose than to answer
exactly this question.

This is a shape CLAUDE.md already names, and the precedent is explicit:

> A label's entry in `EDGE_SCHEMA` is a list of endpoint pairs and each pair is
> a separate claim about the domain, so "the label is walked" is the wrong unit
> to check.

`PRODUCES: [EvidenceUnit, Artefact]` was named on that basis. This is the same
finding one level down: `GOVERNS` is walked, and only one way.

### The correction that got us here

This document's first draft claimed *"nothing on the read surface can enumerate
anything except questions"*. **That was too strong** — `labkit-review` supplied
the counter-chain above and it was verified: `CriterionRef` is reachable cold via
`claimsAsserting → whySupported`.

The correction makes the finding **stronger**, not weaker. "You cannot list
criteria" is a missing convenience. "You can be handed a criterion, told it
failed, and be unable to ask what it blocks" is a dead end in the middle of the
one route a researcher actually has.

**`GateRef` and `WorkRef` are genuinely unreachable**, checked exhaustively
against `report.ts` rather than by sampling — every type carrying either is
obtainable only from a verb that already requires one:

| type | carries | obtained from |
| --- | --- | --- |
| `GateStatus` | `gate: GateRef` | `gateStatus(gate)` |
| `DesignHistory` | `gate: GateRef` | `designHistory(gate)` |
| `GatedWork` | `work: WorkRef` | nested in `GateStatus` |
| `TaskContract` | `work: WorkRef` | `contractFor(work)` |

Fully circular. From `whatIsKnown()` the chain runs
`QuestionRef → pursuitsOf → EnquiryRef → enquiryStatus` and dead-ends: no gate,
no work.

---

## 4. The argument that failed, kept because it is instructive

The first draft argued that `whatIsKnown()` returning four empty buckets and one
untested question, in a record containing a blocked gate, was a confidently
wrong answer.

**It is not, and `labkit-review` was right to refuse it.** `whatIsKnown()` is a
knowledge survey and answers its own question correctly; saying nothing about
gates is a scope boundary. By that argument every verb is wrong about everything
it does not cover. PJ-011 §5 is exactly this case — the researcher asked what
the programme knows, got a right answer, and drew an inference the verb never
offered. **A missing feature manufacturing an empty result**, which is what the
bar exists to catch.

**Kept rather than deleted, and the reason is the point**: the two arguments look
almost identical, and a future reader will re-derive the distinction badly if the
failed version is not sitting beside the working one. It is also PJ-008's own
convention — a prediction that fails is a result about the model, and rows are
not deleted when that happens. They differ on the thing that matters: in §2 the verb makes a **positive assertion**
that another verb contradicts. Here it merely fails to mention something.

---

## 5. `digest`, argued as a convenience

With §2 fixed and §3 built, `digest` earns nothing further on its own — every
section would be a composition of verbs that exist. That is the honest position,
and it is a fine reason to build it: **this repo's objection has only ever been
to conveniences dressed as gaps.**

What it is: **an attention survey — what in this record is waiting on a person,
right now.** Three properties.

1. **Computed, never stored.** Same discipline as `gateStatus`: no
   `Task.queue_state`, no value anyone can set to `needs-review`.
2. **Handles and one-line labels, never nested trees.** Grok's rule: *lists
   filter, detail tools explain.* `digest` says `GATE_1 — blocked`; `labkit gate
   GATE_1` says why.
3. **Every section names something standing, not something that happened.** If a
   block can only be described as "X happened", it belongs in `happened`.

### Sections

| Section | Contents | Source |
| --- | --- | --- |
| **Blocked** | Gates in state `blocked`, and the work each protects | §3's new verb |
| **Unevaluated** | Gates `never-evaluated`/`incomplete`, and which criteria are unrun | §3's new verb |
| **Untouched work** | Planned work with no observations and no analysis | §3's new verb |
| **Open** | Questions `unresolved` | `whatIsKnown()` — after §2 |
| **Provisional** | Answered on a finding nobody promoted | `whatIsKnown()` — after §2 |
| **Deliberately open** | `accepted`, **with each reopening condition** | `whatIsKnown()` — after §2 |

Four changes from Grok's proposal:

- **"Waiting on world" → "Untouched work"**, named for the record. There are no
  logins and no assignees; "waiting on world" is a deployment fact wearing a
  domain name.
- **"Changed since" dropped** — `whatHappened({since})` already answers it (§6).
- **"Needs review" dropped from v0** — `recordReview` is optional on every path,
  so "analyses with no review" lists things nobody promised to do. It earns a
  place when promote or amend is actually gated on a verdict.
- **"Deliberately open" carries the reopening condition.** S-14's argument for
  the `accepted` bucket is that a list which can never be emptied is never read;
  listing accepted items *without* what would reopen them recreates exactly that.

### No `at=`, and this is a refusal rather than a deferral

`whatWasKnown(at)` works because S-1 **freezes** what a decision was taken in
light of — it reconstructs from durable frozen state, which is why its scenario
can assert it with an empty event log open.

**Nothing freezes attention.** "Was this gate blocked last Tuesday?" would be
computed from evaluations as they stand *now*; there is no snapshot of
`blocked`. An `at=` would return a plausible answer computed from today's
structure and present it as history — the confidently-wrong shape this repo goes
furthest to avoid, and worse than refusing.

Stated as a refusal with its reason, because a deferral invites someone to add
it later without re-deriving the objection.

### One implementation, and `digest` is a caller of it

Grok proposed *"digest may call the same projections internally — one
implementation, two facades."* **Not via a shared private helper.** A private
helper is a third thing neither facade names, so the first time `digest` needs a
field the list does not return, it goes in the helper — and there is now state
no public signature describes. That is how a queue state arrives.

`digest` should be **literally the composition**:

```ts
{ blocked: gateList({ state: "blocked" }), unevaluated: gateList({ state: "never-evaluated" }), … }
```

Then any drift is a signature change on a public verb, which
`tests/cli/coverage.test.ts`, `tests/mcp.test.ts` and `check:no-stringly-typed`
already police. The enforcement comes free from machinery that exists.

---

## 6. `events_since` already exists

`whatHappened(filter)` takes `EventFilter { since, by, operation, touching,
limit }` where `since` is a `seq` — exposed as `labkit happened` and the
`what_happened` MCP tool. Grok's #2 is built.

Two notes. It is the right tool for polling and the **wrong** one for
orientation: an event stream cannot express *"still blocked"* — it holds
`evaluateCriterion` at seq 6 and nothing for the gate that has been blocked ever
since. At six events you can reconstruct the present by reading them all; at six
hundred you cannot, and the failure is silent. That is CLAUDE.md's rule about
not answering "what is true now" from the log, and it is why §3 matters: today
`labkit happened` is the *only* route to a `GateRef`, so the model forces users
into the anti-pattern the architecture forbids.

---

## 7. The other proposed verbs, taken on their own evidence

The bar is *verbs are added when a scenario needs them, not in anticipation*, so
seven designed up front is what it refuses.

| Proposed | Verdict | Why |
| --- | --- | --- |
| something producing `GateRef`/`WorkRef` | **earned** | §3 |
| `digest` | **convenience** | §5, argued as one |
| `events_since` | **exists** | §6 |
| `claim_list` | **not yet** | `claimsAsserting` reaches claims by wording — the record is not unreachable, the ask is filtering |
| `question_list` | **no** | `whatIsKnown()` enumerates questions; a thin sibling is a second home for one fact |
| `review_queue` | **not yet** | Nothing is gated on a verdict today (§5) |
| `conflicts` | **not yet** | Grok is right — wait until digest shows people asking what disagrees |

Deliberately not proposed at all: full-text search over findings (a negative
control from the consumer brief), a `todo` assigned to a person (no logins; a
worklist is not an assignee list, and inventing one invents an actor the model
does not have), `everything` (the graph dump `digest` exists not to become), and
any stored `queue_state`.

---

## 8. Proposed order of work

1. **Fix §2** — `whatIsKnown()` consults check state. A ledger row and a
   scenario; the scenario picks the bucket.
2. **Then §3's enumeration**, and **its scenario written after §2 lands, not in
   parallel.** The dependency runs one way and is easy to miss: fixing §2
   requires walking question → cited claim → criterion → state *inside the read
   surface*, so whatever produces a `GateRef` may already exist as a by-product.
   §3's scenario can then ask the sharper question — given that the traversal
   exists internally, what does a *researcher* still need? That may be one verb
   rather than three. Do §3 first and the risk is designing three enumeration
   verbs, then finding §2's fix produced the traversal underneath them.
3. **`digest` as the composition**, argued as a convenience.

### This wants a scenario, not more design

`labkit-review`'s process note, and it is right: §3 is exactly the shape
PJ-008 §2's corpus is for — a researcher's intent that cannot be carried out
through research verbs alone. **Writing it as a conversation will settle whether
the answer is one enumeration verb or three**, which no amount of design will.
The open question in §9.3 should be answered that way rather than argued.

---

## 9. Open questions for Dan

1. **§2 — the fix is recommended, the bucket is not.** Fixing the survey rather
   than `promote()` is settled on evidence (§2). *Which* bucket a promoted claim
   behind a blocked gate belongs in is a question for the scenario, and row Y
   warns against inventing a sixth for nobody. Do you want it decided before the
   scenario is written?
2. **Is `digest`-as-convenience acceptable?** The attempt to earn it as a gap
   failed (§4). If a convenience needs a stronger case here, say so and it can
   wait behind §2 and §3, both of which stand on their own.
3. **One enumeration verb or three?** `gate_list`, `work_list`, and something
   answering "what does this criterion block?" — or one verb. §8 argues the
   scenario decides this.
4. **Should `known`'s prose view print handles?** It prints wording only —
   `- does the new sampler converge?`, no `Q_1` — while `--json` carries them.
   One-line fix, unrelated to the rest, and it makes the default view drillable.

---

## 10. What was verified, and what was not

**Run on 2026-08-27, against real records built through the CLI:** the §2
contradiction end to end; the §3 dead end, including every read command refusing
a `CriterionRef`; the §3 reachability chain `claims → why → unmet.criterion`;
`promote()` containing no reference to gates.

**Read, not run:** `EventFilter`'s shape; the `report.ts` table in §3.

**Not verified:** that each §5 section is expressible in one Cypher traversal.
That is the first thing to establish when building, and a section needing three
round trips per gate is a section to reconsider.

**Not attempted:** any claim about how often a person would run `digest`. There
is no usage data and this document does not pretend otherwise.
