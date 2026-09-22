#!/usr/bin/env zsh
# Proves the live Bonsai record is script-derived: replays the probe-bonsai-*.sh scripts
# into a fresh database and diffs the result against the live one. Zero lines out is the point.
#
#   LK='<labkit cmd with the live target>' zsh scripts/db/probe-bonsai-replay.sh [<bonsai-source-dir>]
#
# LK is the labkit command including its record target (`--db <dir>`, or `--tenant <name>`
# with LABKIT_DB_URL exported). <bonsai-source-dir> is the checkout holding
# experiments/stage2b_denoising/gates.toml; it defaults to $BONSAI_SOURCE, then
# ~/Code/pycharm/bonsai-2026.
#
# Not registered in package.json and not in `bun run check`'s sweep: it needs a Bonsai
# checkout the repository cannot assume exists, and it takes minutes. Unlike probe-dogfood.sh
# its exit code is the outcome.
#
# The live record is only read -- `happened` and `known`. Everything the scripts write goes
# into a fresh, disposable directory.
#
# Both sides are compared as JSON. Two fields are dropped from every act before the diff:
#   - `attribution.git_hash`: which commit was HEAD when the act was recorded, so it differs
#     whenever the scripts have been committed since the live record was built.
#   - `at`: the clock at the moment of recording.
# Attribution name and observed/claimed are kept. They must reproduce identically -- including
# the one Reviewer-attributed evaluate in probe-bonsai-2b.sh -- or the diff could not catch a
# broken --author override.
#
# Two distinct failure shapes, not conflated into one exit code:
#   ERROR (2)  the checker itself could not run -- a replay script died, or a read errored.
#              Nothing about the record was compared, so nothing about it is asserted.
#   FAILED (1) both sides read cleanly and disagree. This is the defect this script catches.
# Without the distinction, a replay that dies partway through leaves a short fresh record and
# every later live act reads as drift -- the right exit code for the wrong reason.
set -uo pipefail

root=${0:A:h:h:h}

[[ -n ${LK:-} ]] || { print -u2 "usage: LK='<labkit cmd with the live target>' $0 [<bonsai-source-dir>]"; exit 2 }
live_lk=$LK

gates_source=${1:-${BONSAI_SOURCE:-$HOME/Code/pycharm/bonsai-2026}}
gates_rel=experiments/stage2b_denoising/gates.toml
if [[ ! -f $gates_source/$gates_rel ]]; then
  print -u2 "ERROR: no $gates_rel under $gates_source; nothing was compared."
  print -u2 "  pass the Bonsai checkout as the argument, or set BONSAI_SOURCE."
  exit 2
fi

fresh=$(mktemp -d)
trap 'rm -rf "$fresh"' EXIT
fresh_lk="bun $root/packages/app-cli/cli.ts --db $fresh"

print -u2 "replaying the scripts into $fresh"
for stage in 1a 1b2-1d 2a 2b 3-gates; do
  script=probe-bonsai-$stage.sh
  print -u2 "  $script"
  args=()
  [[ $stage == 3-gates ]] && args=("$gates_source")
  if ! LK=$fresh_lk zsh "$root/scripts/db/$script" "${args[@]}" >/dev/null; then
    print -u2 "ERROR: $script failed replaying; the record was not compared."
    exit 2
  fi
done

# stdout and stderr kept apart deliberately: a CLI error on stderr must not be silently
# absorbed into the diff as if it were record content.
#
# `read_side`'s own `exit 2` only ends the subshell it runs in -- `$(read_side ...)` is one
# too, the same trap a pipeline sets, one level up. Without checking `$?` at every call site,
# that `exit` is swallowed: the assignment "succeeds" with an empty string and the script
# carries on to print ERROR and then a bogus FAILED diff on top of it. Every caller below is
# `x="$(read_side ...)" || exit $?` for exactly that reason -- do not move the check back
# inside this function.
read_side() {
  local lk=$1; shift
  local err out rc
  err=$(mktemp)
  out=$(${=lk} "$@" 2>"$err")
  rc=$?
  if (( rc != 0 )); then
    print -u2 "ERROR: labkit $* against '$lk' failed:"
    cat "$err" >&2
    rm -f "$err"
    exit 2
  fi
  rm -f "$err"
  printf '%s' "$out"
}

acts_normalised() { jq -S '.acts | map(del(.attribution.git_hash, .at))'; }
graph_normalised() { jq -S .; }

# `happened` proves the act stream matches; `known` reads the graph itself, so both "what a
# script did" and "what the record now says" are covered.
live_happened="$(read_side "$live_lk" happened --limit 100000 --json)" || exit $?
live_happened=$(printf '%s' "$live_happened" | acts_normalised) \
  || { print -u2 "ERROR: the live event stream is not the JSON expected; nothing was compared."; exit 2 }
fresh_happened="$(read_side "$fresh_lk" happened --limit 100000 --json)" || exit $?
fresh_happened=$(printf '%s' "$fresh_happened" | acts_normalised) \
  || { print -u2 "ERROR: the fresh event stream is not the JSON expected; nothing was compared."; exit 2 }
live_known="$(read_side "$live_lk" known --json)" || exit $?
live_known=$(printf '%s' "$live_known" | graph_normalised) \
  || { print -u2 "ERROR: the live graph state is not the JSON expected; nothing was compared."; exit 2 }
fresh_known="$(read_side "$fresh_lk" known --json)" || exit $?
fresh_known=$(printf '%s' "$fresh_known" | graph_normalised) \
  || { print -u2 "ERROR: the fresh graph state is not the JSON expected; nothing was compared."; exit 2 }

happened_diff=$(diff <(printf '%s\n' "$live_happened") <(printf '%s\n' "$fresh_happened")) && happened_ok=1 || happened_ok=0
known_diff=$(diff <(printf '%s\n' "$live_known") <(printf '%s\n' "$fresh_known")) && known_ok=1 || known_ok=0

if (( happened_ok && known_ok )); then
  print -r -- "OK: the live event stream and graph state are exactly what the scripts produce, commit hashes and clocks aside."
  exit 0
fi

print -u2 "FAILED: the live record has drifted from what the scripts produce."
(( happened_ok )) || { print -r -- "-- event stream (happened) --"; print -r -- "$happened_diff"; }
(( known_ok )) || { print -r -- "-- graph state (known) --"; print -r -- "$known_diff"; }
print -u2
print -u2 "A handle name above is the usual cause: the later scripts find their"
print -u2 "inherited handles with \`labkit search\`, so a wording change in an earlier"
print -u2 "script moves what a later one resolves to."
exit 1
