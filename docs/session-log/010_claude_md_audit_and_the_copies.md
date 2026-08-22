# 010: A CLAUDE.md audit, and four copies of the ledger

**Session wrap, 2026-08-22, on `feat/mcp-server`.** Not a decision record — see
`docs/project-journal/027`/`028` for the reasoning about prose that drifts from
the data it summarises, which is what this session kept finding.

## Goal

Audit CLAUDE.md and apply targeted fixes; then, on Dan's follow-up, review
`docs/GLOSSARY.md` and `docs/TASKS.md` for the same problem — "ledgers keep
multiplying and copying".

## Changed

- `CLAUDE.md` (+24/−6, committed by Dan as `9ed4d63`) — three cross-references
  qualified to `docs/consumer-contract/`; a new orientation paragraph for that
  directory; `check:no-tracked-symlinks`, `bun run dev` and `bun run mcp` added
  to the Commands block; a "Nothing runs these for you" block naming what to run
  before committing.
- `docs/mcp-server/001_domain-consumer_feedback_and_next_steps.md` (`8c1ae80`,
  Dan's).
- Working tree: `docs/mcp-server/002_mcp-server_kickoff.md` is untracked and is
  not this session's.

**This branch is 0 commits ahead of `main`** apart from the two above — the MCP
adapter landed through the `feat/domain-consumer` merge (`6d83a92`), not here.

## Verified

- `bun run check:ledger` — **green**: *"no known bug is waiting to be fixed, and
  every row's status matches in both places it is written."*
- `bun run typecheck` — **green**, exit 0, no diagnostics.
- `npx depcruise src tests --output-type err` — **green**: *"no dependency
  violations found (82 modules, 240 dependencies cruised)."*
- `bun test` — **not run**. The range changes no source, only Markdown.

**Both type checks first failed with `TS2688: Cannot find type definition file
for 'bun'`, because this worktree had no `node_modules`.** Dan ran `bun install`
(183 packages) and both then passed. Not a regression — but
`docs/TASKS.md`'s "Setup a new clone or worktree needs" section lists hooks and
untracked `.claude/` files and **does not mention `bun install`**, which is the
first thing a fresh worktree needs and the only one that silently disables two
of the three gates.

One self-inflicted instance of a documented trap, recorded because the document
warning about it is in this repo: the first re-run reported `exit=$?` after
`bun run typecheck | tail -5`, which is `tail`'s status, not the check's.
Re-run redirected to a file. CLAUDE.md says exactly this and it still happened.

## Open

Four defects found and **none fixed** — all four are Dan's call and were put to
him:

1. **`008_user_story_mining.md:728`, the "Rows today" table.** A hand-written
   group-by over §3's index, fifteen lines below it. Lists `open` + unowned as
   F, O, S, T — the index has O `resolved`, S `refuted`, T `refuted`, F
   `boundary`. F appears under two kinds at once, and **AF, the only genuinely
   open row, is absent**. `check-ledger.ts:21` states in its own comment that it
   reads the index and the per-row cells only, so nothing catches this. The
   paragraph directly above the table records that row K was misread as unowned
   by an agent that had just read this table. The remedy is **delete or
   generate, not hand-correct** — hand-correcting is what already failed here.
2. **`docs/GLOSSARY.md:22`** defines `**row A–AD**`; the ledger runs to **AF**
   (`008:702-703`). A range is data, and data in prose goes stale even with a
   `Defined in` column — the fix is to delete the range, not to cite it better.
3. **`docs/TASKS.md` is 95 commits past its own reconcile stamp** (`53eead1` →
   HEAD) and its "Next phase" section is entirely `[x]`.
4. **`docs/TASKS.md` says "A queue, not a record" and is 163 of 300 lines of
   record** — the flaky-suite investigation, on an item marked deprioritised.
   "Ready to build" therefore contains nothing anyone can build.

Two peer sessions contributed and both are worth reading back:

- **`labkit-review`** established that the restatements are decoration — it went
  to §3's index for every one of six or seven status lookups and never used
  TASKS.md's copy. Its proposal: §3's index **already carries a plain-English
  name for every row** in a column nobody cites, so citations that carry it
  (`row F (artefacts are not versioned entities)`) remove the reason the
  restatements exist. `check-ledger.ts:61` already destructures that column.
- **`exo-ledger`** (external, read-only) reported the Rows-today defect and one
  false positive against `023`'s rescoring table. The false positive was
  **declined**: `023` line 3 is bold-dated *"Written 2026-08-20"* and row F was
  reclassified on the 21st, so it is a dated measurement and correct as frozen.
  Its own diagnosis of the error is the reusable part: *verifying a fact and
  endorsing an interpretation of it are separate acts.*

Not checked by either side, deliberately: whether `036` rebuts the boundary
rejection's two grounds.

## Next

Dan to rule on the four items above. If item 1 is taken, the mechanical route is
to extend `scripts/check-ledger.ts` — it already parses §3's index into
`Map<row, {status, line}>` at line 56, so a group-by by status is the same parse.
`exo-ledger` asked to be told either way, since its corpus quotes those lines.
