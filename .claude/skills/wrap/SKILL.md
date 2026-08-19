---
name: wrap
description: |
  Writes the session's wrap-up entry to docs/project-journal/<NNN>_<slug>.md —
  the goal in one line, what actually changed (from git diff --stat), the
  commands that verified it with their key output, what is still open, and the
  exact next step. Invoked by hand as /wrap, and automatically by the Stop hook
  in .claude/skills/wrap/wrap-hook.sh once a session has commits that have not
  been written up.
triggers:
  - "wrap"
  - "wrap up"
  - "end of session"
  - "session summary"
  - "write up what we did"
---

# wrap — the session's own entry in the journal

A wrap entry is a **handover to whoever opens this repo cold**, which is
usually a future session with none of this context. It records what was done
and how it was checked, not why the design is right — the reasoning entries
(PJ-001…) do that, and this must not pretend to be one.

Optional argument: the path to a `.claude/.wrap-state/<session>` file. The Stop
hook passes it. Without it the skill still works; the baseline is just the last
commit that touched the journal.

## 1. Collect

```sh
.claude/skills/wrap/collect.sh [state-file]
```

That prints the next entry number, the baseline commit, `git log --oneline` and
`git diff --stat` since it, the working tree, and the full commit messages.
Read it before writing anything — most of the content is already in the commit
messages, and re-deriving it from the transcript invents differences that
aren't there.

## 2. Verify, and report what actually happened

If the session ran verification commands, use their real output. If it did not,
run them now — an entry claiming green on commands nobody ran is worse than one
that says "not run".

```sh
bun test
bun run typecheck
npx depcruise src tests --output-type err
```

Three traps in this repo, all of which have caught someone already
(see CLAUDE.md):

- **`bun test` exits non-zero even when every test passes** — a PGlite WASM
  teardown interaction. Record the pass/fail counts from the output. Never
  record the exit code as if it meant something.
- **`$?` after a pipeline reports the last command's status.** `bun test | tail`
  reports `tail`'s success. Don't pipe a command whose status you intend to
  report.
- **`bun examples/full-lifecycle.ts` exits 99 on a completely successful run.**
  Judge it by the output ending `closed connection cleanly` with no raw
  graphids in it.

## 3. Write the entry

Filename: `docs/project-journal/<NNN>_<slug>.md`, `NNN` zero-padded, slug in
`snake_case` naming the work rather than the session ("wrap_skill_and_stop_hook",
not "session_2026_08_19").

**Re-check the number immediately before writing** — `ls docs/project-journal/`.
`collect.sh` computed it when it ran, and other sessions work in this repo. If
the file now exists and is not this session's, take the next free number.

**If this session already has an entry** (`collect.sh` says so), update that
file in place. The Stop hook fires at every turn boundary where HEAD moved, so
one session converges on one entry rather than accumulating a pile of them.
Rewrite it whole from the current facts; do not append a changelog of changes
to itself.

The five parts, in this order, and nothing else:

```markdown
# <NNN>: <what this session did, as a title>

**Session wrap, <YYYY-MM-DD>, on `<branch>`.** Not a decision record — see
PJ-0NN for the reasoning behind <whatever this touched>.

## Goal

<One line. What the session set out to do, in the user's terms.>

## Changed

<The file list from git diff --stat, with a clause each on what moved and why.
Commits by sha and subject. Say plainly if the tree is dirty and what is in it.>

## Verified

<Each command that was actually run, with the output that matters — pass/fail
counts, error counts, the line that proves it. Note anything not run.>

## Open

<What was found and not fixed, what was deferred, what is uncertain. "Nothing"
is a legitimate answer and is better than padding. Anything genuinely unresolved
belongs in the reasoning journal too, not only here.>

## Next

<The exact next step: the command to run or the file to open, specific enough
to act on without re-reading the session.>
```

Keep it short. A wrap that restates every commit message has buried the two
lines that matter.

## 4. Record the state, and leave the commit to the user

If a state file path was passed, point it at the entry just written, so a later
fire in this session updates that file instead of starting another:

```sh
.claude/skills/wrap/record-entry.sh <state-file> docs/project-journal/<NNN>_<slug>.md
```

Use the script rather than writing the file by hand — it preserves `baseline`
and `asked`, which belong to the hook. Clobbering `baseline` would make the
next wrap cover only the newest commits instead of the session.

**Do not commit the entry.** This runs at turn boundaries mid-session, and
committing there interleaves doc commits into work in progress. Say in your
reply that the file is written and uncommitted, and give the `git add`/`git
commit` line. If the user asks for it to be committed, do it then.

## Notes

- The Stop hook advances the recorded sha at the moment it fires, so a HEAD is
  never asked about twice even if this skill errors. Failing loudly is safe.
- The number is taken at write time, not reserved. Two sessions wrapping in the
  same second can still collide; the re-check in step 3 narrows it, and the
  loser renames. Not worth a lock.
- These entries are mechanical, and the numbered journal is otherwise a
  curated argument. If they start crowding it, move them to `docs/session-log/`
  — one path change here and in `collect.sh`.
