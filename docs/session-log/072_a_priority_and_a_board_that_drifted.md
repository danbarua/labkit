# 072: a priority, and a board that had drifted

**Session wrap, 2026-08-29, on `chore/board-priority`.** Not a decision record —
the triage's reasoning lives in the issues, and the script says why it refuses
what it refuses.

**Entry 067 is closed and stays dated 2026-08-28.** This opens rather than
extending it because the date changed: a session log is exempt from the
staleness rule *because* it is a measurement of its date, and putting the 29th's
work under the 28th's header would spend that exemption.

**Only `8870b0f` is this session's.** Everything between the baseline and HEAD
is a peer merge (#105 through #113), covered by entries 068 to 071.

## Goal

Dan's: where are #55 and #81, what is next, and re-triage the board — with a
Priority field, because Status alone does not say what to look at first.

## Changed

**`8870b0f` — a Priority on the board, and re-triage against reality.**
Open as **PR #115**. `scripts/apply-board-status.sh` only; no repo behaviour.

The board had drifted from the repo three ways: #57 and #95 closed and still in
Todo, #104 with no status at all, and eight Todo items in no order.

## Verified

- `bun run board:status` applied all eighteen items and re-ran clean.
- **Two new guards, both made red on purpose.** The Status and Priority lists
  must name the same issues — two hand-written lists drift, and a priority
  missing from one is the untriaged-by-default case this script already refuses,
  one level in where it is harder to see. And no issue may hold two priorities.
- `bun run check` — **20/20**. The sweep gained a check from a peer overnight.

**#104's missing status is why `board:status` had been failing** — not a bug in
it. The guard was doing its job between the two runs.

## Open

**#81 is the only P0, and it is a rule rather than a ranking.** CLAUDE.md
permits at most one demonstrated wrong answer shipping green and requires that
clearing it be the next thing built. `labkit pose` and
`labkit --author dan pose` write **byte-identical** attribution — one from the
OS, one from a string nobody checked. Populated and uniform, with one of them a
claim, which is a wrong answer rather than an empty one.

**The design for it is settled and the code has none of it.** An outside review
(Grok, via Dan) corrected the issue's own proposal: `Observed<string>` /
`Claimed<string>` aliases cannot answer it, because the string taxonomy is
erased before anything runs, so a compile-time alias never reaches
`public.labkit_event` and no dashboard can slice on it. `{ value, how }` stored
on the event is the answer. Grepped `src/attribution.ts` and
`src/domain/events.ts` on 2026-08-29: the grade is in prose only.

**#55 is close to closeable and nobody has decided.** Four of its six questions
answer since #93; the remainder was split into #98. Worth a verdict rather than
carrying it.

**#98 stays Parked, checked rather than assumed.** Nothing gets a *wrong* answer
without it — a task's purpose is unanswerable, not incorrect, and PJ-011 §5 is
explicit that an empty result earns nothing because any missing feature
manufactures one. It unparks when someone shows a purpose reported wrongly.

## Next

**#81.** The design is settled, the wrong answer is demonstrated, and it is the
one issue the deferral rule names as owed.
