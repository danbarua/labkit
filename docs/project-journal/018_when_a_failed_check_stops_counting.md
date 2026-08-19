# PJ-018: When a failed check stops counting — clearing row X

**Status: implemented (2026-08-19), on `spike/drizzle-age`. Covers S-3c
(`ced0388`, `b0ed208`), a scenario authored from row X's own brief rather than
promoted from §2. Row X resolved; row AB gains a fourth instance. Verification
at the time of writing: 153 pass / 0 fail, typecheck clean, `npx depcruise src
tests --output-type err` 0 errors, `bun examples/full-lifecycle.ts` ends
`closed connection cleanly` with no raw graphids.**

## Context

Row X had been open since S-3 and unowned for four scenarios — every scenario
named in its cell was built, and none of them settled it. PJ-016 widened it
without clearing it: after S-3b, the same decisive-failure rule that blocked
*work* also disqualified a *finding*, permanently. That widening is what
triggered the nomination rule added to CLAUDE.md in `b3d6f33` — a row whose
severity grows because another row was cleared gets nominated whether or not
anything has demonstrated it.

So this entry is the first end-to-end test of that rule. It named a row, the
row got a discriminator, the discriminator was built, and the row closed. The
four scenarios X spent unowned are the interesting number: nothing was missing
from the model, only a scenario that would ask the question.

## What shipped as a rule, and what was actually earned

The shipped behaviour, in one line of `checksFrom()`:

```ts
const decisive = ordered.find((e) => e.outcome === "fail") ?? ordered[0];
```

Any failing evaluation decided its check, for ever. What S-3 earned was much
narrower: *do not let someone re-run the same robustness check until they
happen to obtain green.* The gap between those two is the whole entry.

The case the broad rule was never asked about: the **check itself** was
defective. Someone reviews it, finds the aggregation dropped a fold, corrects it
and re-runs. Nothing about the result changed. Under the shipped rule the
original failure stayed decisive for ever, and — since S-3b — took the finding
down with it.

## The demonstration

Not argued. With the corrected check recorded, `whySupported()` returned
`supported: false` and `gateStatus()` returned `blocked`, both populated and
plausible, about a finding nothing was wrong with. The record was
indistinguishable from the dice-rolling case, which is precisely the case S-3
existed to prevent.

## The narrowing

A verdict decides its check only if it **still stands**. A verdict whose entire
basis has been withdrawn does not.

Three things fall out of that, and all three are deliberate:

- **The withdrawn verdict stays readable**, marked `withdrawn: true`. Erasing it
  would leave no record of why the finding was ever in doubt. Asked directly by
  the brief's "which historical evaluations remain readable?", and the answer is
  all of them.
- **A verdict that cited nothing cannot be cleared this way.** There is nothing
  to withdraw. This is what stops S-8's asserted-versus-measured distinction
  (row W) becoming a loophole: an agent that asserts a failure without measuring
  anything has also made it unclearable, which is the right way round.
- **The corrected case reports `passed`, not `never-run`.** A check *was* run,
  twice, and one of those verdicts stands.

### Verified in both directions

One direction is the usual deletion check: remove the filter and exactly the
three defective-check assertions fail. The second direction is the one that
matters here, because this is a *narrowing* and the failure mode is doing too
much: widen the rule to "the last verdict wins" and S-3's own two tests fail
alongside S-3c's case 1. A fix that cleared this case while also clearing S-3's
would have looked green against this scenario on its own.

## Judgment calls

**Where the rule lives.** In the read side, shared by both readers — the work a
check gates and the finding it qualifies go through one `checksFrom()`. That
sharing is what made row X's blast radius grow when S-3b landed, and it is also
what makes one clause enough to fix both. A rule that reached only one of them
would have fixed half of a rule.

**Who may declare a check defective — deferred, and this is a real hole.** The
narrowing makes "the check was defective" a lever that clears an inconvenient
failure. The lever requires a recorded `Review` with a verdict and a replacement
analysis, so the audit trail exists; whether that is *sufficient* is a question
about authority, and LabKit has no actor model by decision. Recorded rather than
solved, with the deferred identity work.

**`replaceAnalysis()` now returns what it created.** Row AB's fourth instance,
and the first that blocks a scenario outright rather than degrading an answer:
the verb recorded what it replaced and what that cost, and returned no handle on
the replacement, so a researcher who corrects a check cannot then cite the
correction. The remedy is the smallest of the four — a field on a return type.
The heuristic behaving as row AB says it should, with one sharpening: **ask it
of a verb's return type, not only of its writes.**

## Two predictions wrong, in the same direction

Predictions were committed at `3023cb1` before a line was written. The headline
held — no schema change, no new verb, no migration, and the wrong answer was
demonstrated rather than empty. Two were wrong, both by predicting a *harder*
mechanism than the one already present:

- The discriminating path was **one hop**, not three. `whySupported()` had been
  using `Evidence -RECORDED_IN-> Artefact` to filter superseded findings since
  S-11, in the same method. Predicting a traversal the code was already
  performing next door is a reading failure, not a modelling one.
- The mechanism detoured through a separate helper query on a **wrong
  diagnosis**, below, before coming back to the straightforward traversal.

## The portable finding: a camelCase column decodes as `null`

A `RETURN` name that is camelCase comes back present and `NULL` for every row.
The AS clause AGE requires is unquoted SQL, so Postgres folds `basisOut` to
`basisout` while AGE keys the row by the name the Cypher used. Nothing errors,
and the column reads exactly like a pattern that matched nothing.

**It cost a wrong diagnosis.** I concluded AGE could not bind a two-hop
`OPTIONAL MATCH`, wrote that into a docstring as fact, and restructured the
query around a limitation that does not exist. It was caught by probing six
`OPTIONAL MATCH` shapes directly — multi-hop, and extending an optionally-bound
variable — and watching all six bind. The one that fails is the camelCase name.

Two consequences, both kept:

1. `buildAsClause()` **refuses** a camelCase column name, with the alias in the
   error message. The failure is silent, so documenting it was not enough. Labels
   and property keys are untouched: they are quoted, so `CriterionEvaluation`
   and `natural_id` are unaffected.
2. On its first run the guard found a live instance predating this work.
   `enquiryStatus()` returned a `forClaim` column that had been decoding as
   `null` since it was written — harmless only because nothing read it, polarity
   being "no" when something challenges and "yes" otherwise. Removed as dead;
   PJ-007's shape exactly.

The general lesson is the one this project keeps relearning from the other
direction: an empty result is not evidence of absence. Here it was not even
evidence about the query.

## Ledger

- **Row X — resolved.** Demonstrated, narrowed, verified both ways.
- **Row AB — fourth instance**, remedy still not generalising: four instances,
  four different remedies, no relationship.
- **Row V** remains `resolved (argued)`; nothing here touches it.
- No row is currently a live defect shipping green. Rows `open` and unowned:
  O, S, T, Z. Rows `open` with an unbuilt owner: E, F, J, K, P.

## What this did not settle

**The authored-versus-mined precedent.** S-3c is the second scenario authored
rather than promoted from §2, and nothing here settles PJ-016's argument for
that. Two is a pattern rather than an exception, which raises the stakes on the
question instead of answering it: if scenario-authoring is legitimate, the
corpus stops being an independent check on the model. That is the most contested
decision in the arc and it is now load-bearing twice.

**The noun inventory still has not moved.** Eleven scenarios, zero new node
labels, zero migrations. Either PJ-001's entity set was unusually well chosen or
the corpus is not applying the kind of pressure that would move it, and nothing
built so far distinguishes those.
