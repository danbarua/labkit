# 031: the log that finally had a reader

**Session wrap, 2026-08-25, on `feat/event-store`.** Not a decision record — the
reasoning is in `docs/project-journal/032_the_log_that_finally_had_a_reader.md`
and PR #19.

**A new entry rather than an extension of 030**, whose own Goal line reads
"housekeeping *before* the persisted event store". That work is merged (#13-#18)
and this is what it was clearing the way for; no single Goal line covers both.

## Goal

Make the event log durable, so the attribution that has ridden on every event
since PJ-031 can be read by something.

## Changed

**`eec49b8` — the event log is durable, and every write verb is atomic.** Open
as PR #19. 26 files, +1919/−812.

- `src/db/schema.ts`, `drizzle/0003_tense_hawkeye.sql` — `public.labkit_event`,
  four indexes, one of them GIN on `created`.
- `src/domain/event-store.ts` (new) — `pgEventLog(db, tenantId)`, on the **same
  connection as the graph**, which is what makes an event commit with the writes
  it describes.
- `src/domain/events.ts` — `EventSink` async, `EventFilter`, `select()`;
  `DomainEvent` gains `seq` and `created`; `Operation` is a union of the
  eighteen verb names rather than `string`.
- `src/db/graph.ts` — the minted-ids buffer, `drainMinted()`, and the residue
  guard as one line in `inTransaction`'s existing `finally`.
- `src/domain/write.ts` — `emit` async with a typed `subject`, and **all 18
  verbs wrapped in `inTransaction`**.
- `src/domain/read.ts`, `src/mcp/*` — `whatHappened()`, the `what_happened`
  tool, and `main()` wired to the durable sink.
- `tests/event-store.test.ts` (new, six tests); three interruption tests in
  `tests/domain-session.test.ts` rewritten; ten `events.all()` sites awaited.
- `scripts/check-no-stringly-typed.ts` — `emit`'s allowlist entry deleted, which
  is what it was there for.
- `CLAUDE.md`, `docs/TASKS.md`, `docs/mcp-tools.md`, PJ-032.

Working tree clean.

## Verified

None of it piped. `bun test` **331 pass, 0 fail, exit 0**, 1641 assertions, 49
files. `typecheck`; `depcruise` (103 modules, 366 dependencies);
`check:migrations`, `check:no-stringly-typed`, `check:prop-classes`,
`check:doc-comments`, `check:tests-assert`, `check:stdout` — all clean.
`docs:tools` leaves `docs/mcp-tools.md` unchanged.

**Two guards watched to fail.** Removing the residue clear reddens one test;
removing the tenant filter from the sink reddens all six.

**Driven end to end against `bun run mcp`**, which is the only check that
exercises the durable sink — every in-process MCP test builds its own in-memory
one:

```json
{ "seq": 1, "operation": "openEnquiry", "subject": "LOE_1",
  "created": ["Q_1", "LOE_1"], "attribution_label": "mock-session" }
```

One event for `openEnquiry`, not `pose` + `pursue`; both minted nodes in
`created`; attribution readable by the thing that wrote it.

## Open

**The plan had atomicity backwards and the correction was most of the work.**
All 18 `emit` calls sat *after* their closure returned — including the ten verbs
that already opened a transaction. Caught by reading four of them rather than
trusting a script that measured lexical position.

**Three verbs became atomic that never were.** `sharpen`, `pursue` and
`declareGate` had tests asserting an interruption leaves an unreachable orphan;
they now assert it leaves nothing. One had named the trigger that would
obsolete it — a new reader of `NARROWS` — and the event store did it from the
other side instead.

**The `search_path` trap caught this repo a second time.** The migration
recorded itself as applied and created nothing under `public`; the table was in
`ag_catalog`, because 0001's `SET search_path` is still the active session
setting and drizzle-kit emits unqualified DDL. `0002`'s header records the same
thing happening to the natural-id functions. Everything in `0003` is qualified
by hand now.

**No `check:emit-awaited`.** The plan allowed one, conditional on catching
something when written. It caught nothing — `tsc` had already found every site —
and a checker with no first catch does not clear this repo's bar.

**Still deliberately unbuilt:** prose to SQL (twelve properties no query
matches), dropping any timestamp property (all three have production readers),
and `Computation.kind` holding `input.method`, which the string taxonomy exposed
and did not settle.

## Next

PR #19 awaits review. Nothing queued after it — `docs/TASKS.md` now carries only
the deprioritised suite-ceiling item and the "deliberately not being done" list,
the durable sink having been removed from it.

The nearest real question is whether `what_happened` wants a CLI counterpart;
`src/cli.ts` is read-only by construction and this is a read.
