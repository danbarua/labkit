# Outstanding work

**A queue, not a record.** Only actionable items live here — a finished item is
**deleted**, not struck through; git history is the record. What the model knows
lives in PJ-008 §3's index table; standing facts and gates live in CLAUDE.md.
Neither is restated here — see CLAUDE.md, "The one rule about documents".

---

## Deprioritised

- [ ] **The suite crosses bun's fixed 5000ms ceiling and those tests fail.**
  Dan deprioritised this; it is not obstructing work. The cascade that turned
  one crossing into a burst is fixed (`2de1060`, `5439085`).

  **Cutting query counts does not move it.** Measured 2026-08-24 — twelve runs,
  ABBA-interleaved under saturated CPU — a ~30% reduction left the median at one
  failing test per run on both arms and bought ~5% of wall time. The ceiling is
  crossed by whichever test is unlucky, not by the slowest one, so anything that
  lowers the *mean* is the wrong shape. Session-log entries 022, 024 and 026
  carry the numbers; CLAUDE.md carries the mechanism.

  **Do not re-investigate from scratch.** Refuted with evidence: advisory-lock
  contention; the pglite-socket desync bug as primary mechanism; fd/socket
  exhaustion; WASM heap growth; `afterAll` not awaited; bun's runner;
  provisioning cost; query count per test.

  **Method, so it is not rebuilt.** `LABKIT_TRACE=all` with `src/db/trace.ts`
  for query counts. For failure rates: check out each arm, saturate
  `sysctl -n hw.ncpu` cores with busy loops, run, kill loops, count `^\(fail\)`
  lines, ABBA per round to cancel within-round drift. A clean machine passes on
  every arm — run-to-run wall time varied **4× on identical code** when idle, so
  induced load *reduces* variance rather than adding it. Do not use
  `grep -c … || echo 0`: grep prints `0` **and** exits 1, so the field doubles.

  **Two unmerged branches**, neither measured against the failure rate and
  neither expected to move it:
  - `flake/current-no-reprovision` — content already in `main`; the branch is
    redundant.
  - `flake/setup-off-budget` — moves `begin()`/`end()` into hooks for the ~5
    files that call them in-body, which also takes `reset()` off the test clock.
    Cut from a pre-merge lineage; needs a port, not a merge.

  What would actually move it has to change the *shape* of the distribution
  rather than the mean: raising the ceiling (hides it), or stopping a timed-out
  test from cascading. Neither is built.

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
