# The vertical slice: three gaps demonstrated against running code

**Implemented 2026-08-20 on `feat/domain-consumer`.** `tests/consumer/vertical_slice.test.ts`,
four probes, 192 pass / 0 fail, typecheck clean, `npx depcruise src tests
--output-type err` 0 errors.

**Nothing has been changed in the domain model.** This entry establishes which
failures are real. It deliberately does not fix any of them.

## What changed since `023`, and why it matters

`021` and `023` scored four candidates on paper: two worlds described in prose,
and a durable state I asserted would be identical. That is an argument.

This is the same test against **running code**. Each probe builds two research
worlds through research verbs alone, against a real graph, then asks the public
read surface. Where the surface returns the same answer, the failure is
demonstrated rather than predicted.

The distinction matters here more than usual, because PJ-011 §5 refuses to let a
missing feature earn anything — an empty result is unanswerable, not wrong. A
paired world is the way past that: the two histories genuinely differ, a
researcher genuinely asks the question, and the record genuinely cannot say which
history it holds.

## Probe 1 — orientation. **Passes.**

The control, and it had to pass: a gap-hunting probe that finds nothing but gaps
is measuring its own construction.

Two worlds differing in whether a prespecified robustness condition held — story
3's *"formally significant computation that remains insufficient evidence"*.
`whySupported()` separates them cleanly: `supported: true, unmet: []` against
`supported: false, unmet: ["stable across five seeds"]`.

This is the question LabKit was built for and it answers it.

## Probe 2 — historical survey. **Gap demonstrated. Row Z.**

Two programmes settle the same two questions in **opposite orders**. Both end
holding both beliefs, which is correct and is not the finding. The finding is
that nothing distinguishes a programme that believed the first while the second
was still open from one that believed the second while the first was still open
— and those are different scientific histories.

`whatIsKnown()` is the only survey read and takes no time argument. Both worlds
return the same two questions.

Required by all three designers in cluster 21, in three different vocabularies
(`as_of`/`believed_at`, "as-of view", "past standing reconstructed at a time") —
semantic convergence despite lexical disagreement, which is the strong signal.

## Probe 3 — reconstruction provenance. **Gap demonstrated. Row F.**

One artefact is a regenerated stand-in for a lost historical control; the other
is fresh work for this study that happens to carry the same name. Every read
returns the same shape about both: same `restingOn`, same support, same keys.

The only trace that one reconstructs something is a **sentence a human wrote into
a finding**. That is identity by wording — the defect this project has fixed in
six separate regions — reappearing as the *only available answer* rather than as
a mistake someone made.

Required by Designer 2, which named a durable reconstruction attempt whose
remembered fields include its historical target. PJ-021 stated this gap in almost
the same words and correctly refused to let it earn anything without a
demonstration. This is the demonstration.

## Probe 4 — attribution. **Gap demonstrated, and it is the strongest. Row S.**

Stronger than the other two for a reason worth stating precisely: **those worlds
can be built and then cannot be read apart. These cannot be built at all.**

`closeEnquiry` takes `{ enquiry, answeredBy? }`. No verb on the surface accepts an
actor. So a researcher who wants the record to say who closed a question has
exactly one route — write the name into a finding's prose. The probe does that,
and then shows what it buys: `closure`, `answer` and `open` are identical across
the two worlds; only `evidence` differs, because the two worlds have literally
different sentences in them.

The name is unreachable *as attribution*. A caller can only recover it by parsing
evidence prose and guessing which parenthetical is a person. Attribution is
currently **only wording**, and nothing knows it is there.

Required by all three designers, distributed across four unanimous clusters
rather than forming one — which is why the blinded synthesis never gave it a
heading and a heading-only reading would have scored the prediction refuted.

## What the probes are not allowed to do

`tests/consumer/` may not import `src/db` — a new dependency-cruiser **error**,
verified by making it fire and then restoring. The reasoning is specific to this
exercise: a probe with graph access could answer from the graph directly and
report a distinction no consumer could ever make. That is the one result this
file must be unable to fake.

The clock is fixed at a constant for the same reason. A read that tells two
worlds apart only because wall-clock time moved between them has distinguished
the test runs, not the research states.

## Standing

| Probe | Contract need | Result | Ledger |
| --- | --- | --- | --- |
| Orientation / why | strong | **answers** | — |
| Historical survey | strong | **gap demonstrated** | Z |
| Reconstruction target | strong | **gap demonstrated** | F |
| Attribution | strong | **gap demonstrated, inexpressible** | S |

Three demonstrated failures against running code, each required by the frozen
contract, each surviving the contract-necessity bar from `023`.

## What happens next, and what must not

The change bar is unchanged and no rung has been climbed:

> **reader semantics → existing relationships → new relationship, property or
> reference → a new noun only if unavoidable.**

Rows P and F are the cautionary pair. P looked like missing structure across two
builds and was resolved in the query. F looked like a missing edge and was
answered by a refusal. **Do not open by adding `Actor`, a timestamp, or an
artefact-lineage edge.**

The order I would take them, cheapest first:

1. **Row Z** — try reader semantics. A survey read that accepts a time needs
   *some* ordering, but `Decision` already has `closed_at` and the event stream
   already carries stamps; whether a durable ordering can be derived rather than
   stored is untested and is the first thing to test.
2. **Row F** — try an existing relationship before a new one. The question is
   whether a reconstruction can be recorded as an *act* with a target using verbs
   that already exist, which is what S-9 declined to invent and what Designer 2
   independently required.
3. **Row S** — last, and deliberately. It is the only one of the three that is
   inexpressible rather than unreadable, so it is the most likely to need a real
   noun, and the most expensive to get wrong. It is also **write-side**, which
   this read-only contract could never validate — the requirement is real, the
   shape is not yet earned.
