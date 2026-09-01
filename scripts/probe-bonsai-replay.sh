#!/usr/bin/env bash
# Proves the real Bonsai record is script-derived: replays the four
# probe-bonsai-*.sh scripts into a fresh database and diffs the result
# against the live one. Zero lines out is the point.
#
#   LABKIT_HOME=~/Code/pycharm/bonsai-2026 bash scripts/probe-bonsai-replay.sh
#   bash scripts/probe-bonsai-replay.sh <live-db-dir>
#
# NOT registered in package.json and NOT in `bun run check`'s sweep, for
# the same two reasons `test:pg` sits outside it (CLAUDE.md): it needs a
# resource the repository cannot assume exists -- a specific external
# checkout, LABKIT_HOME, that is not part of this repo or CI -- and it
# takes on the order of three minutes, not the sweep's ~90s budget. Unlike
# `probe:dogfood`, this is NOT a "no exit code expresses the outcome"
# probe -- it can and does properly pass or fail, and its exit code is
# the thing to trust. It keeps the `probe-bonsai-` prefix rather than
# `check-` because it is Bonsai-transcription tooling, sibling to the four
# scripts it replays, not a general LabKit repo check -- CLAUDE.md's own
# lesson about `check-all.ts`'s first exclusion list applies in reverse
# here: a script's name should say what it is, and this one is not what
# `check:` means even though it can go red.
#
# The live record is opened READ-ONLY -- only `happened` is ever run
# against it. Everything the four scripts write goes into a fresh,
# disposable directory.
#
# What gets stripped before the diff, and why each survives or doesn't:
#   - `@<git-hash>` in each event's attribution line: differs whenever the
#     scripts themselves have been committed since the live record was
#     built -- not a reproducibility defect, just which commit was HEAD.
#   - Attribution NAME and claimed/observed are kept, not stripped. They
#     must reproduce identically -- including the one Reviewer-attributed
#     evaluate in probe-bonsai-2b.sh -- and a stripped diff that could not
#     catch a broken --author override would not be proving what this
#     script exists to prove.
#
# **ISO timestamps used to be stripped here too, and no longer are (#166).**
# They differed because every write ran against `date -u` at the moment the
# script executed, so a replay run today could never match a live record
# built on an earlier day. Once the four scripts backfill real, verified
# dates via `--date` instead, `at` is deterministic content like any other
# field -- checked directly, 2026-08-31: a replay with the stripping simply
# deleted matched the live record byte for byte, with nothing left for the
# regex to remove. Leaving it stripped would have hidden the one thing this
# check exists to catch if a future edit ever made a script's `--date`
# non-deterministic again.
#
# Two distinct failure shapes, not conflated into one exit code:
#   ERROR   the checker itself could not run -- a replay script died, or a
#           `labkit` read errored. Nothing about the record was compared,
#           so nothing about it is asserted either way.
#   FAILED  both sides read cleanly and disagree. This is the real defect
#           this script exists to catch.
# Without the distinction, a replay that dies partway through (a guard
# firing, say) leaves a short fresh record, and every later live event
# reads as "drift" -- the right exit code for the wrong reason, which is
# worse than no check at all because it points the reader at a handle
# that never actually moved.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
live="${1:-${LABKIT_HOME:-}}"
[ -n "$live" ] || { echo "usage: LABKIT_HOME=<live-db-dir> $0, or $0 <live-db-dir>" >&2; exit 2; }
[ -d "$live/.labkit" ] || { echo "no .labkit record at $live" >&2; exit 2; }

fresh="$(mktemp -d)"
trap 'rm -rf "$fresh"' EXIT

echo "replaying the five scripts into $fresh" >&2
for script in probe-bonsai-1a.sh probe-bonsai-1b2-1d.sh probe-bonsai-2a.sh probe-bonsai-2b.sh probe-bonsai-3-gates.sh; do
  echo "  $script" >&2
  # probe-bonsai-3-gates.sh reads gates.toml from a real Bonsai checkout,
  # which $fresh (a disposable temp dir) doesn't have -- $live is that
  # checkout. Every other script ignores the second argument.
  if ! bash "$root/scripts/$script" "$fresh" "$live" >/dev/null; then
    echo "ERROR: $script failed replaying; the record was not compared." >&2
    exit 2
  fi
done

normalize() {
  # Drop the @<hash> token from an attribution line, wherever it sits.
  # No longer strips ISO timestamps -- see the header comment (#166).
  sed -E -e 's/ @[0-9a-f]+,/,/'
}

# stdout and stderr kept apart deliberately: a CLI error on stderr must
# not be silently absorbed into the diff as if it were event text.
#
# `read_side`'s own `exit 2` only ends the subshell it runs in --
# `$(read_side ...)` is one too, the same trap a pipeline sets, one level
# up. Without checking `$?` at every call site, that `exit` is swallowed:
# the assignment "succeeds" with an empty string and the script carries
# on to print ERROR and then a bogus FAILED diff on top of it. Every
# caller below is `x="$(read_side ...)" || exit $?` for exactly that
# reason -- do not move the check back inside this function.
read_side() {
  local db="$1"; shift
  local err out rc
  err="$(mktemp)"
  out="$(bun "$root/src/cli/cli.ts" --db "$db" "$@" 2>"$err")"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "ERROR: labkit $* against $db failed:" >&2
    cat "$err" >&2
    rm -f "$err"
    exit 2
  fi
  rm -f "$err"
  printf '%s' "$out"
}

# `happened` proves the event STREAM matches; `known` reads the graph
# itself and is cheap to add, so both sides of "what a script did" and
# "what the record now says" are covered, not just the former.
live_happened="$(read_side "$live" happened --limit 1000)" || exit $?
live_happened="$(printf '%s' "$live_happened" | normalize)"
fresh_happened="$(read_side "$fresh" happened --limit 1000)" || exit $?
fresh_happened="$(printf '%s' "$fresh_happened" | normalize)"
live_known="$(read_side "$live" known)" || exit $?
fresh_known="$(read_side "$fresh" known)" || exit $?

happened_diff=$(diff <(printf '%s\n' "$live_happened") <(printf '%s\n' "$fresh_happened")) && happened_ok=1 || happened_ok=0
known_diff=$(diff <(printf '%s\n' "$live_known") <(printf '%s\n' "$fresh_known")) && known_ok=1 || known_ok=0

if [ "$happened_ok" = 1 ] && [ "$known_ok" = 1 ]; then
  echo "OK: the live event stream and graph state are exactly what the four scripts produce, commit hashes aside."
  exit 0
fi

echo "FAILED: the live record has drifted from what the four scripts produce." >&2
[ "$happened_ok" = 0 ] && { echo "-- event stream (happened) --"; echo "$happened_diff"; }
[ "$known_ok" = 0 ] && { echo "-- graph state (known) --"; echo "$known_diff"; }
echo >&2
echo "A handle name below is the usual cause -- probe-bonsai-2a.sh's hardcoded" >&2
echo "q6=\"Q_6\" / loe6=\"LOE_6\" inheritance from probe-bonsai-1b2-1d.sh is the" >&2
echo "known fragile point (guarded on write, not proven identical until now)." >&2
exit 1
