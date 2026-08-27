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
| **the ledger** | PJ-008 §3's table of design pressure on the model. Authoritative on what the model knows | `docs/project-journal/008_user_story_mining.md` §3 |
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

## The bars a change has to clear

Four separate tests, easy to conflate and conflated once already (`024` records
it).

| Term | Means | Defined in |
| --- | --- | --- |
| **§5** | PJ-011 §5: a model change needs a **demonstrated wrong answer**, not an empty result. An unanswerable question earns nothing | CLAUDE.md, "Changing the graph model" |
| **bar 1–3** | The original three: a wrong answer without the change; an empty result is not one; a new edge needs a reader, not just a writer | CLAUDE.md, same section |
| **bar 4** | *Contract necessity* — does losing this distinction prevent or corrupt a read the frozen consumer contract requires? Weaker than §5: *prevent* covers absence | `docs/consumer-contract/023` §3 |
| **the change bar / the rungs** | The order a remedy must be tried in: reader semantics → existing relationships → new relationship, property or reference → a new noun only if unavoidable | CLAUDE.md, "Changing the graph model" |

## Ledger status vocabulary

`open` + owned / `open` + unowned / `demonstrated` / `resolved` /
`resolved (argued)` / `refuted` / `boundary`.

**Defined in PJ-008 §3's Kind table, and which row is which is in §3's index
table.** Neither is copied here; a status written in two places is what
CLAUDE.md's document rule exists to stop.

## Method

| Term | Means |
| --- | --- |
| **paired worlds** | Two durable research states built through verbs alone, differing in one thing a researcher cares about. If a read returns the same answer for both, the model cannot express the difference |
| **the detector test** | *What change to the model makes this test fail?* A test that would stay green after the gap it describes is closed has not demonstrated anything (`024`) |
| **injection** | Adding the field a fix would add, watching the test fail, then restoring the source **byte-identical**. What turns a detector claim into a fact |
| **deletion verification** | The same move for a change already made: remove it, watch the wrong answer return, restore byte-identical |
| **predictions first** | A predictions document written before a line of source, so a refutation survives as a result instead of being edited into hindsight. It may **not** rank outcomes by how impressive they would be (PJ-026) |
