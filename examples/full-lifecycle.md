# A research lifecycle, through the CLI

```sh
bun run example
```

Runs against a throwaway database, deleted when it exits. Nothing you have is
touched.

It takes one question from being asked to being answered, and shows what LabKit
records along the way. Every command below is one you could type. The pasted
outputs are as of 2026-09-03; the script is the source of truth, and
`bun run example` prints today's.

---

## Ask a question

```
$ labkit open 'does the pruning schedule move convergence?'
Q_1
LOE_1
```

One act: the question, and a line of enquiry pursuing it. A write answers with
every handle it minted, one per line; `LOE_1` is the one every later command
uses to name this work.

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
EV_1
EU_1
```

The analysis says what it read, which planned work it carries out, and which
prespecified condition its conclusions are held to:

```
$ labkit analyse LOE_1 \
        --method 'paired comparison against the unpruned baseline' \
        --from ART_1 --implementing TASK_1 --held-to CRIT_1
COMP_1
EU_2
ART_2
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
EV_2
CLM_1
```

The claim's handle is on stdout, so the next command can take it straight off.
Later, `labkit conclude COMP_1 --replacing CLM_1 --finding '…'` supersedes that
one finding and leaves every other conclusion of the same run standing. And a
finding that settles the proposition neither way is a state the record can
hold: `labkit is CLM_1 undecided --because EV_2` keeps the evidence without
pretending it points anywhere.

## Check, confirm, close

```
$ labkit evaluate CRIT_1 --gate GATE_1 --value 'n=24 at every depth' --outcome pass
CEVAL_1

$ labkit gate GATE_1
GATE_1 — satisfied
  ...
Conditions
  - passed              the effect holds at n>=20  (CRIT_1)  decided passed on "n=24 at every depth"
```

Saying a finding is confirmed is a **separate act** from concluding it. Until
someone says so it is scratch, and an answer resting on it is *provisional*
rather than *established*:

```
$ labkit is CLM_1 confirmed --because 'the prespecified check passed at every depth'
DEC_1

$ labkit close LOE_1 --answered-by CLM_1
DEC_2
```

Both are decisions, and both answer with the decision's handle — the record
keeps who took it and why.

## Read it back

```
$ labkit known
Established
  - does the pruning schedule move convergence?  (Q_1)  — yes

Provisional (answered, but not something to build on yet)
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
  confirmed because: the prespecified check passed at every depth
Supported by
  - converges ~3 steps earlier at every depth  (via paired comparison against the unpruned baseline, COMP_1)

Held to
  - the effect holds at n>=20 — passed

Resting on
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
    1  2026-09-03T09:05:24.379Z  openEnquiry  LOE_1
         by full-lifecycle.sh (claimed) @9a9fc4af, minting Q_1, LOE_1
    ...
    7  2026-09-03T09:05:26.941Z  conclude  COMP_1
         by full-lifecycle.sh (claimed) @9a9fc4af, minting EV_2, CLM_1
    ...
    9  2026-09-03T09:05:28.101Z  is  CLM_1
         by full-lifecycle.sh (claimed) @9a9fc4af, minting DEC_1
```

Who ran it and against which commit — neither is reconstructable from the graph.
`openEnquiry` is one event, not a `pose` and a `pursue`: a researcher who opened
an enquiry did one thing.

An act is findable by what it **created**, not only by what it was about:

```
$ labkit happened CLM_1
    7  ...  conclude  COMP_1     minting EV_2, CLM_1
    9  ...  is        CLM_1      minting DEC_1
```

## Anything else

Every command takes `--json`, which prints the same document an MCP client gets:

```
$ labkit --json known
{
  "established": [
    {
      "question": "Q_1",
      "asks": "does the pruning schedule move convergence?",
      "claim": "CLM_1",
      "answer": "yes"
    }
  ],
  "provisional": [],
  "unresolved": [],
  "untested": [],
  "accepted": []
}
```

`labkit --help` lists the rest — sharpening a question, amending a gate's
conditions, replacing a defective analysis, re-verifying, deliberately leaving
a question open, and a free-text `note` on anything.

`bun run check:cli` walks this same path with assertions on it, and
`docs/persistence.md` has the AGE findings the storage layer rests on.
