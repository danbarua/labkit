# 011: The MCP server becomes usable — commands, docs, and writes

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record. The
change bar this had to clear is in CLAUDE.md, "Changing the graph model"; the
queue item it closes is in `docs/TASKS.md`.

## Goal

Finish the MCP build-out. Three pieces: name the write verbs' argument types,
serve the tool surface as generated documentation, then **expose write tools** —
which meant deleting the tests that forbade them.

## Changed

Three code commits.

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

**`b8b5f0d` — the server writes.**

The MCP server had been read-only for one batch of work, and that had hardened
into **three tests that would fail on the first write tool** — two grepping
`src/mcp/` source for the string `WriteSurface` and for any write verb name, one
asserting `readOnlyHint` on every tool. Dan's question was the right one: read-
only is a property of a batch of work, not a design position, and an agent that
can only read a record nothing lets it write is querying an empty graph.

- Both greps deleted. The third test kept, with `readOnlyHint` **derived** from
  which list a tool is in rather than asserted of all of them.
- `tests/cli.test.ts` and `tests/helpers/read-only.ts` **untouched** — the CLI is
  read-only by design, building a `ReadSurface` and never a `WriteSurface`,
  which is a stronger property than any grep.
- Six write tools: `pose`, `pursue`, `open_enquiry`, `record_observations`,
  `record_analysis`, `close_enquiry`.
- `pursuits_of` added on the read side. `known` returns question ids and nothing
  returned the enquiry ids beneath them, so a reconnecting agent could not find
  an enquiry to record against.
- `buildServer(read, write)` — **neither optional**. An optional write half is
  the read-only mode surviving as an API shape.

## Verified

- `bun run typecheck` — exit 0.
- `npx depcruise src tests --output-type err` — exit 0, no violations.
- `bun run check:doc-comments` — green. This one matters here: every field's
  doc comment moved with its field rather than being retyped, and that check is
  what says so.
- `bun run check:tests-assert`, `bun run check:stdout` — green.
- `bun test` after `0b9261d` — **279 pass, 1 fail, 280 tests, 172.7s**.
- `bun test` after `eda11a2` — **283 pass, 0 fail, 283 tests, 38 files, 101.4s**.
- `bun test` after `b8b5f0d` — **285 pass, 0 fail, 38 files, 92.5s**.

**The end-to-end loop is asserted over the wire**: open an enquiry, record
observations, record an analysis, close it, then ask `enquiry_status`,
`why_supported` and `known` about it — every act a `callTool`, no
`ResearchSession` constructed. Remove the write half and the first read fails.
Two refusals asserted beside it: a second close is an error, and half an answer
(`answered_by_proposition` without its analysis) is refused rather than
silently abandoning an enquiry the caller believed it was answering.

**The failure was not the change.** S-11 timed out at 6807ms against bun's fixed
5000ms ceiling — the flake TASKS.md documents, not an assertion failure. It
appeared because the five gates were running concurrently with the suite; the
same tree ran 100.7s the previous evening. `tests/scenarios/` alone on a quiet
machine: **157 pass, 0 fail, 67.8s**. Checked rather than assumed, because a
ceiling crossing and a real regression produce the same summary line.

**`ObservationsRef` carries an `ART_` id, not an `EU_` one.** `record_analysis`
resolves each `from` id by natural-id prefix, and the ref's *name* says
"observations" — but `recordObservations` returns the **artefact's** id. Read off
the verb's return rather than inferred from the type name, which is the only
reason it is right.

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
- **`promote` is not exposed, and the loop stops at `provisional`.** A concluded
  question rests on a finding nobody promoted, so it is kept out of
  `established` deliberately — reading "what do we actually know" must not
  include a lunchtime sweep. `tests/mcp.test.ts` asserts that as the state of
  affairs rather than as a defect, and that assertion will need changing when
  `promote` lands. It is first in the next pass.
- **Nine of the fifteen commands are still unexposed**, all following the
  identical pattern.
- **Write events do not survive the process.** `main()` uses the default
  in-memory sink. The graph is the durable record and always was; nothing
  persists the event stream, and no caller has asked for one.
- The gap-analysis queue item was **deleted, not done** — a corpus review
  standing in front of obvious work. Both gaps it would have looked for (no
  write tools at all; no way to discover an enquiry id) were found by building.

## Next

`docs/TASKS.md`, "Ready to build" — **`promote` first**, then the other eight
write tools. The pattern is fixed now: a `writeTool` entry in
`src/mcp/tools.ts` with flat string inputs the handler assembles into the
command, an output schema in `src/mcp/schemas.ts` gated by `Exact<>`, and a
case in the end-to-end loop test. Verbs returning `void` take
`acknowledgementSchema`.

This entry is closed. The next piece of work opens 012.
