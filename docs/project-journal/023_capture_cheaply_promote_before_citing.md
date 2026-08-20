# PJ-023: Capture cheaply, promote before citing — clearing row K

**Status: implemented (2026-08-20), on `spike/drizzle-age`. Covers S-18
(`a449392`), promoted from §4 by its own recorded condition. Row K **resolved**
with one new edge label (`PROMOTES`) and no new node label, property or
migration. Verification: 188 pass / 0 fail, typecheck clean,
`npx depcruise src tests --output-type err` 0 errors.**

## Context

Story 18 is *low-friction exploration captured without ephemeral scratch
becoming part of the scientific record by accident.* Its rule: **capture
cheaply, promote before citing.** The premise does the work — scratch is
recorded *before* anyone knows it will matter, so whatever standing it ends up
with cannot have been declared when it was written.

## A condition nobody re-reads is not a mechanism

S-18 is the one scenario in this project promoted by a rule rather than
authored. §4 has carried its trigger since the document was written — *"held
back because the exploratory/confirmatory distinction may already cover it; if
row K survives the build, promote this to a scenario."*

Row K survived S-8, which gave it no verdict. So the condition **fired at S-8**
and then sat fired, unnoticed, through three external reviews. The fourth
reviewer found it by reading §4.

That is worth recording as a process result rather than a footnote. The ledger's
machinery — `°` markers, the ownership taxonomy, "every deferred row names the
scenario that would settle it" — is all designed so that state is *scannable*.
None of it helps for a condition expressed as prose in a section nobody revisits.
The `°` marker on row K said an unbuilt owner existed; nothing said the owner had
become due.

## The wrong answer

`Claim.kind` has existed since PJ-004 and `Conclusion.standing` has defaulted to
`exploratory` since S-7. The state was there. It had **one reader** —
`confirmatoryResultsBehind()`, deciding whether an amendment is scientific or
mechanical.

So closing a question on a lunchtime notebook sweep reported it settled and
`whatIsKnown()` filed it under `established`, indistinguishable from a question
closed on a confirmatory comparison. Populated, confident, and story 18's own
sentence about scratch entering the record by accident.

Verified by deletion, not argued: removing the `established`/`provisional`
discriminator puts the notebook sweep straight back into `established`.

**Resolved in the readers, and the row's original line was half right.**
*"`exploratory` already is this distinction"* was true about the *state* and
silent about the *transition* and about anything that respects either — which is
where the whole verdict lived. `established` now requires a promoted finding, a
new `provisional` bucket takes the rest, and `enquiryStatus().restsOn` says what
a closure rests on.

`provisional` is not a failure and not a hedge: the question **is** settled as
far as anyone has taken it, and reporting otherwise would be its own lie. What
changed is that a reader asking "what do we actually know" no longer gets scratch
mixed in silently.

## `PROMOTES`, earned by refutation

The prediction was explicit: **no new structure.** `CHANGES: Decision → Claim`
already exists and is walked (S-12), a promotion is a decision that changes a
claim's standing, so reuse it.

Refuted by demonstration. `withdrawalOf()` reads *any* `Decision -CHANGES->
Claim` as a retraction — which is exactly right for S-12, where a reinterpreted
claim stops being asserted. Promoting a finding therefore made `whySupported()`
report it `withdrawn: true` and unsupported. **Promotion retracted the thing it
promoted.**

That is row V's `GATES` lesson from the other side: one edge with two readings is
the failure shape behind every expensive mistake in this project. Two acts that
both "change a claim" are not the same relationship when one means *stop
asserting this* and the other means *assert this more strongly*.

It clears the bar on all four counts: a demonstrated wrong answer (not an empty
one), a reader as well as a writer (`whySupported()`, `whatIsKnown()`,
`enquiryStatus()`), reproducible by swapping the edge back, and the refutation
kept rather than edited into hindsight.

## Standing: conferred *or* declared, and the discriminator is foresight

The build predicted that standing "becomes conferred by an act", answering rows
G/K/R's successor question. **Half refuted, and the half that survives is
sharper than the prediction.**

`promote()` confers standing. Declaring at creation (`Conclusion.standing`, S-7)
was not removed, and should not be:

- Declaring **before the run** is what prespecification *is* — naming the
  confirmatory comparison in advance is the thing a locked design locks.
- Declaring **after** the fact is the p-hacking that lock exists to prevent, and
  no path permits it.
- Work that could not have declared it — scratch, captured before anyone knew it
  mattered — is promoted afterwards and **pays for the lateness with a recorded
  reason**.

So the two are not competing spellings of one mechanism. They are separated by
whether the standing was knowable in advance, and a reader can tell them apart:
`whySupported().promotedBecause` is present only for the conferred kind. G/K/R
were indeed one question; the answer is a disjunction rather than a winner.

**Not a gate**, as the pre-build note required. S-17 established that declaring a
gate does not satisfy it, so a gate-conferred model would leave a claim behind an
unevaluated confirmatory gate reading exploratory and S-7's amendment check would
miss a scientific change.

## The alternative that would have refuted it

The predictions named the refutation condition: `closeEnquiry()` simply
**refusing** to close on exploratory evidence, S-5's decline-rather-than-guess,
with no promotion verb at all. That would fix the reader defect without answering
whether standing is conferred, and would leave G/K/R where they were.

It is not what happened, and the reason is the scenario's own control. Refusing
would make every cheap close demand a promotion first — which is exactly the
ceremony story 18 forbids, and PJ-001's *"should not accumulate ceremony"* bullet
read from the same side S-14 read it from. Afterward 1 states the positive case:
the question is settled as far as anyone has taken it, and the record should say
so *and* say what it rests on. A refusal would have said neither.

## The ripple: S-1's fixture, and why it is not a notation change

Narrowing `established` broke exactly one existing scenario, and finding out
which one was the useful part. **S-1 was the only place in the corpus asserting
`established` positively**, and it did so on the free default — its prior
programme closes a question on a curvature sweep and nothing ever said what that
sweep was.

S-1's fixture now declares `standing: "confirmatory"` at creation, because its
prior work is prespecified and that is what prespecified work does. `promote()`
would have been the wrong remedy there: it is for findings whose standing was not
knowable when they were recorded.

This strengthens S-1's own premise rather than bending it. S-1 arranges three
scientific states *"so that no two of them can be told apart by reading text"* —
and until now `established` could be told apart by nothing at all. It was free.

Two smaller notes, because both are the kind of thing review catches:

- **`promote()` supplies its own `invalidation_check`**, as `sharpen`,
  `closeEnquiry`, `amendDesign` and `reinterpret` all do. That field is the
  verb's sentence about what would make a decision of *this class* wrong, not the
  researcher's words. S-14 is the one place the researcher supplies it, because
  there naming the condition *is* the act. Taking an `until:` here that no
  scenario reads would be the ceremony S-14 forbids.
- **`promote()` sets `Claim.kind` through `graph.query()`**, following
  `invalidateAnalysis()`'s precedent for `Artefact.invalidated`. Both are
  property updates on an existing node with no invariant to enforce; `Decision`
  has `closeDecision()` because `is_open`/`closed_at` is a biconditional that
  `NODE_TYPES.Decision.validate` guards. Nothing here needs guarding, so nothing
  was added.

## Ledger

- **Row K — resolved.** One new edge label, `PROMOTES`; no node label, property
  or migration.
- **Row R — resolved, successor question answered** (conferred *or* declared, by
  foresight).
- **No row now names an unbuilt owner.** Rows `open` and unowned: F, O, S, T, Z.
  `boundary`: Y, AA.

**The Bonsai corpus is exhausted** — for real this time, and checkable against
the ownership table rather than asserted in prose (PJ-021 got this wrong while
its own table said otherwise). Fifteen scenarios built: twelve of the fourteen
promoted in PJ-008, plus S-3b and S-3c as authored discriminators, plus S-18
promoted from §4. S-2 and S-13 own nothing outstanding.

What comes next is not another authored scenario. Five consecutive builds have
pressed only on relationships, query semantics and identity, and the noun
inventory has not moved in fifteen — which is a signal about where pressure has
to come from, not a reason to keep applying the same kind. The next probe is a
**real consumer above the domain layer**, done contract-first: cold-context
agents design the researcher-facing read surface from the research questions and
these journals *without* being shown the graph ontology, then the thinnest
read-only MCP/CLI adapter behind it. An adversarial reading of PJ-001 runs
alongside — a reviewer can propose ten plausible alternative ontologies, and the
consumer is what makes one of those disagreements consequential.
