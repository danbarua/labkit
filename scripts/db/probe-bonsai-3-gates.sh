#!/usr/bin/env zsh
# Imports Bonsai's real gates.toml (reviewer requirement 4's binding-clause
# inventory) into LabKit, driving the CLI the same way the probe-bonsai-*
# scripts do. Thin wrapper: the row-by-row logic lives in
# import-bonsai-gates.ts because parsing and iterating gates.toml's rows is
# not something a shell script does honestly.
#
#   LK='bun packages/app-cli/cli.ts --db <dir>' zsh scripts/db/probe-bonsai-3-gates.sh [<bonsai-source-dir>]
#
# LK is the labkit command including its record target (`--db <dir>`, or
# `--tenant <name>` with LABKIT_DB_URL exported). <bonsai-source-dir> is the
# checkout holding experiments/stage2b_denoising/gates.toml; it defaults to
# $BONSAI_SOURCE, then ~/Code/pycharm/bonsai-2026.
set -euo pipefail

[[ -n ${LK:-} ]] || { print -u2 "usage: LK='bun packages/app-cli/cli.ts --db <dir>' $0 [<bonsai-source-dir>]"; exit 2 }

root=${0:A:h:h:h}
source_dir=${1:-${BONSAI_SOURCE:-$HOME/Code/pycharm/bonsai-2026}}

# Nothing here was watched happening: every act below is transcribed from a
# source, so every event it writes says which one. One export covers the file;
# `labkit happened` shows it on each act, which is what makes a stale one
# visible rather than silent.
export LABKIT_RECONSTRUCTED_FROM="bonsai-2026 experiments/stage2b_denoising/gates.toml"

exec bun "$root/scripts/db/import-bonsai-gates.ts" "$source_dir"
