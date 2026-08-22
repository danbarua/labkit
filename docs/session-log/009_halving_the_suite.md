# 009: halving the suite, a closed question closed twice, and the branch opened for merge

**Session wrap, 2026-08-22, on `feat/domain-consumer`.** Not a decision record —
see `docs/TASKS.md` for the flake's evidence and the two fixes that failed.

**Numbered 009, not 008.** `labkit-minion` holds `008_working_the_inferred_pile.md`
on `feat/minion`, unmerged here — `collect.sh` computes the next number from this
tree and cannot see the other. Checked with `git ls-tree origin/feat/minion`
before writing, which is the step that stops two entries colliding on merge.

## Goal

The second half of the suite flake: the ceiling crossings themselves, after
`007` fixed the cascade they amplify into.

## Changed

- `5439085` — **`reset()` truncates the label tables instead of dropping the
  graph.** An AGE graph is a Postgres schema and every label in it is a real
  table, so the drop destroyed thirteen node labels, twenty-five edge labels and
  thirty-eight indexes that the next `resolveTenantContext()` rebuilt: ~77 DDL
  round trips per test. The truncate already covered those tables — a graph's
  schema is not one of the four exclusions — so the drop was doing nothing the
  truncate did not, at seventy-seven times the price.
  - `tests/helpers/db.ts` — the change, with the measurement in its docstring.
  - `src/db/provisioning.ts` — `dropTenantGraph()` lost its only caller; kept,
    with a docstring saying where the caller went.
  - `tests/reconciliation.test.ts` — that function's new and only reader.
- `3c00496` — **the surviving drop is safe by file isolation, not by tenant
  name.** `labkit-minion` argued the truncate's correctness claim is checkable
  by `grep` rather than by waiting for a flake — correct, and stronger than any
  measurement — but gave the wrong reason for why the one remaining
  `dropTenantGraph` caller is harmless. Corrected in that test's docstring, in
  this entry, and in `docs/TASKS.md`, which also gains the methodological note
  its confirmation runs produced.
- `771e6b7` — merged `labkit-minion` through `0e6f329`: `sharpen` cleared,
  `evaluateCriterion` fixed, `closeEnquiry`'s interrupted-retry route fixed.
- `81c6ea5` — **`docs/TASKS.md` still carried the withdrawn form of the
  collateral prediction.** I sharpened it in messages and in this entry and
  never went back to the file it was written down in — six hours after this
  branch closed out eight instances of exactly that. It now states the testable
  form and records the disagreement.
- `5921647` — **a second route to `closeEnquiry`'s wrong answer, needing no
  interruption.** Nothing guarded against closing an already-closed question, so
  two clean calls wrote two resolving decisions and `enquiryStatus` picked
  between them arbitrarily: abandon an enquiry, later close it citing evidence,
  and it still reports abandoned with no answer. Refused on the write side.

- `cd8adf0` — two queue items closed. `whySupported` stays in one file
  (**decided, not deferred** — offered and declined, so it leaves the queue);
  and `package-lock.json` on `main` **resolves itself**, verified by dry-run
  merge rather than assumed.
- `6ed5baf` — merged `labkit-minion` through `5089728`: **the inferred pile is
  closed.** Its work, not mine, except `closeEnquiry`'s double-close route.
- `477204b` — **PJ-029**, on what a second agent turned out to be for. Not
  throughput: every useful catch across the day was a conclusion that was
  *right* with reasoning underneath it that was *wrong*, which no test detects
  because the tests pass either way. CLAUDE.md gains the pointer.

Working tree clean apart from this entry.

## Verified

- **Traced first, changed second** (`LABKIT_TRACE=all`, one scenario file):
  **24% of every query was provisioning**, and almost none of it was checking —
  342 index creates, 225 `create_elabel`, 117 `create_vlabel` against 28 catalog
  reads. `6eeeb92` made the *checking* cheap; nothing had made the *rebuilding*
  cheap, because nobody had noticed it was happening. Same file after: 3087 →
  2453 queries, −20.5%.
- **Paired, interleaved, one variable**, cascade fix in both arms:

  | arm | pass/fail | wall | load |
  |---|---|---|---|
  | BASE r1 | 264 / 0 | 197s | 5.64 |
  | FIX r1 | 264 / 0 | **87s** | 4.86 |
  | BASE r2 | 264 / 0 | 137s | 6.14 |
  | FIX r2 | 264 / 0 | **76s** | 4.33 |

  **167s mean against 81s.** One variable, because the previous attempt at this
  file was invalidated by bundling two changes.
- **Error vocabulary on a post-change run** (259 pass / 7 fail, 266 tests):
  `graph "labkit_t1" does not exist` **0**, `Connection terminated` **0**,
  `Client was closed` **1**, ceiling crossings 7, **collateral 0**.
- `bun run typecheck`, `npx depcruise src tests --output-type err` (0 violations),
  and all four `check:*` — green.
- The double-close guard is injection-verified (disable it, the test fails), and
  **S-14 is asserted rather than argued**: a question accepted as unresolved can
  still be closed when evidence arrives, because the guard keys on `RESOLVES`
  and `acceptAsUnresolved` writes `DEFERS`. That is the case the guard could
  have broken silently, and `labkit-minion` asked for it.
- **After the final merge: 277 pass / 0 fail in 91.7s**, zero ceiling crossings
  and zero teardown errors of any kind.
- **A later full run on a loaded machine: 266 pass / 6 fail — five ceiling
  crossings and ONE collateral failure** carrying a `Connection terminated`. So
  collateral is not zero in every run. The earlier zeros were real and are not
  the whole picture; recorded here rather than left standing alone.
- **So the sharpened prediction is a live disagreement, not a confirmation.** It
  held on `labkit-minion`'s tree (14 failures, all crossings, zero collateral)
  and failed on this one. Two trees, opposite answers, no explanation for the
  difference. `docs/TASKS.md` says so where the prediction is recorded.

## Open

**`Client was closed` is not zero, and I am not claiming the mechanism covers
it.** It went 3 → 1 against `labkit-minion`'s clean measurement of `2de1060`.
Only `graph … does not exist` had a predicted mechanism (nothing drops the graph
any more) and only that one is zero.

**Independent confirmation arrived, and the strongest form of it was not a
measurement.** `labkit-minion` ran three idle suites against `5439085` — 270/0
at 89s, 82s and 110s, **zero ceiling crossings**, zero of every teardown
signature. It then said the useful thing about its own data: *a clean run cannot
verify a claim about what happens during a flake, so three of them is three
times not testing it.* Worth keeping as a rule.

What settles it is structural. `reset()` drops nothing; `grep` finds exactly one
surviving `dropTenantGraph` caller, this file's new reconciliation test. So
**`graph "labkit_t1" does not exist` is impossible by construction, not merely
unobserved** — which is stronger than any zero either of us measured.

**But the reason first given for it was wrong, and the correction is the
interesting part.** The claim was that the surviving caller targets `"drop-me"`,
"a different graph from `labkit_t1` entirely". It is not: `"drop-me"` is the
first tenant resolved in that file, `tenants.id` is truncated with
`RESTART IDENTITY`, so it gets id 1 and **the graph every other file also calls
`labkit_t1`** — verified directly. What actually keeps it apart is that
`setupTestDb()` builds a **separate PGlite instance per test file**. Same
conclusion, different reason, and the reason is what a future reader would have
relied on.

**A signature appeared once that neither fix addresses, and it is deliberately
kept out of the flake numbers:** `unnamed prepared statement does not exist` —
**pglite#1046 Defect A**, the actual upstream bug `tests/helpers/db.ts`'s header
describes, seen for the first time this session. If it recurs, that header's
misattribution warning has a live instance behind it for the first time.

**The two `closeEnquiry` fixes are order-dependent and neither is sufficient
alone** — caught by `labkit-minion` before mine landed, and not derivable from
either commit alone. On the pre-transaction tree an interrupted close left an
orphan resolving decision; my guard would then have refused the retry
**permanently**, locking the question at `abandoned` forever. That converts a
repairable erasure into a lockout. Reverting either fix alone reintroduces a
defect the other's message does not describe.

**One verb, two independent defects, different remedies.** Worth counting the
pile per *route* rather than per verb: four routes examined, three defects.
Stopping at the first fix in a function would have left the second.

**Crossings are not fixed, and no claim is made that they are reduced.** All
four paired arms had zero, so that data cannot speak to it. The argument is
mechanical rather than measured: crossings are what the 5000ms budget buys, and
the work inside it halved.

## Next

**The inferred pile is closed** (`docs/consumer-contract/047`). Every
non-transactional write verb in `src/domain/` examined by demonstration: **seven
routes had an interruption window and three were defects.** Reported that way
rather than "six clean of nine", because two verbs write one node and no edge so
were never at risk, and one of the three defects needed no interruption at all.
That is the honest denominator.

The rule that survived, after one correction: **a partial state is acceptable
exactly when every answer a reader can derive from it is true.** The earlier
version tested the *shape* of the leftover state, and a shape has no truth
value — two identical shapes differ in truth depending on the history that
produced them.

Historical, from when this entry was written: **`pursue` came back clean**,
and the useful part is not the verdict: `whatDependsOn` turned out to be
protected by an *accident of write order*, and it asserted the invariant rather
than describing it, so the accident now fails loudly the day it stops holding.
All four have since been examined and all four are clean or not-at-risk.

**Five routes, three defects** — as it stood then; nine verbs and three defects
at close. Both clean verbs write their reachability edge
last; all three defects write it early. That has a mechanism behind it and is
still **not a rule** — the same shape of reasoning produced two wrong mechanisms
in `042` and my own unfalsifiable first prediction. It is useful for choosing
what to look at first and nowhere else.

Its `closeEnquiry` prediction came back a defect **with both specific
predictions wrong** — it writes one `BASED_ON` not one per finding, and the answer cannot be
inverted because the empty case is guarded explicitly. Right verdict, wrong
reasoning underneath, which is the outcome worth knowing: fixing on the
prediction would have wrapped the right function while believing something
false about why.

**Its open question, which my fix does not answer:** three picks in `read.ts`
(`originOf`, `enquiryStatus`, `whySupported`) are unguarded on the argument that
the write side cannot produce two. That premise is unsafe wherever a writer can
fail halfway. I argued it *is* safe for `RESOLVES` — one writer, now refusing —
so a reader-side tie-break there would be unreachable. **That argument covers
`RESOLVES` only.** The other two each need their own answer to "who can write
two of these, and can they fail halfway?" Neither has been examined.

For the crossings: `labkit-minion`'s three idle runs give **zero crossings** at
82–110s, so the load-controlled count is in and there is nothing to chase there
today. What remains open has no owner and no obvious next step —
`Client was closed` at 3 → 1 with no claimed mechanism, and
`unnamed prepared statement does not exist` seen once on this tree and never on
the other. Both are recorded in **Open**; neither is worth a session on current
evidence.

**The branch is open for merge: [PR #1](https://github.com/danbarua/labkit/pull/1).**
202 commits, and the merge is clean rather than hoped-clean — `main` has one
commit since the merge base and it touches nothing this branch touches;
`git merge-tree --write-tree main feat/domain-consumer` exits 0 with zero
conflicts, tree `8f846ef`, checked independently by this session and by
`labkit-review` to the same hash.

Nothing else is queued.
