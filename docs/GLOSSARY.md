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

## Sources

| Term | Means | Defined in |
| --- | --- | --- |
| **PJ-NNN** | A project-journal entry — a decision and its reasoning | `docs/project-journal/` |
| **the ledger** | PJ-008 §3's table of design pressure on the model. Authoritative on what the model knows | `docs/project-journal/008_user_story_mining.md` §3 |
| **S-N** (S-3, S-9b…) | A scenario from PJ-008's corpus, built as an executable conversation. Letters mark variants built later | PJ-008 §2, `tests/scenarios/` |
| **row A–AD** | One row of the ledger — one predicted or found gap in the model | PJ-008 §3 |
| **D1 / D2 / D3** | **Designer 1/2/3** — the three cold-context designers of the consumer-contract exercise. 1 = `claude-opus-5`, 2 = `gpt-5.6-sol`, 3 = `grok-4.6`. **Beware:** `D1`/`D2` also appear in PJ-001 and PJ-003 as *Decision* nodes in ASCII diagrams. Different thing entirely | `docs/consumer-contract/020_synthesis_blinded.md` |
| **H1** | The consumer-contract exercise's main hypothesis, and the count of candidate distinctions surviving it | `docs/consumer-contract/021`, rescored in `023` |

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

| Term | Means |
| --- | --- |
| `open` + **owned** | An unbuilt discriminator is named, marked `°` |
| `open` + **unowned** | Every named probe was built; a **new** discriminator is needed |
| `demonstrated` | A wrong answer is on the record and the **fix** is what is unbuilt. At most one at a time — `bun run check:ledger` enforces it |
| `resolved` | Settled, with or without a model change |
| `resolved (argued)` | Settled, but by argument rather than a demonstrated wrong answer. Weaker, and scannable as such |
| `refuted` | The predicted gap turned out not to be one |
| `boundary` | A characterised limit, recorded on purpose, with no claim it should be fixed |

Full legend, including why the distinctions matter: PJ-008 §3.

## Method

| Term | Means |
| --- | --- |
| **paired worlds** | Two durable research states built through verbs alone, differing in one thing a researcher cares about. If a read returns the same answer for both, the model cannot express the difference |
| **the detector test** | *What change to the model makes this test fail?* A test that would stay green after the gap it describes is closed has not demonstrated anything (`024`) |
| **injection** | Adding the field a fix would add, watching the test fail, then restoring the source **byte-identical**. What turns a detector claim into a fact |
| **deletion verification** | The same move for a change already made: remove it, watch the wrong answer return, restore byte-identical |
| **predictions first** | A predictions document written before a line of source, so a refutation survives as a result instead of being edited into hindsight. It may **not** rank outcomes by how impressive they would be (PJ-026) |
