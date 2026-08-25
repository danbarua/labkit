# 033: the CLI can write

**Session wrap, 2026-08-25, on `feat/cli-writes`.** Not a decision record — the
reasoning is in `docs/project-journal/033_the_constraint_protected_the_wrong_thing.md`
and PR #21.

Range is exactly this session: baseline `78e77f7`, the previous entry's own wrap
commit, closed with `close-entry.sh` before this work began.

## Goal

Retire the CLI's read-only constraint, add the write verbs, and replace the
outdated `examples/` script with a shell one driving the CLI.

## Changed

Two commits, open as PR #21. **Stacked on PR #20** (`feat/cli-parity`), which is
still unmerged and which this rewrites the same file as.

**`8f57fef` — the CLI writes.**

- `src/cli.ts` — eighteen write commands, one per `WriteSurface` verb, each
  printing what it minted; a `WriteSurface` built beside the read one over the
  same graph and the same sink; `--db`, `--author`; the parser now keeps every
  occurrence of a flag and refuses one it does not know; a top-level handler so
  a domain refusal prints as a message rather than a stack.
- `src/attribution.ts` — `gitContext` (`git rev-parse HEAD`, `""` on any
  failure) and `personContext`. The first subprocess under `src/`, exactly where
  that file predicted it would arrive. The MCP server keeps the mocks.
- `src/db/connect.ts` — `labkitHome()` reads `LABKIT_HOME`; `connectDb` defaults
  to it. `LABKIT_DB_URL` still wins.
- `examples/full-lifecycle.sh` **new**, `examples/full-lifecycle.ts` **deleted**
  — every line a CLI command, hermetic via `--db` into a temp dir, fifteen
  assertions on the answers.
- `tests/cli.test.ts` — the two structural read-only tests deleted; write parity
  derived from `src/domain/write.ts`; a narrower test that the CLI calls nothing
  on its `TenantGraph`; the sink and attribution assertions extended to the
  write half. `tests/helpers/read-only.ts` **deleted**, no other consumer.
- `package.json` — `bun run example`.
- `CLAUDE.md`, `examples/full-lifecycle.md`, `.claude/skills/wrap/SKILL.md`, and
  PJ-033.

**`2c9d4a4` — regenerate the dependency graph.** Separate because two files
leaving renumbers every node.

Working tree clean.

## Verified

None of it piped.

- `bun test` — **346 pass, 0 fail, exit 0**, 1761 assertions, 49 files.
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — no violations, 103 modules, 370
  dependencies.
- `check:doc-comments`, `check:tests-assert`, `check:stdout`,
  `check:no-stringly-typed`, `check:prop-classes`, `check:migrations`,
  `check:no-tracked-symlinks` — all clean.
- `bun run docs:tools` — leaves `docs/mcp-tools.md` unchanged.
- `bun run example` — **exit 0**, 15 assertions. Watched to fail: with the
  `promote` line stubbed out it exits **1** and names the assertion.

Not run: `check:pglite-concurrency`.

## Open

**A negative control found an assertion that asserted nothing**, and it is the
finding worth carrying forward. The lifecycle script passed with its `promote`
step removed, because `whatIsKnown` reads `Claim.kind === "confirmatory"` and
**two unrelated acts write that field** — `promote()` sets it, and
`recordAnalysis()` sets it from a conclusion's `standing`. Fixed by recording
the conclusion exploratory so the promote line is load-bearing, verified in both
directions.

The domain question under it is **not** settled: `Claim.kind` carries *this was
prespecified* and *this has been promoted* under one value, and a reader cannot
tell them apart. PJ-033 §4.

**A test opened a database in the repo root** and its comment said it did not.
Found by the `.labkit` directory it left behind; now pointed at a temp dir via
`--db`, which doubles as the only test of that flag.

**Two doc references were stale in the same way.** CLAUDE.md and the wrap
skill both named `bun examples/full-lifecycle.ts` by path.

**Carried forward, untouched:** prose to SQL, dropping any timestamp property,
`Computation.kind` holding `input.method`.

## Next

PRs #20 and #21 await review, in that order — #21 rebases onto `main` once #20
merges.

The user has named domain modelling as what comes after. `Claim.kind` carrying
two facts is one concrete entry point; PJ-008 §3's open rows are the other.
