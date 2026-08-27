# 055: the survey consults the checks it was held to

**Session wrap, 2026-08-27, on `feat/survey-consults-checks`.** Not a decision
record — S-19's own header carries the argument, and issue #62 carries the
question it answers.

A new entry rather than more of 054: that entry's subject merged in PR #67.

## Goal

The first product work after the housekeeping: build the scenario for issue
#62, and fix the `ReadOnlyString` annotation found next to it.

## Changed

**`8563447`** — `tests/scenarios/s19_promoted_over_an_unmet_check.test.ts` new;
`whatIsKnown` consults held-to check standing via a new `checksMetFor`;
`KnowledgeSurvey.provisional` re-documented and its CLI heading renamed;
`Claim.kind` loses a false `ReadOnlyString`.

**`6d7d50a`** — S-19 gets prose in PJ-008 §3, ledger row **AK**, and a
demonstration in `examples/full-lifecycle.sh`.

Open as **PR #69**.

## Verified

**The wrong answer was demonstrated before anything was changed.** Against
unfixed code the scenario's middle test fails and the other two pass —
including the one asserting the contradiction head-on: `standing:
"confirmatory"` and `state: "never-run"` on one claim, at the same moment.

`bun run check` — all 18.

**Negative control:** with the consult replaced by `const met = true`, the
middle test goes red again and the rest stay green.

**A guard did real work.** `check:no-stringly-typed` refused the first
`checksMetFor` for keying a map on a bare `string` when it holds a claim
handle. Second time today that check has caught the same slip — the first was
`blockedBy` in the previous piece of work — which is the argument for it being
a script rather than a habit.

**A scenario that exists only as a test file is findable by nobody**, which
Dan said and was right about: *"Is anyone going to go looking in PJ-008 for
S-19?"* The prose follows the convention S-3b set for a scenario authored after
the mining exercise, and says it came from the digest design and issue #62
rather than §1 — which is why no story number sits above it.

**The example demonstrates it for the cost of a reorder, not an addition.** It
already had every ingredient — criterion, gate, `analyse --held-to`, evaluate,
promote, close — but ran the check *before* promoting, so it only ever showed
the happy path. It now promotes, closes, shows `known` reporting provisional,
shows `why` explaining, then evaluates and shows the same question established.
One evaluation moves it and nothing else about the record changes. The text it
replaced asserted that promotion is what separates provisional from
established, which is now half true and was the reading that hid this defect.

## Open

**The bucket was landed in, not chosen, which is what the open question asked
for.** The case falls to `provisional`, and that bucket's heading — *"resting
on work nobody promoted"* — was false for it the instant it existed: this claim
**was** promoted, and what it lacks is a check nobody ran.

So `provisional` now holds two opposite reasons and is named for what they
share: *answered, and not something to build on yet*. **One bucket rather than
a sixth**, because a reader acts identically on both and `whySupported` already
distinguishes them for anyone who needs to know which. Row Y's warning against
a bucket built for nobody stands, and the alternative would have been to invent
a word — `contested` was taken by evidence bearing against, `unverified` fits
never-run and not failed — for a distinction with no different consequence.

**The fix reuses `checksFrom` rather than re-deriving the state rule**, and
that is the same defect one level up: a failure sticking among standing
verdicts, a wholly-withdrawn basis being retraction rather than failure, and
never-run being first-class are three rules earned by S-3, S-3c and S-17. Two
implementations of them would be two things to keep in step, which is precisely
how `whySupported` and `whatIsKnown` came to disagree.

**`Claim.kind`'s annotation was false, and it is issue #50's shape exactly.**
`ReadOnlyString` is defined by the taxonomy as *stored, handed back to callers,
never decided on* — it exists to say nothing reads the field. Three sites
decide on it, the first being the bucketing changed here. Found by reading the
declaration beside its readers, not by any check. It is a plain union now:
weaker than the taxonomy would like, and true. **An annotation that asserts
something false about its own field is worse than none**, because it is what a
reader trusts instead of grepping.

**#63 is not closed by this and may be closer.** The two facts under
`Claim.kind` are still under one value; what changed is that the survey no
longer treats *promoted* as a proxy for *verified*, which was the reading that
made the conflation invisible.

**Unmerged and easy to lose:** `docs/wrap-margin-close` carries 054's closing
update and is not in `main`.

**The prediction #66 was waiting on did not hold, and that is a result.** It
was sequenced behind #62 on the theory that fixing the survey might produce the
enumeration as a by-product. It did not: `checksMetFor` is **keyed by claim and
answers one boolean**, taking claims the caller already holds. It never
enumerates anything and cannot be asked *which gates are blocked*, because
there is no claim to start from. The traversal exists and is the wrong shape,
which is a cleaner answer than "reuse it" and is written onto #66 so nobody
reconstructs it from merged PRs.

It also settles one of #66's options: **extending `known` with more buckets is
now clearly wrong** rather than suspected. `provisional` absorbed a second
reason precisely because a reader acts identically on both; adding *gates* to a
survey of *questions* is the scope error that sank the first attempt at a
standup view.

## Next

PR #69 awaits review. Then #66, which nothing blocks — and the recommendation
there is unchanged: a worked example settles it faster than more design, since
both prior rounds on this feature were corrected by running something.
