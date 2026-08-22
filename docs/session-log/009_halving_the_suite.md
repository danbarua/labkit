# 009: emptying the tenant graph instead of dropping it

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

**Crossings are not fixed, and no claim is made that they are reduced.** All
four paired arms had zero, so that data cannot speak to it. The argument is
mechanical rather than measured: crossings are what the 5000ms budget buys, and
the work inside it halved.

## Next

`labkit-minion` holds the sweep's inferred pile and is on `closeEnquiry`, whose
predicted defect would be the worst in the pile — `enquiryStatus()` derives
`answer: challenges ? "no" : "yes"` from exactly the edges written last, so a
partial write could invert the recorded answer to a research question. **It is
a prediction.** Base rate stays two examined, one defect until it is run.

For the crossings: a load-controlled count on an idle machine, from both trees.
Nothing else is queued.
