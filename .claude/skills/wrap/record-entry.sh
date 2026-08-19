#!/usr/bin/env bash
#
#   record-entry.sh <state-file> <entry-path>
#
# Points this session's state at the entry just written, so the next Stop-hook
# fire updates that file instead of starting another one. Preserves `baseline`
# and `asked`, which belong to the hook.

set -euo pipefail
state_file="${1:?state file}"
entry="${2:?entry path}"
# Personal tooling, but a mangled invocation should not point state at an
# arbitrary path.
case "$entry" in docs/*) ;; *) echo "entry must be under docs/: $entry" >&2; exit 1;; esac
get() { [ -f "$state_file" ] && sed -n "s/^$1=//p" "$state_file" | tail -1 || true; }
mkdir -p "$(dirname "$state_file")"
printf 'baseline=%s\nasked=%s\nentry=%s\n' "$(get baseline)" "$(get asked)" "$entry" > "$state_file"
echo "recorded: $entry"
