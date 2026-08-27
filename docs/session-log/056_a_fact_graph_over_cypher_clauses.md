# 056: a fact graph whose nodes are Cypher clauses

**Session wrap, 2026-08-27, on `spike/fact-graph`.** Not a decision record —
`spikes/fact-graph/README.md` is the finding, and the two files beside it are
the evidence.

**The number is 056, not 055.** 055 exists on `feat/survey-consults-checks`,
which is open as PR #69 and not merged; `ls docs/session-log/` on this branch
cannot see it. Taken by checking the other branch, which is the collision the
skill's re-check step exists for.

## Goal

Dan's thought experiment, after reading `labkit known`: *"what if you were
implementing a View Model from scratch, composed as a graph of functions,
instead of constructing objects from imperative code?"* Then: could each node be
a Cypher clause? Then: spike it and see whether it is "let's see" or "batshit
crazy".

## Changed

**`e9277a5`** — `spikes/` with its own README saying nothing there ships;
`spikes/fact-graph/` with two runnable files and the findings.
**`08ab1cc`** — the fourth check state probed and the README updated.

Nothing under `src/` was touched. `bun run check` — all 18, both times.

## Verified

Everything ran against a real AGE database built through the CLI.

| case | shipped | spike |
| --- | --- | --- |
| supporting claim, check never run | `provisional` | `provisional` |
| **challenging claim, check never run** | **`established`** | `provisional` |
| supporting claim, check passed | `established` | `established` |
| criterion failed then passed | `failed` | `failed` |
| verdict whose cited finding was invalidated | `no-standing-verdict` | `no-standing-verdict` |

The second row is a live defect in shipped code. The last row is the state
predicted to break the decomposition; it did not.

**Right for the right reason, checked rather than assumed** — the
`no-standing-verdict` row carries `outcome: "pass"`, `basis: EV_3`,
`invalidated: true`, so the fold counts one cited and zero standing.

## Open

**The strongest finding is a mistake made twice, by me, twenty minutes apart.**
`02-grain.ts` hand-writes its own query and re-introduces the identical
`SUPPORTS`-only blindness that `01` had just fixed — on a spike whose entire
purpose was demonstrating why that should be impossible. `CLM_2` is missing
from its output for that reason and is left missing on purpose.

That is evidence about the author, not about AGE: the constraint that forces
the two-clause dance will defeat anyone writing it by hand, indefinitely. Dan's
reading is the right one and stronger than mine — it is an argument for a
builder that absorbs the footgun, because the failure is **invisible when
omitted**. Nothing errored when I wrote `<-[:SUPPORTS]-`.

**No wall was found, which was the question.** AGE composes: a 15-line query
assembled from named clauses ran first time, and `OPTIONAL MATCH` through a
null-bound variable correctly yields null rather than a cartesian product —
predicted otherwise, and wrong. The single real limit is that
`[:SUPPORTS|CHALLENGES]` is a syntax error, and that limit is the *cause* of the
defect above rather than an obstacle to fixing it.

**Grain is the one concept the machinery needed**, and its rule was found by
getting it wrong: a dependency at the *same* grain is one value, only a *finer*
grain fans out. In shipped code that relationship is carried by which loop you
are inside — invisible, and how `checksMetFor` came to group by criterion alone.

**The machinery has hazards of its own.** `empty: new Set()` is one shared
mutable instance, so one question's criteria leaked into the next question's
fold: invisible with one subject, wrong with two.

**Not filed:** the challenging-claim defect. `labkit-review` posted comments on
PR #69 which Dan asked me to stay blind to, and his summary says one finding
covers this — so filing it would risk a duplicate. Dan was asked and has not
answered.

**Untouched:** the write side, and anything about performance. One composed
query replaces two, which is suggestive and unmeasured.

## Next

Dan's call on whether the challenging-claim defect needs an issue.

The unconverted read side is 21 more classifications against a machinery that
is now fixed at 47 lines. If it goes further, the next question is whether the
facts live beside the verbs or in their own module — and that is a design
decision, not a spike.
