# A fact graph whose nodes are Cypher clauses

**Ran 2026-08-27, against a real AGE database.** Both files execute; the
transcripts below are their output, not a design sketch.

## The question

The read side classifies things — 24 booleans and string unions a user sees in
`src/domain/report.ts`. Each classification is computed by a hand-written Cypher
query folded by hand into a report. Dan's observation, on seeing `labkit known`:

> this view shows me five 'buckets' of questions, I have no idea what each
> bucket means, and all I have is a combinatorial explosion of meta-questions
> about questions.

And his proposal: what if the read model were **a graph of functions**, with
each node a Cypher clause?

## What was found

**1. The read side is already a fact graph, written as a string literal and an
`if`-chain.** `01-composed-query.ts` builds its query by walking named facts;
the result is nearly byte-for-byte the query already in `whatIsKnown`. So the
parts exist — they have no names, cannot be reused, and have drifted into three
copies.

**2. The one real AGE constraint is what causes the bug.** `[:SUPPORTS|CHALLENGES]`
is a syntax error, so "the claim that answers this question" needs two clauses
and a coalesce. That dance gets written once and forgotten the second time:

```
$ labkit known
Established   - does the scheduler help?    (Q_2)  <- challenging, check never run
Provisional   - does the sampler converge?  (Q_1)  <- supporting,  check never run
```

One word different in the conversation (`bearing: "challenges"`), opposite
answers, and nothing in the record disagrees with either. As a named fact it is
written once and every reader is right or wrong together — which the spike
demonstrates by getting `Q_2` right.

**3. The strongest evidence is a mistake made twice.** `02-grain.ts` hand-writes
its own query and **re-introduces the identical `SUPPORTS`-only blindness**
twenty minutes after `01` fixed it. Same trap, same author, on a spike whose
entire purpose was showing why that should be impossible. `CLM_2` is missing
from `02`'s output for exactly this reason, and it is left missing on purpose.

**4. Grain is the boundary, and it is a real one.** `checksFrom()` spans four
subject levels — question → criterion → evaluation → basis — each folding into
the one above. A flat fact cannot express that. The machinery grew one concept,
**the key a fact is computed per**, at a cost of 22 lines.

The rule it needs was found by getting it wrong (`standing.find is not a
function`): a dependency at the **same** grain is one value; only a **finer**
grain fans out. In the shipped code that relationship is carried by *which loop
you are inside*, which is invisible and is how `checksMetFor` came to group by
criterion alone.

**5. The state I predicted would break the decomposition did not.**
`no-standing-verdict` is the fourth check state and the only rule that reaches
back *down* a level: a verdict is retracted when every finding it cited has
been invalidated, which lives two grains below the check. Reached by evaluating
a criterion against a robustness finding, then reviewing that analysis and
replacing it — which invalidates the artefact the verdict rested on:

```
before:  the effect holds at n>=20 — passed
after :  the effect holds at n>=20 — no-standing-verdict
```

Shipped and spike agree. And the spike is right for the right reason, checked
rather than assumed: the row carries `outcome: "pass"`, `basis: EV_3`,
`invalidated: true`, so the evaluation-grain fold sees one cited basis and zero
standing, marks it withdrawn, and the check has verdicts of which none stands.

**Grain absorbed it with no new machinery.** The fold at the evaluation grain
consumes the basis rows beneath it naturally, because "reaching down a level"
is what a fold at that grain already does. Predicted as the most likely place
to find a wall; there isn't one.

**6. AGE did not get in the way.** Composed 15-line queries ran first time.
`OPTIONAL MATCH` through a null-bound variable correctly yields null rather than
a cartesian product — predicted otherwise, and wrong.

**7. The machinery has its own hazards.** `empty: new Set()` is one shared
mutable instance, so one question's criteria leaked into the next question's
fold. Invisible with one subject, wrong with two. The identity element must be a
factory, and in a real version that should be unforgeable rather than a
convention.

## What it cost

| | code lines |
| --- | --- |
| `whatIsKnown` + `whatWasKnown` + `checksMetFor` + `checksFrom` | 264 |
| `01` machinery (flat) | 25 |
| `02` machinery (+ grain) | 47 |

The machinery is fixed; the facts are ~6 lines each. The ratio improves with
each of the remaining classifications.

## Verified against shipped code

| case | shipped | spike |
| --- | --- | --- |
| supporting claim, check never run | `provisional` | `provisional` |
| **challenging claim, check never run** | **`established`** | `provisional` |
| supporting claim, check passed | `established` | `established` |
| criterion failed then passed | `failed` | `failed` |
| verdict whose cited finding was invalidated | `no-standing-verdict` | `no-standing-verdict` |

The second row is a defect in shipped code, found by this spike and not yet
filed.

**All four check states are now covered**, which was the open question when
this spike was committed.

## Not attempted

- **The write side.** All of this is read-only.
- **Anything about performance.** One composed query replaces two, which is
  suggestive and unmeasured.

## Running them

```sh
LABKIT_HOME=/some/scratch/dir bun spikes/fact-graph/01-composed-query.ts
```

They need a record with the shapes above; `01` expects at least one answered
question. Neither writes.
