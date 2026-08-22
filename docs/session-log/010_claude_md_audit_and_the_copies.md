# 010: Deleting the copies, then the first schema work

**Session wrap, 2026-08-22, on `feat/mcp-server`.** Not a decision record — the
rule this session adopted is in CLAUDE.md, "The one rule about documents", and
the reasoning behind it is PJ-025 through PJ-029.

## Goal

Audit CLAUDE.md and fix what was wrong. It turned into: find every place state
was written into prose and delete it — then start on the MCP build-out the
cleared queue exposed.

## Changed

Seven commits from `6d83a92`. Two are Dan's (`9ed4d63` applying the audit's
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

**`b89d4b7` is the first code**, and the first TASKS.md item ticked:

- **`src/mcp/schemas.ts`** (new) — Zod mirrors of the report types the read
  tools return, each held to its interface by two-way assignability, so drift
  fails `tsc --noEmit`.
- `src/mcp/tools.ts` — `outputSchema` on six of seven tools.
- `src/mcp/server.ts` — its doc block said no `outputSchema` was declared and
  why; that decision is reversed and the comment rewritten rather than left
  standing beside code that contradicts it.
- `tests/mcp.test.ts` — two tests: every declared schema parses its tool's real
  output, and the set of tools without a schema is *derived* and must equal
  `["known"]`.

Tree is clean.

## Verified

- `bun run typecheck` — **exit 0**, no diagnostics.
- `npx depcruise src tests --output-type err` — **exit 0**, no violations.
- `bun run check:doc-comments` — **exit 0**, green.
- `bun run check:tests-assert` — **exit 0**, green.
- `bun test` — **279 pass, 0 fail, 37 files**, 100.7s. Read from the output,
  not the exit code.

**The drift gate was demonstrated, not asserted** — each edit made, `tsc` run,
edit reverted:

| drift | tsc | runtime parse |
| --- | --- | --- |
| field added | fails | — |
| field removed | fails | — |
| field retyped | fails | — |
| **optional field dropped** | **passes** | fails only if the seed produces it |

Deleting `restsOn` (which the seeded session populates) fails two tests;
deleting `replacedBy` (which it does not) passes everything, `tsc` included.
That residual gap is written into `src/mcp/schemas.ts` and the test, and is
**not** described as closed.

Both type checks first failed with `TS2688: Cannot find type definition file for
'bun'`, because this worktree had no `node_modules`. Dan ran `bun install` and
both passed. Not a regression — but the failure names TypeScript rather than the
missing install, and the dependency-free checks stay green throughout, so a green
tick is available to mislead. That is now the first section of CLAUDE.md.

One self-inflicted instance of a documented trap: a re-run reported `exit=$?`
after `bun run typecheck | tail -5`, which is `tail`'s status. Redirected to a
file instead. CLAUDE.md warns about exactly this.

## Open

- **An optional field that no test data produces can be dropped from a schema
  and nothing notices** — neither `tsc` nor the parse test. Widening the seed in
  `tests/mcp.test.ts` is what narrows it; nothing else does.
- **`known` declares no `outputSchema`.** It returns a union, and the SDK's
  `normalizeObjectSchema` returns `undefined` for one rather than throwing, so
  declaring it makes every call fail validation (measured against the installed
  `@modelcontextprotocol/sdk@1.30.0`). Splitting it into two tools would fix
  that and is a wire change, so it was not done on the way past.
- **A new failure mode ships with this**: a drifted schema now turns a working
  read into `isError` for the caller, where before it produced stale docs.
- **`check:ledger` enforced two rules and only one was about a copy.** "At most
  one `demonstrated` row at a time" is now unenforced prose. Dan's call, made
  explicitly. `labkit-review` notes it is one `awk` over the index if it bites.
- **Row AF** wants a discriminator; **`036`'s two grounds** are unchecked. Both
  in TASKS.md.
- Both peer sessions have been told the deletions landed. `exo-ledger` was
  cleared to write up the row-K episode in its own corpus.

## Next

**Typed command objects for `src/domain/write.ts`** — its verbs take untyped
object arguments, and naming a type per command gives the write half what the
read half now has. It is the precondition for exposing any write tool over MCP.
Then the gap analysis, last, because it decides how much of the write side gets
exposed at all.

This entry is closed. The next piece of work opens 011.
