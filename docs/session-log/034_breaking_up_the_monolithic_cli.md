# 034: breaking up the monolithic CLI

**Session wrap, 2026-08-25, on `refactor/cli-modules`.** Not a decision record —
the framework choice is argued in PR #23 and in `src/cli/`'s own headers.

Range is exactly this session: baseline `868e45c`, the merge of PR #21, closed
with `close-entry.sh` before this work began.

## Goal

Port the 1435-line `src/cli.ts` into `src/cli/` by separation of concerns, on a
real argument-parsing library, without touching the working one.

## Changed

Open as **PR #23**. Staged deliberately: stages 2 and 3 push to the same branch.

**`006b22e` — stage 1: skeleton, views and read commands.**

- `src/cli/cli.ts` — the composition root, 54 lines: which program, which
  runner, what a failure does to the process.
- `src/cli/program.ts` — assembles the commands, knows how to connect to
  nothing, so a test can build the whole surface and inspect it.
- `src/cli/session.ts` — the wrap: connect, resolve tenant, build both surfaces
  over one graph and one durable sink, run, print, close. `Run` is *injected*
  into the command modules, which is what lets the contract test drive every
  command with no database.
- `src/cli/args.ts` — argv to domain values, on zod; every coercion throws
  commander's `InvalidArgumentError`, so a caller's typo stays distinct from a
  verb's deliberate refusal.
- `src/cli/views/{format,knowledge,enquiry,gates,analysis,events}.ts` — the
  eighteen renderers, extracted verbatim with their comments.
- `src/cli/commands/reads.ts` — one declaration per read verb.
- `tests/cli/{views,coverage,json-contract}.test.ts` — the thirteen view tests
  moved unchanged; read-verb coverage derived from the command modules' source;
  all sixteen read commands parsed against the MCP output schemas.
- `scripts/check-stdout.sh` — exempts both composition roots by name rather than
  the whole `src/cli/` tree.
- `package.json`, `bun.lock` — commander 15.

**`ca72106` — split the example from the check.** `bun run example` was a smoke
test wearing the name: it captured every answer into a variable and printed
`ok <label>`, so a reader learnt nothing about what LabKit prints.

- `examples/full-lifecycle.sh` — now shows each command as typed with its real
  output and a few lines of intent per section. Header cut from ~40 lines of
  archaeology to 12.
- `scripts/smoke-cli.sh` **new** (`bun run check:cli`) — the assertions,
  unchanged. The only thing that runs the CLI process against a real database.
- `examples/full-lifecycle.md` — was archaeology plus a hundred-line checklist
  of August spike outcomes, with the example below the fold. Rewritten as the
  walkthrough with real output inline.
- `docs/persistence-spikes.md` **new** — those spike outcomes, as findings
  rather than checkboxes. One had been sitting unticked and reading as
  outstanding work when it was a negative result.
- `CLAUDE.md`, `.claude/skills/wrap/SKILL.md` — the two script names.

**`src/cli.ts` is untouched** and still the entry point: `bin`, `dev` and
`build` all point at it. Both trees pass their tests.

Working tree clean.

## Verified

None of it piped.

- `bun test` — **364 pass, 0 fail, exit 0**, 1847 assertions, 52 files.
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — no violations, 119 modules, 428
  dependencies.
- `check:stdout`, `check:tests-assert`, `check:doc-comments` — clean.
- `bun run example` — exit 0. `bun run check:cli` — exit 0, 15 assertions.
- **Watched to fail**: a `console.log` added to `src/cli/views/format.ts`
  reddens `check:stdout`, which is what the by-name exemption is for.
- **Driven end to end against a live database**: seeded with the *old* CLI, read
  back with the *new* one.

Not run: `check:pglite-concurrency`, `check:migrations`, `check:prop-classes`,
`check:no-stringly-typed` — nothing here is in their scope.

## Open

**oclif was ruled out by this repo's own build target**, and the finding is
worth keeping: its docs say *"We do not support bundling"*, and the only
bundler-viable discovery strategy is the one that cannot use
`oclif.manifest.json`. `bun build --compile` is already a script here, so the
manifest — which would have given auto-docs and a checkable command list — is
mutually exclusive with the binary the repo already builds.

**`--json` is the MCP document, with one real exception.** Four MCP tools wrap a
bare array in a single-key object because `structuredContent` must be an object;
the test unwraps. `what_happened` genuinely reshapes — flattening attribution,
defaulting an absent `seq` to `0` — and the CLI prints the `DomainEvent` as
held. Asserted as a divergence, so it reddens if MCP stops reshaping.

**Coverage runs one way only**, and that was a stated requirement: every read
verb needs a command, a command needs no MCP tool. A terminal-only command
cannot redden anything.

**A document can be worse than the code it describes.** `examples/full-lifecycle.md`
had a hundred lines of dated spike outcomes above the example, written as a
checklist with one item unticked — read by a newcomer as outstanding work they
were meant to action. The same instinct had put forty lines of commit-message
prose in the script header. Neither was caught by any check.

**`--no-ansi` deliberately absent.** Nothing emits an escape sequence yet, and a
flag that switches off something the program does not do is a promise rather
than a feature.

**Two entry points write to stdout until stage 3.** The exemption in
`check-stdout.sh` names both; it narrows again when the old file goes.

## Next

Stage 2: the eighteen write commands, into `src/cli/commands/writes.ts`, same
branch and PR. Then stage 3 — flip `bin`/`dev`/`build`, narrow the stdout
exemption, delete `src/cli.ts` and `tests/cli.test.ts`, and generate shell
completions and `docs/cli.md` from the command declarations.

PR #23 awaits review of stage 1 first.
