# Post-review standing, and what the implementation probe must do

**Written 2026-08-20 after external review of `020`–`022`.** Four corrections,
two of which are defects in documents this session had already committed. Both
verified against the files before being accepted; both are annotated in place
rather than rewritten, and `022`'s superseded section is kept verbatim.

## 1. A preregistered protocol deviation, named

The brief's *Order of operations* preregistered:

```
Stage A → Stage B → blinded synthesis over all six → mapping → paired-world tests
```

What actually ran:

```
Stage A → blinded synthesis over three → Stage-A mapping → Stage B → Stage-B delta
```

The synthesis clustered **three** documents, not six, and the mapping happened
**before** Stage B rather than after. That is a deviation from a protocol this
session wrote in revision 2 and then failed to follow, without noticing while
writing two analysis documents on top of it.

The realised design is arguably the better one — it freezes the uncontaminated
Stage-A interpretation *before* the ontology-heavy material arrives, which is the
whole point of the ablation and which a six-document synthesis would have blurred.
That does not make it the protocol. **A deviation that turns out well is still a
deviation**, and letting it become the protocol retrospectively is how a
preregistration stops meaning anything.

Recorded, and the document roles are now fixed permanently:

| | |
| --- | --- |
| `020` | blinded **Stage-A** semantic map |
| `021` | **Stage-A** interim scoring |
| `022` | **Stage-B** delta analysis |

No combined synthesis is to be written later. One would wash out exactly the
distinction — independently elicited versus supplied — that the three documents
exist to preserve.

## 2. `022`'s headline was lexical, and is withdrawn

`022` claimed the ablation's clearest proof was *"Designer 3 had no concept of a
decision until Stage B supplied one."*

**Verified false in the sense that matters.** D3's Stage A output already
contained accepting-as-unresolved, positive and negative closure, `locked_amendment`
distinguishing a mechanical feasibility repair from a scientific change,
captured-not-admitted, and promotion state with explicit criteria. Every act was
there. What was missing was the **noun** abstracting them — and Stage B supplied
the literal word *decision*, after which D3 added `Decision`.

That is vocabulary priming, demonstrated beautifully. It is not a newly
introduced semantic distinction, and scoring it as one is **the exact instrument
revision 2 abandoned** — counting nouns rather than distinctions. Committed
inside the document analysing an experiment rebuilt to avoid that error.

**The sound demonstration is the telemetry result**, and it is promoted to the
headline:

```
Stage A boundary: "job performance is elsewhere"
        ↓  all three over-refuse telemetry entirely
Stage B: "link external runs without duplicating telemetry"
        ↓  all three independently add external-run references
```

That is a genuine change to the *contract* — an operation that refused now
answers — rather than a word appearing in a glossary. The narrow derived
agent-task contract is a second sound instance: the Stage A researcher statements
never required that consumer at all, and all three reached it only once PJ-001
introduced implementation-agent context.

## 3. A fourth bar: contract necessity

Three bars could still promote designer overreach. A designer can require a
distinction that is genuinely unrepresentable *and* not actually needed by
anything in the frozen contract.

**Inserted between bar 2 and bar 3:**

> Does losing this distinction materially prevent or corrupt a read operation
> that the frozen contract actually requires?

Rescored:

| Candidate | Contract necessity | Representation pressure | Standing |
| --- | --- | --- | --- |
| Attribution / authority | **strong** | strong | H1, row S |
| Historical ordering | **strong** | strong | H1, row Z |
| Reconstruction target | **strong** | strong | H1, row F |
| Bitemporality (record- vs belief-time) | **plausible, not required** | strong | candidate extension |

**Bitemporality is demoted out of the H1 count.** D1's distinction — *"believed
on 3 March"* versus *"recorded by 3 March"* — is real and the model unquestionably
cannot represent it. But no source obligation among the eighteen requires
retroactively recorded belief to be separately queryable. An excellent feature is
not the same as earned domain pressure. It sits beside row Z as *candidate
extension, not yet contract-required*, and it still matters for one reason
recorded in `021`: fixing row Z with a single `decided_at` would look like a fix
while silently choosing one reading.

**H1 survives on three, not four.**

## 4. D2's dependency finding has two levels, and only one is cheap

`022` classified it as query semantics. That is right for the safe half and
misses the expensive half.

**Safe default — no new state.** "No dependency found" must not be reported as
"independent". Open-world traversal, stated as such. Test it when the read
surface is built.

**Strong assertion — new state.** *"Unaffected within a complete dependency
boundary"* requires knowing the relevant dependency set **is** complete. Then:

```
World A: all relevant dependencies have been recorded
World B: some dependencies are known to be missing
```

Those may be identical in today's graph. If they are, coverage itself becomes
durable provenance state.

**Do not build D2's coverage assertion.** Preserve it as a discriminator:

> Can the consumer succeed by always being explicit that dependency traversal is
> open-world?

If yes, query semantics is the whole answer. If users eventually require
certified completeness, the discriminator has fired and the second world matters.

## Row F is the result to notice

S-9 could only say *nothing durable records what this reconstruction was
reconstructing*, and PJ-011 §5 correctly refused to let an absence earn anything.

A cold designer with no access to S-9, row F, or this repository then required a
reconstruction object whose essential remembered fields are its **historical
target** and source set.

Row F has moved from *known absence* to **consumer-required distinction**. It has
still not earned `Artefact → Artefact`; it has earned the right to be demonstrated
against a real read contract. That is precisely the external pressure the scenario
method was waiting for and could not manufacture from inside itself.

## Next: a thin vertical slice, not twenty operations

**No more designers.** Build four reads against real durable state, in researcher
language, with no graph vocabulary crossing the boundary:

1. **orientation / why** — "where does this stand, and why?"
2. **historical survey** — "what did the record hold at time T?"
3. **reconstruction provenance** — "what was this reconstruction reconstructing?"
4. **attribution** — "who made or authorised the consequential act?"

For each, **create two durable research worlds first**. If the public read API
returns the same answer where the frozen contract requires different ones, that is
the consumer-phase equivalent of the scenario method's demonstrated wrong answer —
and it is a demonstration rather than an absence.

Then the unchanged ladder: **reader semantics → existing relationships → new
relationship, property or reference → a new noun only if unavoidable.**

Do not start by adding `Actor`, timestamps, or artefact lineage. Let the four
reads fail against real state first. Fifteen scenarios have gone by with the noun
inventory unmoved, and the two rows that looked most like missing structure —
P and F — were answered in the query and in a refusal respectively.
