# 034: breaking up the monolithic CLI

**Session wrap, 2026-08-25, on `refactor/cli-modules`.** Not a decision record —
the framework choice is argued in PR #23 and in `src/cli/`'s own headers.

Range is exactly this session: baseline `868e45c`, the merge of PR #21, closed
with `close-entry.sh` before this work began.

## Goal

Port the 1435-line `src/cli.ts` into `src/cli/` by separation of concerns, on a
real argument-parsing library, without touching the working one.

## Changed

Open as **PR #23**, staged. Stage 3 pushes to the same branch.

**`006b22e` — stage 1: skeleton, views, read commands.**

- `src/cli/cli.ts` — the composition root, 54 lines.
- `src/cli/program.ts` — assembles the commands, connects to nothing, so a test
  can build the whole surface and inspect it.
- `src/cli/session.ts` — the wrap: connect, resolve tenant, build both surfaces
  over one graph and one durable sink, run, print, close. `Run` is *injected*
  into the command modules, which is what lets the contract test drive every
  command with no database.
- `src/cli/args.ts` — argv to domain values, on zod; every coercion throws
  commander's `InvalidArgumentError`, so a caller's typo stays distinct from a
  verb's deliberate refusal.
- `src/cli/views/{format,knowledge,enquiry,gates,analysis,events}.ts` — the
  eighteen renderers, extracted verbatim with their comments.
- `src/cli/commands/reads.ts`, `tests/cli/{views,coverage,json-contract}.test.ts`,
  `scripts/check-stdout.sh` (both roots exempt by name), commander 15.

**`ca72106` — split the example from the check.** `bun run example` was a smoke
test wearing the name: it captured every answer into a variable and printed
`ok <label>`.

- `examples/full-lifecycle.sh` — shows each command as typed with its real
  output and a few lines of intent per section.
- `scripts/smoke-cli.sh` **new** (`bun run check:cli`) — the assertions,
  unchanged.
- `examples/full-lifecycle.md` — was archaeology plus a hundred-line checklist
  with the example below the fold; now the walkthrough with real output inline.
- `docs/persistence-spikes.md` **new** — those spike outcomes, as findings.
- `CLAUDE.md`, `.claude/skills/wrap/SKILL.md` — the two script names.

**`a9234d8` — stage 2: the eighteen write commands.**

- `src/cli/commands/writes.ts` — one declaration per `WriteSurface` verb. The
  five that return `void` answer `{ok, acted}`, the shape MCP uses, **declared
  locally rather than imported** — nothing under `src/cli/` imports `src/mcp`.
- `scripts/diff-cli.sh` **new** (`bun run check:cli-diff`) — runs the example
  against both CLIs and diffs the transcripts. Scaffolding; dies at cutover.
- `tests/cli/json-contract.test.ts` — its seed now drives the **write commands**
  rather than the surfaces, so eleven write answers are captured as they happen
  and parsed against the MCP schema for the same verb. Missing `afterAll` added.
- `tests/cli/coverage.test.ts` — write-verb coverage, symmetric with reads.
- `docs/dependency-graph.mmd` regenerated.

**`390f156`, `c70820a`** are this entry.

**`src/cli.ts` is untouched** and still the entry point: `bin`, `dev` and
`build` all point at it. Both trees pass their tests.

Working tree clean.

## Verified

None of it piped.

- `bun test` — **366 pass, 0 fail, exit 0**, 1871 assertions, 52 files.
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — no violations, 120 modules, 433
  dependencies.
- `check:stdout`, `check:tests-assert`, `check:doc-comments` — clean.
- `bun run example`, `bun run check:cli`, `bun run check:cli-diff` — all exit 0.
- **The two CLIs print byte-identical transcripts** across twenty-odd commands,
  timestamps and commit hash blanked and nothing else.
- **Watched to fail, twice**: a `console.log` in `views/format.ts` reddens
  `check:stdout`; a bullet changed from `-` to `*` in the same file reddens
  `check:cli-diff` with 38 differing lines.

Not run: `check:pglite-concurrency`, `check:migrations`, `check:prop-classes`,
`check:no-stringly-typed` — nothing here is in their scope.

## Open

**A missing `afterAll` is invisible from the file that causes it.** Stage 1's
contract test never tore down, so its tenant graph survived into
`tests/scenarios/s18`, whose reader found a question this file had established
and failed `expect(known.established).toEqual([])`. Deterministic — the two
files run together reproduce it — and no check looks for a missing teardown.
Fixed in stage 2.

**oclif was ruled out by this repo's own build target.** Its docs say *"We do
not support bundling"*, and the only bundler-viable discovery strategy is the
one that cannot use `oclif.manifest.json`. `bun build --compile` is already a
script here, so the manifest — which would have given auto-docs and a checkable
command list — is mutually exclusive with the binary the repo already builds.

**`--json` is the MCP document, with one real exception.** Four MCP tools wrap a
bare array because `structuredContent` must be an object; the test unwraps.
`what_happened` genuinely reshapes — flattening attribution, defaulting an
absent `seq` to `0` — and the CLI prints the `DomainEvent` as held. Asserted as
a divergence, so it reddens if MCP stops reshaping.

**Coverage runs one way only**, and that was a stated requirement: every verb
needs a command, a command needs no MCP tool. A terminal-only command cannot
redden anything.

**A document can be worse than the code it describes.**
`examples/full-lifecycle.md` had a hundred lines of dated spike outcomes above
the example, as a checklist with one item unticked — read by a newcomer as
outstanding work they were meant to action. The same instinct had put forty
lines of commit-message prose in the script header. Neither was caught by any
check.

**`--no-ansi` deliberately absent.** Nothing emits an escape sequence yet.

**Two entry points write to stdout until stage 3.** The exemption in
`check-stdout.sh` names both; it narrows again when the old file goes.

## Next

Stage 3, same branch and PR: flip `bin`/`dev`/`build` to `src/cli/cli.ts`,
narrow the stdout exemption to one root, delete `src/cli.ts`,
`tests/cli.test.ts` and `scripts/diff-cli.sh`, then generate shell completions
and `docs/cli.md` from the command declarations.

Run `bun run check:cli-diff` one last time before deleting the old CLI — it is
the only thing that compares them, and it goes with it.
