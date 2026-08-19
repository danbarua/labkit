# 001: Row V cleared, and the wrap tooling that wrote this

**Session wrap, 2026-08-19, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/016_the_standard_a_finding_is_held_to.md` for the
reasoning behind the domain change, and PJ-008's ledger rows V and X for what
it settled and what it did not.

## Goal

Resume the branch — which under CLAUDE.md's deferral rule meant clearing row V,
the one confirmed wrong answer shipping green — then build a `/wrap` skill and
wire it to a Stop hook.

## Changed

Two unrelated workstreams, eight commits, working tree clean.

**Row V** (`de94994` predictions, `1d4a9a0` build, `63db28a` close-out,
`77c7227` loose ends):

- `src/db/domain.ts` — `QUALIFIES: Criterion → EvidenceUnit`, the standard a
  finding is held to, as distinct from the work a condition gates.
- `src/domain/session.ts` — `recordAnalysis({ heldTo })` writes it;
  `whySupported()` reads it and now returns `standard` and `unmet`; `gate` is
  optional on `evaluateCriterion()`; `declareGate()` refuses a gate protecting
  nothing; check itemisation extracted to `checksFrom()` and shared by both
  readers.
- `src/domain/report.ts` — `SupportExplanation.standard` / `.unmet`, and
  `supported` documented as the three-way thing it now is.
- `tests/scenarios/s3b_criteria_qualify_only.test.ts` — new, 8 tests.
- `tests/scenarios/s3_robustness_disagrees.test.ts` — its row V assertion
  flipped from `true` to `false`, as the comment on it had demanded since S-3.
- `docs/project-journal/008_user_story_mining.md` (+135) — S-3b's scenario,
  predictions and outcomes; row V resolved, row X widened; stale status header.
- `docs/project-journal/016_…md` — new.
- `CLAUDE.md` — journal pointers, the verb list, the write-moment heuristic,
  and the deferral rule, which now names no live defect.

**Wrap tooling** (`3892281`, `c7ff1b8`, `570b9bf`, `94d3d80`): four files under
`.claude/skills/wrap/` — `SKILL.md`, `collect.sh`, `wrap-hook.sh`,
`record-entry.sh` — plus `docs/session-log/README.md`. The Stop/SessionStart
wiring is in `.claude/settings.json`, which `.gitignore` treats as personal and
is therefore **not committed**.

## Verified

Re-run at `94d3d80`, not carried over from earlier in the session:

- `bun test` → **145 pass, 0 fail**, 471 expect() calls, 15 files. (Exit code
  ignored deliberately — it lies here.)
- `bun run typecheck` → clean, no output.
- `npx depcruise src tests --output-type err` → **0 errors**, 2 warnings, both
  the pre-existing `no-orphans` on `src/index.ts` and `src/cli.ts`.
- `bun examples/full-lifecycle.ts` → ends `closed connection cleanly`, no raw
  graphids. Run at `1d4a9a0`, before the tooling commits, which touch no source.
- Row V's deletion probes, both by removing the code and re-running: without
  `QUALIFIES` the S-3 assertion returns to `true`; without the invalidation
  filter on the standard read, a superseded analysis's failed check disqualifies
  the claim its replacement supports.
- The hook's six branches, by piping sample JSON through `wrap-hook.sh`:
  session start, HEAD unchanged, `stop_hook_active`, HEAD moved (blocks with the
  right commit count), the same HEAD twice (silent), garbage stdin (exit 0).

Not run: nothing exercises the wrap shell scripts automatically. They have no
test harness and are checked by hand.

## Open

- **The Stop hook has never fired for real.** Hooks load at session start, so
  the wiring added this session could not take effect in it. First live test is
  after a restart.
- **Row X** is now the likeliest next confirmed wrong answer: a decisive failure
  disqualifies a *finding* permanently, not just work. Not demonstrated, and no
  scenario in the corpus would settle it — recorded in PJ-008 as unresolved and
  unowned rather than deferred.
- **Model (b) for row V was closed by argument, not demonstration.** Stated
  plainly in PJ-016 §4 rather than filed as though the scenario had refuted it.
- **Only supporting analyses are qualified.** A challenging analysis whose own
  prespecified checks fail still reads as a live challenge. Named in the query
  comment and PJ-016; the scenario that would settle it is a null result whose
  robustness checks disagree.
- Five corpus scenarios remain unbuilt: S-2, S-9, S-10, S-13, S-14.

## Next

Restart Claude Code so `.claude/settings.json`'s `SessionStart`/`Stop` entries
load, make a commit, and confirm the hook fires once and only once:

```sh
cat .claude/.wrap-state/*        # baseline pinned at session start, asked advancing
```

Then pick up the domain work at PJ-008 §2 — S-13 is the natural next scenario,
testing closure stability from the opposite direction to S-7.
