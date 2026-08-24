# Outstanding work

**A queue, not a record.** Only actionable items live here — a finished item is
**deleted**, not struck through; git history is the record. What the model knows
lives in PJ-008 §3's index table; standing facts and gates live in CLAUDE.md.
Neither is restated here — see CLAUDE.md, "The one rule about documents".

---

## Deprioritised

- [ ] **The suite crosses bun's fixed 5000ms ceiling and those tests fail.**
  Dan deprioritised this; it is not obstructing work. The cascade that turned
  one crossing into a burst is fixed (`2de1060`, `5439085`); provisioning got
  69% cheaper again in `6eeeb92`. What remains is the crossings themselves.

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
  fail. **The predictor is queries per test** — files span 6 to ~280, individual
  tests reach ~380, and at ~16ms per round trip under load that band straddles
  5000ms, which is why it is 7-15 *different* tests each run.

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

  Extrapolated, and labelled as such: s9b's heaviest test was 378 queries ≈ 6.0s
  at the loaded rate; at the same ratio it is ~256 ≈ 4.1s, under the ceiling.
  **Not measured against the failure rate** — that still needs induced load.

  **The next lever is the same shape one level up**: 220-314 queries per heavy
  file are domain cypher, and the verbs issue them in per-item loops
  (`reinterpret` runs a query per withdrawn claim, `replaceAnalysis` one per
  input). `closeDecision` also still does a precheck-then-write, unbatched.

  **Measure paired and interleaved, one variable, under induced load** — a
  clean machine passes on every arm, so a green run proves nothing. An earlier
  fix passed round one on both arms and failed at the lowest load of four.

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
