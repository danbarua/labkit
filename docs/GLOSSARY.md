# Glossary

**Pointers, not definitions.** Every term below is defined somewhere else, and
that somewhere is authoritative. This file exists because the definitions all
live where a reader already knows them — `D1/D2/D3` is defined on line 10 of a
document that then uses it 218 times, and nowhere else — so arriving at any other
document leaves you guessing.

Keeping it to a gloss and a pointer is deliberate. A second copy of a definition
is a second thing to go stale, which this project has now caught four times in
one week: a doc comment on the wrong function, a ledger status disagreeing with
itself, a CLAUDE.md sentence outliving its truth, and a row whose title
contradicted a document in the same repository.

This file glosses **shorthand**, which is stable. It carries no statuses, counts
or ranges — see CLAUDE.md, "The one rule about documents".

## Sources

| Term | Means | Defined in |
| --- | --- | --- |
| **PJ-NNN** | A project-journal entry — a decision and its reasoning | `docs/project-journal/` |
| **the ledger** | PJ-008 §3's table of design pressure on the model — **closed as a dated record on 2026-08-31**; findings live in issues, and the one demonstrated-wrong-answer slot is the project board's P0 column | PJ-008b, `docs/project-journal/008b_appendix_the_corpus_era_closes.md` |
| **the corpus era / the usage era** | Before and after PJ-008b: validating the model against authored scenarios, then building it against a real record and real use | PJ-008b |
| **S-N** (S-3, S-9b…) | A scenario from PJ-008's corpus, built as an executable conversation. Letters mark variants built later | PJ-008 §2, `tests/scenarios/` |
| **row X** | One row of the ledger — one predicted or found gap in the model | PJ-008 §3 |
| **D1 / D2 / D3** | **Designer 1/2/3** — the three cold-context designers of the consumer-contract exercise. 1 = `claude-opus-5`, 2 = `gpt-5.6-sol`, 3 = `grok-4.6`. **Beware:** `D1`/`D2` also appear in PJ-001 and PJ-003 as *Decision* nodes in ASCII diagrams. Different thing entirely | `docs/consumer-contract/020_synthesis_blinded.md` |
| **H1** | The consumer-contract exercise's main hypothesis, and the count of candidate distinctions surviving it | `docs/consumer-contract/021`, rescored in `023` |

## Domain vocabulary that reads like plain English and is not

Words a reader will assume they already understand. Each is defined in exactly
one place and used everywhere.

| Term | Means | Defined in |
| --- | --- | --- |
| **the five buckets** | `established` / `provisional` / `accepted` / `unresolved` / `untested` — how `whatIsKnown` partitions questions | `KnowledgeSurvey`, `src/domain/report.ts` |
| **provisional** | **Answered, and not something to build on yet.** Two reasons, deliberately one bucket: the finding nobody promoted (S-18), *and* the promoted finding whose prespecified check failed or was never run (S-19). Its name described only the first until 2026-08-27 | `KnowledgeSurvey.provisional` |
| **`Status` vs `state`** | `Status` is only ever a **report type** — `GateStatus`, `CheckStatus`, `EnquiryStatus`, the whole answer about one thing. `state` is only ever a **field** holding a computed enum. There is no `status:` field anywhere, and using both words for one idea is the confusion this entry exists to stop | `src/domain/report.ts` |
| **the string taxonomy** | `IndexedString` / `Timestamp` / `IdentityString` / `ReadOnlyString<T>` / `Prose` — what LabKit *does* with a stored string, so a reader learns it from the declaration instead of auditing every query. All are plain aliases and constrain nothing; `check:no-stringly-typed` is what makes them load-bearing | `src/db/domain.ts` |
| **`ReadOnlyString<T>`** | *Stored, handed back to callers, **never decided on***. It exists to say **nothing reads this field**, so an annotation that is wrong is worse than none — `Claim.kind` carried it falsely while three sites branched on it (2026-08-27) | `src/db/domain.ts` |
| **held to** | A conclusion answering to a condition agreed **before** the run. Written when the analysis is recorded, not when the check is evaluated, so a check nobody ran still counts against the finding (S-3b) | `EDGE_SCHEMA.QUALIFIES`, `src/db/domain.ts` |
| **corroborates vs belongs to** | The two ways a report reaches a claim's neighbours, and they are **not** interchangeable. **Findings aggregate over the proposition**: a re-run concluding the same sentence corroborates, which is what S-10 needs. **A prespecified check belongs to the one analysis held to it**: another analysis's check is not this claim's standard. Selecting findings by handle was tried and turned 13 scenarios red; selecting checks by wording made two verbs contradict each other. Ledger row AL | `findingsBearing` and `checksAnchor`, `src/domain/read.ts` |
| **a fact** | A named node carrying a Cypher clause, a fold, and the **grain** it is computed per. The read side is composed from these so a rule cannot be written twice and drift; the write side stays hand-rolled Cypher, which documents why the graph is shaped as it is | `src/domain/facts.ts`, CLAUDE.md "The read side is a graph of facts" |
| **grain** | The subject a fact answers about — question, claim, criterion, evaluation. A dependency at the **same** grain is one value; only a **finer** one fans out into a map | `src/domain/facts.ts` |
| **looks again vs acts** | The severity test for a read defect, sharper than *empty result versus wrong answer*: a query returning **too little** makes someone look again; a query re-asking a **settled question** makes someone act. From `exo-ledger`, 2026-08-28. Ours was the second kind — `established` is not a smaller answer than `provisional`, it is a prompt to build on something. Use it to decide which reads earn a mutation first: those feeding a bucket, a queue or a refusal before those feeding a detail view | `exo-ledger`, relayed via `labkit-review` |
| **mutation coverage** | The testability argument for naming a fact: mutate it once and **every** reader must go red. Measured here — dropping the retraction rule from `checkState` fails 4 tests across two readers, and walking one bearing fails 3 across two scenario files, so a defect class that took six separate discoveries became reachable from two lines. It multiplies only where a fact has more than one reader, which is why it sharpens the compose-it line rather than widening it | CLAUDE.md, "The read side is a graph of facts" |

## Retired: the bars a change had to clear

**There are no bars.** Removed 2026-09-03 on Dan's directive — *"bars are bars
on making progress; bars is ancient historical language. There are no bars on
applying sensible software engineering decisions. There are no hypothetical
scenarios gating us from implementing functionality needed in the real world.
The real world drives requirements drives code changes."*

The tokens are kept here **only so a reader who meets one in a dated journal
entry knows what it meant and that it is dead**: `§5` (a correctness change
needs a demonstrated wrong answer), `bar 1-3` (a wrong answer without the
change; an empty result is not one; a new edge needs a reader), `bar 4`
(contract necessity), `the change bar` / `the rungs` (the order a remedy had to
be tried in), `the usage-era bar` (would this have saved the user the pain of
Markdown + Git). None of them constrains anything today. What replaced them is
in CLAUDE.md, "Changing the graph model": if there is a relationship between A
and B, that is an edge; a new label or edge is earned by someone needing it.

The one rule that survived, under its own name rather than as a bar:

| Term | Means | Defined in |
| --- | --- | --- |
| **the slot / the one-wrong-answer rule** | At most one demonstrated wrong answer ships green at a time, and clearing it is the next thing built. Its state is the board's P0 | CLAUDE.md, "One wrong answer at a time" |

## Retired: composed scenarios

The Explorer no longer runs scripted arcs against a fresh database — it
serves one real record, re-read on every request. Listed **only so a reader
meeting one of these in a dated entry knows what it meant**:

| Term | Meant |
| --- | --- |
| **a move / a fragment** | One composable research action over `WriteSurface`, returning the handles the next move needed — `askAndPursue`, `gatedWork`, `replaceAnalysis`… |
| **a composition / an arc** | A named sequence of moves run against a real database to produce a trace, distinct from an acceptance scenario |
| **origin** (`labkit-ts` / `labkit-rust` / `labkit-db`) | Which producer a trace came from: the TypeScript domain run fresh, the Rust/Grafeo port, or a real record read back from its durable log |

## Retired: ledger status vocabulary

`open` + owned / `open` + unowned / `demonstrated` / `resolved` /
`resolved (argued)` / `refuted` / `boundary` — PJ-008 §3's Kind table, closed
by PJ-008b. Listed **only so a reader meeting one in a dated entry knows what
it meant**. Nothing is written in these words any more: what was `demonstrated`
is the board's P0 issue, and what was `open` is an open-question issue.

## The record, and what is said about it

Shorthand from the Bonsai work (#124) and the verbs it earned.

| Term | Means | Defined in |
| --- | --- | --- |
| **the record / the live record** | `~/Code/pycharm/bonsai-2026/.labkit/` — the real research programme LabKit was built for, entered as a LabKit record. Not synthetic, not a fixture | #124 |
| **script-derived** | The live record is exactly what the four `scripts/probe-bonsai-*.sh` produce, and is rebuilt from them rather than repaired in place | #157, `scripts/probe-bonsai-replay.sh` |
| **the replay checker** | Replays the four scripts into a fresh directory and byte-diffs `happened` and `known` against the live record. OK / FAILED / ERROR are three different outcomes | `scripts/probe-bonsai-replay.sh` |
| **a snapshot** | A dated copy of `.labkit/` taken at a milestone, outside both repositories, never updated in place | `~/labkit-snapshots/`, #129 |
| **minted / `created`** | What a write act brought into existence. *A verb that mints something returns what it minted* — every write returns its events, and `created` on the event is the drained list, so a return type cannot under-report | #161, `WriteSurface.emit` |
| **measured vs asserted** (a verdict) | An evaluation resting on cited evidence versus one citing nothing. Empty `basis` means asserted. `gate` prints the difference since #151; a measured quality-bar check still records as asserted because a verdict can cite only a claim | S-8, `Verdict.basis`, #150 |
| **observed vs claimed** (attribution) | Whether LabKit saw who acted or was told. `--author` is claimed. Time has the same split: `at` is the claimed instant (`--date` can set it), `seq` the observed order the store assigned | #81, #154 |
| **standard vs hypothesis** (a criterion) | A criterion is the quality bar a result is *held to*, which passes or fails whichever way the science comes out — *primary, median and sign-flip agree at the locked bound*. It is not the hypothesis under test; direction lives in a conclusion's `bearing` | PR #147's review |
| **a three-part refusal** | Every refusal names what was expected, what it got, and what would satisfy it, and may name a concept or a verb both surfaces spell the same — never a command | `ReadSurface` doc comment, `src/domain/read.ts`; #164, #169 |
| **partial supersession** | A re-analysis that revisits some of a prior analysis's conclusions and says nothing about the rest. `replace` retracts all of them today (#132, the demonstrated wrong answer); the fix is #173 | #132, #173 |
| **`conclude`** | The proposed primitive under `analyse`/`replace`/`reverify`: one conclusion per call, so a compound act is built by successive handle-carrying calls rather than described in a JSON blob | #173 |

## The Explorer, and what it draws

| Term | Means | Defined in |
| --- | --- | --- |
| **a trace** | The steps a picture is drawn from: per act, what it created, which edges, the derived state afterwards. Never hand-written; read off the event sink | `fragments/trace.ts` |
| **derived state** | What LabKit's own reports say about an enquiry or gate after a step, as distinct from the nodes and edges the step wrote — the two can and do disagree in count | `fragments/derive.ts`, the Explorer's bottom panel |

## Method

| Term | Means |
| --- | --- |
| **paired worlds** | Two durable research states built through verbs alone, differing in one thing a researcher cares about. If a read returns the same answer for both, the model cannot express the difference |
| **the detector test** | *What change to the model makes this test fail?* A test that would stay green after the gap it describes is closed has not demonstrated anything (`024`) |
| **injection** | Adding the field a fix would add, watching the test fail, then restoring the source **byte-identical**. What turns a detector claim into a fact |
| **deletion verification** | The same move for a change already made: remove it, watch the wrong answer return, restore byte-identical |
| **predictions first** | A predictions document written before a line of source, so a refutation survives as a result instead of being edited into hindsight. It may **not** rank outcomes by how impressive they would be (PJ-026) |
