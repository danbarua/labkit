# 032: the terminal was getting the subset

**Session wrap, 2026-08-25, on `feat/cli-parity`.** Not a decision record — the
one design change here is argued in `src/cli.ts`'s header and in PR #20.

**A new entry rather than an extension of 031**, whose Goal line is about making
the event log durable. That work is merged (#19) and 031's own `## Next` names
this as the open question it left; no single Goal line covers both. The range
`collect.sh` reports is far wider than either — entries 025 through 031 cover
most of it, and only the three commits below are this session's.

## Goal

Bring the CLI's read surface to parity with the MCP read tools, so a person at a
terminal can ask what an agent can ask.

## Changed

Three commits, open as PR #20.

**`ed9da4d` — the CLI answers every question the MCP read tools answer.**

- `src/cli.ts` — twelve new commands (`claims`, `conflict`, `pursuits`,
  `origin`, `gate`, `criteria`, `design`, `contract`, `interpretation`,
  `reproduction`, `reproducibility`, `happened`) with a renderer each; the
  header's "four commands, not twenty" paragraph replaced; `--analysis` deleted,
  having been advertised, parsed and read by nothing.
- `src/cli.ts` `main()` — `pgEventLog(connection.db, ctx.tenantId)` handed to
  the `ReadSurface` instead of letting `SessionCore` default it.
- `src/domain/index.ts` — `ReproductionReport` and `ReproducibilityReport`
  exported; nothing outside `src/domain` could previously name what those two
  verbs return.
- `tests/cli.test.ts` — the five-name method list replaced by a derivation over
  `publicVerbsOf("src/domain/read.ts")`, reusing `tests/helpers/surface-coverage.ts`;
  nine renderer tests, one per distinction; a source assertion on the sink.
- `CLAUDE.md` — the parity and the sink, in the paragraph that already says the
  CLI is read-only by construction.

**`c1954e7` — regenerate the dependency graph.** Separate on purpose: the
checked-in file predated `attribution.test.ts` and `event-store.test.ts`, so it
renumbers every node and moves 634 lines. The one edge this branch adds is
`src/cli.ts` → `src/domain/event-store.ts`.

**`29ad8ec` — `happened` refuses a non-numeric `--since` or `--limit`.**

Working tree clean.

## Verified

None of it piped.

- `bun test` — **342 pass, 0 fail, exit 0**, 1713 assertions, 49 files.
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — no violations, 103 modules, 368
  dependencies.
- `check:tests-assert`, `check:doc-comments`, `check:stdout`,
  `check:no-stringly-typed` — all clean.
- `bun run docs:tools` — leaves `docs/mcp-tools.md` unchanged.

**Driven end to end against a live PGlite database**, which is the only check
that exercises the CLI's durable sink: a write through `WriteSurface` in one
process, read back by the CLI in another.

```
$ labkit happened
    1  2026-08-25T10:43:53.255Z  openEnquiry  LOE_1
         by smoke @deadbeef, minting Q_1, LOE_1
```

`labkit happened Q_1` finds the same act by what it *created*, not its subject.
The `.labkit` directory that smoke test wrote was deleted afterwards.

## Open

**The defaulted sink would have shipped a confidently wrong answer.**
`SessionCore` falls back to `inMemoryEventLog()`; in a process that exits after
one query that is an array nothing ever wrote to, so `labkit happened` would
have reported that nothing has ever happened against a full database. Found
before writing the command, not after. The guard is a source assertion —
standing up a database to observe an absence is a worse test.

**A test comment claimed no database is opened, and one is.** `main()` connects
before it dispatches, so the flag guard's `usageError` path opens PGlite like
every other. Caught by the `.labkit` directory the test left behind. Corrected
in place rather than deleted.

**No project-journal entry.** The only position reversed is `src/cli.ts`'s own
"four commands, not twenty", which attributed a bar to PJ-023 that PJ-023 did
not set — it asked for "the thinnest read-only MCP/CLI adapter", thin meaning no
logic of its own. One paragraph in the file a reader will actually hit.

**Carried forward from 031, untouched:** prose to SQL, dropping any timestamp
property, and `Computation.kind` holding `input.method`.

## Next

PR #20 awaits review. Nothing queued behind it — `docs/TASKS.md` still carries
only the deprioritised suite-ceiling item and the deliberate non-goals.

The user has named domain modelling as what comes after: the open rows in
PJ-008 §3's index are where that starts.
