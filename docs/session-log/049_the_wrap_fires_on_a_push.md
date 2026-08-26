# 049: the wrap fires on a push

**Session wrap, 2026-08-26, on `fix/wrap-on-push`.** Short — one gate and its
test.

Merged as **PR #39** (`ffe1fb2`). The first entry written under the rule it
describes, and — see Open — the first eaten by the window it predicted. Restored
onto `main` afterwards, along with 048.

## Goal

Dan, on watching a wrap commit threaten to become PR #39: make the hook fire on
a push rather than on every commit.

## Changed

**The range is wider than this entry.** `collect.sh` flags `82342ed` as touching
another entry's file — it touches 048, which it restores, and is this session's
own commit. The range also contains `25f3348`, PR #38's merge, which entry 048
covers.

**`457bf9d`** (merged as `ffe1fb2`, PR #39) — `.claude/skills/wrap/wrap-hook.sh`
gains one gate; SKILL.md's Notes record it.

**`82342ed`** (PR #40) — restores 048 *and* this entry onto `main`, and adds the
merge race to `docs/TASKS.md`. Both had been pushed to branches whose pull
requests were already merged; see Open.

048 was first lost in **#38's** squash — pushed to `docs/ledger-owners` shortly
before the merge, recovered from `5360287` — and then lost again with 049 in
**#39's**.

## Verified

Four states, run rather than reasoned about:

| state | result |
| --- | --- |
| committed, not pushed | quiet |
| pushed | **fires, once** |
| same HEAD again | quiet |
| entry committed, unpushed | quiet |
| entry pushed | quiet — only the session log changed |

`bun run check` — all 17 pass, twice: at `457bf9d` and again at `82342ed`
(55.8s for the suite).

**The orphaning was found by comparison, not by any check.** `git merge-base
--is-ancestor` against `origin/main` is what showed both entries missing; the
merge reported success and nothing else disagreed with it.

**The first probe proved nothing, twice over**, and both failures are worth
knowing before writing another. An empty `--allow-empty` commit tripped the
existing empty-range guard, so the run exercised that rather than the gate. And
a `git reset --hard` inside the probe silently reverted the *uncommitted* hook
change under test, so the second run exercised the **old** hook and reported the
opposite of the truth. It was caught only because the result was backwards from
what the gate should do — a probe that had agreed with the hypothesis would have
been believed.

## Open

**`asked` is deliberately not advanced when the work is unpushed**, and that is
the one thing to preserve if this is ever edited. Advancing it would mark the
HEAD handled, and the push that follows — same HEAD — would be skipped by the
check above, so the work would never be wrapped at all.

**No `main` guard was added.** `labkit-review` reported disabling the hook on
`main`; nothing to that effect is in the merged hook or `.claude/settings.json`,
so their change is unmerged or local. Duplicating a guard that cannot be seen
seemed worse than leaving it.

**The squash that ate 048 did it again, to this entry, forty-five seconds
later.** The prediction above was written, pushed, and immediately confirmed:
`ffe1fb2` was cut from `457bf9d` at 23:37:00; the commit carrying 048 and 049
was authored at 23:37:45 and is not in it. So both entries were orphaned on a
branch whose pull request was already closed, and this is the second consecutive
squash to eat 048.

Firing on a push makes the window *smaller* and demonstrably does not close it —
a wrap still loses a race against a merge that is already in flight. It is a
race, not a rule violation, so "remember to push before merging" is not an
available remedy. What would close it: a check that refuses a merge whose branch
has commits the merge commit does not contain, or a wrap that writes to `main`
rather than to the branch. Queued in `docs/TASKS.md`; neither is built.

## Next

PR #40 awaits review.

A status review at the end of this session found two plan documents worth
acting on, neither yet touched:

- **The migration-and-image plan is fully implemented** — the role and grants
  are in the hand-written migration, `pgRole(...).existing()` keeps the
  generated one generated, `docker/postgres/` owns the image. Its only residue,
  the login-role probe, is already in `docs/TASKS.md`.
- **`docs/mcp-server/001_...` is stale in its status table** — it records the
  agent-facing write contract as not done against 34 shipped tools, 18 of them
  writes, and the suite-ceiling problem as unresolved after it was re-measured
  to zero failures. It is referenced by nothing and sits outside the three
  exempt dated-record directories. Two live ideas in it are tracked nowhere
  and would be lost with the file: dogfooding LabKit on its own open questions,
  and an orientation surface for an agent that does not yet know an identifier
  to ask about. Dan's call.

Then `docs/TASKS.md`'s documents group: the CLAUDE.md stale-prose sweep, and
`docs/persistence-spikes.md` becoming `docs/persistence.md`.
