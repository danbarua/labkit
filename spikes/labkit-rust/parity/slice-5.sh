#!/usr/bin/env bash
# The first vertical slice of the port, as six commands and their exact output.
#
# **This file is the target, not a description of one.** Run it against the Bun
# binary to regenerate `slice-4.expected`; run it against the Rust binary and
# diff. Parity is then a mechanical result rather than two people reading two
# terminals.
#
# Why a *vertical* slice and not a layer: these six exercise argument parsing,
# handle minting (CRIT_1, LOE_1, TASK_1, GATE_1), four graph writes, a survey
# read that buckets, and a computed gate state -- which is the whole shape of
# the application in miniature. A layer would prove nothing until the last one
# landed.
#
# Usage:  slice-4.sh <command...>          e.g. slice-4.sh bun src/cli/cli.ts
#                                               slice-4.sh ./target/debug/labkit-grafeo
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

# Slice 3: the reads that work off the record slices 1 and 2 built, plus the
# two write verbs that mint without composing. Every one takes a handle the
# caller already holds, or no argument at all.
run claims 'the pruning schedule moves convergence'
run pursuits Q_1
run enquiry LOE_1
run criteria GATE_1
run contract TASK_1
run gates
run work
run origin Q_1
run interpretation CLM_1
run affects depth-sweep-raw
run pose 'does batch size interact?'
run pursue Q_2 --approach 'vary batch size at fixed depth'
run gates --state satisfied
run work --state carried-out

# Slice 4: the verbs that record a *change of mind* — a review, an amended
# condition, a narrowed reading, a question sharpened, an enquiry accepted as
# unresolved. Each mints a Decision or a Review and points it at what it acted
# on; the reports that read them back come next.
run review COMP_1 --verdict 'the baseline was mismatched at depth 4'
run sharpen Q_2 --into 'does batch size interact below depth 8?' --because 'the sweep only disagreed at low depth'
run origin Q_3
run amend CRIT_1 --now-requires 'the effect holds at n>=20 and at depth<8' --because 'the low-depth disagreement' --citing CLM_1
run design GATE_1
run reinterpret CLM_1 --as 'the pruning schedule moves convergence below depth 8' --because 'the amended condition'
run interpretation CLM_1
run accept LOE_2 --because 'the equipment is unavailable' --until 'the new sampler lands' --in-light-of CLM_1
run known
run conflict CLM_1 CLM_2

# Slice 5: the supersession chain and everything that reads it -- a second
# amendment on the same design, a re-check of an earlier analysis, what that
# re-check read against what the original read, a replacement for a defective
# analysis, and whether an analysis can be accounted for from what it read.
# Each of these needed `design` widened from "the immediately prior step" to
# the full chain LabKit's own `designHistory()` walks, and `SUPERSEDES` fixed
# to Decision -> Decision first (see README).
#
# A second amendment first, on CRIT_2 rather than CRIT_1 -- reaching the
# chain-continuation branch design's rewrite needed, not the fresh-chain one
# slice 4 already covers.
run amend CRIT_2 --now-requires 'the effect holds at n>=20 and at depth<4' --because 'a second refinement, below the first' --citing CLM_1
run design GATE_1
#
# reverify/replace/reproducibility get their own question and analysis rather
# than reusing CLM_1's -- `reinterpret` (slice 4) already withdrew "the
# pruning schedule moves convergence", and re-asserting a withdrawn
# proposition is refused by the record, correctly. That refusal is real
# domain behaviour, not a gap to route around.
run pose 'does the correction change the sign of the effect?'
run pursue Q_4 --approach 'redo the analysis on a held-out set'
run observe LOE_3 --name held-out-raw --finding 'held-out convergence counts' --hash sha256:aa11
run observe LOE_3 --name held-out-raw-nohash --finding 'a second, unhashed observation'
run analyse LOE_3 --method 'held-out comparison' --from ART_3 --concludes '{"proposition": "the effect holds on the held-out set", "finding": "it does, by a smaller margin"}'
run analyse LOE_3 --method 'a second read of the same data' --from ART_4 --concludes '{"proposition": "the held-out margin depends on the split", "finding": "no dependence found"}'
run reverify COMP_2 --enquiry LOE_3 --method 're-run under fresh sampling' --under ART_3 --concludes '{"proposition": "the effect holds on the held-out set", "finding": "still holds, similar margin"}'
run reproduction COMP_4
run review COMP_2 --verdict 'the held-out comparison mismatched sampling seeds'
run replace COMP_2 --because REV_3 --enquiry LOE_3 --method 'corrected held-out comparison' --from ART_3 --concludes '{"proposition": "the effect holds on the held-out set", "finding": "holds, corrected margin"}'
run reproducibility COMP_2 ART_3=sha256:aa11
run reproducibility COMP_2 ART_3=sha256:wrong
run reproducibility COMP_2
run reproducibility COMP_3 ART_4=sha256:anything
