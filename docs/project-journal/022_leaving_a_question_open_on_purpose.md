# PJ-022: Leaving a question open on purpose — clearing row J

**Status: implemented (2026-08-20), on `spike/drizzle-age`. Covers S-14
(`7f7d2a3`), promoted from §2. Row J **resolved**, with no new node label, edge,
property or migration. Verification at the time of writing: 183 pass / 0 fail,
typecheck clean, `npx depcruise src tests --output-type err` 0 errors.**

## Context

S-14 is the scenario PJ-008 nominated to guard PJ-001's *"should not accumulate
ceremony"* bullet. A marginal comparison cannot be settled — the confirmatory
dataset is spent, there is no larger held-out sample — and the researcher wants
it neither pursued nor closed, but **accepted** as unresolved, with the
condition that would reopen it written down.

## Row J's own fallback was the failure mode

The ledger has recorded row J's no-change route since the document was written:
*"distinguish by whether an open task exists."* §2 says, equally plainly, that
*"a model that can only express it as an open task is a failure."*

Those two sentences have sat in the same document, contradicting each other,
through every review. External review set the same constraint independently
before this build: S-14 must not derive scientific standing from `Task`
presence. It does not. No `Task` is created anywhere in the scenario, and none
was needed to make any query answer correctly.

## The wrong answer was reachable, which is what earned the verb

This matters more than usual here, because the obvious framing — "there is no
verb for this" — describes a *missing feature*, and a missing feature
manufactures an empty result, which under PJ-011 §5 earns nothing.

It is not that. A researcher wanting the record to say "we are leaving this"
had `closeEnquiry()` with nothing cited, and it reports the question
**`abandoned`**: nobody worked on it, no result behind it. Work *had* been done
and the reason was specific. That is a confident misreading of a deliberate
decision as neglect — the worst available answer rather than the absence of one.

`acceptAsUnresolved()` writes a `Decision` that `DEFERS` the question, carrying
the reason, `BASED_ON` the finding it was accepted in light of, and — on
`invalidation_check`, which already meant exactly *what would make this decision
wrong* — the condition that would reopen it.

## What only became visible once the branch was reachable

`DEFERS` had a reader and no writer. `enquiryStatus()` could return
`closure: "deferred"` and nothing in the system could produce that state, so the
branch had never executed.

When `acceptAsUnresolved()` finally entered it, the branch was **wrong in two
ways**:

- it reported **`open: false`** — a question deliberately left open read as
  shut;
- the token was **`deferred`**, naming a state nothing had ever written, while
  the state that actually exists is *accepted*.

Neither could have been found by inspection with any confidence, because there
was no way to produce a case that exercised them. This is the clearest payout so
far for PJ-011 §6's no-cull policy: declared-but-unwalked structure is *a
computable map of where the model has untested claims*, and this particular
claim turned out to be false in two independent ways. A cull would have deleted
the map along with the error.

It is also the end of that map. As of S-14 every label in `EDGE_SCHEMA` has both
a writer and a reader, and every node label is created by some verb. `DEFERS`
was the last unwalked edge; `CHALLENGES` was the previous one, walked by S-4 and
S-5. The policy stays — it protects what gets added next — but it currently
protects nothing.

## Judgment calls

**A fourth survey bucket, not a flag.** `whatIsKnown()` gains `accepted`
alongside `established` / `unresolved` / `untested`, because a reader scanning
for what still needs doing must not find a deliberately-parked question there.
A boolean on `unresolved` would have left it in the list it must not be in.

**Deferred-pending-work was not built.** Row J named two states. Only one has
ever been needed by a scenario, so only one exists. If "parked until someone
gets to it" is ever required, the distinction gets earned then — the same answer
S-10 gave about unit-level re-verification, and the same reason.

**A drafted field was removed rather than shipped.** `EnquiryStatus.blocking`
would have made the Afterward bullet *"does it block anything? → no"* directly
assertable, and its only consumer would have been that assertion. Inventing a
to-do list in order to report it empty **is** the ceremony the scenario forbids.
That is the second time this session a report-or-refusal was declined for having
nothing real to describe — S-10's `compareNumerically()` was the first — and the
rule is the same one from both directions: *a refusal needs something real to
refuse, and a report needs something real to report.*

**The condition is not enforced, and cannot be.** The bullet asks that what
would reopen the question be about the world — new design, new data — rather
than "run the same analysis again". Nothing in the model can check that. What it
guarantees is that a condition was named *at all*, which is the difference
between deciding to stop and drifting to a halt. Recorded as a limit rather than
papered over with validation that would only check the shape of a sentence.

## Ledger

- **Row J — resolved.** No new structure; the reopening condition rides on
  `Decision.invalidation_check`.
- Rows `open` and unowned: F, O, S, T, Z. `open` with an unbuilt owner: **K**
  alone, owned by story 18 — whose promotion condition fired when S-8 gave no
  verdict, and which is the next build.
- After story 18, S-2 and S-13 own nothing outstanding, and this corpus is done.
