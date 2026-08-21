# Outstanding work

**A queue, not a record.** What the model knows and does not know lives in
`docs/project-journal/008_user_story_mining.md` §3 — the ledger is authoritative
and this file points at it rather than restating verdicts. Two places describing
the same state is the failure this project keeps catching; if a row's status
here disagrees with the ledger, the ledger is right and this file is stale.

Grouped by **what stops someone picking it up**, because the items are not the
same kind of thing and a flat list hides that. Last reconciled 2026-08-21 against
`d33734a`.

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
  migration (`029`, `030`). `recordObservations()` is now transactional.
- **Row O** — which review a retraction rested on. One edge label,
  `INVALIDATED_BY: Artefact → Review`, no migration (`031`, `032`). Taken up on
  an external challenge whose *discriminator was unbuildable* and whose
  *reasoning was right*; the row's own cell had described the gap as ambiguity
  when it was absence.

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
