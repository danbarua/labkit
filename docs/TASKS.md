# Outstanding work

**A queue, not a record.** What the model knows and does not know lives in
`docs/project-journal/008_user_story_mining.md` §3 — the ledger is authoritative
and this file points at it rather than restating verdicts. Two places describing
the same state is the failure this project keeps catching; if a row's status
here disagrees with the ledger, the ledger is right and this file is stale.

Grouped by **what stops someone picking it up**, because the items are not the
same kind of thing and a flat list hides that. Last reconciled 2026-08-21 against
`17b9976`.

---

## Ready to build

Someone could start these today.

- [ ] **An absent dependency path must not read as independence.**
  `whatDependsOn()` walks a fixed set of routes and lets everything it did not
  reach read as unaffected. Required by Designer 2; classified in
  `consumer-contract/022` as **query semantics** (change-bar tier 1), not a model
  change. Needs the usual shape first: **a scenario where a reader acts on
  "unaffected" and is wrong.** Third catch on this verb — PJ-021 found it
  returning `claims: []` for an input while still naming the enquiry.
  *Do not* build Designer 2's `Dependency coverage assertion`; `023` §4 keeps
  that as a discriminator for later, since certified completeness needs durable
  state that open-world traversal does not.

## Recently closed, so nobody re-opens them

- **Row Z** — historical ordering. `Decision.decided_at`, one property, no
  migration (`consumer-contract/025`, `026`).
- **Row AD** — observation-only work reading as no work. One node, two edges, no
  migration (`029`, `030`). `recordObservations()` is now transactional, and
  `bun run check:ledger` reports no demonstrated wrong answer shipping green.

## Needs a discriminator before it can be built

Four ledger rows sit `open` + **unowned**: every named probe has been built, so
each needs a *new* one. These are research questions, not tickets — "do row F" is
not actionable, and writing a scenario to satisfy a row would manufacture the
result (PJ-011 §5).

- [ ] **Row F — no artefact-to-artefact lineage.** **Discriminator built** as
  S-9b; see `consumer-contract/027`, `028`. Rung 2 held — `reverify()` already
  records a rebuild as an act with a target and prevents the only wrong answer
  available — and then refused the case the contract actually requires, a rebuild
  that concludes nothing. Ladder **paused at rung 3**, gated on the adapter
  phase's reconstruction-provenance read. Reclassifying it `boundary` was
  considered and rejected: it would contradict `023`'s strong contract-necessity
  score. What it still needs is not a new probe but the adapter read to fail
  against real state.
- [ ] **Row S — no agent, person or role.** The strongest consumer finding: all
  three designers required *persistent* attribution across four unanimous
  clusters. S-8 recorded the absence as a standing decision (identity is
  infrastructure, not domain) and three cold designers disagree. **Write-side**,
  so a read-only contract structurally cannot settle its shape.
- [ ] **Row O — withdrawal reason under-determined.** **Deferral withdrawn on
  challenge** (`labkit-review`, 2026-08-21): the cell defers to the event model
  as a *why state changed* question while its own verified-state line describes
  a *what is true now* one, and `replaceAnalysis` requiring a review of the
  analysis being replaced already closes half of it. The candidate
  discriminator — an analysis retired on the strength of a review that is later
  itself invalidated; does the retirement still read as resting on valid
  grounds? — needs **no event sink**. Predictions first: if the propagation
  query comes back correct, that is a result and the cell can finally say why it
  stays unowned in terms of something that was run.
  A refuted *challenge* needs no new ledger convention — **it is a prediction
  with a different author**, and rows A and B keep refuted predictions because
  someone committed to an outcome before the build, not because of who they
  were. Only the attribution line changes. If it goes that way, the cell must
  say **what the challenge got wrong**, not that it was wrong: *"the deferral was
  right, and here is the reason"* is a verdict; *"the challenge was refuted"* is
  the shrug this row has had for eleven scenarios.
- [ ] **Row T — edges cannot carry properties.** **Orphaned.** Its only named
  owner was row O, and if O is settled by a plain `Decision → Review` edge then T
  contributes nothing to it and loses that owner. Says so in its own cell rather
  than being handed a future phase as a fake owner — an unbuilt *phase* is not a
  scenario, and naming one turns "we have no discriminator" into "it's handled".

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
