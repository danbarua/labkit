# 030 — Which record is this answer about?

**2026-08-23.** A scenario, a diagnosis, and no decision yet. The scenario is
written here because PJ-008's corpus is closed and this one did not come from
it — it came from exposing the whole domain over MCP, where every handle is a
bare string and nothing can be passed by accident.

## 1. The scenario

**Story.** One question, two approaches running in parallel. One reports; the
other has not.

> **Researcher:** We've got two teams on whether depth moves convergence — Ana's
> running the seed sweep, Bruno's doing the ablation.
>
> *(later)*
>
> **Agent:** The seed sweep is conclusive. Depth moves convergence, about three
> steps, consistent across five seeds.
> **Researcher:** Good, close it out.
>
> *(next morning)*
>
> **Bruno:** Where's my ablation up to?
> **LabKit:** *?*

**Afterward — LabKit must answer:**

- *Where is Bruno's ablation up to?* → **not** "answered". Nothing has been
  recorded against it. Today LabKit says it is answered, and offers Ana's
  evidence as its own.
- *Is the question still open?* → no. It was answered, by the seed sweep.
- *Should Bruno keep going?* → LabKit must not decide this. Independent
  corroboration of an answered question is legitimate work; so is stopping. The
  record says the question is answered and the ablation has reported nothing,
  and Bruno chooses.
- *What did the answer rest on?* → the seed sweep. Not "the seed sweep and the
  ablation".

**Where it sits.** S-1's fourth Afterward already builds the setup — two
pursuits of one question stay one question, `pursuitsOf` returns both, `known`
lists the question once — and stops one step before either closes.

## 2. The diagnosis

Not a bug. `closeEnquiry()` writes `Decision -RESOLVES-> Question` and
`enquiryStatus()` derives closure from the question, both deliberately and both
recorded as such: closure attaches to the question a line of enquiry pursues,
not to the line. That was true while one question had one pursuit. `pursue`
makes it false.

Stated as identity, which is where Dan took it and where it belongs: **a
reference denotes one record while the answer is about another.**

| reference | the id denotes | what the verb takes it to mean |
| --- | --- | --- |
| `EnquiryRef` into `enquiryStatus` | a line of enquiry | the **question** it pursues |
| `ObservationsRef` | an artefact of either kind | "observations", asserted by `kind` |
| `AnalysisRef` as an input | a computation | that computation's **output artefact** |

This is *identity is never wording* arriving in a seventh region, asked from the
other end. The six previous instances all asked **are these two records the
same one?** This asks **which record is this answer about?** Same failure
either way: something identified by one thing and answered by another.

`tests/subject-identity.test.ts` demonstrates all three in one file. It asserts
what the model does today **including where that is wrong** — a green run means
the ambiguities are still present, not that they are acceptable, and fixing
row 1 turns the file red on purpose.

## 3. The actual problem: the read models are value objects

Dan's question — *two pursuits = two records = two IDs; is the domain API
presenting entities as value objects?* — is the diagnosis, and it is upstream of
§2's table rather than beside it.

`enquiryStatus` binds its `question` field like this:

```ts
const question = rows[0]?.q.name ?? loe.loe.name;   // src/domain/read.ts
```

That is **wording**, and where no question stands behind the enquiry it falls
back to the *line of enquiry's own name* — one field, two different entities'
text, neither an identity. Compare the same word one report over:

| report | field | holds |
| --- | --- | --- |
| `EnquiryStatus` | `enquiry` | an **id** |
| `EnquiryStatus` | `question` | the question's **wording** |
| `QuestionStanding` | `question` | an **id** |
| `QuestionStanding` | `asks` | the **wording** |

`question` means the id in one report and the text in another.

**This is why the multi-pursuit bug was inevitable rather than careless.**
`EnquiryStatus` carries no `QuestionRef` — nothing a caller can follow. So when
Bruno asks about his ablation there is no way to hand him the question's
identity and let him ask a second question about it. One report had to answer
both facts, and answering both from one shape means collapsing them.

It also unifies §2's three rows into one. They are not three ambiguities:
**the reference layer is unreliable, so the reports gave up on it and flattened
to strings.** `ObservationsRef` and `AnalysisRef` are references that do not
denote what they name; `EnquiryStatus` is a report that declined to carry a
reference at all. Same cause, opposite symptom.

Every entity in this model has a natural id, minted in the same round trip that
creates it, for exactly this. The read side drops them on the floor.

## 4. Which reads drop identifiers — the audit

Measured, not read off the source: a scenario exercising every verb, then every
string leaf of every report classified as an id or as prose. **Three reports
already do it right**, and they are the template:

```
whatIsKnown[].question    ID    +  .asks     TEXT
originOf.from             ID    +  .fromAsks TEXT
reproducibilityOf[].part  ID    +  .name     TEXT
```

Identity and wording, side by side, neither standing in for the other. Also
correct: `gateStatus.checks[].criterion` and `designHistory.criterion`, which
carry a ref beside the criterion's text.

**The fields that carried wording where an identity exists — all closed
2026-08-23**, and re-audited by the same method afterwards: every
entity-naming field in `EnquiryStatus`, `DependencyReport`,
`SupportExplanation` and `GateStatus` now carries an id beside its wording.
What remains as bare text is text: enum values, instants, and the wording half
of each pair.

| report | field | carries | the id it drops |
| --- | --- | --- | --- |
| `EnquiryStatus` | `question` | the question's text | `Q_n` |
| `EnquiryStatus` | `evidence[]` | evidence statements | `EV_n` |
| `DependencyReport` | `claims[]` | propositions | `CLM_n` |
| `DependencyReport` | `enquiries[]` | enquiry **names** | `LOE_n` |
| `SupportExplanation` | `support[].via` | the computation's *method* | `COMP_n` |
| `SupportExplanation` | `superseded[].via`, `against[].via` | same | `COMP_n` |
| `SupportExplanation` | `reverifiedBy[]` | analysis methods | `COMP_n` |
| `GateStatus` | `gating[]` | task objectives | `TASK_n` |
| `GateStatus` / `CheckStatus` | `evaluations[].basis[]` | evidence statements | `EV_n` |
| `GateStatus`, `SupportExplanation` | `unmet[]` | criterion propositions | `CRIT_n` |

**`whatDependsOn` is the worst of these and the clearest argument.** Its entire
purpose is *what would be affected if this turned out to be wrong*, and it
answers with prose:

```
claims:    ["depth moves convergence"]
enquiries: ["focused sweep"]
```

A caller cannot act on either. Every follow-up verb takes a reference, and the
report that exists to say *go and look at these* hands back text you would have
to search for by name — which is precisely the ambiguity `whySupported` already
**refuses** to guess at when two claims share a wording. One read refuses to
resolve wording; another emits it as the answer.

## 5. The plan

**Steps 1–3 done** (2026-08-23). Every row of §4 is closed; the demonstration
in `tests/subject-identity.test.ts` §4 now asserts the *fixed* shape and names
each row it used to catch. **Step 4 is the open one**: re-ask the multi-pursuit
question.

**What the fixes cost, recorded because it is the reusable part.** Four field
renames (`via` → `analysis`/`method`, `unmet` → `{criterion, requires}`,
`gating` → `{work, objective}`, `basis` → `{evidence, states}`) made `tsc` name
every one of ~40 call sites. One field *kept* its name and changed meaning —
`EnquiryStatus.question`, wording to identity — and `tsc` named **none**,
because both are `string`. **Rename when the meaning changes.** It is the
difference between a compiler-assisted edit and a grep you have to be right
about.

Two dedup defects fell out on the way, neither previously noticed: both
`whatDependsOn` and `CheckStatus.basis` deduplicated on **wording**, so two
records saying the same sentence merged into one. S-5 says those are two
records. In order, each step shippable on its own:

1. **A demonstration first.** Extend `tests/subject-identity.test.ts` with the
   audit as an assertion: for each row of §4's table, the field is prose and the
   entity it names has an id the report does not carry. Red-to-green target for
   everything below, and it fails honestly today.
2. **Fix the pattern where it is already established**, one report at a time,
   adding the reference *beside* the wording rather than replacing it —
   `{question, asks}` is the shape three reports already use, so this is not a
   new convention. ~~Additive: no caller breaks.~~ **Wrong, corrected by
   doing it:** where the wording lives in a bare `string[]` or a bare `string`,
   there is nowhere to add a reference beside it, so both fixes were *shape
   changes*. `tsc` named every call site for `DependencyReport`. It named none
   for `EnquiryStatus.question`, because that field changed meaning from wording
   to identity and both are `string` — the CLI would have silently printed
   `Q_1` where the question used to be. Found by grepping readers, not by the
   compiler. **A field that changes meaning without changing type is the
   dangerous half of this plan**, and the remaining rows in §4 are mostly that
   shape.
3. **`DependencyReport` first**, because it is the one whose answer is
   unusable without it, and `EnquiryStatus` second, because it is the one
   shipping a wrong answer.
4. **Then re-ask the multi-pursuit question.** Once `EnquiryStatus` carries a
   `QuestionRef`, "is the question answered?" is a read Bruno can *reach*, and
   whether it wants its own verb becomes a question about convenience rather
   than about expressibility. §6 below may answer itself.
5. **`ObservationsRef` and `AnalysisRef` last**, because they are the two rows
   where the current behaviour is convenient and correct, and the remedy is
   least clear.

**What this plan does not do.** No graph change, no new node label, no new edge.
Every id in §4's table already exists and is already reachable from the query
that builds the report; the work is carrying it through the projection instead
of discarding it. If a step turns out to need a model change, that is a finding
and belongs in the ledger, not in this plan.

## 6. What the scenario decides, and what it does not

Writing the conversation out ruled out both options first put to Dan. Both
assumed `enquiryStatus` reports *one* state, and the conversation says Bruno
needs **two facts**: the question is answered, and his line has produced
nothing. Collapsing them is what produces the wrong answer — the same shape as
S-1 refusing to collapse `untested` into `unresolved`.

**Settled, and by neither of the two options.** `EnquiryStatus` is now
`{enquiry, pursuing, contributed, question}` — everything at the top level is
true of the *enquiry*, and the question's state is nested where it cannot be
read as a pursuit's own. `contributed` is what this pursuit produced, which is
the fact Bruno asked for and which the flattened shape had no field able to
hold. No second verb was needed: the collapse, not the verb count, was the
defect.

**One diagnosis does not imply one remedy.** CLAUDE.md records four scenarios
asking *does the act record what it produced?* which needed four different
fixes. Rows 2 and 3 above may go the same way: the `AnalysisRef` dereference is
convenient and writes the correct edge, and making it honest would mean callers
naming artefacts they do not hold.

## 7. What is already known to cost something

Row 1 gives a **confidently incorrect answer** — a line of enquiry nobody worked
on reporting itself answered with another line's evidence. That clears PJ-011
§5 without a further probe.

Rows 2 and 3 do not, *inside the process*. Passing an analysis's output artefact
id as an `ObservationsRef` produces an identical record. But that equivalence
was measured holding an artefact id the domain handed back, and **a consumer
over the wire does not have one**: `replace_analysis(supersedes=A2,
from=[A1])` fails with `CONSUMES does not allow Computation -> Computation`.
The workaround exists — the id surfaces in `whySupported().restingOn` — by
asking why a claim is supported in order to learn what a computation read.

That correction came from an external review of PR #2 (ChatGPT), which caught
that the equivalence had been checked at the wrong boundary. Right check, wrong
side of the adapter.

## 8. What a cold review found afterwards, and what is left

A cold-context agent was asked whether the identifier work had made the read
layer **simpler with fewer bugs**. It answered **no**, with numbers: **+222 /
−72** across the read layer, nothing deleted, and `dedupeById` with two callers
while five sites open-coded the same thing.

**The fix had stopped exactly at §4's table boundary.** Six more
dedup-by-wording defects survived, three of them in `src/domain/core.ts`
helpers shared by both halves. All are now fixed. The sharpest was
`workGatedBy`: the *same* `Gate -GATES-> Task` traversal `gateStatus` already
reported as `{work, objective}`, left as a `Set<string>` of objective text one
file over.

`decidedOnTheStrengthOf` was the most embarrassing — it deduplicated questions
by wording, contradicting a sentence in `report.ts` saying S-1 "poses two
identically-worded questions, and neither may be resolved by comparing text".

**One finding refuted rather than fixed.** The review flagged `enquiryStatus`
deriving `answer: "no"` from an unscoped `CHALLENGES` match. It is unreachable:
`CHALLENGES` has exactly one writer on an exclusive branch, so one `Evidence`
carries one bearing edge ever, and `closeEnquiry` cites the evidence for the
closing proposition. Probed with an analysis concluding both ways — the answer
came back `yes`, correctly. **A static read inferred a path no writer can
produce**, which is the failure mode a cold reviewer is most prone to and worth
recording as the counterweight to everything else it got right.

**Still carrying wording where an id exists** — recorded, not fixed:
`ReplacementReport.affected` / `unchanged` / `changed[].proposition`,
`AmendmentRecord.replaced` / `nowRequires`, and `Revision` /
`InterpretationHistory`'s claim wording. `interpretationHistory` also *walks* by
name — its loop guard is keyed by id now, so the false "loops at" is gone, but
the traversal itself still resolves claims by text.
