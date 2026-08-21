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

- [ ] **The suite is flaky. The mechanism is now known; the fix is not.**
  Investigated 2026-08-21 by three parallel agents. **Every earlier hypothesis
  in this entry was wrong, including two of mine**, and the corrections are
  worth more than the conclusion.

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
  - **A run's test count is a detector, and it is exact.** The suite has 249
    static `test(` declarations, one of which is inside
    `for (const label of NODE_LABELS)` (`tests/domain-graph.test.ts:362`) and
    expands to thirteen. `249 - 1 + 13 = 261`, with no remainder — so **261 is
    derived, not observed**, and any other number means a test was reported
    twice. That is the previous bullet's mechanism seen from the counter: a
    test whose body keeps running after the ceiling stops waiting gets counted
    at the timeout and again on completion.

    Found on 2026-08-21 in a run reporting **262 tests, 239 pass / 23 fail** —
    which also happened to be racing a second full `bun test` against the same
    directory, so it says nothing about the flake's usual cause. The count
    check is the useful part and is cheaper than reading durations: **if
    `Ran N tests` is not 261, a test crossed the ceiling.** Recompute the 261
    if a test file or a node label is added; it is a derived constant, so it is
    supposed to move.

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
