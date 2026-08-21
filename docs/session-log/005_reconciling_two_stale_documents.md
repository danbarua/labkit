# 005: two stale documents, row F closed, and the read surface's two doors

**Session wrap, 2026-08-21, on `feat/domain-consumer`.** Not a decision record —
see `docs/project-journal/` for the reasoning behind anything below.

**The range is wider than this entry.** Two commits in it (`53eead1`, `4ec6325`)
amend entry `004` rather than adding work; `004` covers what they correct. This
entry exists because `close-entry.sh` (`b71b2be`) closed `004` first, which is
the whole point of having it.

## Goal

Two goals, in sequence, and the entry should probably have been closed between
them: reconcile `004` and `TASKS.md`, both of which Dan found stale in one
reading; then build `src/mcp/` — the last piece of PJ-023's next phase.

## Changed

### Documents that had stopped matching the world

- `53eead1` / `4ec6325` — `004`'s open questions listed the SVG decision as
  pending after it had been made by deleting the SVG. The fix then asserted
  `package-lock.json` was gone from `main` while `git ls-tree` output printed
  moments earlier said otherwise. Corrected.
- `7855f7b` — TASKS.md: six stale items, each verified against the ledger or the
  working tree rather than recalled. Row **T** was listed `open` and described as
  `refuted` in the same section.
- `a637e3f` — `wrap-hook.sh` claimed the session id always survives. True for
  compaction (both triggers tested), never tested for forks; `labkit-minion`
  demonstrated a fork of `be5374e7` coming up as `74f9b207`. SKILL.md gains the
  worktree seeding recipe, since `.claude/.wrap-state/` is untracked and a fork
  into a new worktree fails **silently**.
- `c27df4c` — **never suggest `git reset --hard` to another session.** Told
  `labkit-minion` to reset onto a merge; it held **five uncommitted files** at
  that moment. It rebased instead. A parallel session's *worktree* state is
  invisible to you in a way its branch state is not.

### Row F, closed

- `96a50a3`, `b482675`, `afcbc58` — merged `feat/minion`'s row F work and its
  verdict: **`boundary`**. Four reporting bites, all fixed by carrying
  `natural_id`, which already existed; a version-of relationship would have
  fixed none, so the bites are evidence *against* the row. **Row F was the only
  candidate in this project's history that would have required a first new noun,
  and it did not.** Node labels stay at thirteen. Row **T** refuted, four for
  four (`b5256bd`).

### PJ-027

- `ecbd29f`, `6710ad9` — **prose agreeing with itself is not evidence the code
  agrees with the prose.** Three unrelated places held a rule in a comment and
  code that ignored it. Commissioned after this entry first recorded it as a
  finding and left it for Dan.

### The read surface's second door

- `3b21bea` — **a question posed in April was reported `open` in March.** An
  external review predicted it from reading `whatWasKnown()`; demonstrated
  before anything changed (`tests/consumer/historical_survey.test.ts`, failing
  on both counts), then cleared by `Question.posed_at` — one property, one
  writer, no migration, no new noun. Second defect in the same method: `at` was
  validated with `Date.parse()` and compared as *text* against UTC stamps, so
  `2026-03-01T09:00:00-05:00` sorted before `10:00Z` and the survey reported a
  question unresolved four hours after it was resolved.
- `70817a2` — **`src/mcp/`, seven tools**, plus four CLI adapter defects the same
  review found. The MCP tools return the whole structured report; the CLI's
  hand-picked prose had fallen behind the report types three times over
  (`accepted-as-unresolved` rendering as plain `open`; `withdrawn`/`challenged`/
  never-examined all rendering as bare "NOT supported"; exploratory-vs-
  confirmatory closure dropped). All were correct in `--json` all along. The arg
  parser also read a flag's *value* as the positional when the flag came first,
  and `why` had no way to answer `whySupported()`'s ambiguity refusal.
- `da8b99d` / `84da50d` — the MCP shutdown path, wrong then right. See **Open**.
- `93d23c0` — CLAUDE.md, the ledger's row Z cell, and TASKS.md brought level with
  the above.

Working tree clean apart from this entry.

## Verified

- `bun test` → **258 pass / 0 fail**, 35 files (`93d23c0`; run in background,
  exit 0, counts read from the output rather than the code).
- `bun run typecheck` → clean. `npx depcruise src tests --output-type err` → **0
  errors**, 1 warning (`no-orphans: src/index.ts`, pre-existing stub).
- `bun run check:ledger`, `bun run check:doc-comments` → clean.
- **End to end over real stdio**, not only the in-process transport: a seeded
  record driven through `initialize` / `tools/list` / `tools/call`, three
  consecutive runs, all three responses, exit 0 in ~0.35s. `enquiry_status`'s
  answer matches what `bun run src/cli.ts enquiry LOE_1` prints for the same
  record.
- `tests/mcp.test.ts` drives the real server over the SDK's `InMemoryTransport`
  — real protocol, real seeded graph, in-process.

## Open

**I committed a fix that was dead code, and the check that passed it was
invalid.** `da8b99d` hung a handler off `transport.onclose`; `StdioServerTransport`
subscribes to stdin's `data` and `error` and never to `end`, so it never fired.
It was "verified" by `${PIPESTATUS[1]:-$?}` — `PIPESTATUS` is bash, this shell is
zsh — which fell through to `$?` after a pipeline and reported `wc -l`. That is
the trap CLAUDE.md documents in two places, walked into while writing a commit
message that cited the same file. Measured without the pipe: hung for the full
timeout. The second attempt then exited before writing a response it had already
computed. `84da50d` counts in-flight calls and drains them first.

**A test that encodes the bug it was written to pin** is a fourth shape worth
looking for, and PJ-027 does not name it. `clock_ordering.test.ts`'s "before
anything was decided, everything is open" passed because the assertion and the
defect agreed with each other. That is PJ-027's comment failure one level up.

**Ledger:** F `boundary`, T `refuted`, S `refuted`, O/AD/AE `resolved`, **AF the
only `open` row and unowned** — its own cell says it earns nothing under §5.

## Next

`labkit-minion` has the **PJ-027 sweep** brief: fan out by region
(`src/db/`, `src/domain/`, `tests/`, `scripts/` + `.claude/skills/`), four
finding categories kept apart, candidates verified before they reach me, and a
second deliverable asking whether any instance had a **checkable** form. Its
report is the next thing to act on.

`close-entry.sh` should be run on this entry before the next piece of work
starts — it now spans two goals, which is the condition that script exists for.
