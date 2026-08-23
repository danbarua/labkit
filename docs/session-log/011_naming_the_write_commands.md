# 011: Naming the write half's command shapes

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record. The
change bar this had to clear is in CLAUDE.md, "Changing the graph model"; the
queue item it closes is in `docs/TASKS.md`.

## Goal

Give `src/domain/write.ts`'s verbs named argument types, so an adapter can hold
a command before issuing it. Second of the three MCP build-out items.

## Changed

One commit, `0b9261d`. 360 insertions, 150 deletions.

- **`src/domain/commands.ts`** (new, 206 lines) — fifteen command interfaces,
  the counterpart to `report.ts`. `report.ts` is what a read returns; this is
  what an act takes, and only one of the two existed before.
- `src/domain/write.ts` — inline anonymous shapes replaced by the named types
  (−180 lines, all of it moved rather than deleted). `recordAnalysis` had no
  nameable argument type at all: it took
  `Parameters<WriteSurface["recorded"]>[0]`. It takes `RecordAnalysisCommand`
  now, shared with the private `recorded()`.
- `src/domain/index.ts` — the fifteen exported from the barrel.
- **`tests/domain-commands.test.ts`** (new) — holds each command in an
  annotated variable, issues it, then asserts the record.
- `docs/TASKS.md` — the item ticked.

`pose`, `openEnquiry` and `stateCriterion` take a single scalar and are
deliberately not wrapped.

## Verified

- `bun run typecheck` — exit 0.
- `npx depcruise src tests --output-type err` — exit 0, no violations.
- `bun run check:doc-comments` — green. This one matters here: every field's
  doc comment moved with its field rather than being retyped, and that check is
  what says so.
- `bun run check:tests-assert`, `bun run check:stdout` — green.
- `bun test` — **279 pass, 1 fail, 280 tests, 172.7s.**

**The failure was not the change.** S-11 timed out at 6807ms against bun's fixed
5000ms ceiling — the flake TASKS.md documents, not an assertion failure. It
appeared because the five gates were running concurrently with the suite; the
same tree ran 100.7s the previous evening. `tests/scenarios/` alone on a quiet
machine: **157 pass, 0 fail, 67.8s**. Checked rather than assumed, because a
ceiling crossing and a real regression produce the same summary line.

**The extraction is verified by `tsc`, not by reading.** Structural typing means
an unchanged shape has an unchanged type, so a faithful extraction is exactly
the one where no call site needs editing — and none did. That is why the commit
does extraction only: a redesign in the same commit would not have been
checkable this way.

## Open

- **The gap analysis is the last "Ready to build" item** and the one that
  decides how much of the write side gets exposed over MCP. `labkit-review`'s
  note on it, worth carrying in: the honest version has to include what Markdown
  was doing that LabKit **will not** do, not only the reverse.
- The residual gaps from entry 010 stand: an optional field no test data
  produces can be dropped from an MCP output schema unnoticed, and `known`
  still declares no `outputSchema` because the SDK cannot carry a union.
- No write tool is exposed over MCP yet. These types are the precondition, not
  the feature.

## Next

`docs/TASKS.md`, "Ready to build", third item — read the corpus for the minimum
domain surface an agent needs to track work in LabKit rather than in Markdown.
Do that before building any write tool, since it decides which of the fifteen
commands should be reachable at all.
