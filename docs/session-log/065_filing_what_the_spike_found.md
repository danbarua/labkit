# 065: filing what the spike found

**Session wrap, 2026-08-28, on `docs/renumber-063`.** Not a decision record —
the findings are argued in #91 and #92 and now in the issues below, and the
numbering collision is argued in `.claude/skills/wrap/SKILL.md` and entry 064.

## Goal

After #91 and #92 merged: get the things worth not losing out of a session log
and into the queue, and clean up the branches.

## Changed

**No code, and one commit.** This entry.

The work was three issues, which is where it belongs — CLAUDE.md's own rule is
that a queue is state and a markdown file is prose, and carrying findings
forward in `## Open` is the laundering it names by name:

- **#94** — the tenant policy is bypassed by the connecting role, not merely by
  a lost GUC. `labkit_event` is `ENABLE ROW LEVEL SECURITY` without `FORCE` and
  owned by the role `LABKIT_DB_URL` connects as. Labelled `deferred`, naming
  **#49** as what unparks it.
- **#95** — the spike stack publishes fixed host ports, so two worktrees
  collide. The port clash is the small half; the bad half is a green `healthz`
  describing a process you did not start.
- **A comment on #81** — *claimed by somebody else* as a third provenance
  grade, from #91's shared-registry result. Not weaker than `Claimed`: false,
  and identical in presentation to true.

**A rename that was done twice, and the redundant half was mine.**
`063_two_verbs_that_let_an_agent_start.md` needed to become `064`, and both
sessions fixed it. `labkit-dev-mcp`'s landed as **#97**; my commit was dropped
rather than merged. It said so first and its version is better — see below.

## Verified

Nothing to run — no code changed. The collision was measured rather than
noticed:

```
git ls-tree --name-only origin/main docs/session-log/ \
  | sed -E 's|.*/([0-9]{3})_.*|\1|' | sort | uniq -d
063
```

## Open

**The re-check SKILL.md prescribes did not fail, and could not have helped.**
`f893b95` merged at 17:09:10 and `72eb0db` at 17:09:19. Each session re-checked
`ls docs/session-log/` correctly, against a `main` that did not yet contain the
other's entry. The guard is against two sessions *writing* at once; this was a
write against a **merge**, which is a different race and outside what a
directory listing can see.

So "look harder" is not the remedy. The honest options are a reservation step
or accepting that the loser renames — and the second is what the skill already
chose, with its reasons. Nothing to change unless it happens often.

**Two sessions duplicated a fix because neither checked the other's tree.**
`git worktree list` shows which branch each checkout is holding, and it is the
one thing that is visible across the boundary — CLAUDE.md already says a
parallel session's *worktree* state is invisible while its *branch* state is
not. Reading it before acting on shared state is cheap and neither of us did.

**A git trap worth recognising rather than debugging.**
`git checkout -b work/next origin/main` updates the worktree **before** it fails
on the ref lock, and it fails when a branch named `work` already exists, because
a name cannot be both a ref and a directory. The result is HEAD on the old
branch with the new branch's content in the index — several hundred staged lines
that read as somebody else's work landing in yours. Nothing is lost; the fix is
to check out a valid name. The wrong reflex is to commit it, which would produce
a commit whose message describes none of it.

## Next

Nothing queued here. The open work is in the tracker, and **#94** is the one
with the most behind it.
