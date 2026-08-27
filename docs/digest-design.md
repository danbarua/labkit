# `labkit digest` and the list-shaped queries — a design, for review

**Draft, 2026-08-27, for Dan to review.** Nothing is built. Every claim about
what LabKit does today was run against a real record on that date; the
transcripts are in §2 and can be re-run in about a minute.

Input from Grok (a proposed verb set, quoted where used) and from
`labkit-review`. The demonstration in §2 is this session's.

---

## 1. What was asked

> `labkit digest`: give me everything I need for my daily standup /
> self-reminder. We have no **list** views — tables in a CRUD forms-over-data
> app. Not just `digest` but the list-shaped queries users will need.

Grok's framing, which this document adopts:

> `known` is a knowledge survey. **`digest` is an attention survey.** Different
> job.

That is the right distinction and it understates the problem. The finding below
is not that the attention survey is missing. It is that **the two ways a user
can start cold both give a wrong answer**, and one of them is a route this
repository's own rules forbid.

---

## 2. What the record can answer today, demonstrated

A record was built through the CLI — a question, a pursuit, a criterion, a
planned task, a gate protecting that task, and a failing evaluation against the
criterion. Five minutes of ordinary work. `labkit gate GATE_1` describes it
accurately:

```
GATE_1 — blocked  (has failed at least once)
  consequence: ship the sampler
Conditions
  - failed              held-out loss must beat baseline  (CRIT_1)
Not currently met
  - held-out loss must beat baseline  (CRIT_1)
Gating
  - run the 8k-step ablation  (TASK_1)
```

**Now start cold.** A user at standup holds no handles. There are exactly two
verbs they can call.

### 2.1 `labkit known` gives a confidently wrong impression

```
Established        nothing
Provisional        nothing
Accepted as unresolved  nothing
Unresolved         nothing
Untested (nothing has been run against these)
  - does the new sampler converge?
```

Read that at standup and the honest summary is *"one question, nothing has been
run against it, nothing needs me."* The record says otherwise: a criterion was
evaluated and **failed**, a gate is **blocked**, and a planned task **cannot
proceed**. None of it appears.

This is not an empty result. `known` is not silent — it answers, in five
labelled buckets, and the answer a reader takes from it is false. That is the
distinction PJ-009 §2 turns on, and it is why this clears the bar where "we have
no list views" would not:

> An **empty** result is not a wrong one. It is *unanswerable*… Only a
> confidently incorrect answer shows the model claiming something it cannot
> support.

The verb is not lying about its own subject — it surveys *questions* and the
question genuinely is untested. The wrongness is at the level the user reads at,
and no verb they could reasonably have called would have corrected it.

### 2.2 The only route to the handles is the one the architecture forbids

```
$ labkit happened
  1  pose               Q_1     by dan, minting Q_1
  2  pursue             LOE_1   by dan, minting LOE_1
  3  stateCriterion     CRIT_1  by dan, minting CRIT_1
  4  planWork           TASK_1  by dan, minting TASK_1
  5  declareGate        GATE_1  by dan, minting GATE_1
  6  evaluateCriterion  CEVAL_1 by dan, minting CEVAL_1
```

That is the only way to learn `GATE_1` exists. Every other read verb takes a
handle the caller must already hold — `gateStatus(GateRef)`,
`contractFor(WorkRef)`, `criteriaGoverning(GateRef)`, `whySupported(ClaimRef)`,
`enquiryStatus(EnquiryRef)`. **No verb on the read surface produces a
`GateRef`, a `WorkRef` or a `CriterionRef`.** The single text-to-handle route,
`claimsAsserting`, is a wording lookup that deliberately refuses to pick.

So the event log is doing orientation duty, and CLAUDE.md forbids exactly that:

> Don't answer a "what is true now" question from the event log. Events explain
> *how state changed*. The graph explains *what the current research state is*.

The rule is not decoration — an event stream cannot express *"still blocked"*.
It has `evaluateCriterion` at seq 6 and no entry for the gate that has been
blocked ever since. At six events you can reconstruct the present by reading
them all. At six hundred you cannot, and the failure is silent: you read the
recent ones and miss a block from last week.

**Both cold-start routes are therefore wrong**, in different ways: `known`
answers about the wrong subject, and `happened` answers about the wrong tense.

### 2.3 A smaller finding, worth fixing in passing

`known`'s prose view prints wording and **no handles** —
`- does the new sampler converge?` and not `Q_1`. The JSON view has them. So the
default human view of the only enumerating verb cannot be drilled into without
re-running it as JSON.

---

## 3. What `digest` is

**An attention survey: what in this record is waiting on a person, right now.**

Three properties, and the third is what keeps it from becoming a graph dump.

1. **Computed, never stored.** Same discipline as `gateStatus` — no
   `Task.queue_state`, no value anyone can set to `needs-review`. Stored shape
   is where change gets expensive; queries are free to be wrong and re-run.
2. **Ids and one-line labels, never nested trees.** Grok's rule and the right
   one: *lists filter, detail tools explain.* `digest` says `GATE_1 — blocked`;
   `labkit gate GATE_1` says why. Anything that would embed a
   `SupportExplanation` belongs in the detail verb.
3. **Every section is a standing condition, not an event.** A section earns its
   place by naming something *true now* that nobody has dealt with. This is the
   §2.2 rule applied as a design constraint: if a block can only be described as
   "X happened", it belongs in `happened`, not here.

### Proposed sections

Each is a list of `{handle, one-line label}` plus one discriminator. Grok's set,
with what I would change and why.

| Section | Contents | Standing? |
| --- | --- | --- |
| **Blocked** | Gates in state `blocked` — the task each protects | yes |
| **Unevaluated** | Gates `never-evaluated` or `incomplete`, and which criteria are unrun | yes |
| **Provisional** | Questions answered on a finding nobody promoted | yes — `known` already computes it |
| **Open** | Questions `unresolved` — worked on, no answer | yes — from `known` |
| **Untouched** | Planned work with no observations and no analysis | yes |
| **Deliberately open** | `accepted` — **and their reopening conditions** | yes |

Four changes from Grok's list:

- **"Waiting on world" becomes "Untouched work"**, named for the record rather
  than for an agent. There are no logins and no assignees; "waiting on world" is
  a deployment fact wearing a domain name.
- **"Changed since" is dropped.** `whatHappened({since})` already exists and
  already answers it — see §5. Putting it in `digest` would give the same
  question two homes.
- **"Needs review" is dropped from v0.** `recordReview` is optional in every
  path, so "analyses with no review" is a list of things nobody promised to do.
  It earns its place when a promote or amend is actually gated on a verdict, and
  not before.
- **"Deliberately open" carries the reopening condition**, which is the one
  thing that makes the section safe to have. S-14's whole argument for the
  `accepted` bucket is that a to-do list which can never be emptied is never
  read; a digest that lists accepted items *without* saying what would reopen
  them recreates that.

### On `at=`

**Default now, and no `at=` in v0.** `whatWasKnown(at)` owns the historical
question and answers it from durable state, with S-1's freezing behaviour making
"what was true then" genuinely subtle. Two verbs answering it differently is the
worse outcome. Agreed with Grok.

---

## 4. The list verbs, and which are actually earned

The repo's bar is explicit — *verbs are added when a scenario needs them, not in
anticipation* — so a set of seven designed up front is precisely what it
refuses. Taking each on its own evidence:

| Proposed | Verdict | Why |
| --- | --- | --- |
| `gate_list` | **earned** | §2.2: no verb produces a `GateRef`. `gateStatus` is unreachable from a cold start. Not an empty result — an existing report you cannot address. |
| `work_list` | **earned** | Same argument for `WorkRef`; `contractFor` is equally unreachable. Also what "Untouched" needs. |
| `events_since` | **already exists** | `whatHappened({since, by, operation, touching, limit})`. See §5. |
| `claim_list` | **not yet** | `claimsAsserting` reaches claims by wording, so the record is not unreachable — the ask is filtering. Wait for digest to show the need. |
| `question_list` | **no** | `whatIsKnown()` enumerates questions in five buckets. A thin sibling is a second home for one fact. |
| `review_queue` | **not yet** | See §3 — nothing is gated on a verdict today. |
| `conflicts` | **not yet** | Grok is right: don't build until digest shows people asking what disagrees. |

**So the earned set is `digest`, `gate_list`, `work_list`** — and `gate_list`
and `work_list` are earned by the *same* finding, which is worth saying plainly
rather than counting them as two.

### The v0 I would ship, and the order

1. **`gate_list` and `work_list` first**, because they are what §2.2
   demonstrates and they are small.
2. **`digest` second, defined as a composition of them** plus `whatIsKnown()`.

That ordering is also the answer to Grok's *"one implementation, two facades"*.
I would not have `digest` and the lists share a private helper — that is where a
stored queue state eventually hides. **`digest` should be defined as the
composition**, so there is exactly one implementation of "which gates are
blocked" and `digest` is a caller of it like anyone else.

---

## 5. `events_since` already exists

`whatHappened(filter)` takes `EventFilter { since, by, operation, touching,
limit }`, where `since` is a `seq`. It is exposed as `labkit happened` and as
the `what_happened` MCP tool.

So the World-polling case Grok describes is built. What §2.2 says is that it
must not be *also* the orientation route — not that it is the wrong tool for
polling, which it is not.

---

## 6. Deliberately not proposed

| Tempting | Why not |
| --- | --- |
| Full-text search over findings | Negative control from the consumer brief; not an ontology question |
| `todo` assigned to a person | No logins. A worklist is not an assignee list, and inventing one invents an actor the model does not have |
| `everything` | The graph dump `digest` exists not to be |
| A stored `queue_state` | `gateStatus` computes four states from structure and there is no value anyone can set to `satisfied`. The same must hold here |

---

## 7. What this does not change

**No new nodes and no new edges.** Every section in §3 is computable from
structure that already exists — `EDGE_SCHEMA` is untouched, and so is
`NODE_TYPES`. If drafting the queries turns up a section that *needs* a new
edge, that is a finding for the ledger and a separate argument under PJ-009's
five bars, not something to slip in with a read verb.

**No change to `whatIsKnown()`.** It is not wrong about its own subject.

---

## 8. Open questions for Dan

1. **Is the §2.1 argument the one you want made?** It is the load-bearing
   claim: `known` gives a wrong impression rather than an empty one. If you read
   that transcript and think *"well, it did answer the question it was asked"*,
   then `digest` is a convenience and the doc should say so honestly instead.
2. **Should `known`'s prose view print handles** (§2.3)? One-line fix, separate
   from all of this, and it makes the default view drillable.
3. **`gate_list` and `work_list` — one verb or two?** They are earned by one
   finding. A single `unreachable`-style verb would be worse; two narrow ones
   match the existing surface. I lean two, and it is arguable.
4. **Does "Untouched work" want a scenario before it ships?** The other five
   sections read off computations that already exist. This one is a new
   traversal, and PJ-008's corpus is how new traversals have been earned here.

---

## 9. What was verified for this document, and what was not

**Run on 2026-08-27**: every transcript in §2, against a real record built
through the CLI in a temporary directory. `EventFilter`'s shape and the absence
of any `GateRef`/`WorkRef`/`CriterionRef`-producing verb were read off
`src/domain/read.ts` and `src/domain/events.ts`.

**Not verified**: that the six sections in §3 are each expressible in one
Cypher traversal. That is the first thing to find out when building, and a
section that needs three round trips per gate is a section to reconsider.

**Not attempted**: any judgement about how often a person would run this. There
is no usage data, and this document does not pretend otherwise.
