#!/usr/bin/env bash
#
# Hook driver for the `wrap` skill -- see SKILL.md in this directory.
#
#   wrap-hook.sh start   SessionStart: record the HEAD this session began at.
#   wrap-hook.sh stop    Stop: ask Claude to write the session log entry,
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
# Kept in step with collect.sh's own `log_dir` -- see SKILL.md's Notes.
log_dir="docs/session-log"

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
# SessionStart carries source: startup | resume | clear | compact.
src = re.sub(r"[^a-z]", "", str(d.get("source") or "").lower())[:16]
print(sid, "true" if d.get("stop_hook_active") else "false", src, sep="\t")
' 2>/dev/null || printf 'no-session\tfalse\t')"

session_id="$(printf '%s' "$parsed" | cut -f1)"
stop_active="$(printf '%s' "$parsed" | cut -f2)"
source_kind="$(printf '%s' "$parsed" | cut -f3)"
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
  if [ ! -f "$state_file" ]; then
    inherited=""
    # Guards a continuation that is issued a NEW session id: state keyed by
    # that id vanishes from under a session still going -- fresh baseline at
    # today's HEAD, empty `entry`, and the work continues into a SECOND
    # numbered entry describing half a session, while the first half is left
    # covered by an entry nobody will update again.
    #
    # THIS IS NOT WHAT COMPACTION DOES. The branch was written on the premise
    # that compaction re-issues the session id. That premise was then tested
    # and is false in this build, for both triggers: manual /compact (session
    # 49e462ec, one boundary, id preserved) and auto-compaction on context
    # exhaustion (session be5374e7, compacted twice, state file intact both
    # times). The id survives, the state file exists, and this branch is never
    # reached. Kept as insurance against a build that behaves differently --
    # if you are debugging state that went missing, this is not the cause.
    #
    # Gated on `source` deliberately. `startup` and `clear` are genuinely new
    # sessions and must re-baseline. `resume` is the weaker half: resuming may
    # re-issue the id, and when it does not the state file already exists and
    # we never reach here -- but a resume whose own state file was removed by
    # the 30-day sweep below inherits whichever session wrapped most recently
    # on this history, which is a guess rather than a fact.
    case "$source_kind" in
      compact|resume)
        prev="$(ls -t "$state_dir" 2>/dev/null | head -1 || true)"
        if [ -n "$prev" ] && [ -f "$state_dir/$prev" ]; then
          prev_asked="$(sed -n 's/^asked=//p' "$state_dir/$prev" | tail -1)"
          # Only if that session's history is ours. Otherwise it is simply the
          # session that happened to wrap most recently, on another branch or
          # another line of work, and inheriting it would hand this session
          # someone else's entry to overwrite.
          if [ -n "$prev_asked" ] && git merge-base --is-ancestor "$prev_asked" "$head_sha" 2>/dev/null; then
            inherited="$prev"
          fi
        fi
        ;;
    esac
    if [ -n "$inherited" ]; then
      cp "$state_dir/$inherited" "$state_file"
    else
      write_state "$head_sha" "$head_sha" ""
    fi
  fi
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

# The wrap's own commit must not ask to be wrapped.
#
# Committing the entry moves HEAD, so `asked` no longer matches and this fires
# again -- asking whether a commit whose entire content IS the write-up has
# been written up. The answer is yes by construction, and it cost a whole agent
# turn each time to establish that. So: if nothing outside the session log has
# changed since we last asked, advance `asked` and stay quiet.
#
# Deliberately narrow. A wrap turn that also commits real work still fires,
# because that work genuinely is unwritten -- which is why SKILL.md tells you to
# commit such work SEPARATELY and first. Bundling it into the wrap commit is
# what would hide it here.
if git rev-parse --verify --quiet "$asked" >/dev/null 2>&1; then
  touched="$(git diff --name-only "$asked..$head_sha" 2>/dev/null || true)"
  if [ -n "$touched" ] && ! printf '%s\n' "$touched" | grep -qv "^$log_dir/"; then
    write_state "$baseline" "$head_sha" "$entry"
    exit 0
  fi
fi
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
# Says what actually happened, not what it used to claim. The old wording --
# "N commit(s) ... have not been written up" -- was false whenever the entry
# already covered them; the trigger is that HEAD moved, and N is the size of
# the range the entry has to describe, not a backlog.
reason = (
    f"Session wrap: HEAD has moved since the entry for this session was last written. "
    f"The entry covers {count} commit(s) from the session baseline. "
    f"Invoke the `wrap` skill now (Skill tool, skill: \"wrap\", args: \"{state_file}\"), "
    f"then stop. {target}"
)
print(json.dumps({"decision": "block", "reason": reason}))
' "$count" "$target" "$state_file"
