# 066: the hooks a worktree already had

**Session wrap, 2026-08-28, on `fix/hooks-on-install`.** Not a decision record —
`scripts/install-hooks.sh`'s header carries the measurement and why the no-repo
branch is a distinction rather than a `|| true`.

**A third entry for this session.** 061 is #83's, 064 is #66's, this is #57's,
and no one `## Goal` line covers any two of them. The baseline is still 061's,
so the range is much wider than what is below; `062`, `063` and `065` are a peer
session's.

## Goal

Close #57: a fresh checkout starts with no git hooks and says nothing about it.

## Changed

**`dbe0f54`** — hooks installed by `bun install`, and the false claim that made
them look necessary in a worktree removed from three places.

- `package.json` — a `postinstall` running the same script `dev:install-hooks`
  does.
- `scripts/install-hooks.sh` — its header, which claimed a worktree starts
  unprotected; and a new branch for *not a git repository*, which an install can
  legitimately be run in.
- `CLAUDE.md` — the same claim, in the fresh-worktree checklist, replaced with
  the measurement.

Working tree clean. Open as PR **#99**.

## Verified

`bun run check` — **all 19 passed**.

**The claim was measured, not reasoned about.** From inside a worktree:

```
$ git config --show-origin core.hooksPath
file:/Users/dan/Code/science/labkit/.git/config	.githooks
```

That is the *main checkout's* config answering. `core.hooksPath` is
per-repository and a linked worktree shares the repository's `config`, so a
worktree inherits hooks. A fresh **clone** is the case that really starts
unprotected.

Both new branches exercised rather than assumed:

- **no repository** — the script copied somewhere without `.git` prints the new
  line and exits 0;
- **unset config, which nothing had ever reached** — unset `core.hooksPath`, ran
  `bun install`, watched postinstall print `core.hooksPath set to .githooks (was
  unset)`, and confirmed the value afterwards. Seconds of exposure, closed by the
  same command.

## Open

**The false claim cost nothing and was still worth the commit**, which is the
part worth remembering. It had been the *stated reason* for a manual step nobody
needed to take — and this session ran that step in a new worktree, watched it
print `already .githooks`, and did not register what that meant until reading
the issue days later. A wrong reason survives because following it still works.

**`collect.sh` flagged a rename against the wrong entry.** `4c1af3b` renamed
`063_two_verbs…` to `064_two_verbs…` and was reported as belonging to the peer's
`063_the_pooler_arm.md`, because matching is by entry *number* and the rename
touched the old path. SKILL.md says renames are handled — *"verified against
entry 003, renamed twice … all correctly left unflagged"* — and that holds when
an entry is renamed within one session's ownership. It does not hold when a
rename hands the number to somebody else, which is what a collision fix does.
Cosmetic, and not chased.

## Next

`gh pr view 99`.

Then the queue is domain-model open questions — **#63**, **#64**, **#65**, and
**#81**, the last now sharper than when it was filed: the peer's HTTP work found
a third provenance grade, *claimed by somebody else*, which a shared registry
produces and which is worse than the placeholder #87 removed.

`labkit-review` has a review outstanding; nothing here is waiting on it.
