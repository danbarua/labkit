---
name: wrap
description: |
  Writes the session's wrap-up entry to docs/session-log/<NNN>_<slug>.md —
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

# wrap — the session log

A wrap entry is a **handover to whoever opens this repo cold**, which is
usually a future session with none of this context. It records what was done
and how it was checked, not why the design is right.

It lives in `docs/session-log/`, deliberately apart from
`docs/project-journal/`. The journal is a curated argument — each entry is a
decision and its reasoning, and CLAUDE.md sends readers to the newest few for
"what's true now". A session log is mechanical and disposable by comparison,
and interleaving the two would dilute the sequence that is doing the work. A
wrap that turns out to contain a real decision has found something the journal
should say; put it there too, in the journal's own terms.

Optional argument: the path to a `.claude/.wrap-state/<session>` file. The Stop
hook passes it, and it is what pins the baseline to the HEAD this session began
at. Without it the skill still works, on a guessed window: the last commit that
touched `docs/session-log/`, failing that the commit before today's first
commit, failing that HEAD. `collect.sh` names which one it used — say so in the
entry when it is a guess.

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

Filename: `docs/session-log/<NNN>_<slug>.md`, `NNN` zero-padded, slug in
`snake_case` naming the work rather than the session ("wrap_skill_and_stop_hook",
not "session_2026_08_19").

**Re-check the number immediately before writing** — `ls docs/session-log/`.
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
`docs/project-journal/` for the reasoning behind <whatever this touched>.

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

## 4. Record the state, then commit the entry

If a state file path was passed, point it at the entry just written, so a later
fire in this session updates that file instead of starting another:

```sh
.claude/skills/wrap/record-entry.sh <state-file> docs/session-log/<NNN>_<slug>.md
```

Use the script rather than writing the file by hand — it preserves `baseline`
and `asked`, which belong to the hook. Clobbering `baseline` would make the
next wrap cover only the newest commits instead of the session.

**Then commit it yourself.** An earlier version of this skill handed the
`git add`/`git commit` back to the user, on the reasoning that committing at a
turn boundary interleaves doc commits into work in progress. That reasoning did
not survive contact: the entry gets committed anyway, one round-trip later, so
the interleaving happens regardless and the only thing the handoff adds is a
message the user has to act on before the hook stops firing.

Three rules, because this repo has more than one session in it:

- **Check first, every time.** `git status && git log -1 --oneline`. If HEAD
  has moved since you last looked, **stop and report** rather than committing on
  top of work you have not seen. A wrap is a description of a range; if the
  range changed under you, the description is wrong.
- **Stage by explicit path. Never `git add -A`.** The wrap entry is one file;
  name it. `git add -A` has twice swept unrelated working-tree changes into
  commits in this repo's history — another session's journal entry once, a
  regenerated dependency graph another time — and in both cases the commit
  message described neither.
- **Check the index, not just your own `git add`.** `git mv` and `git rm`
  stage by themselves, so a rename done earlier in the turn is already staged
  and rides into the next commit behind an explicit `git add` of other paths.
  That is the same "the message described neither" failure reached without
  ever typing `git add -A`, and it has happened once — the rename of entry 002
  landed in the PJ-024 commit. `git status --short` before committing shows it:
  anything in the left-hand column is going in.
- **Do not create an empty commit.** The Stop hook fires at every turn boundary
  where HEAD moved, including the one your own wrap commit causes. If the entry
  is unchanged, say so and stop; there is nothing to record.

```sh
git add docs/session-log/<NNN>_<slug>.md
git commit -m "docs: wrap the <what this session did> session"
```

If the wrap turn also produced other changes worth committing — a fix the entry
describes, say — commit those separately and first, so the wrap describes a
range that already exists.

## Forking, and forking into a worktree

**A fork re-issues the session id** (demonstrated 2026-08-21: a fork of
`be5374e7` came up as `74f9b207`, with its own transcript directory). Compaction
does not — that was tested separately and the id survives.

A fork into the **same** tree is handled: SessionStart inherits the predecessor's
`baseline` when its recorded HEAD is an ancestor of ours.

A fork into a **new worktree is not**, and fails quietly. `.claude/.wrap-state/`
is untracked, so the new tree has no state dir and nothing to inherit; the first
Stop finds no `baseline`, self-baselines at whatever HEAD is then, and **exits
without asking**. The first fire is swallowed *and* the baseline lands after the
work it should have covered.

**A second worktree bug, fixed 2026-08-21.** The hook resolved `state_dir` from
`$CLAUDE_PROJECT_DIR`, which is the directory the session *started* in — so a
session working in a worktree read the **other** checkout's state: another
session's baseline, and an `entry=` naming a file that does not exist on its
side. It reported "no entry yet" indefinitely, lying about whether the session
had wrapped, until an unrelated merge made the file appear. It now resolves from
`git rev-parse --show-toplevel`, which names the same directory for a session
that is not in a worktree, so there is no special case beside a normal one.

That fix does **not** remove the need to seed. It puts the state file in the
right tree; the tree still starts empty.

Seed it before the first stop:

```sh
mkdir -p .claude/.wrap-state
printf 'baseline=%s\nasked=%s\nentry=\n' <start-sha> <start-sha> \
  > .claude/.wrap-state/<session-id>
```

Pick `<start-sha>` as the commit your work begins *after* — not the fork point,
if the fork point includes commits from the session you forked from.

## Closing an entry and starting the next one

One session does not have to mean one entry. A session that wraps a piece of
work and then moves on to something unrelated should **close** the entry and
re-baseline, so the next Stop fire opens a fresh numbered one:

```sh
.claude/skills/wrap/close-entry.sh <state-file>
```

That rewrites `baseline` and `asked` to HEAD and clears `entry`. It is the
supported way — those three fields belong to the hook and SKILL.md otherwise
says not to hand-edit them. **Run it only when the entry being closed already
covers everything up to HEAD**, or the range in between goes unwritten.

Why it exists: without it, one long session rewrites a single growing document
all day. Entry 004 reached **1,165 lines covering 115 commits** and a dozen
unrelated pieces of work — config cleanup, a design exercise, a refactor, five
ledger rows, a flake investigation, a CLI — because there was no way to say
"that piece is finished". Five entries would have been five handovers; one was
none. Backported from exo-ledger, 2026-08-21.

Rule of thumb: close when you would struggle to write one `## Goal` line that
covers what comes next.

## Notes

- The Stop hook advances the recorded sha at the moment it fires, so a HEAD is
  never asked about twice even if this skill errors. Failing loudly is safe.
- **The wrap's own commit no longer fires the hook.** It used to: committing
  the entry moves HEAD, so `asked` stopped matching and the next turn boundary
  asked whether a commit whose entire content *is* the write-up had been
  written up. Always yes, and it cost an agent turn each time to say so. The
  hook now stays quiet when nothing outside `docs/session-log/` changed since
  it last asked. Narrow on purpose: a wrap commit that also carries real work
  still fires, which is the other reason step 4 says to commit such work
  separately and first — bundling it in is what would hide it.
- **Compaction does not lose the session's state — the guard against that is
  insurance, not a working mechanism.** `SessionStart` inherits the
  predecessor's `baseline` and `entry` when `source` is `compact` or `resume`
  **and** that session's recorded HEAD is an ancestor of ours; `startup` and
  `clear` never inherit, being genuinely new sessions, and the ancestry check
  stops a session inheriting an unrelated one that merely wrapped most
  recently. It was built on the premise that compaction re-issues the session
  id — which was then tested, on 2026-08-20, and is **false in this build for
  both triggers**: manual `/compact`, and auto-compaction on context
  exhaustion (one session compacted twice). The id is preserved, the state file
  survives untouched, and the branch is not reached *by compaction*. It **is**
  reached by a fork, which does re-issue the id -- see §Forking above, added
  after this bullet and leaving it saying "never" for a while. What it would
  have cost had the compaction premise held: a session's second half opening a second numbered entry
  while its first half sits in one nobody updates again.
- **`collect.sh` warns when the range is wider than the session.** `baseline`
  is pinned at session start and never moves, which is right until a session is
  *resumed* across another session's work — then the range contains commits
  another entry already covers, and a whole-file rewrite that trusts it will
  restate their work as yours. The tell is a commit touching a session-log
  entry that is not this session's; the warning names the entry that claims it.
  Matching is by entry **number**, not path, because an entry gets renamed when
  a session outgrows its title and the rename commit touches the old path —
  verified against entry 003, renamed twice, whose three commits touching its
  two former names are all correctly left unflagged.
  It reports a **lower bound**, not an inventory: only commits touching the log
  directory are inspected, so it sees another session's *entry*, never its
  *work*. A peer whose commits were mostly code leaves commits in your range
  that it cannot name — entry 003's range contains `e386027`, a wrap-tooling
  commit touching only `.claude/skills/wrap/`, unflagged.
  Say in the entry that the range is wider than the session, as 002 does.
- **Two places know the log directory**: `collect.sh`'s `log_dir` and
  `wrap-hook.sh`'s. Both must move together, along with this file and
  `record-entry.sh`'s guard.
- The number is taken at write time, not reserved. Two sessions wrapping in the
  same second can still collide; the re-check in step 3 narrows it, and the
  loser renames. Not worth a lock.
- Numbering restarts at `001` in `docs/session-log/` and is independent of the
  project journal's. Two sequences, two purposes.
