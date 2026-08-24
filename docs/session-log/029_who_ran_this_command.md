# 029: who ran this command

**Session wrap, 2026-08-24, on `feat/attribution`.** Not a decision record — see
`docs/project-journal/031_time_was_one_aspect_of_execution_context.md` for why
attribution was recorded at all and why nothing reads it yet.

**The baseline is wider than this entry.** It is still pinned at `72dbe15` from
the start of a long session; everything up to `3ca3cd0` is written up in entry
028 and is not restated here. This entry covers `eb431c3` alone.

## Goal

Add attribution: domain events should record *who* ran a command and against
which commit, beside *when*.

## Changed

**`eb431c3` — record who ran a command, beside when.** One commit, thirteen
files, on a branch cut from `c5f1050`. Open as PR #12.

- `src/domain/events.ts` — `AttributionContext`, `CommandContext`,
  `UNATTRIBUTED`; `DomainEvent.attribution` is **required**, which is what makes
  the compiler rather than a convention stop an unattributed event.
- `src/domain/core.ts` — `ResearchSessionOptions extends Partial<CommandContext>`
  rather than nesting under a `ctx` key. That choice is why no verb signature
  moved, all fourteen `this.clock.now()` reads are untouched, and **zero
  scenario files changed** — nesting would have rewritten 110 construction sites
  across 38 test files for identical behaviour.
- `src/domain/write.ts` — the `emit` choke point stamps `attribution`. One call.
- `src/mcp/server.ts` — `buildServer` now takes `(read, makeWrite: () =>
  WriteSurface)` and builds a surface per tool call, so attribution and
  `git_hash` are sampled per command. The event sink is **hoisted into
  `main()`** and passed to both halves; it used to default into existence inside
  whichever surface was constructed first, which fragments the stream silently
  once surfaces are per-call.
- `src/attribution.ts` (new) — provider interfaces and mocks, deliberately a
  peer of `src/cli.ts` rather than a member of any layer.
- `tests/attribution.test.ts` (new) — four tests; the last guards the sink hoist.
- `tests/mcp.test.ts`, `mcp-smoke.test.ts`, `subject-identity.test.ts` — three
  copies of the server composition, mirrored to the factory. `subject-identity`
  was a fourth copy nobody had listed; `typecheck` named it.
- `docs/project-journal/031_*.md` (new), `CLAUDE.md`, `docs/TASKS.md`.

Working tree clean.

## Verified

All run on `eb431c3`, none piped.

- `bun test` — **327 pass, 0 fail, exit 0**, 1762 assertions, 48 files, 60.53s.
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — no violations, 101 modules, 337
  dependencies.
- `check:tests-assert`, `check:doc-comments`, `check:stdout` — all clean.

**Both guards were watched to fail**, which is the part worth trusting:

- Changing one surface back to a defaulted sink turns the last test in
  `tests/attribution.test.ts` red (`3 pass, 1 fail`).
- Deleting `attribution:` from `emit` is a compile error —
  `Property 'attribution' is missing ... but required in type 'DomainEvent'`.

Both were reverted immediately and the suite re-run.

## Open

**Attribution is written and nothing reads it.** `read.ts` never touches
`events`, the sink is in-memory, no report surfaces an author. Deliberate and
argued in PJ-031 §5 rather than overlooked — a view can be rebuilt when a reader
appears, an unattributed command cannot. It is now a second and nearer trigger
for the durable sink than the one `src/domain/events.ts` names.

**The providers are mocks.** `mockGitContext` returns forty zeros. A real
provider shells out to `git rev-parse HEAD`, which would be the first subprocess
under `src/`; `src/attribution.ts` exists so that when it arrives it arrives in
one file the graph and the verbs do not import.

**A verb that stamps a node property and then emits reads the clock twice**, so
under a ticking clock those are different instants — `pose` writes `posed_at`
and then emits. Pre-existing, harmless under the frozen clocks the suite uses,
noted in PJ-031's judgment calls rather than fixed.

**Hookify rules still do not propagate to new worktrees** — carried unchanged
from entry 028, still unaddressed.

## Next

PR #12 awaits review. Nothing else queued; `docs/TASKS.md` carries only the
deprioritised flake ceiling and the "deliberately not being done" list.
