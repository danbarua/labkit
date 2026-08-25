# 034: breaking up the monolithic CLI

**Session wrap, 2026-08-25, on `refactor/cli-modules`.** Not a decision record —
the framework choice is argued in PR #23 and in `src/cli/`'s own headers.

Range is exactly this session: baseline `868e45c`, the merge of PR #21, closed
with `close-entry.sh` before this work began.

## Goal

Port the 1435-line `src/cli.ts` into `src/cli/` by separation of concerns, on a
real argument-parsing library, without breaking the working one on the way.

## Changed

**PR #23**, three stages on one branch. Complete.

**`006b22e` — stage 1: skeleton, views, read commands.**
`src/cli/cli.ts` (composition root, 54 lines), `program.ts` (assembles commands,
connects to nothing), `session.ts` (the wrap: connect, resolve, build both
surfaces over one graph and one durable sink, run, print, close — `Run` is
*injected*, which is what lets tests drive commands with no database),
`args.ts` (argv to domain values, on zod, throwing commander's
`InvalidArgumentError`), `views/*` (the eighteen renderers, extracted verbatim),
`commands/reads.ts`, `tests/cli/{views,coverage,json-contract}.test.ts`,
commander 15.

**`ca72106` — split the example from the check.** `bun run example` was a smoke
test wearing the name. Now: `examples/full-lifecycle.sh` shows each command as
typed with its real output; `scripts/smoke-cli.sh` (`bun run check:cli`) keeps
the assertions; `examples/full-lifecycle.md` is the walkthrough rather than
archaeology; `docs/persistence-spikes.md` **new** takes the spike outcomes.

**`a9234d8` — stage 2: the eighteen write commands.**
`src/cli/commands/writes.ts`. The five `void` verbs answer `{ok, acted}`,
declared locally — nothing under `src/cli/` imports `src/mcp`.
`scripts/diff-cli.sh` **new**, the old-vs-new transcript differential.
The contract test's seed now drives the write **commands**, so eleven write
answers are parsed against the MCP schema for the same verb.

**`4bf6a9f` — stage 3: cutover.** `bin`, `dev`, `build` → `src/cli/cli.ts`.
`src/cli.ts`, `tests/cli.test.ts` and `scripts/diff-cli.sh` deleted.
`scripts/check-test-teardown.ts` **new** (`bun run check:test-teardown`).
`tests/cli/wiring.test.ts` and `tests/cli/args.test.ts` **new** — the
assertions the deleted file was about to take with it.
`check-stdout.sh` narrows back to one exemption. `CLAUDE.md`, `docs/TASKS.md`,
`docs/dependency-graph.mmd`.

**`390f156`, `c70820a`, and this commit** are the entry.

Working tree clean.

## Verified

None of it piped.

- `bun test` — **352 pass, 0 fail, exit 0**, 1732 assertions, 53 files.
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — no violations, 120 modules, 421
  dependencies.
- `check:doc-comments`, `check:tests-assert`, `check:test-teardown`,
  `check:stdout`, `check:no-stringly-typed`, `check:prop-classes`,
  `check:migrations`, `check:no-tracked-symlinks` — all clean.
- `bun run example`, `bun run check:cli`, `bun run dev --help` — all exit 0.
- **The two CLIs printed byte-identical transcripts** across twenty-odd
  commands, run one last time immediately before the old one was deleted. The
  post-cutover example output is byte-identical to the pre-cutover old-CLI
  transcript, checked directly.
- **Watched to fail, three times**: a `console.log` in `views/format.ts` reddens
  `check:stdout`; a bullet changed from `-` to `*` reddens `check:cli-diff` with
  38 lines; removing the `afterAll` from the contract test reddens
  `check:test-teardown` by name.

## Open

**`bun run build` produces a binary that cannot migrate a fresh database.**
`runMigrations()` resolves `drizzle/` from `import.meta.url`, which inside a
compiled bundle is `/$bunfs/root/…`, so it dies with
`Can't find meta/_journal.json file`. **Measured against both entry points** —
the old `src/cli.ts` built as a binary fails identically — so it predates the
split and was never caused by it. The binary has simply never been run against
an empty database, and `bun run build` exits 0 on something that cannot work.
`docs/TASKS.md` carries it with two shapes of fix, neither chosen.

**Compare old and new test names whenever a test file is retired.** The deleted
`tests/cli.test.ts` had 24 tests: eight obsoleted by commander generating its
own help and parsing, thirteen already moved — and three that had done neither,
including the two guarding confidently-wrong answers (durable sink, real
attribution). Nothing but the name comparison would have surfaced it.

**A missing `afterAll` is invisible from the file that causes it.** Stage 1's
contract test never tore down; its tenant graph survived into
`tests/scenarios/s18`, whose reader found a question this file had established.
Deterministic, and the red file was not the wrong one. Now checked.

**A document can be worse than the code it describes.**
`examples/full-lifecycle.md` had a hundred lines of dated spike outcomes above
the example, as a checklist with one item unticked — read by a newcomer as
outstanding work they were meant to action. The same instinct had put forty
lines of commit-message prose in the script header. No check looks at this.

**oclif was ruled out by this repo's own build target** — *"We do not support
bundling"*, and the only bundler-viable discovery strategy cannot use
`oclif.manifest.json`, which is the artefact that would have justified it.

**`--json` is the MCP document, with one recorded exception.** Four MCP tools
wrap a bare array because `structuredContent` must be an object; the test
unwraps. `what_happened` genuinely reshapes, and that divergence is asserted so
it reddens if MCP stops.

**Coverage runs one way only**: every verb needs a command, a command needs no
MCP tool. A terminal-only command cannot redden anything.

**`--no-ansi` deliberately absent.** Nothing emits an escape sequence yet.

## Next

PR #23 awaits review. Nothing queued behind it.

Named and not built: shell completions and a generated `docs/cli.md` from the
command declarations — both were reasons to consider oclif, both are now
straightforward because `program.ts` builds the whole command surface without a
database. `bun run docs:tools` is the pattern to copy.
