# 037: the linter that fought the typechecker

**Session wrap, 2026-08-25, on `chore/biome-linter`.** Not a decision record —
the reasoning for each disabled rule is in `biome.jsonc`, beside the rule.

Range is exactly this session: baseline `e7834ae`, the merge of PR #25, closed
with `close-entry.sh` before this work began.

## Goal

Task 1 from `docs/TASKS.md`: read biome's linter findings rather than
bulk-suppressing them, and turn the linter on.

## Changed

One commit, open as **PR #26**.

**`f6919fe` — the linter is on.**

- `biome.jsonc` — `linter.enabled: true`, `recommended: true`, and two rules off
  **by name with their reason beside them**: `noNonNullAssertion` and
  `noExplicitAny`.
- `package.json` — `check:lint`, now in the sweep (15 steps).
- 216 violations fixed across 40 files: unused imports and variables, useless
  renames, one `useImportType`, two `noAssignInExpressions`, and 106 destructured
  bindings tests bound and never read. Three of those emptied their pattern and
  became plain `await` statements.
- `docs/TASKS.md` — renumbered. **1. Colour in the CLI** (new), **2. The
  compiled binary cannot migrate**. The linter item deleted, per the file's rule.
- `CLAUDE.md` — both biome scripts, and the discriminator below.

Working tree clean.

## Verified

- `bun run check` — **all 15 pass, exit 0**. `bun test` 352 pass / 0 fail.
- `biome lint .` reports nothing.
- The disabled rules were **tested rather than argued**: biome's own unsafe fix
  applied to the 148 `noNonNullAssertion` sites produced twelve `TS2322`s.

## Open

**Nothing from this work.** `check:lint` passes and the two exclusions carry
their reasons.

Carried forward, both in `docs/TASKS.md`: colour in the CLI (Task 1), and the
compiled binary that cannot migrate (Task 2).

## Next

Task 1: colour in the CLI. `src/cli/views/` are pure functions returning
strings, tested through fixtures in `tests/cli/views.test.ts` — whatever carries
the colour has to stay visible to those fixtures or they stop checking what they
check. `--no-ansi` ships with it, plus a TTY check so `$(labkit analyse …)`
still yields a bare handle, `NO_COLOR` honoured, and `--json` untouched.

PR #26 awaits review first.
