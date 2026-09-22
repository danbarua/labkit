#!/usr/bin/env zsh
# Builds the whole Bonsai record from the transcription scripts into the record LK names,
# then replays them into a fresh database and diffs the two.
#
#   LK='<labkit cmd with target>' zsh scripts/db/build-bonsai-record.sh [<bonsai-source-dir>]
#   bun run bonsai:record
#
# LK is the labkit command including its record target (`--db <dir>`, or `--tenant <name>`
# with LABKIT_DB_URL exported). The target must hold no acts yet: the scripts `search` for
# handles earlier scripts wrote, so a build over a record that already has some resolves
# against the wrong ones instead of failing.
#
# What comes from the Bonsai checkout is `gates.toml`, read-only, because it is source data
# rather than output. That is the only dependency on the checkout; if it is missing this
# refuses rather than building a record with the governance arc silently absent.
set -euo pipefail

root=${0:A:h:h:h}

[[ -n ${LK:-} ]] || { print -u2 "usage: LK='<labkit cmd with target>' $0 [<bonsai-source-dir>]"; exit 2 }
export LK

gates_source=${1:-${BONSAI_SOURCE:-$HOME/Code/pycharm/bonsai-2026}}
gates_rel=experiments/stage2b_denoising/gates.toml
if [[ ! -f $gates_source/$gates_rel ]]; then
  print -u2 "build-bonsai-record.sh: no $gates_rel under $gates_source"
  print -u2 "  pass the Bonsai checkout as the argument, or set BONSAI_SOURCE."
  print -u2 "  It is read from and never written to; everything this builds goes to the record LK names."
  exit 2
fi

print -r -- "record:       $LK"
print -r -- "gates.toml:   $gates_source/$gates_rel (read-only)"
print

acts=$(${=LK} happened --limit 1 --json | jq -er '.acts | length') \
  || { print -u2 "build-bonsai-record.sh: could not read the record LK names ($LK)"; exit 2 }
if (( acts != 0 )); then
  print -u2 "build-bonsai-record.sh: the record LK names ($LK) already holds acts."
  print -u2 "  The scripts search for handles by wording, so they need an empty record; make the target fresh and re-run."
  exit 2
fi

# Each stage's output goes to its own log; only a failing stage's tail is shown.
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT

probe() {
  local name=$1
  shift
  print -r -- "=== $name.sh"
  if ! zsh "$root/scripts/db/$name.sh" "$@" > "$staging/build-$name.log" 2>&1; then
    tail -20 "$staging/build-$name.log" >&2
    exit 1
  fi
}

for stage in 1a 1b2-1d 2a 2b; do
  probe "probe-bonsai-$stage"
done

probe "probe-bonsai-3-gates" "$gates_source"

# The record is only worth keeping if it is the one the scripts describe, which is the
# question probe-bonsai-replay.sh answers: it replays every script into a fresh disposable
# database and diffs the result against what was just built.
print
print -r -- "=== probe-bonsai-replay.sh"
LK="$LK" zsh "$root/scripts/db/probe-bonsai-replay.sh" "$gates_source"

print
print -r -- "OK: record built ($LK), replay clean."
