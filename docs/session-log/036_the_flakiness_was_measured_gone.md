# 036: the flakiness was measured gone

**Session wrap, 2026-08-25, on `chore/tasks-audit`.** Not a decision record —
the measurement and its margin live in CLAUDE.md's "Testing patterns".

Range is exactly this session: baseline `24fa9a7`, the squash-merge of PR #24,
closed with `close-entry.sh` before this work began.

## Goal

Validate the claim sitting at the top of `docs/TASKS.md` — that the suite
crosses bun's 5000ms ceiling and tests fail — after several clean
`bun run check` runs suggested it might be stale.

## Changed

One commit, open as **PR #25**.

**`e888cb4` — the flakiness is measured gone.**

- `docs/TASKS.md` — the "Deprioritised" section **deleted**, not annotated. The
  file's own first paragraph says a finished item is deleted and git history is
  the record. 97 → 53 lines, and the queue now opens on something actionable.
- `CLAUDE.md` — the measurement, the margin table, the harness method (the next
  re-measurement needs it), and the eight refuted hypotheses. The 7-15 figure is
  kept, re-tensed, and labelled as describing the suite of 2026-08-24.

Working tree clean.

## Verified

The claim itself was the work, so the numbers are the deliverable.

**Five full runs under saturated CPU**, 10 cores in busy loops, `bun test`
redirected to a file: **352 pass, 0 fail** every time, 128-147s each. The
documented rate was 7-15 different tests per run under exactly that load.

**The margin, measured by lowering the ceiling rather than adding load:**

| ceiling | failures |
| --- | --- |
| 500ms | 41 |
| 1000ms | 103 |
| 2000ms | 2 |
| 3000ms | 1 |
| 5000ms (default) | 0, five times |

Roughly 2.5× headroom, one test still crossing at 3000ms.

`bun run check` — all 14 pass, exit 0.

## Open

**No cause is established.** Three changes were each measured against this on
2026-08-24 and none moved the failure median at the time; the suite is now much
faster than when any was measured alone, and PGlite 0.5.7 landed the same day.
A bisect would settle it and nobody has run one. CLAUDE.md says so rather than
naming a winner.

**The headroom is 2.5×, not infinite.** A slower machine, or a few more
query-heavy tests, would put this back. The suite fits; the mechanism was not
removed.

**`tests/leader-election.test.ts` is a separate, known flake** and was not
isolated in this measurement — it passed in all five runs, which is luck as much
as anything. It deliberately needs genuine concurrent connections and sits on an
open upstream bug.

Carried forward, both in `docs/TASKS.md`: the compiled binary that cannot
migrate, and biome's unread linter.

## Next

PR #25 awaits review.

Then `docs/cli.md`, generated from `src/cli/program.ts`'s command surface in the
shape of `docs/mcp-tools.md` — `scripts/render-tool-docs.ts` and
`src/mcp/docs.ts` are the pattern. Then the biome linter triage, and shell
completions from the same command surface.
