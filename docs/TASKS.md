# Outstanding work

**A queue, not a record.** Only actionable items live here — a finished item is
**deleted**, not struck through; git history is the record. What the model knows
lives in PJ-008 §3's index table; standing facts and gates live in CLAUDE.md.
Neither is restated here — see CLAUDE.md, "The one rule about documents".

---

## Deprioritised

- [ ] **The suite crosses bun's fixed 5000ms ceiling and those tests fail.**
  Dan deprioritised this; it is not obstructing work. The cascade that turned
  one crossing into a burst is fixed (`2de1060`, `5439085`), and `6eeeb92` cut
  provisioning bookkeeping from **1,086 queries to 332 (−69%)** over one
  scenario file, taking that file from 2,448 queries to 1,716 (−30%) — its own
  commit message carries the measurement. What remains is the crossings
  themselves.

  (That figure was briefly withdrawn as underivable and is restored. The
  withdrawal was wrong: the workings were in `6eeeb92`'s commit message the
  whole time, and nobody looked there. Its apparent conflict with the six
  queries measured on 2026-08-24 was not one either — `6eeeb92` reports three
  round trips of *reconciliation*, and the six are a whole provisioning call,
  those three plus `BEGIN`, the advisory lock and `COMMIT`.)

  **Do not re-investigate from scratch.** Refuted with evidence: advisory-lock
  contention; the pglite-socket desync bug as primary mechanism; fd/socket
  exhaustion; WASM heap growth; `afterAll` not awaited; bun's runner. Use
  `LABKIT_TRACE=all` — `src/db/trace.ts` exists so the next investigation does
  not rebuild instrumentation.

  **Profiled 2026-08-24, and the mechanism everyone was working from was
  wrong.** CLAUDE.md said provisioning was the cost; that sentence predated
  `6eeeb92` by sixteen minutes and was never updated. On today's code a
  steady-state provisioning call is 6 queries and 1-4ms, the cold one is 83 and
  runs once per file, and provisioning is 8-18% of query time in the files that
  fail. **The predictor is queries per test** — files span 6 to ~280 and
  individual tests reach ~380, the band that straddles 5000ms once
  per-round-trip latency degrades under load.

  **Every `Nms` extrapolation below rests on one number, and it is stale.**
  `311 queries / 4.955s` ≈ 16ms, measured 2026-08-21 and not since. That run's
  own note says its dominant cost was provisioning re-checking ~38 labels at a
  round trip each — the work `6eeeb92` then deleted — so it is an average over a
  query mix that no longer exists, biased unknowably. The extrapolations are
  kept because a wrong-but-stated basis can be re-derived and a deleted one
  cannot, but **re-measure before acting on any of them.**

  Two costs nothing had named: `reset()` (`tests/helpers/db.ts`) is ~35-40ms a
  call and 29% of suite query time against provisioning's 18%; and bun's hook
  and body clocks are **separate** — a slow `beforeEach` reports `a beforeEach
  hook timed out`, while every failure recorded here says `timed out after
  5000ms`, the body wording. So in the ~23 files that set up from `beforeEach`,
  setup cost cannot be the mechanism; only the ~5 that call `begin()`/`end()`
  inside a test body pay it, and `reset()`, on the test's own clock.

  **Two candidates exist as branches, both built 2026-08-24, neither measured
  against the failure rate.** Honest pricing from the profile, not from a run:

  - `flake/current-no-reprovision` — `current()` reuses the `TenantContext`
    `begin()` resolved. Removes 8 round trips per call, ~100-130ms under load.
    Against a 6s test that is ~4%. One file, `src/db` untouched.
  - `flake/setup-off-budget` — moves `begin()`/`end()` into hooks for the files
    that call them in-body. Better motivated by the profile than the above,
    since it also moves `reset()` off the test clock. Its `tests/mcp.test.ts`
    work was written against a pre-merge lineage and needs redoing.

  **The lever the profile pointed at was query count per test**, and it has now
  been attacked once: `createEdge` charged **three** round trips before writing
  anything — two endpoint-existence checks and a duplicate check. The two
  endpoint checks moved to the failure path (`d0a4a5e`-ish; see
  `src/db/graph.ts`), since the `CREATE` matches both endpoints itself and
  returns no rows when one is missing. Measured, same file, same classifier:
  `tests/scenarios/s11b_*` **812 → 572 queries (−29.6%)**;
  `tests/scenarios/s9b_*` 908 after, against 1340 before *by arithmetic*
  (908 + 2 × 216 edges), −32%.

  **Measured against the failure rate 2026-08-24, and it does not fix the
  flake.** Twelve full runs, ABBA-interleaved over three rounds, every core
  saturated by busy loops for the duration of each run. A = `082b8a9` (before
  any of this work), B = `61e6022` (both changes):

  | arm | failures per run | median | wall median |
  | --- | --- | --- | --- |
  | A | 1, 1, 1, 1, 1, 0 | **1** | 218s |
  | B | 0, 25, 1, 1, 1, 1 | **1** | 208s |

  **Identical median failure rate.** What the query reduction bought is ~5% of
  wall time, not fewer failures. B's total (29 against A's 5) is one 620s run —
  3× the median, the known cascade signature — and with n=6 per arm it cannot be
  attributed to the change; B does strictly less work per run. Both arms fail
  about one test per run under load and both are capable of a catastrophic run.

  So the earlier extrapolation (s9b's heaviest test ~6.0s → ~4.1s) may well be
  true of that test and still not move the failure rate, because the tests that
  fail are not always the heaviest ones.

  **The quiet-machine arm is worth knowing too**: run-to-run wall time varied
  **4×** on identical code (107s to 427s). That is why every single-run
  comparison in this investigation — including ones cited in merged PRs — proved
  nothing, and why induced load *reduces* variance rather than adding it (A's
  loaded spread was 208-224s, an 8% band).

  **The next lever named here was wrong, and the measurement says so.** It
  predicted the per-item query loops (`reinterpret` per withdrawn claim,
  `replaceAnalysis` per input) were where the volume was. Batching all three
  with `IN $ids` saved **six queries across three heavy files** — the
  collections hold one or two items, so there was nothing to batch.

  Where the volume actually is: `recorded()` writes three edges per conclusion
  and each paid a duplicate-existence round trip. `createEdge` now takes an
  opt-in `endpointIsNew` for the case where the caller minted an endpoint in
  the same call, so no edge can exist yet. Measured, same files:

  | file | before | after |
  | --- | --- | --- |
  | `s11_invalidate_analysis` | 1584 | **1320** (−16.7%) |
  | `s12_reinterpret_claim` | 1127 | **1070** (−5.1%) |
  | `s11b_which_review_retracted_it` | 572 | **542** (−5.2%) |

  `closeDecision` also lost its precheck-then-write, the shape `createEdge`
  shed: the `SET` matches the node itself, so an absent decision returns no rows.

  **Do not expect this to move the failure rate either** — entry 024 measured
  that a ~30% query cut did not, because the ceiling is crossed by whichever
  test is unlucky rather than by the slowest one.

  Method, so it is not re-derived: `scratchpad/loaded.sh` shape — checkout arm,
  saturate `sysctl -n hw.ncpu` cores with busy loops, run, kill loops, count
  `^\(fail\)` lines. ABBA per round cancels within-round drift. **Do not use
  `grep -c ... || echo 0`** — grep prints `0` *and* exits 1, so the field
  doubles.

## Deliberately not being done

Here so nobody re-discovers them as gaps.

- **Bitemporality.** Record-time versus belief-time is real and unrepresentable,
  and no source obligation requires it. `Decision.decided_at` is record time.
- **An instant on `EvidenceUnit`.** Would let `whatWasKnown()` split `open` into
  worked-on and untouched. Nothing has needed it.
- **A durable event sink.** `read.ts` never touches `events`, and the scenarios
  that mention the log assert it is *empty* when a historical answer is read.
  It is a SQL table and a reader; what it waits on is a consumer — an audit log,
  MCP notifications, or a projection to another view model.

---

## Setup a new clone or worktree needs

**Moved to CLAUDE.md, "First, in a fresh clone or worktree"** (2026-08-22).
