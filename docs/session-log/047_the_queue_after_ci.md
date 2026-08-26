# 047: the queue after CI

**Session wrap, 2026-08-26, on `chore/tasks-update`.** Short on purpose — this
is bookkeeping, not a unit of work. Entry 046 covers the MCP wiring surface and
merged with PR #35.

Open as **PR #36**.

## Goal

Bring `docs/TASKS.md` back in line with what is built, now that CI is green.

## Changed

**`ab751f3`** — `docs/TASKS.md`. The CI group deleted, two documents items
deleted, five new items added.

## Verified

- `bun run check` — all 17 pass.
- **CI is green on the merged code**: two consecutive successful builds on
  `feat/one-binary`, the second being the first with both `bun test` callers
  routed through the script.
- PR #34 is closed unmerged, as entry 046 said it should be.

## Open

Three groups remain, and the second and third are new since the queue was last
written:

- **Documents** — the CLAUDE.md stale-prose sweep, and
  `docs/persistence-spikes.md` becoming `docs/persistence.md`. The sweep now has
  a standard to sweep against, which it did not when it was queued: the pinned
  header's sixth rule, and its tense tell.
- **The DB loose ends** — including two from the review session about the case
  the one binary leaves open, where a client launched from a subdirectory
  reports an empty record for a project full of work.
- **The suite's margin** — 20000ms is a ceiling that stops CI failing, not
  headroom. Nothing measures the margin on the machine that runs it, and
  `test:in-docker` was shown not to reproduce timing failures.

**A worktree note, since it cost a moment:** `main` is checked out in the
sibling worktree, so `git checkout main` fails here and a following
`reset --hard origin/main` lands on whatever branch is current. Nothing was lost
— the branch it hit was already merged — but branch from `origin/main` directly
rather than trying to check `main` out.

## Next

PR #36 awaits review.

Then the CLAUDE.md sweep: `git log --oneline -30` names what changed underneath
it, and the connection model, testing patterns and persistence sections are
where the rewrites landed.
