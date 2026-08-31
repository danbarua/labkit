# PJ-008 Appendix: the corpus era closes

**Status: decision record, 2026-08-31.** Sits between PJ-008 and PJ-009
deliberately — it closes the machinery PJ-008 opened, and everything after
PJ-009 was built under that machinery's rules. §3's ledger above this file is
**closed as written**: forty rows, A through AN, dated records of the
validation era. Nothing writes there any more, and nothing "corrects" it —
the same terms `docs/session-log/` closed under.

## What the ledger was, and what it did

PJ-008 §3 was the instrument of one question: **is the domain model right?**
Every row was a prediction about where the model would strain, made before
building, settled by demonstration. Its rules — an empty result earns nothing,
only a demonstrated wrong answer changes the model, at most one demonstrated
wrong answer ships green, every deferred row names its discriminator — were
calibrated for that question, and they worked: forty rows closed as
27 resolved, 5 refuted (each refutation a real result), 1 resolved by
argument, 3 characterised as boundaries, with predictions wrong often enough
to prove the method could lose. The interaction corpus it governed produced
every verb the product now ships.

## Why it closes now

The question changed. On 2026-08-31 the first *real* research programme —
Bonsai, 102 events, four transcription chains — went into the record, and the
day's findings exposed the ledger's era three ways:

1. **Dual bookkeeping, demonstrated the day it started.** Row AM was written
   beside issue #132 and row AN beside #137 — two copies of one status, in a
   repository whose sixth principle is that state lives in one place. The
   session log died for exactly this; the ledger earns the same verdict the
   day it starts requiring it.
2. **The validation bar started blocking usability.** "An empty result earns
   nothing" (PJ-011 §5) is why #98 sat Parked — a task that cannot name the
   question it serves is *unanswerable, not wrong* — while the Bonsai
   transcription reproduced the pain on a real task the same day. The bar was
   right when the risk was speculative modelling; it is wrong when a real
   consumer is asking a real question and being told the absence is not a
   defect.
3. **Verbs stopped being scenario-earned in practice.** `search` (#155)
   shipped for a user's stated need, with no scenario, and was the most
   immediately useful verb added in weeks.

## The dispositions

Every row that was not settled has a home; nothing open is orphaned by this
closure:

| Row | Status at closure | Where it lives now |
| --- | --- | --- |
| AH — `Claim.kind` carries two facts | open, unowned | issue #63 |
| AI — `Computation.kind` holds prose | open | issue #64 |
| AJ — `(proposition, enquiry)` is a hidden entity | open | issue #65 |
| AM — partial supersession | demonstrated | issue #132, the board's P0 |
| F, Y, AA | boundary | closed with the ledger — a boundary is a dated characterisation, and these three are complete as written |

## What survives, rewritten for the usage era

These replace the corresponding rules in CLAUDE.md, and the reasoning is
here rather than there:

- **The one-wrong-answer discipline survives; its ledger does not.** "At most
  one demonstrated wrong answer ships green, and clearing it is the next
  thing built" did real work as recently as yesterday and stays. Its state
  lives on the project board's P0 column — one place, already maintained —
  not in a table row. An external review's defence of the rule stands: it
  exists to make known falsehoods uncomfortable, and that does not expire
  with the era.
- **Two bars now, by kind of change.** A *correctness* change to the model —
  an edge redirected, a grain moved, a derivation fixed — still requires a
  demonstrated wrong answer; queries stay free to be wrong and re-run, stored
  shape stays expensive. A *capability* change — a new verb, a new edge that
  exists so a question can be asked at all — is earned by a **demonstrated
  consumer need**: a real user or agent asked, and the record could not
  answer. #98 is the first beneficiary; `SERVES` no longer waits for a wrong
  answer that its own absence makes impossible.
- **Verbs are earned by consumers.** A scenario is one kind of consumer; a
  person transcribing a real programme is a better one.
- **The vocabulary rule narrows to its true half.** The node vocabulary was
  always shared — handle prefixes broadcast it, because the node names *are*
  researcher language. What stays out of required inputs is the edge wiring,
  and for a shipping reason rather than a scenario one: it is the
  least-validated layer of the model (#132, #143, and the port's six wrong
  edges are all edge-layer), and verbs-as-input is what lets it change
  without breaking a caller. Outputs may carry anything useful; a verb that
  *requires* graph vocabulary as input is a usability defect. When the edge
  layer settles, revisit even that.
- **Refusals must teach the shape.** The model enforces its structure either
  way; doing it opaquely was the worst of both. Tracked as its own issue.

## What this does not reopen

The scenarios stay: `tests/scenarios/` is the acceptance suite for mechanics
the model has, whoever asked for them. The dialogue rule inside them stays,
re-read as a usability assertion — the model must remain usable by someone
who has never seen `src/db/domain.ts`. And nothing here relaxes the
measurement culture; this entry exists because the ledger's costs were
measured on the day they doubled, not felt.
