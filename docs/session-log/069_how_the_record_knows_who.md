# 069: how the record knows who

**Session wrap, 2026-08-28, on `feat/attribution-grade`.** Not a decision record
— `AttributionHow` in `src/domain/events.ts` carries the argument, and #81
carries the two corrections that got it there.

**A fifth entry for this session**; 061 is #83's, 064 is #66's, 066 is #57's,
068 is the adapter rename. `062`, `063`, `065` and `067` are a peer session's.
Baseline is still 061's, so the range is far wider than what is below.

## Goal

Build the earned half of #81: let the record say *how* it came by an actor's
name, not just what the name was.

## Changed

**`ed87549`** — `attribution_how` end to end.

- `src/domain/events.ts` — `AttributionHow`, the field on
  `AttributionContext`, and `RecordedAttribution` for the read side.
- `src/attribution.ts` — `how()` on `SessionContextProvider`; each provider
  grades itself.
- `src/db/schema.ts`, `drizzle/0005_equal_elektra.sql`,
  `src/db/migrations.ts` — a nullable column, no default, and the `EMBEDDED`
  line.
- `src/domain/event-store.ts` — both directions.
- `src/cli/views/events.ts`, `src/mcp/{schemas,tools}.ts` — the readers.
- `scripts/smoke-cli.sh` — the earning case as a standing check.

Working tree clean. Open as PR **#109**.

## Verified

`bun run check` — **all 19 passed**.

**Mutation:** `personContext` returning `observed` unconditionally fails
`check:cli`, mutation confirmed by `git diff --stat`.

Three gates caught things review would not have. `check:migrations` refused the
migration until it declared a lock strategy. `check:doc-comments` caught
`AttributionContext`'s header orphaned by a type inserted above it — the second
time today. And the MCP output schema failed at runtime because `tools.ts` maps
event fields by hand and I had added the grade everywhere except there; the
`Exact<>` compile gate cannot see a hand-written mapping.

## Open

**The type split is the part to understand before changing this.**
`AttributionContext.attribution_how` is required and `RecordedAttribution`'s is
nullable. One shared type would let `null` leak backwards into writers, and a
writer that can omit the grade is the state the field exists to end. `null`
means *recorded before LabKit knew how it knew*, and the migration is its only
producer.

**Two values are named and undeclared.** `corroborated` arrives with the
`agent-bus whoami` handshake that writes it; `no_handshake` has no producer
while the MCP gate refuses an unregistered write at all. Declaring either now
would be the objection this session made twice to other people's enums.

**`git_hash` gets no grade**, and that is a decision rather than an oversight —
forty zeros are already visibly fake, and grading a commit is a different axis
that would arrive untested.

**Still not built: `trace_id`.** It has no producer — the CLI has none, stdio
MCP has none, `Mcp-Session-Id` exists only in stateful HTTP. And a harness
session id is too coarse to be one: **153 merged commits on `main` carry this
session's id**, so joining on it joins everything to everything. Measured, not
argued.

## Next

`gh pr view 109`.

Then #81 is down to what has no producer, so the live queue is the domain-model
open questions — **#63**, **#64**, **#65** — and #55's residual: a `Task` hangs
off nothing but a gate, so *why does this work exist* is unanswerable. That one
is named and deliberately unbuilt, waiting for a reader that gets a
**confidently wrong** answer rather than an empty one.
