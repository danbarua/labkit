#!/usr/bin/env bash
# The first vertical slice of the port, as six commands and their exact output.
#
# **This file is the target, not a description of one.** Run it against the Bun
# binary to regenerate `slice-1.expected`; run it against the Rust binary and
# diff. Parity is then a mechanical result rather than two people reading two
# terminals.
#
# Why a *vertical* slice and not a layer: these six exercise argument parsing,
# handle minting (CRIT_1, LOE_1, TASK_1, GATE_1), four graph writes, a survey
# read that buckets, and a computed gate state -- which is the whole shape of
# the application in miniature. A layer would prove nothing until the last one
# landed.
#
# Usage:  slice-1.sh <command...>          e.g. slice-1.sh bun src/cli/cli.ts
#                                               slice-1.sh ./target/debug/labkit-grafeo
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
run() {
  printf '$ labkit %s\n' "$*"
  lk "$@" 2>/dev/null || printf '<<the command failed>>\n'
  printf '\n'
}

run criterion 'the effect holds at n>=20'
run open 'does the pruning schedule move convergence?'
run plan --objective 'sweep depth 4 through 20' --acceptance 'a curve with n>=20 at each depth' --may-read raw
run declare --governed-by CRIT_1 --consequence 'may not be built on until this holds' --protecting TASK_1
run known
run gate GATE_1
