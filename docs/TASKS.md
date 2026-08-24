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

  **Three changes have been measured against the failure rate and none moved
  it.** Cutting query counts ~30%, moving setup off the per-test clock, and
  booting one PGlite instead of 44 — each twelve runs, ABBA-interleaved under
  saturated CPU. All three bought wall time (5%, 7%, **40%**) and left the
  failure median where it was. The ceiling is crossed by whichever test is
  unlucky, not by the slowest one, so anything that lowers the *mean* is the
  wrong shape. Entries 022, 024, 026 and 028 carry the numbers.

  **The instrument shaped the hypothesis for three of those rounds, and that is
  the reusable lesson.** `LABKIT_TRACE` instruments the `LabKitDB` seam, so it
  cannot see anything before a connection exists — WASM boot was invisible to it
  by construction, and boot was 44-110s of a ~200s suite. Every hypothesis
  generated from the tracer was downstream of the largest cost. **Before
  profiling, ask what the profiler cannot see.**

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

  **One known flaw in that harness.** ABBA runs A,B,B,A, so A holds positions 1
  and 4 of a round and B holds 2 and 3 — equal mean position, which cancels
  linear drift but not an effect peaking mid-round. The catastrophic run landed
  on B in two consecutive experiments. Randomise arm order per round, or
  alternate ABBA with BAAB.

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

  Attribution rides on every event as of PJ-031 and nothing reads it, which is a
  second and nearer trigger than the one `src/domain/events.ts` names. Still not
  a reason to build the sink; it is a reason the wait is now visible.
