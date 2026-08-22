# 005: two stale documents, row F closed, the read surface's two doors, and a sweep for prose that lies

**Session wrap, 2026-08-21, on `feat/domain-consumer`.** Not a decision record —
see `docs/project-journal/` for the reasoning behind anything below.

**The range is wider than this entry.** Four commits in it belong to other
entries: `53eead1`/`4ec6325` amend `004`, and `202e6cd`/`57656b4` are
`labkit-minion`'s entry `006`, which covers its own work (row F's verdict,
PJ-027, the sweep, `reproducibilityOf`, PJ-028). Don't read this as a record of
those.

**This entry outgrew itself and was not closed in time.** It spans three goals;
`close-entry.sh` exists for exactly that and should have been run twice. Noted
rather than papered over, because it is the same failure `004` had at 1,165
lines.

## Goal

Reconcile `004` and `TASKS.md`, both of which Dan found stale in one reading;
build `src/mcp/`; then take my half of a deliberate sweep for code that
disagrees with the prose beside it.

## Changed

### Documents that had stopped matching the world

`53eead1`, `4ec6325`, `7855f7b`, `a637e3f`, `c27df4c` — `004`'s open questions
and TASKS.md's six stale items; the wrap hook's claim that a session id always
survives (a fork re-issues it — `be5374e7` → `74f9b207`); and **never suggest
`git reset --hard` to another session**, after telling `labkit-minion` to while
it held five uncommitted files. It rebased instead.

### Row F, closed

`96a50a3`, `b482675`, `afcbc58`, `079798f` — merged `labkit-minion`'s verdict:
**`boundary`**. Four reporting bites, all fixed by carrying `natural_id`, which
already existed; a version-of relationship would have fixed none, so they are
evidence *against* the row. **Row F was the only candidate in this project's
history that would have required a first new noun, and it did not.** Row T
refuted (`b5256bd`).

### The read surface's second door

- `3b21bea` — **a question posed in April was reported `open` in March.** An
  external review predicted it from reading `whatWasKnown()`; demonstrated
  before anything changed, then cleared by `Question.posed_at`. Second defect in
  the same method: `at` was validated with `Date.parse()` and compared as
  **text** against UTC stamps, so an instant with an offset sorted wrongly and
  the survey reported a question unresolved four hours after it was resolved.
- `70817a2` — **`src/mcp/`, seven tools**, plus four CLI adapter defects the same
  review found. The MCP tools return the whole structured report; the CLI's
  hand-picked prose had fallen behind the report types three times over, and all
  three were correct in `--json` all along.
- `da8b99d` / `84da50d` — the MCP shutdown path, wrong then right. See **Open**.
- `93d23c0`, `30f975b` — CLAUDE.md, the ledger's row Z cell and TASKS.md brought
  level; then CLAUDE.md's "edge labels 19 → 24", which is 25.

### My half of the PJ-028 sweep

- `7c6853f` — **two tests that asserted nothing.**
  `tests/leader-election.test.ts` had no `expect(` at all (the only such file in
  the repo, cited in CLAUDE.md as proving election works); three processes each
  self-electing primary on three separate databases would have passed. It now
  asserts one primary, two secondaries, cross-visibility and distinctness.
  `tests/trace.test.ts` asserted `expect(true).toBe(true)` under a comment
  saying the test existed so removing the guard would be loud — it wasn't. The
  in-flight set is now observable via `tracedInFlight()` and the test asserts
  **both** directions, since "empty afterwards" is also satisfied by a tracker
  that records nothing. Injection-verified.
- `0c214ca` — **`examples/full-lifecycle.ts` had been dead for 221 commits**,
  reading through views deleted on 2026-08-19. See **Open** for why nobody
  noticed. It reads through `graph.query()` now, ends with an explicit
  `process.exit(0)`, and asserts the provenance chain instead of leaving
  graphid-spotting to a reader.
- `20fef4f` — the headline (`restingOn`'s docstring recommending the mistake its
  own commit fixed, and an `IdentifiedArtefact` comment naming the new name as
  the old one); the row Z detector, which never flipped because it scanned a
  survey **row** while the capability arrived as a **method**; the read-only
  claim widened to both surfaces via `tests/helpers/read-only.ts`; four stale
  prose sites; and `check:stdout` replacing a transplanted check that could not
  fail.

Working tree clean apart from this entry.

## Verified

- `bun test` → **261 pass / 0 fail**, 36 files, 867 assertions (background run,
  counts from the output).
- `bun run typecheck` → clean. `npx depcruise src tests --output-type err` →
  **no violations at all**, 0 errors *and* 0 warnings — the standing
  `no-orphans: src/index.ts` warning went when that file stopped being a stub.
- `check:ledger`, `check:doc-comments`, `check:tests-assert`, `check:stdout` →
  all green. The last two are new; `check:tests-assert` was landed **red** by
  `labkit-minion`, naming the two tests it was written from, and `7c6853f` is
  what makes it green.
- `bun examples/full-lifecycle.ts` → **exit 0**, chain walked
  `Q_68 → LOE_68 → EU_69 → EV_69 → CLM_68`, no raw graphids.
- **MCP end to end over real stdio**, not only the in-process transport:
  `initialize` / `tools/list` / `tools/call` against a seeded record, three
  consecutive runs, all three responses, exit 0 in ~0.35s. `enquiry_status`
  matches what `bun run src/cli.ts enquiry LOE_1` prints for the same record.

## Open

**I committed a fix that was dead code, and the check that passed it was
invalid.** `da8b99d` hung a handler off `transport.onclose`; `StdioServerTransport`
never subscribes to stdin's `end`, so it never fired. It was "verified" by
`${PIPESTATUS[1]:-$?}` — `PIPESTATUS` is bash, this shell is zsh — which fell
through to `$?` after a pipeline and reported `wc -l`. That is the trap
CLAUDE.md documents, walked into while writing a commit message citing the same
file. The second attempt then exited before writing a response it had already
computed. `84da50d` drains in-flight calls first.

**A rule that tells readers to ignore a signal removes the only watcher that
signal had.** CLAUDE.md said to ignore `full-lifecycle`'s exit code because it
exited 99 on success. The rule was added *the same day the script broke, after
it broke*, by the commit whose subject was closing out the last verification
step. Both halves are fixed: the exit code means something again, and the rule
is gone. This is the sharpest thing the session produced and it is now in
CLAUDE.md in general form.

**A check that could not fail.** `scripts/check-progress-to-stdout.sh` was a
transplant citing a version, a source file and CLI flags that never existed
here. It ran green on a fiction for months — PJ-028's shape one level out from
the tests. Replaced by `check:stdout`, which guards something that became
load-bearing today: stdout **is** the MCP protocol channel.

**What the read-only tests do not prove**, now written down rather than implied:
`graph.query()` takes arbitrary Cypher and `SET` is Cypher, so the check is *"no
write verb is called"*, not *"writing is impossible"*.

**The sweep's inferred pile is unverified and unactioned** — see
`labkit-minion`'s report. One item in particular (`write.ts`'s claim that every
compound verb runs in `inTransaction()`) should get one demonstration per verb
before anyone edits: getting it backwards would wrap things that should not be.

**Ledger:** F `boundary`, T `refuted`, S `refuted`, O/AD/AE `resolved`, **AF the
only `open` row and unowned** — its own cell says it earns nothing under §5.

## Next

Run `.claude/skills/wrap/close-entry.sh` on this entry — it covers everything to
HEAD and spans three goals, which is the condition that script exists for.

Then merge `labkit-minion`'s `feat/minion` (through `cfb639b`): PJ-028's
self-correction, the regenerated dependency graph, and the `agtype.ts` /
`read.ts` / `report.ts` prose fixes. `check:tests-assert` goes green on its side
once it takes `7c6853f`.
