# 045: a pinned DX Principles header

**Session wrap, 2026-08-26, on `docs/dx-principles`.** Not a decision record —
the header itself is the argument, and it is pinned at the top of `CLAUDE.md`.

Open as **PR #33**.

**The range is wider than this entry.** The wrap baseline still points at
`7fbc84f`, so `git log` from there also contains the merges of PR #30, #31 and
#32 — entries 042, 043 and 044. Only `2d3b398` is this entry's. The baseline is
re-pinned when this entry is closed, so the next one starts clean.

## Goal

The first buildable item of `docs/TASKS.md`'s documents group: a pinned DX
Principles header for `CLAUDE.md`, modelled on `agent-bus`'s `AGENTS.md`.

## Changed

**`2d3b398` — a pinned DX Principles header for CLAUDE.md.**

- `CLAUDE.md` — six rules at the top of the file, inside the same
  DO-NOT-MODIFY fence `agent-bus` uses. `## The one rule about documents` now
  points at the sixth principle instead of restating it.

Working tree clean at `2d3b398`; pushed.

## Verified

- `bun run check` — all 16 pass.
- **The one figure the header asserts that was not already established** —
  "1,055 lines when deleted" — checked against the commit that removed
  `docs/mcp-tools.md`. Every other incident it cites was already recorded in
  `CLAUDE.md` or in this log.

## Open

**The header is a claim about this repo's failures, and it should be read as
falsifiable.** Six rules, six incidents, all from `CLAUDE.md` or the last week
of this log. If one turns out to be misremembered, the rule loses its evidence
and should be argued again or dropped — that is the point of naming the incident
rather than stating the rule alone.

**It was written before the sweep it defines.** The next item is the CLAUDE.md
stale-prose sweep, and these rules are what "stale" now means. Written in that
order deliberately: sweeping first would have been sweeping to no standard.

**One rule is borrowed rather than earned here.** The tense heuristic — a
sentence about how the code *is* goes stale, one about what *changed* does not —
is `agent-bus`'s, taken because it converts the sixth rule from a judgement call
into a grep. Everything else names a LabKit incident.

`docs/TASKS.md` still holds the rest of the documents group and the DB-layer
loose ends.

## Next

PR #33 awaits review.

Then the CLAUDE.md sweep. `CLAUDE.md` is 1,555 lines; the pinned header is the
standard to apply, and the expectation is that it removes more than it adds.
Start by grepping for the tense tell — sentences asserting how something *is* —
in the sections the last fortnight rewrote underneath: the connection model,
the testing patterns, and the persistence layer.
