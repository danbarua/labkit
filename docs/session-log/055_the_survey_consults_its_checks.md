# 055: the survey consults the checks it was held to

**Session wrap, 2026-08-27, on `feat/survey-consults-checks`.** Not a decision
record — S-19's own header carries the argument, and issue #62 carries the
question it answers.

A new entry rather than more of 054: that entry's subject merged in PR #67.

## Goal

The first product work after the housekeeping: build the scenario for issue
#62, and fix the `ReadOnlyString` annotation found next to it.

## Changed

**`b8092f2`** — `tests/scenarios/s19_promoted_over_an_unmet_check.test.ts` new;
`whatIsKnown` consults held-to check standing via a new `checksMetFor`;
`KnowledgeSurvey.provisional` re-documented and its CLI heading renamed;
`Claim.kind` loses a false `ReadOnlyString`.

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

## Next

A PR for this branch, then issue #66 — one enumeration verb or two — which the
design sequenced behind #62 precisely because this fix walks question →
answering claim → held-to criteria inside the read surface, and part of the
enumeration may exist as a by-product of `checksMetFor`.
