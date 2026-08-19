#!/usr/bin/env bash
#
# Gathers the mechanical facts a wrap entry needs, so the write-up is about
# judgment rather than re-deriving what git already knows.
#
#   collect.sh [state-file]
#
# With a state file (the Stop hook passes one), the baseline is the HEAD this
# session started at. Without one -- `/wrap` typed by hand -- the baseline is
# the last commit that touched the journal, which is the last time somebody
# wrote one of these.

set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root"

state_file="${1:-}"
journal="docs/project-journal"

baseline=""
entry=""
if [ -n "$state_file" ] && [ -f "$state_file" ]; then
  baseline="$(sed -n 's/^baseline=//p' "$state_file" | tail -1)"
  entry="$(sed -n 's/^entry=//p' "$state_file" | tail -1)"
  origin="the HEAD this session started at, from $state_file"
fi
if [ -z "$baseline" ]; then
  baseline="$(git log -1 --format=%H -- "$journal" 2>/dev/null || true)"
  origin="the last commit that touched $journal (no session state -- invoked by hand?)"
fi
if [ -z "$baseline" ]; then
  baseline="$(git rev-list --max-parents=0 HEAD | tail -1)"
  origin="the root commit (no journal history found)"
fi

head_sha="$(git rev-parse HEAD)"

# Next number: the highest NNN_ prefix plus one. Recomputed at write time by
# the skill, because a second session in this repo may be about to take it.
next="$(ls "$journal" 2>/dev/null | sed -n 's/^\([0-9]\{3\}\)_.*/\1/p' | sort -n | tail -1)"
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
