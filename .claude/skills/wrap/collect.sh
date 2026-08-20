#!/usr/bin/env bash
#
# Gathers the mechanical facts a wrap entry needs, so the write-up is about
# judgment rather than re-deriving what git already knows.
#
#   collect.sh [state-file]
#
# With a state file (the Stop hook passes one), the baseline is the HEAD this
# session started at. Without one -- `/wrap` typed by hand -- it falls back to
# the last commit that touched the session log, and failing that to today's
# commits. It never falls back to the root commit: a "session wrap" covering
# the entire history of the repository is worse than saying there is no
# baseline.

set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root"

state_file="${1:-}"
log_dir="docs/session-log"

baseline=""
entry=""
if [ -n "$state_file" ] && [ -f "$state_file" ]; then
  baseline="$(sed -n 's/^baseline=//p' "$state_file" | tail -1)"
  entry="$(sed -n 's/^entry=//p' "$state_file" | tail -1)"
  origin="the HEAD this session started at, from $state_file"
fi
if [ -z "$baseline" ]; then
  baseline="$(git log -1 --format=%H -- "$log_dir" 2>/dev/null || true)"
  [ -n "$baseline" ] && origin="the last commit that touched $log_dir (no session state -- invoked by hand?)"
fi
if [ -z "$baseline" ]; then
  # Nothing in the log yet. Today's commits are a bounded, honest guess.
  earliest="$(git log --since=midnight --format=%H 2>/dev/null | tail -1)"
  if [ -n "$earliest" ]; then
    # --verify is load-bearing, not defensive. Without it, `git rev-parse
    # <root-sha>^` prints the literal unparseable ref to STDOUT before exiting
    # non-zero, so 2>/dev/null does not suppress it and the || appends a second
    # line -- leaving $baseline as two lines and breaking every downstream
    # `git log/diff $baseline..HEAD`. --verify prints nothing on failure.
    # Reported by a peer session that copied this skill into a two-commit repo,
    # where today's earliest commit genuinely is the root; reproduced here
    # before applying. Any young repo hits it.
    baseline="$(git rev-parse --verify "$earliest^" 2>/dev/null || echo "$earliest")"
    origin="the commit before today's first commit (no session state, nothing in $log_dir yet)"
  else
    baseline="$(git rev-parse HEAD)"
    origin="HEAD -- no session state, nothing in $log_dir, and nothing committed today"
  fi
fi

head_sha="$(git rev-parse HEAD)"

# Next number: the highest NNN_ prefix plus one. Recomputed at write time by
# the skill, because a second session in this repo may be about to take it.
next="$(ls "$log_dir" 2>/dev/null | sed -n 's/^\([0-9]\{3\}\)_.*/\1/p' | sort -n | tail -1)"
next="$(printf '%03d' "$((10#${next:-0} + 1))")"

echo "## next entry number"
echo "$next   (highest existing + 1; re-check at write time, another session may take it)"
echo
echo "## this session's entry"
if [ -n "$entry" ]; then echo "$entry   (already written -- update it in place)"; else echo "none yet -- create one"; fi
echo
echo "## baseline"
echo "$baseline"
echo "  origin: $origin"
echo "  HEAD:   $head_sha"
echo
# Commits in this range that another session has already written up.
#
# `baseline` is pinned at session start and never moves, which is right for a
# session that runs to completion. A session RESUMED across another session's
# work gets a range containing that work -- faithfully reported, and a
# whole-file rewrite that trusts it will restate their commits as this
# session's. The tell is a commit touching a session-log entry that is not
# ours: that entry claims the work around it.
#
# This detects another session's ENTRY, not another session's WORK. Only
# commits touching $log_dir are inspected, so a peer whose commits were mostly
# code contributes nothing to detect and the list is a LOWER BOUND on the
# overlap. Found by session be5374e7 running this against entry 003: e386027 --
# a wrap-tooling commit touching only .claude/skills/wrap/ -- sits in its range
# unflagged. The warning text says so; do not let it read as an inventory.
claimed=""
# Match by entry NUMBER, not by path. An entry gets renamed when a session
# outgrows its title (003 was renamed twice), and the commit carrying the
# rename touches the old path -- which an exact-path exclusion reads as
# another session's entry, flagging this session's own commit. The number is
# what is stable.
entry_num=""
case "$entry" in "$log_dir"/[0-9][0-9][0-9]_*) entry_num="$(basename "$entry" | cut -c1-3)";; esac
if [ -d "$log_dir" ]; then
  while read -r sha; do
    [ -n "$sha" ] || continue
    others="$(git diff-tree --no-commit-id --name-only -r "$sha" -- "$log_dir" 2>/dev/null \
      | grep -v '/README\.md$' \
      | { [ -n "$entry_num" ] && grep -v "^$log_dir/$entry_num\_" || cat; } || true)"
    [ -n "$others" ] || continue
    claimed="$claimed$(git log -1 --format='  %h %s' "$sha")   -> $(printf '%s' "$others" | tr '\n' ' ')
"
  done <<EOF
$(git log --format=%H "$baseline..$head_sha" -- "$log_dir" 2>/dev/null || true)
EOF
fi
if [ -n "$claimed" ]; then
  echo "## WARNING -- part of this range belongs to another session's entry"
  printf '%s' "$claimed"
  echo "  AT LEAST these commits, and the work they describe, are written up there."
  echo "  Lower bound: only commits touching $log_dir are inspected, so a session"
  echo "  whose work was mostly code leaves commits here that are NOT listed above."
  echo "  Cover only this session's own commits, and say plainly in the entry that"
  echo "  the range is wider than the session. Do not restate the other entry."
  echo
fi

echo "## commits since baseline"
git log --oneline "$baseline..$head_sha" 2>/dev/null || echo "(none)"
echo
echo "## files changed since baseline (git diff --stat)"
git diff --stat "$baseline" "$head_sha" 2>/dev/null || echo "(none)"
echo
echo "## uncommitted working tree"
if [ -n "$(git status --porcelain)" ]; then
  git status --short
  echo
  git diff --stat
else
  echo "(clean)"
fi
echo
echo "## commit messages in full (the reasoning is usually already here)"
git log --format='--- %h%n%B' "$baseline..$head_sha" 2>/dev/null || echo "(none)"
