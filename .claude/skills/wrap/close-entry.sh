#!/usr/bin/env bash
#
#   close-entry.sh <state-file>
#
# Closes this session's current entry and re-baselines at HEAD, so the next
# Stop-hook fire starts a FRESH numbered entry covering only what comes after,
# instead of rewriting the finished one. For a session that has wrapped one
# piece of work and is moving on to the next.
#
# This is the supported way to do it: `baseline`, `asked` and `entry` belong to
# the hook, and SKILL.md says not to hand-edit them. Re-baselining is safe here
# precisely because the entry being closed already covers everything up to HEAD
# -- run it only when that is true, or the range in between goes unwritten.

set -euo pipefail
state_file="${1:?state file}"
# Same resolution as wrap-hook.sh, and for the same reason: $CLAUDE_PROJECT_DIR
# names the directory the session *started* in, so a session working in a git
# worktree would `cd` to another checkout and write **that** tree's HEAD as this
# session's new baseline — silently skipping or duplicating a range. The
# worktree fix landed in wrap-hook.sh and not here or in collect.sh, which is
# the asymmetry PJ-027 is about, inside the fix for an instance of it.
root="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || true)"
[ -d "$root" ] || root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root"

head_sha="$(git rev-parse HEAD)"
prev_entry="$([ -f "$state_file" ] && sed -n 's/^entry=//p' "$state_file" | tail -1 || true)"

mkdir -p "$(dirname "$state_file")"
printf 'baseline=%s\nasked=%s\nentry=\n' "$head_sha" "$head_sha" > "$state_file"

echo "closed: ${prev_entry:-(no entry recorded)}"
echo "re-baselined at $head_sha -- the next wrap starts a new entry"
