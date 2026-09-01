# A research lifecycle, through the CLI

```sh
bun run example
```

Runs against a throwaway database, deleted when it exits. Nothing you have is
touched.

It takes one question from being asked to being answered, and shows what LabKit
records along the way. Every command below is one you could type.

---

## Ask a question

```
$ labkit open 'does the pruning schedule move convergence?'
LOE_1
```

One act: the question, and a line of enquiry pursuing it. `LOE_1` is the handle
every later command uses to name this work.

## Say in advance what would count

```
$ labkit plan --objective 'sweep depth 4 through 20 under the pruning schedule' \
              --acceptance 'a convergence curve with n>=20 at each depth'
TASK_1

$ labkit criterion 'the effect holds at n>=20'
CRIT_1

$ labkit declare --governed-by CRIT_1 --protecting TASK_1 \
                 --consequence 'the result may not be built on until this holds'
GATE_1
```

The condition is stated **before** the measurement. A check agreed after seeing
the numbers is not the same check, and LabKit is built to keep those apart.

A gate has a state before anyone checks it, and it is not *passed*:

```
$ labkit gate GATE_1
GATE_1 — never-evaluated
  consequence: the result may not be built on until this holds
Conditions
  - never-run           the effect holds at n>=20  (CRIT_1)

Not currently met
  - the effect holds at n>=20  (CRIT_1)

Gating
  - sweep depth 4 through 20 under the pruning schedule  (TASK_1)
Computed, never stored. There is no value anyone can set to `satisfied`.
```

## Measure, then analyse

Observations land before anything is concluded from them:

```
$ labkit observe LOE_1 --name depth-sweep-raw \
        --finding 'convergence step counts at depths 4, 8, 12, 16, 20' \
        --hash sha256:9f2b
ART_1
```

The analysis says what it read, which planned work it carries out, and which
prespecified condition its conclusions are held to:

```
$ labkit analyse LOE_1 \
        --method 'paired comparison against the unpruned baseline' \
        --from ART_1 --implementing TASK_1 --held-to CRIT_1
COMP_1
```

That is the run: a computation, an evidence unit, and an artefact to hold its
output. It has concluded nothing yet, which is a real state and not an empty
one — the analysis is still being done.

Each finding is its own act, because that is how findings arrive: one at a
time, over days.

```
$ labkit conclude COMP_1 \
        --proposition 'the pruning schedule moves convergence' \
        --finding 'converges ~3 steps earlier at every depth'
CLM_1
```

It answers with the claim, so the next command can take it straight off stdout.
Later, `labkit conclude COMP_1 --replacing CLM_1 --finding '…'` supersedes that
one finding and leaves every other conclusion of the same run standing.

## Check, promote, close

```
$ labkit evaluate CRIT_1 --gate GATE_1 --value 'n=24 at every depth' --outcome pass
CRIT_1

$ labkit gate GATE_1
GATE_1 — satisfied
  ...
Conditions
  - passed              the effect holds at n>=20  (CRIT_1)  decided pass on "n=24 at every depth"
```

Promotion is a **separate act** from concluding. Until a finding is promoted it
is scratch, and an answer resting on it is *provisional* rather than
*established*:

```
$ labkit promote CLM_1 --because 'the prespecified check passed at every depth'
CLM_1

$ labkit close LOE_1 --answered-by CLM_1
LOE_1
```

## Read it back

```
$ labkit known
Established
  - does the pruning schedule move convergence?

Provisional (resting on work nobody promoted)
  nothing

Accepted as unresolved
  nothing

Unresolved (worked on, no answer yet)
  nothing

Untested (nothing has been run against these)
  nothing
```

Five buckets, and the difference between them is the product. *Established* and
*provisional* are both answered — what differs is what the answer rests on.

Why does it stand?

```
$ labkit why CLM_1
"the pruning schedule moves convergence"
  supported, confirmatory
  promoted because: the prespecified check passed at every depth
Resting on
  - converges ~3 steps earlier at every depth  (via paired comparison against the unpruned baseline, COMP_1)

Held to
  - the effect holds at n>=20 — passed

Ultimately resting on
  - depth-sweep-raw  [ART_1]
```

And if the raw measurement turned out to be wrong:

```
$ labkit affects depth-sweep-raw
Claims that would be affected
  - the pruning schedule moves convergence  (CLM_1)

Lines of enquiry
  - does the pruning schedule move convergence?  (LOE_1)

Routes walked
  - evidence recorded in this artefact, and the claims it bears on
  - computations that consumed this artefact, and the claims their findings bear on
  - the same, for every artefact downstream of this one through CONSUMES/PRODUCES

This is a lower bound, not a finding of independence: anything
connected by a route not listed above is absent from these lists
and is not thereby unaffected.
```

That closing paragraph is not hedging. The walk is exhaustive over the routes it
names and silent about any it does not, and saying so is the difference between
a dependency report and a false clean bill of health.

## What was done, and by whom

Every other command answers from the record — what is *true now*. One answers
from the event log:

```
$ labkit happened
    1  2026-08-25T14:36:47.166Z  openEnquiry  LOE_1
         by full-lifecycle.sh @390f1562, minting Q_1, LOE_1
    ...
    6  2026-08-25T14:36:49.175Z  recordAnalysis  COMP_1
         by full-lifecycle.sh @390f1562, minting COMP_1, EU_2, ART_2, EV_2, CLM_1
    8  2026-08-25T14:36:50.128Z  promote  CLM_1
         by full-lifecycle.sh @390f1562, minting DEC_1
```

Who ran it and against which commit — neither is reconstructable from the graph.
`openEnquiry` is one event, not a `pose` and a `pursue`: a researcher who opened
an enquiry did one thing.

An act is findable by what it **created**, not only by what it was about:

```
$ labkit happened CLM_1
    6  ...  recordAnalysis  COMP_1     minting ..., CLM_1
    8  ...  promote         CLM_1
```

## Anything else

Every command takes `--json`, which prints the same document an MCP client gets:

```
$ labkit --json known
{
  "established": [
    { "question": "Q_1", "asks": "does the pruning schedule move convergence?" }
  ],
  "provisional": [],
  "unresolved": [],
  "untested": [],
  "accepted": []
}
```

`labkit --help` lists the rest — sharpening a question, amending a gate's
conditions, replacing a defective analysis, re-verifying, narrowing an
interpretation, deliberately leaving a question open.

`bun run check:cli` walks this same path with assertions on it, and
`docs/persistence-spikes.md` has the AGE findings the storage layer rests on.
