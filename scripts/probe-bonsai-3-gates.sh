#!/usr/bin/env bash
# Imports Bonsai's real gates.toml (reviewer requirement 4's binding-clause
# inventory) into LabKit, driving the CLI the same way the probe-bonsai-*
# scripts do. #127. Thin wrapper: the row-by-row logic lives in
# import-bonsai-gates.ts because parsing and iterating gates.toml's rows is
# not something bash does honestly.
#
#   LABKIT_HOME=~/Code/pycharm/bonsai-2026 bash scripts/probe-bonsai-3-gates.sh
#   bash scripts/probe-bonsai-3-gates.sh <db-dir> [<bonsai-source-dir>]
#
# <bonsai-source-dir> is where gates.toml actually lives; it defaults to
# <db-dir>, which is right whenever LabKit's db sits inside the Bonsai
# checkout itself (the normal case). probe-bonsai-replay.sh passes the two
# apart, because its <db-dir> is a disposable temp directory with no
# gates.toml in it at all.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="${1:-${LABKIT_HOME:-}}"
# Nothing here was watched happening: every act below is transcribed from a
# source, so every event it writes says which one. One export covers the file;
# `labkit happened` shows it on each act, which is what makes a stale one
# visible rather than silent.
export LABKIT_RECONSTRUCTED_FROM="bonsai-2026 experiments/stage2b_denoising/gates.toml"

source_dir="${2:-$db}"
[ -n "$db" ] || { echo "usage: LABKIT_HOME=<dir> $0, or $0 <db-dir> [<bonsai-source-dir>]" >&2; exit 2; }

exec bun "$root/scripts/import-bonsai-gates.ts" "$db" "$source_dir"
