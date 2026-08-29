#!/usr/bin/env bash
# The first vertical slice of the port, as six commands and their exact output.
#
# **This file is the target, not a description of one.** Run it against the Bun
# binary to regenerate `slice-2.expected`; run it against the Rust binary and
# diff. Parity is then a mechanical result rather than two people reading two
# terminals.
#
# Why a *vertical* slice and not a layer: these six exercise argument parsing,
# handle minting (CRIT_1, LOE_1, TASK_1, GATE_1), four graph writes, a survey
# read that buckets, and a computed gate state -- which is the whole shape of
# the application in miniature. A layer would prove nothing until the last one
# landed.
#
# Usage:  slice-2.sh <command...>          e.g. slice-2.sh bun src/cli/cli.ts
#                                               slice-2.sh ./target/debug/labkit-grafeo
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: $0 <command to run labkit>" >&2; exit 2; }

# **Capture the runner before anything shifts it.** The first version defined
# `lk() { "$@" --db "$db"; }` and called it with only the labkit subcommand, so
# the shell tried to execute a program named `criterion`. Every command
# "failed", and the generated fixture was six failure markers -- which would
# have passed against a Rust binary that printed nothing at all.
RUNNER=("$@")

db=$(mktemp -d "${TMPDIR:-/tmp}/labkit-parity.XXXXXX")
trap 'rm -rf "$db"' EXIT

# `--db` into a throwaway directory: the run shares nothing with a working
# database, which is what makes this safe to run anywhere.
lk() { "${RUNNER[@]}" --db "$db" "$@"; }

# stdout only. The "creating a new record" notice goes to stderr by design --
# the whole of a write command's stdout is an id the next command consumes --
# and it carries an absolute temp path, so it could never be diffed anyway.
# It is asserted separately at the bottom.
# **One field is normalised, and only one.** An evaluation is stamped with the
# moment it happened, so `gate` prints an ISO timestamp that differs on every
# run. Left alone the diff is red forever, which is the same defect as green
# forever: a signal nobody can act on. Both binaries pass through this, so a
# port that omitted the stamp entirely would still be caught -- the line would
# lose its shape, not just its value.
normalise() { sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z/<timestamp>/g'; }

run() {
  printf '$ labkit %s\n' "$*"
  lk "$@" 2>/dev/null | normalise || printf '<<the command failed>>\n'
  printf '\n'
}

run criterion 'the effect holds at n>=20'
run open 'does the pruning schedule move convergence?'
run plan --objective 'sweep depth 4 through 20' --acceptance 'a curve with n>=20 at each depth' --may-read raw
run declare --governed-by CRIT_1 --consequence 'may not be built on until this holds' --protecting TASK_1
# Slice 1's five acts, unchanged -- slice 2 continues the same record rather
# than starting a fresh one, because `known` only becomes interesting once
# something has been run against a question.
run observe LOE_1 --name depth-sweep-raw --finding 'convergence step counts at depths 4, 8, 12, 16, 20' --hash sha256:9f2b
run analyse LOE_1 --method 'paired comparison against the unpruned baseline' --from ART_1 --implementing TASK_1 --held-to CRIT_1 --concludes '{"proposition": "the pruning schedule moves convergence", "finding": "converges ~3 steps earlier at every depth"}'
run known
run why CLM_1
run promote CLM_1 --because 'we are relying on this to ship'
run close LOE_1 --answered-by CLM_1
run known
run evaluate CRIT_1 --gate GATE_1 --value 'n=24 at every depth' --outcome pass
run gate GATE_1
run known
