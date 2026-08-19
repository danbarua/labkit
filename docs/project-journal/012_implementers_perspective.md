# PJ-012: An implementer's perspective, written without the motivating context

**Status: opinion, not decision (2026-08-19), on `spike/drizzle-age`. One
vantage point among several. Nothing here was agreed with the reviewer or the
user; it is recorded so it can be argued with, and superseded when it turns
out to be wrong.**

> **Read this with a date in mind.** Written after S-3, before S-4, S-1, S-7,
> S-12 and S-5 existed. Its central open question — "do the nouns survive claim
> identity?" — has since been answered *yes*, by S-12 and S-5, with no schema
> change. For what is true now, read **PJ-014** (question lifecycle) and
> **PJ-015** (claims and amendment). Three of the four things this entry said
> to watch have outcomes recorded there; the fourth (what a first non-additive
> change costs) is still untested.

## Why this entry exists, and what it can't see

The user, the reviewer and the project's originator share context this entry
does not have: the specific pain that motivated starting LabKit. That is
deliberate and, I think, correct — it keeps my judgements grounded in what is
actually in the repository rather than in a narrative I would otherwise be
fitting to.

But it bounds what this entry is worth. Every claim below is derived from
building the thing and reading it back. Where I reason about *what LabKit is
for*, I am extrapolating from a corpus (PJ-008) that is itself a
reconstruction of someone else's research programme. Weight accordingly.

The rest of this entry is the part I do have privileged access to: I have
written every line of `src/`, and I have watched which parts resisted.

## 1. What building revealed that a specification could not

**The model resisted in exactly one place, consistently.** Across three
scenarios and four independent cold reviewers, the *entity* inventory has not
moved: the thirteen nouns from PJ-001 have absorbed a real research
programme's messiness without one being added, removed, or split. Every
pressure point — all twenty-one ledger rows — landed on relationships,
properties, or query semantics. If the nouns were wrong, three scenarios and
four reviewers is enough exposure that I would expect to have seen it by now.
That is the single strongest result the project has, and it was not
predictable from the design exercise that produced them.

**Cost asymmetry is measured, not assumed.** Three additive changes
(`CONSUMES`, `GOVERNS`, an extra `EVALUATES` endpoint) each cost two lines
and zero migrations, and each was verified to reach tenants provisioned
before it existed. Non-additive change has no story at all and has never been
attempted. "Easy to change" is currently a claim about one direction.

**The expensive mistakes were all the same shape: two things treated as one.**
Criterion-scope collapsed into gate-scope. `invalidated`'s absent and
explicit-`false` spellings. `Question` collapsed into `LineOfEnquiry`.
`Evidence` carrying both measurement and inference. Each was cheap to fix in
code and each was *invisible* until a second consumer touched the same
structure.

That yields a method claim I did not expect and would not have got from
specification: **a single scenario cannot detect conflation.** It takes two
consumers of the same object, wanting different things from it. S-17 alone
never needed criterion-scope; S-3 alone never noticed it was gone; the pair
caught it in one assertion. This is the concrete reason to keep scenarios
running after they go green, and it argues that scenario *overlap* is worth
more than scenario *coverage*.

**Derived-over-stored kept winning without anyone deciding it should.** Four
gate states, per-criterion `never-run`, "which conclusions changed",
`everFailed` — each was reached by finding that storing it created an
invariant to maintain, and computing it did not. It is now written down as a
heuristic in `CLAUDE.md`, but it was discovered by repetition, not imposed.

## 2. Where I was wrong this round

**The frontier map.** I argued it gets more valuable at the front of the
funnel, because that is where most of the graph is unwalked. That is true and
irrelevant. At the front the researcher holds the map in their head — there
are few enough threads to keep track of. The place it earns its keep is deep
in the back half, where the question stops being *"what haven't I explored?"*
and becomes *"which seam am I currently mining, and what did I come here
for?"* Those are different artefacts. The first is a coverage map; the second
is closer to a position fix. I designed toward the wrong one.

**"We tested the least representative region first."** I flagged this as a
cost. Given the funnel — the front half can be prose in Markdown, the back
half is where bookkeeping has to be right — building back-to-front is not
counterintuitive, it is the only order that puts effort where software is
required. The front half may never need this system. My flag was aimed at the
wrong end.

I would keep one narrower version of the concern: row A was refuted in the
only context where criteria exist, which is fine, but **row I** — absence of
evidence versus inconclusive evidence — has so far only been tested *inside*
the gate machinery. It is the row most likely to behave differently where
nothing was prespecified, and it is not yet clear it has been tested at all
in that mode.

## 3. The harvest, if the specs never complete

The user expects this development phase may not finish against the specs as
authored. Assuming that, here is what I think survives independently of
whether a single node label is right — recorded now, while the provenance is
fresh:

- **`src/db/agtype.ts`** — a real recursive-descent agtype parser. Not
  LabKit-specific. Handles the complete `::tag` set at arbitrary nesting,
  returns `bigint` for graphids past `Number.MAX_SAFE_INTEGER` (which LabKit
  hits on every tenant, today), preserves exact `::numeric` text, and fixes a
  reproduced float-in-array bug in Apache AGE's own Node driver. This is
  contributable upstream more or less as-is.
- **`src/db/cypher.ts`** — column decoders where one declaration produces
  both the SQL `AS` clause and the TypeScript row type, with `optional()`
  carrying `OPTIONAL MATCH` nullability into the type. Reusable by any
  AGE-plus-TypeScript project, and a strictly better answer than the
  reference driver's global type-parser registry.
- **`cypherDollarQuote`** with the trailing-`$` case upstream misses.
- **The pglite-socket concurrency finding** (PJ-006) plus
  `scripts/check-pglite-concurrency.sh` — an independent reproduction of a
  real upstream defect, with a standing regression check.
- **Additive reconciliation on every tenant resolve** (`provisioning.ts`) — a
  working answer to "there is no `ALTER GRAPH`", including the observation
  that provisioning up front makes unwalked structure a computable frontier.
- **The method itself**, which I think is the most transferable thing here:
  predictions written before the build; a ledger that keeps refuted
  predictions as results; *shown wrong, not argued wrong*; empty results not
  counting as wrong ones; scenario tests mechanically barred from importing
  the persistence layer; every answer asserted twice, once from the return
  value and once from a fresh query.

None of that depends on the domain model being right.

## 4. Reservations, stated plainly

- **Not-deciding is accumulating.** Rows B, N, P, Q, R, S, T and V are all
  open, and three of them were deliberately not picked when two models fitted.
  I believe each individual call was right. I also think there is no stated
  trigger for when the stack becomes its own problem, and the failure mode is
  gradual: the model stays technically undecided while the code quietly
  encodes one reading anyway. `openEnquiry` collapsing `Question` is arguably
  already an instance.
- **A wrong answer is shipping green.** `whySupported()` reports
  `supported: true` for a finding whose own prespecified checks failed. It is
  commented, tracked as row V, and asserted deliberately — but a passing suite
  containing a known-wrong answer relies on everyone remembering why.
- **The event log is a growing IOU.** Rows I, O and the whole temporal story
  are being routed toward a durable sink that does not exist. The seam is
  real; the store is not. Each row routed there increases what its eventual
  shape has to satisfy.
- **`incomplete` is the one gate state no test forced.** I reasoned it should
  exist. By this project's own bar that is a weaker warrant than everything
  around it, and I would not defend it as earned.

## 5. What I would watch next

1. **Does row I hold outside the gate machinery?** It is the row most likely
   to have been tested only in its easy mode.
2. **Do the nouns survive claim identity?** S-5 and S-12 are where an entity
   change would first become plausible — if `Claim` turns out to be two
   things, that is the first genuine entity finding.
3. **What does the first non-additive change actually cost?** The cheapness
   claim is one-directional and untested.
4. **Whether conflation keeps being the failure mode.** If it is, scenario
   overlap should be scheduled deliberately rather than falling out of the
   order, and the ledger might usefully record which *pair* of scenarios
   touches each structure.

## Judgment calls

- **This is filed as opinion and labelled as such.** It states positions the
  reviewer has not seen and may disagree with; the point is that it can be
  argued with rather than quietly informing my choices.
- **I did not soften the reservations to match the good news.** The nouns
  holding is genuinely the strongest result here, and it sits next to four
  concerns I would raise unprompted.
- **I recorded being wrong about the frontier map in full**, because the
  correction — coverage map versus position fix — is more useful than the
  original idea was.
