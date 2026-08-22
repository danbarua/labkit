# Outstanding work

**A queue, not a record.** What the model knows and does not know lives in
`docs/project-journal/008_user_story_mining.md` §3 — the ledger is authoritative
and this file points at it rather than restating verdicts. Two places describing
the same state is the failure this project keeps catching; if a row's status
here disagrees with the ledger, the ledger is right and this file is stale.

Grouped by **what stops someone picking it up**, because the items are not the
same kind of thing and a flat list hides that. Last reconciled 2026-08-21 against `53eead1`, **after Dan found both this
file and session-log 004 stale in the same reading**. Reconcile against the
ledger and the working tree, not against memory of what was decided.

---

## Ready to build

Someone could start these today.

- [ ] **The suite is flaky. The cascade is fixed (2026-08-22); the ceiling
  crossings are not.** Investigated 2026-08-21 by three parallel agents.
  **Every earlier hypothesis in this entry was wrong, including two of mine**,
  and the corrections are worth more than the conclusion.

  **What was fixed** (`2de1060`): a test that overran bun's ceiling used to
  take the next one with it, because `scenario.end()` closed whatever a single
  mutable `db` pointed at — and by then it pointed at the live test. FIFO
  connection ownership, plus a reset that only fires when nothing is
  outstanding. Demonstrated deterministically rather than statistically: a real
  six-second overrun reproduces the cascade 100% in 7.5s, and
  `tests/scenario-harness.test.ts` pins the same ordering in milliseconds.

  **Also fixed** (`5439085`): `reset()` truncates the label tables instead of
  dropping the graph. Dropping destroyed thirty-eight labels and thirty-eight
  indexes that the next `resolveTenantContext()` rebuilt — **24% of every query
  in a traced scenario file**, almost all of it *creating*. Paired and
  interleaved with one variable: **167s mean → 81s**. It is also a correctness
  fix: `graph "labkit_t1" does not exist` needs something to *drop* the graph,
  and after this nothing in the suite does. That is checkable by `grep` rather
  than by waiting for a flake — **impossible by construction, not merely
  unobserved** — which is a stronger result than the zeros measured on either
  tree.

  **Two methodological notes from confirming it**, both worth more than the
  numbers. A clean run cannot verify a claim about what happens during a flake,
  so three green suites are three times *not* testing it. And the first reason
  given for the by-construction argument was wrong — the surviving
  `dropTenantGraph` caller was said to target a different graph, when
  `"drop-me"` resolves to `labkit_t1` like everything else; what isolates it is
  one PGlite instance per test file. Right conclusion, wrong reason, caught by
  checking.

  **What was not fixed:** tests still cross the ceiling and still fail. Only
  the amplification is gone.

  **The prediction, and it is NOT confirmed.** The first form — *"a crossing
  should now produce roughly one failure, not a burst"* — was withdrawn as
  unfalsifiable: `labkit-minion`'s **unpatched** baseline produced 5 crossings
  and 4 collateral, roughly one-to-one, so a post-fix run at one-to-one would
  have "confirmed" behaviour the baseline already showed. Burst size is
  load-dependent.

  The form that can be tested is about the **error vocabulary**, not the count:
  **collateral should be zero** — no failure whose cause is another test's
  teardown. That is checkable per run and does not move with load.

  **It currently disagrees with itself across two trees.** On `labkit-minion`'s:
  14 failures, every one a crossing, **0 collateral**. On this one, a later run:
  266 pass / 6 fail — five crossings and **1 collateral**, carrying a
  `Connection terminated`. So it survived one tree and failed the other. That is
  a live disagreement, not a settled result, and it should not be written up as
  a success anywhere. **Record the count, the spread, and the error vocabulary**
  on any failing run; the vocabulary is the part that decides it.

  **The version that failed is the useful half.** The first attempt moved
  `testDb.reset()` into `begin()` so every test isolated itself. Paired,
  interleaved A/B on one tree in one session:

  | arm | pass | fail | ran | wall | load |
  |---|---|---|---|---|---|
  | BASE | 261 | 0 | 261 | 187s | 7.04 |
  | reset-at-begin | 261 | 0 | 261 | 165s | 5.80 |
  | BASE | 261 | 0 | 261 | 142s | 3.51 |
  | reset-at-begin | 245 | **18** | **263** | 386s | **3.22** |

  It failed at the *lowest* load of the four, so load does not explain it — and
  it had a mechanism. **Twenty-three of the twenty-nine files call `end()` from
  `afterEach`, which bun runs outside the per-test timeout.** Moving the reset
  into `begin()` put a graph drop and a truncate *inside* every test's 5000ms
  budget, trading the cascade for more crossings, which is what causes the
  cascade. `ran=263` is the tell: crossings, double-counted.

  **Round 1 was 261/0 for both arms and marginally faster for the fix.**
  Stopping there would have shipped it. That is the argument for the paired
  design in one sentence.

  **What actually happens, demonstrated:**
  - **Nothing hangs.** 59,086 queries tracked start-to-finish across a run that
    reproduced 11 failures — **zero** unfinished. A watchdog polling for
    anything outstanding >3s never fired.
  - **A test's legitimate work crosses bun's fixed 5000ms ceiling.** One
    timing-out test issued **311 sequential queries** summing 4.955s against a
    4.979s wall span — 99.5% real round trips, no idle. The dominant cost is
    `provisionTenantGraph()` re-checking thirteen node labels and twenty-odd
    edge labels, one round trip each, on **every** `scenario.begin()` *and*
    every `scenario.current()`. The documented two-reader pattern pays twice.
  - **A teardown race turns one timeout into a cascade.** Bun's timeout does
    **not cancel the test body** — it only stops waiting. The abandoned test
    keeps running and its late `scenario.end()` resets the database and closes a
    connection that by then belongs to the *next* test. Traced at log-line
    granularity in two files independently.
  - **The test count is one-directional, and was briefly written down here as a
    detector. It is not one.** The suite's count is derived rather than
    observed: count the `test(` declarations at line start (excluding
    `RegExp.prototype.test` calls, of which there are five), subtract the one
    generating declaration inside `for (const label of NODE_LABELS)`
    (`tests/domain-graph.test.ts:362`), add `NODE_LABELS.length` for its
    expansions. On 2026-08-21 that was `249 - 1 + 13 = 261`, exactly. **Derive
    it; do not trust that literal** — it moves whenever a test file or a node
    label is added, and a bare number in this paragraph would earn no assertion
    and carry no date.

    A count *above* the derived value means a test was reported twice, which is
    the previous bullet seen from the counter: a body that keeps running after
    the ceiling stops waiting is counted at the timeout and again on
    completion. Observed once, in a run reporting **262 tests, 239 pass / 23
    fail** — which was also racing a second `bun test` against the same
    directory, so it says nothing about the flake's usual cause.

    **The converse is false, demonstrated the same day.** A natural flake on a
    quiet machine lost five tests to the ceiling and reported **261** — the
    normal count. So the count catches some crossings and misses others, at a
    rate nobody has measured except that it is not zero.

  - **What did separate a flaking run from a clean one, on the same tree:**

    | | tests | result | expects | wall |
    |---|---|---|---|---|
    | A | 261 | 256 pass / 5 fail / 5 errors | 856 | 280.87s |
    | B | 261 | 261 pass / 0 fail | 867 | 88.98s |

    Wall clock separated them 3.2×, and the **`expect()` count** dropped 11.
    The assertion count is the better of the two: it measures work that did not
    happen rather than time that passed, so it does not move with machine load.
    Neither is a threshold anyone has calibrated — they are what to compare
    between two runs of the same tree, which needs no constant at all.

  **Refuted, with evidence:** advisory-lock contention (346 acquisitions, max
  **38ms**); pglite#1046 desync as the primary mechanism (no desync signature,
  247/247 clean closes); file-descriptor or socket exhaustion (flat 86–92);
  WASM heap growth (non-monotonic, *declining* at the failure point); `afterAll`
  not awaited (every gap positive, 4–17ms); bun's runner (single process for
  185s, no worker children).

  **A fix was tried and failed.** FIFO connection ownership with deferred reset,
  plus `current()` reusing the resolved context. Paired A/B, three rounds under
  shared load: **FIX 2/4/0, BASE 2/0/0.** No improvement, direction against it,
  reverted. **It bundled two independent changes**, so it says nothing about
  either half — `current()` skipping re-provisioning is provably less work and
  remains an untested candidate on its own.

  **Named, not built:** drive `begin()`/`end()` from `beforeEach`/`afterEach` so
  bun's timeout cannot interleave two tests' setup and teardown; short-circuit
  provisioning for `current()`; raise the ceiling (works, hides rather than
  fixes). The real target is the **provisioning cost** — it is what puts a test
  within reach of 5000ms at all.

  **Since that was written, provisioning got 69% cheaper** (`6eeeb92`): the
  catalog is read in two queries instead of ~78 checks, three round trips in the
  steady state. Lower pressure, same ceiling — not a fix, and not measured
  against the failure rate. **Use `LABKIT_TRACE=all` rather than rebuilding
  instrumentation**; `src/db/trace.ts` exists precisely so the next investigation
  does not start where the last two did.

  **Dan has deprioritised this** — it is not obstructing work.

  **Two measurement traps this burned, both mine.** Comparing runs taken hours
  apart under uncontrolled machine load — sibling Claude sessions run `bun test`
  concurrently here, load ~6 on 10 cores — produced one confident wrong finding
  and nearly produced a second in the opposite direction. Use a **paired**
  design. And `bun test <paths>` is not a different invocation from bare
  `bun test`: arguments are substring **filters** over a fresh discovery walk.


## Needs a discriminator before it can be built

**No ledger row sits `open` + unowned.** Verified against §3, not recalled:
O `resolved`, S `refuted`, T `refuted`, AD `resolved`, AE `resolved`,
**F `boundary`** — and **AF `open`**, added the same day, which is the one row
still wanting a discriminator.

**Row F reached a verdict on 2026-08-21: `boundary`** (`docs/consumer-contract/035`,
`036`). Argued, not accumulated to. Four bites, all in *reporting* —
`reproducibilityOf()` (S-9c), `whySupported().restingOn` (S-9d), and
`reproductionOf().differs` (S-10c) — and **every one was fixed by carrying
`natural_id`, which already existed**. A version-of relationship would have
fixed none of them, so they are evidence against the row rather than for it.

The enumeration is what makes it a verdict: every read on `ReadSurface` touching
an artefact takes a **reference**, or takes a name and **refuses** when it is
ambiguous, or **returns** identity. S-10c asserts that rather than leaving it as
prose. The model was never missing identity; the reads were not using it.

**It reopens if** anyone asks for versions as an ordered sequence — *"show me the
history of this control series"* — asked of a name rather than of one artefact.
No verb asks it, and under PJ-011 §5 a question never asked earns nothing. That
would be the first read needing identity its caller does not hold.

Row F was the only candidate in this project's history that would have required
a first new noun. It did not.

- [ ] **Row AF — execution input order is not recorded.** `CONSUMES` says which
  artefacts a computation read, never in what sequence, so two runs of an
  order-sensitive method are indistinguishable (S-10b). **Earns nothing under
  §5**: the reports claim the two runs consumed the same inputs, and they did —
  what a reader *infers* is the wrong part, and the record never asserted it.
  Needs a reader acting on "reproduced" for a reversed run and being wrong in a
  way the record **states** rather than implies. Unowned.

**Row T is `refuted`, not open** — this file said both at once until 2026-08-21.
Edges *do* carry properties; `createEdge()` takes them. What survives is that an
edge property cannot be part of edge identity, nor changed by re-calling the verb
that created it. Its best remaining candidate was tested and went
the same way (S-10b): input order on `CONSUMES` is genuinely lost, and **an
ordinal on the edge would not fix it**, because nothing compares orders — the
record does not know a method is order-sensitive. Row T would have been claiming
row AF's absence. Four for four against: S-7, S-12, row O, and this.

## Next phase

- [x] ~~**A thin read-only CLI**~~ — done (`21cd68f`). `known`, `why`, `affects`,
  `enquiry`. Read-only **structurally**: it builds a `ReadSurface`, never a
  `ResearchSession`, and the test derives the forbidden verb list from
  `WriteSurface.prototype` so a verb added later is covered without anyone
  remembering.
- [x] ~~**The MCP adapter**~~ — done (`70817a2`, `84da50d`). `src/mcp/`:
  **seven** tools, not four. The CLI's four plus the three history reads an agent
  plausibly asks and a person at a terminal does not — `design_history`,
  `interpretation_history`, `reproduction_of`. Read-only structurally, same as the
  CLI, and the test derives the forbidden verb list the same way. It returns the
  **whole** structured report rather than a chosen subset, which is the property
  `tests/mcp.test.ts` asserts without naming a field: the CLI's hand-picked prose
  had fallen behind the report types three times over, and a transport that ships
  the report entire cannot.
- [x] ~~**The CLI adapter defects an external review found**~~ — done (`70817a2`).
  `accepted-as-unresolved` rendered as plain `open`; `withdrawn`, `challenged` and
  never-examined all rendered as bare "NOT supported"; an answered enquiry did not
  say whether its closure rested on exploratory or confirmatory work. All three
  were correct in `--json` all along. Also: the arg parser took positionals as
  "the first thing not starting with `--`", so a flag before the positional read
  the flag's *value* as the argument; and `why` had no way to answer
  `whySupported()`'s ambiguity refusal, which turned a good refusal into a dead
  end (`--analysis <id>` now, and an optional `analysis` on the MCP tool).

## Waiting on a decision, not on work

- [ ] **Should `whySupported` + `checksFrom` be their own module?** 359 lines,
  19% of the pre-split code, straddling claims and criteria. Deferred by the user
  during the read/write split; nothing depends on it.
- [ ] **`package-lock.json` is still tracked on `main`** and arrives there when
  this branch merges. Correct under the docs-on-`main` / code-on-branch split —
  noted so it is not a surprise.

## Recorded, deliberately not being done

Here so nobody re-discovers them as gaps. Each has a reason, and the reason is
better than the work.

- **Bitemporality (row Z+).** Record-time versus belief-time is real and
  unrepresentable, and **no source obligation requires it** — demoted by `023`'s
  contract-necessity bar. `Decision.decided_at` is record time and says so.
- **An instant on `EvidenceUnit`.** Would let `whatWasKnown()` split `open` into
  worked-on and untouched. Nothing has needed it; `026` names where it would go
  and says it should be earned the way `decided_at` was.
- **Rows Y and AA** are `boundary` — characterised limits, with no claim they
  should be fixed.

---

## Setup a new clone or worktree needs

Not tasks, but the things that are not in the repo and will not announce
themselves.

- **Nothing to configure for hooks.** `.githooks/` and the SVG were both removed
  (`ce97456`); `bun run dev:dependency-cruiser` regenerates
  `docs/dependency-graph.mmd` by hand, and graphviz is no longer needed.
- `.claude/settings.local.json`, `.claude/.wrap-state/` and
  `.claude/hookify.*.local.md` are untracked, so a **worktree will not have
  them**. The hookify rules are the ones worth copying across — they warn on
  four mistakes made in this repo today. See CLAUDE.md.
- Checks worth knowing: `bun run check:ledger`, `check:doc-comments`,
  `check:migrations`. The first two each caught a real defect within hours of
  being written.
