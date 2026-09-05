#!/usr/bin/env bash
# Builds the whole Bonsai record from the transcription scripts, in this
# checkout, into a directory this repository owns.
#
#   bun run bonsai:record                 # rebuild .labkit-bonsai/ from scratch
#   bun run bonsai:record -- --deploy     # and copy it over the Bonsai checkout's
#   bash scripts/build-bonsai-record.sh [--deploy] [<db-dir>] [<gates-source-dir>]
#
# **It lives here rather than in the Bonsai checkout, and that is the point.**
# The record was built into `~/Code/pycharm/bonsai-2026/.labkit` for as long as
# the transcription was archaeology performed on that repository. It is not
# that any more: the only things that read or write this record are LabKit's
# own agents and `probe-bonsai-replay.sh`, nobody is working in Bonsai, and
# treating a checkout nobody is touching as production turned every script
# change into a handover -- three separate issues (#204, #212, #233) whose
# entire content was "someone please re-run five commands", and a fourth
# (#296) filed the same way before this script existed.
#
# What still comes from the Bonsai checkout is `gates.toml`, read-only, because
# it is source data rather than output. That is the honest dependency and it is
# the only one; if it is missing this refuses rather than building a record
# with the governance arc silently absent.
#
# **`--deploy` is the only thing here that writes outside this repository**, and
# it is a flag a person types rather than the default, because it replaces a
# record it cannot see the contents of. It runs after the replay check, never
# before: what gets copied is a record already proved to be the one the scripts
# describe. The old record is moved aside rather than deleted, and its path is
# printed, so a deploy is undoable by `mv`.
#
# The record is a PGlite database of tens of megabytes and is not committed:
# `.gitignore`'s bare `.labkit` matches the directory the CLI creates inside
# whatever `--db` names, at any depth. Verified rather than assumed -- see the
# `git status --porcelain` assertion at the end, which fails if anything under
# the record's directory has become trackable.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

deploy=0
args=()
for arg in "$@"; do
  if [ "$arg" = "--deploy" ]; then deploy=1; else args+=("$arg"); fi
done

db="${args[0]:-$root/.labkit-bonsai}"
gates_source="${args[1]:-${BONSAI_SOURCE:-$HOME/Code/pycharm/bonsai-2026}}"

gates_rel="experiments/stage2b_denoising/gates.toml"
if [ ! -f "$gates_source/$gates_rel" ]; then
  echo "build-bonsai-record.sh: no $gates_rel under $gates_source" >&2
  echo "  pass the Bonsai checkout as the second argument, or set BONSAI_SOURCE." >&2
  echo "  It is read from and never written to; everything this builds goes to $db." >&2
  exit 2
fi

echo "record:       $db"
echo "gates.toml:   $gates_source/$gates_rel (read-only)"
echo

# From scratch, every time. A partial record is worse than none: the scripts
# `search` for handles a previous run wrote, so a rebuild over a half-built
# record resolves against the wrong one instead of failing.
rm -rf "$db"
mkdir -p "$db"

for stage in 1a 1b2-1d 2a 2b; do
  echo "=== probe-bonsai-$stage.sh"
  bash "$root/scripts/probe-bonsai-$stage.sh" "$db" > "$db/build-$stage.log" 2>&1
done

echo "=== probe-bonsai-3-gates.sh"
bash "$root/scripts/probe-bonsai-3-gates.sh" "$db" "$gates_source" > "$db/build-3-gates.log" 2>&1

# The record is only worth keeping if it is the one the scripts describe, which
# is the question `probe-bonsai-replay.sh` exists to answer: it replays every
# script into a fresh disposable database and diffs the event stream against
# what is here. Zero lines out.
echo
echo "=== probe-bonsai-replay.sh"
bash "$root/scripts/probe-bonsai-replay.sh" "$db" "$gates_source"

# Nothing here may become trackable. What makes this a real assertion rather
# than a formality is the database itself: narrowing `.gitignore`'s `.labkit`
# to a rooted path -- the obvious-looking tidy-up -- would leave forty megabytes
# under `$db/.labkit/` staring at the next `git add`, and this fires. The build
# logs beside it are covered by `*.log` instead and prove nothing either way.
untracked=$(cd "$root" && git status --porcelain --untracked-files=all -- "$db" | head -5)
if [ -n "$untracked" ]; then
  echo >&2
  echo "build-bonsai-record.sh: the record is not ignored by git:" >&2
  printf '%s\n' "$untracked" >&2
  exit 1
fi

if [ "$deploy" = 1 ]; then
  echo
  echo "=== deploy to $gates_source"
  if [ -e "$gates_source/.labkit" ]; then
    aside="$gates_source/.labkit.replaced-$(date -u +%Y%m%dT%H%M%SZ)"
    mv "$gates_source/.labkit" "$aside"
    echo "  previous record moved to $aside"
  fi
  cp -R "$db/.labkit" "$gates_source/.labkit"
  echo "  deployed."
fi

echo
echo "OK: record built at $db, replay clean, nothing trackable."
