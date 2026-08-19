#!/usr/bin/env bash
#
# Hook driver for the `wrap` skill -- see SKILL.md in this directory.
#
#   wrap-hook.sh start   SessionStart: record the HEAD this session began at.
#   wrap-hook.sh stop    Stop: ask Claude to write the session's journal entry,
#                        but only if HEAD has moved since the last time we asked.
#
# Wired from .claude/settings.json, which is personal (gitignored) -- the
# mechanism is shared, the wiring is not. Reads the hook payload as JSON on
# stdin and writes its decision as JSON on stdout.
#
# The loop this is built to avoid: Stop fires on every turn, and a hook that
# blocks unconditionally blocks forever. Three things stop that here --
# `stop_hook_active` short-circuits a continuation we ourselves caused, the
# recorded sha is advanced at the moment we fire (so a fire is never repeated
# for the same HEAD, whatever the skill does or fails to do), and a session
# that has committed nothing never fires at all.

set -euo pipefail

mode="${1:-stop}"
root="${CLAUDE_PROJECT_DIR:-$PWD}"
state_dir="$root/.claude/.wrap-state"

payload="$(cat || true)"

# session id and stop_hook_active, tab-separated. python3 rather than jq:
# jq is not guaranteed on this machine, python3 is.
parsed="$(printf '%s' "$payload" | python3 -c '
import json, re, sys
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
sid = str(d.get("session_id") or "no-session")
sid = re.sub(r"[^A-Za-z0-9_-]", "_", sid)[:96]
print(sid, "true" if d.get("stop_hook_active") else "false", sep="\t")
' 2>/dev/null || printf 'no-session\tfalse')"

session_id="${parsed%%$'\t'*}"
stop_active="${parsed##*$'\t'}"
state_file="$state_dir/$session_id"

cd "$root" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
head_sha="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$head_sha" ] || exit 0   # a repo with no commits has nothing to wrap

read_state() { # read_state <key>
  [ -f "$state_file" ] && sed -n "s/^$1=//p" "$state_file" | tail -1 || true
}

write_state() { # write_state <baseline> <asked> <entry>
  mkdir -p "$state_dir"
  printf 'baseline=%s\nasked=%s\nentry=%s\n' "$1" "$2" "$3" > "$state_file"
}

if [ "$mode" = "start" ]; then
  # Only if absent: resuming a session must not re-baseline past work that the
  # original session already did.
  [ -f "$state_file" ] || write_state "$head_sha" "$head_sha" ""
  # Old sessions' state files are just litter.
  find "$state_dir" -type f -mtime +30 -delete 2>/dev/null || true
  exit 0
fi

# --- stop ---

# A continuation we caused ourselves. Approving here is what makes the wrap
# skill able to finish and stop.
[ "$stop_active" = "true" ] && exit 0

baseline="$(read_state baseline)"
asked="$(read_state asked)"
if [ -z "$baseline" ]; then
  # No SessionStart baseline (hook added mid-session, or a session that began
  # before this was wired). Take HEAD as the baseline and stay quiet.
  write_state "$head_sha" "$head_sha" ""
  exit 0
fi

[ "$asked" = "$head_sha" ] && exit 0   # already asked about this HEAD

entry="$(read_state entry)"
# Advance `asked` BEFORE asking, so a HEAD is never asked about twice even if
# the skill never runs, never writes, or errors. `baseline` deliberately does
# NOT move: the entry covers the whole session, and is rewritten whole each
# time rather than describing only the latest commits.
write_state "$baseline" "$head_sha" "$entry"

count="$(git rev-list --count "$baseline..$head_sha" 2>/dev/null || echo "?")"
if [ -n "$entry" ] && [ -f "$root/$entry" ]; then
  target="This session already has an entry at $entry -- update that file in place, do not start a new one."
else
  target="This session has no entry yet -- create one."
fi

python3 -c '
import json, sys
count, target, state_file = sys.argv[1], sys.argv[2], sys.argv[3]
reason = (
    f"Session wrap: {count} commit(s) since the last wrap have not been written up. "
    f"Invoke the `wrap` skill now (Skill tool, skill: \"wrap\", args: \"{state_file}\"), "
    f"then stop. {target}"
)
print(json.dumps({"decision": "block", "reason": reason}))
' "$count" "$target" "$state_file"
