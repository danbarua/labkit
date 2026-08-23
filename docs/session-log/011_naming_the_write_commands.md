# 011: Named write commands, and the tool surface as prose

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record. The
change bar this had to clear is in CLAUDE.md, "Changing the graph model"; the
queue item it closes is in `docs/TASKS.md`.

## Goal

Two pieces of the MCP build-out: give `src/domain/write.ts`'s verbs named
argument types so an adapter can hold a command before issuing it, then serve
the tool surface as human-readable documentation generated from the tools.

## Changed

Two code commits.

**`0b9261d` — named write commands.**

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

**`eda11a2` — the documentation resource.**

- **`src/mcp/docs.ts`** (new, 156 lines) — renders every tool as markdown:
  what it answers, what it takes, what comes back, field by field.
- `src/mcp/server.ts` — registers it at **`labkit://docs/tools`**,
  `text/markdown`. A resource rather than a tool because it takes no arguments
  and describes the server rather than the record. It holds no `ReadSurface`,
  so it can be read against a server whose database is unreachable.
- `tests/mcp.test.ts` — three tests, none naming a tool or a field.

Two choices worth keeping. It is **generated on each read** — no checked-in copy
to fall behind, no generator to remember to re-run, so it cannot be stale by
construction. And the types are rendered from **JSON Schema rather than the Zod
objects**, because JSON Schema is what crosses the wire: a reader is shown the
shape they will receive. `known` declares no `outputSchema` (the SDK cannot
carry a union), so the document renders both of its shapes rather than neither.

## Verified

- `bun run typecheck` — exit 0.
- `npx depcruise src tests --output-type err` — exit 0, no violations.
- `bun run check:doc-comments` — green. This one matters here: every field's
  doc comment moved with its field rather than being retyped, and that check is
  what says so.
- `bun run check:tests-assert`, `bun run check:stdout` — green.
- `bun test` after `0b9261d` — **279 pass, 1 fail, 280 tests, 172.7s**.
- `bun test` after `eda11a2` — **283 pass, 0 fail, 283 tests, 38 files, 101.4s**.

**The failure was not the change.** S-11 timed out at 6807ms against bun's fixed
5000ms ceiling — the flake TASKS.md documents, not an assertion failure. It
appeared because the five gates were running concurrently with the suite; the
same tree ran 100.7s the previous evening. `tests/scenarios/` alone on a quiet
machine: **157 pass, 0 fail, 67.8s**. Checked rather than assumed, because a
ceiling crossing and a real regression produce the same summary line.

**The documentation test was wrong first, and that is the part to read.** It
names no tool and no field — every expectation is computed from `TOOLS` — and
that was not sufficient. Its first version read `properties` at the top level
only and **passed with every nested field name missing from the document**;
found by breaking the generator and watching it not fail, not by review. Fixed
to walk to the leaves, then re-broken to confirm it fails. Being derived does
not stop a test checking the wrong thing, which is PJ-028's argument arriving
one level up from where it was written.

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
- The documentation resource covers the **read** tools, because those are the
  only ones. Whatever it says about writes will be generated the same way or it
  will be a second copy.

## Next

`docs/TASKS.md`, "Ready to build", third item — read the corpus for the minimum
domain surface an agent needs to track work in LabKit rather than in Markdown.
Do that before building any write tool, since it decides which of the fifteen
commands should be reachable at all.
