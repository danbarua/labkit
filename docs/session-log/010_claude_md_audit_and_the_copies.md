# 010: An audit of CLAUDE.md that ended in deleting the copies

**Session wrap, 2026-08-22, on `feat/mcp-server`.** Not a decision record — the
rule this session adopted is in CLAUDE.md, "The one rule about documents", and
the reasoning behind it is PJ-025 through PJ-029.

## Goal

Audit CLAUDE.md and fix what was wrong. It turned into: find every place state
was written into prose, and delete them.

## Changed

Five commits from `6d83a92`. Two are Dan's (`9ed4d63` applying the audit's
CLAUDE.md fixes, `8c1ae80` a domain-consumer feedback draft); `f707108` and
`916f45a` are this entry.

**`77c3755` is the session** — 189 insertions, 628 deletions:

- `scripts/check-ledger.ts` **deleted**, with its `package.json` entry. It
  existed to hold two copies of a row's status to each other; the copies are
  gone.
- `docs/project-journal/008_user_story_mining.md` — the **32 per-row
  `**Status:**` fragments** stripped, and the "Rows today" column dropped. §3's
  index table is now the only place a row's status lives. The Kind/Means legend
  stayed, because the glossary now points at it.
- `CLAUDE.md` — a **"First, in a fresh clone or worktree"** section added at the
  top (from `bun install` outward); **"The one rule about documents"** added
  below it; ~125 lines of row state and journal retelling deleted from the
  opening, keeping the rules those entries produced.
- `docs/TASKS.md` — **300 → 62 lines**. Actionable items only. The flaky-suite
  entry compressed from 163 lines to ~18: symptom, the two fixes by SHA, the
  refuted-hypothesis list, and the paired-measurement warning.
- `docs/GLOSSARY.md` — status table replaced by a pointer; the stale `row A–AD`
  range deleted.
- `docs/mcp-server/002_mcp-server_kickoff.md` — deleted (was untracked), its
  three TODOs folded into TASKS.md "Ready to build", which was empty before.

Tree is clean.

## Verified

- `bun run typecheck` — **exit 0**, no diagnostics.
- `npx depcruise src tests --output-type err` — **exit 0**, no violations.
- `bun run check:doc-comments` — **exit 0**, green.
- `bun run check:tests-assert` — **exit 0**, green.
- `bun test` — **not run**. No source changed in this range.

Both type checks first failed with `TS2688: Cannot find type definition file for
'bun'`, because this worktree had no `node_modules`. Dan ran `bun install` and
both passed. Not a regression — but the failure names TypeScript rather than the
missing install, and the dependency-free checks stay green throughout, so a green
tick is available to mislead. That is now the first section of CLAUDE.md.

One self-inflicted instance of a documented trap: a re-run reported `exit=$?`
after `bun run typecheck | tail -5`, which is `tail`'s status. Redirected to a
file instead. CLAUDE.md warns about exactly this.

## Open

- **`check:ledger` enforced two rules and only one of them was about a copy.**
  Index-vs-cells agreement died correctly. "At most one `demonstrated` row at a
  time" was a rule about the single source itself, and is now unenforced prose
  again — which is PJ-025's failure mode. Flagged to Dan; his call was explicit.
- **Row AF** is the one row wanting a discriminator. In TASKS.md, unowned.
- **`036` rebutting the boundary rejection's two grounds** — raised by
  `exo-ledger`, unchecked by anyone, deliberately.
- **`exo-ledger` asked whether it may write up the row-K episode** (a warning
  paragraph sitting directly above the table that misled the agent it warns
  about) in its own external corpus. Dan has not answered; it is holding.
- Neither peer session has been told the deletions landed. `exo-ledger`'s corpus
  quotes lines that no longer exist.

## Next

Ship code, not prose. `docs/TASKS.md` "Ready to build" now has the MCP work in
order: `outputSchema` on the tools in `src/mcp/tools.ts`, then typed command
objects for `src/domain/write.ts`, then the gap analysis — that one last,
because it decides how much of the write side gets exposed.
