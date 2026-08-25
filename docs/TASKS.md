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

## The compiled binary cannot migrate

`bun run build` produces `bin/labkit`, and against a database that does not
exist yet it dies with `Can't find meta/_journal.json file`. `runMigrations()`
(`src/db/migrate.ts`) locates `drizzle/` with
`new URL("../../drizzle", import.meta.url)`, and inside a `bun build --compile`
bundle that URL is `/$bunfs/root/…`, where the folder is not.

**Measured 2026-08-25 against both entry points** — the old `src/cli.ts` built
as a binary fails identically — so it predates the CLI split and was never
caused by it. It has simply never been run: `bun run dev` and `bun test` both
read `drizzle/` off disk and work.

Two shapes of fix, neither chosen: embed the journal and the SQL as imported
strings so the bundle carries them, or ship `drizzle/` beside the binary and
resolve relative to `process.execPath`. The first makes the binary
self-contained and makes a migration a code change; the second keeps migrations
as data and makes the binary a two-file artefact.

Not urgent — nothing ships the binary — but `bun run build` currently exits 0
on something that cannot work, which is the shape CLAUDE.md warns about.

## Biome's linter is unread

`biome.jsonc` has `linter.enabled: false`. Turning it on reports **96 errors and
376 warnings** (2026-08-25, biome 2.5.10, `recommended` rules).

Not suppressed in bulk, deliberately. Some of those will be real, some will
disagree with a choice this repo made on purpose, and a blanket
`"rules": { "recommended": false }` or a wall of `biome-ignore` comments loses
the difference — which is the whole reason the linter was left off in the same
commit that adopted the formatter.

The work is to read them in groups, fix what should be fixed, and disable each
remaining rule *by name with a reason* in `biome.jsonc`.

## Deliberately not being done

Here so nobody re-discovers them as gaps.

- **Bitemporality.** Record-time versus belief-time is real and unrepresentable,
  and no source obligation requires it. `Decision.decided_at` is record time.
- **An instant on `EvidenceUnit`.** Would let `whatWasKnown()` split `open` into
  worked-on and untouched. Nothing has needed it.
