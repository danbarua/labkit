# Outstanding work

**A queue, not a record.** What the model knows and does not know lives in
`docs/project-journal/008_user_story_mining.md` §3 — the ledger is authoritative
and this file points at it rather than restating verdicts. Two places describing
the same state is the failure this project keeps catching; if a row's status
here disagrees with the ledger, the ledger is right and this file is stale.

Grouped by **what stops someone picking it up**, because the items are not the
same kind of thing and a flat list hides that. Last reconciled 2026-08-21 against
`c8e6362`.

---

## Ready to build

Someone could start these today.

- [ ] **The suite is flaky, and it is not just `leader-election` any more.**
  Five consecutive plain `bun test` runs on 2026-08-21 gave 0, 2, 2, 9 and 1
  failures. What is established:
  - **Every file passes in isolation**, run one per process, all 28.
  - **Files run sequentially**, not in parallel — the isolated runs sum to 81.1s
    and one combined run takes 82.3s. So it is not concurrent PGlite instances.
  - **It concentrates in the consumer probes.** The nine-failure run was one
    file cascading: a test dies and every test after it in that file dies too.
    Those probes have since been **split into two files** (`7352a5f`), so a
    desynced connection can only take half of them down. Containment, not a fix.
  - That cascade is the shape `tests/helpers/db.ts` already documents — a
    connection hitting the pglite-socket defect "desyncs permanently and stays
    broken for the rest of its life" (electric-sql/pglite#1046). The containment
    is one connection per test, and **that file is the only one where a single
    test opens two connections in sequence** (`inTwoWorlds`), which makes it the
    weakest point of the containment rather than an unrelated bug.
  - **The failure depends on how bun is invoked, not on the tests.** Passing the
    26 files explicitly gave **0 failures across 8 runs** — in alphabetical
    order, reverse, consumer-first, consumer-last, and in bun's own discovered
    order copied out of a junit report. Bare `bun test` over the same 26 files
    fails about half the time. At a ~50% rate, eight clean explicit runs
    happening by chance is about 1 in 250, so the difference is real even though
    the mechanism is not known. It points at bun's runner rather than at LabKit.
  - **Every failure begins with a 5-second timeout** — a hang, not an error —
    and `graph "labkit_t1" does not exist` is fallout from the test that was
    abandoned mid-flight.
  - Not established: what hangs, or why bare invocation differs.

  **A second warning.** Three consecutive bare runs failed the *same four tests*
  and were written up here as deterministic. Two more runs then gave 0 and 3.
  Three identical runs is not determinism, and the claim should have been
  re-tested before it was recorded — it briefly made the problem look solved
  when it was not.

  A cheap workaround exists and has not been taken: make `bun run test` pass an
  explicit file list. It is a workaround rather than a fix, it would hide the
  problem rather than solve it, and hiding a flake is how a suite stops being
  trusted — so it is recorded as an option and left undone deliberately.

  **A warning for whoever picks this up.** One experiment here produced a
  confident wrong answer: `ls tests/*.test.ts tests/**/*.test.ts` yields five
  **duplicated** paths, so those files run twice in one process against shared
  module state. Any measurement using that list is worthless, and it briefly
  looked like evidence that `leader-election` was innocent. Use `bun test` or an
  explicit list.

  Worth fixing before it trains anyone to ignore a red suite.

- [ ] **An analysis cannot read another analysis's output.** Found by S-11c
  while demonstrating the dependency gap, and not itself part of it.
  `recordAnalysis({ from })` accepts only observations handles, and
  `recordObservations()` is the only thing that produces one — so a two-stage
  pipeline can only be recorded by re-entering the intermediate as if it were
  fresh measurement, which breaks the provenance chain in the record while it
  holds in the world. Fifteen scenarios never needed a second stage, which is
  why it does not exist.
  Needs the usual shape first: **a reader acting on the broken chain and being
  wrong.** S-11c has half of it — the omission is demonstrated — but the remedy
  is a verb, not a query, so it wants its own demonstration of what a caller
  gets wrong when they cannot express the second stage. Related to row F: an
  analysis output that can be fed onward is a thing with an identity apart from
  its bytes.

## Recently closed, so nobody re-opens them

- **Row Z** — historical ordering. `Decision.decided_at`, one property, no
  migration (`consumer-contract/025`, `026`).
- **Row AD** — observation-only work reading as no work. One node, two edges, no
  migration (`029`, `030`). `recordObservations()` is now transactional.
- **D2's open-world `unaffected`** — `whatDependsOn()` presented a lower bound
  as a complete answer. Fixed in the query shape alone (`c8e6362`):
  `DependencyReport` now names the routes walked and carries `complete: false`
  as a literal type. Demonstrated first by **S-11c**. The coverage assertion
  `023` §4 forbids is still not built and the type is written so it cannot be
  added by accident.
- **Rows S and T** — refuted, not merely closed. There is no *who* to attribute
  work to when analyses are run by agents, and what the question reaches for is
  provenance the model already carries (`S-8b`). Edges *can* carry properties;
  `createEdge()` now takes them, and what survives is that a property cannot be
  part of edge identity.
- **Row O** — which review a retraction rested on. One edge label,
  `INVALIDATED_BY: Artefact → Review`, no migration (`031`, `032`). Taken up on
  an external challenge whose *discriminator was unbuildable* and whose
  *reasoning was right*; the row's own cell had described the gap as ambiguity
  when it was absence.

## Needs a discriminator before it can be built

Two ledger rows sit `open` + **unowned** — down from four. Rows **O** and **S**
closed on 2026-08-21 and row **T** was refuted the same day. These are research questions, not tickets — "do row F" is
not actionable, and writing a scenario to satisfy a row would manufacture the
result (PJ-011 §5).

- [ ] **Row F — artefacts are not versioned entities.** Retitled 2026-08-21: the
  row spent the whole arc asking for an `Artefact → Artefact` edge, and the
  missing thing is one level down. An artefact has no identity apart from its
  content — `logical_name` is wording, which S-9 refused to treat as identity,
  and `content_hash` is the bytes — so there is nothing two artefacts can be two
  **versions of**. Same shape as row O: the writer knows, the verb never asks,
  the reader infers wrongly.
  Still **not built**, and it is now the most expensive open item: a genuine new
  noun (rung 4). S-9b cleared bar 4 and not §5. Its discriminator, which it
  never had before, is *a scenario in which the record must distinguish a new
  version of a thing from a new thing, and gets it wrong.*

- [ ] **Row T — edges cannot carry properties.** **Orphaned**, as predicted. Row
  O was its only named owner and closed with `INVALIDATED_BY`, a plain edge with
  no properties — so T contributed nothing and has no owner at all. Needs a
  genuinely new discriminator: a case where reifying the fact to a node is worse
  than a property on the edge would be. Three rows have now been settled by
  giving the fact its own node or edge, which is mild evidence *against* the row.

## Next phase

- [ ] **A thin read-only MCP/CLI adapter over the frozen contract.** PJ-023 named
  it; `023`/`024` narrowed it. The contract exists in
  `consumer-contract/010`–`015`; the vertical slice is the pattern. Build four
  reads first, not twenty operations. **Two durable worlds per read, before the
  read is written** — if the public API returns one answer where the contract
  needs two, that is a demonstration rather than an absence.

## Waiting on a decision, not on work

- [ ] **Does the SVG still earn 134KB?** Both forms are committed and
  self-maintaining; the question narrowed once a diffable form existed. Rendered
  comparison published as an artifact. One line in
  `scripts/update-dependency-graph.sh` either way.
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

- `git config core.hooksPath .githooks` — enables the dependency-graph hook. The
  hook is tracked; the config is not.
- `brew install graphviz` — optional. Without it the mermaid graph is still
  maintained and only the SVG goes stale, announced on stderr.
- `.claude/settings.local.json` and `.claude/.wrap-state/` are deliberately
  untracked. See CLAUDE.md.
