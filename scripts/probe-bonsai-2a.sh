#!/usr/bin/env bash
# Transcribes Bonsai's real Stage 2A into LabKit, by hand, through the CLI.
# Continuation of #135/#125 -> #144/#147 (Stage 1B.2/1C/1D) -- same real
# record, same rules: no verb pre-picked, every invented fact / hesitation /
# wrong answer checked against #132/#133/#134/#137/#139/#143/#146 before
# being filed as new.
#
#   LABKIT_HOME=~/Code/pycharm/bonsai-2026 bash scripts/probe-bonsai-2a.sh
#   bash scripts/probe-bonsai-2a.sh <db-dir>
#
# Answers Q_6/LOE_6 -- accepted as unresolved in the previous chain's Stage
# 1B.2 ("can this structured mapping be linked to an externally defined task
# or information-processing objective (Level 3)?"), reopening condition
# "define and run against an external task." Q_6/LOE_6 are FOUND, not
# hardcoded (#155's `labkit search`, added 2026-08-31) -- this script's
# inheritance from the prior script's `accept` call is real (the wording is
# theirs, not this script's own), but the handle numbering is not this
# script's to assume. `search` finds the question by its distinctive
# wording, refuses to pick if more than one match comes back, and
# `pursuits` finds the one line of enquiry pursuing it -- both fail loudly
# rather than silently writing Stage 2A's answer onto a question a prior
# script's handle numbering happened to shift onto.
#
# ## What transcribing this found
#
# **Third instance of #143's shape, as predicted.** Stage 2A resolves Q_6
# by `close`-ing LOE_6 with a real answer -- watch #143's own comment
# thread for whether this recurs identically (a sibling enquiry never
# existed here, unlike items 1/2's LOE_4/LOE_7 and LOE_3/LOE_5 pattern, so
# LOE_6 closes on itself rather than being superseded by a second pursuit;
# worth noting as a *different* shape of the same underlying gap, not a
# third identical repro).
#
# **#98, reproduced live, not reasoned about.** `plan --objective
# --acceptance` mints a Task with no question and no enquiry parameter.
# Declared one anyway (the feasibility ladder's go/no-go gate genuinely is
# real, gated work), then asked `labkit contract` for it -- confirmed
# directly: it answers "what is this work for" with the objective/
# acceptance text alone, nothing connecting it to Q_6, exactly as #98's own
# `TaskContract = {work, objective, acceptance, mayRead, enforced}` says.
# Commented on #98 with this concrete instance rather than filing a
# duplicate.
#
# **A second instance of #146, not a `reinterpret`.** Stage 2A's own
# FINDINGS.md originally claimed "the four [evolved] graphs are not
# equivalent [in task utility]" from eyeballing four non-overlapping
# confidence intervals against a shared baseline -- external review found
# this overclaimed what separate CIs against one baseline can support, and
# it was narrowed to "each graph individually beats pre-evolution" (the
# four secondary conclusions transcribed below). Checked whether
# `reinterpret` fits: it narrows an existing CLAIM's reading, and the
# overclaim was never its own `--concludes` output in this transcription --
# it was freehand synthesis over the four already-recorded claims, exactly
# #146's shape ("no verb for a claim that synthesizes others without a new
# computation"). Minting a claim just to reinterpret it would manufacture
# the very thing #146 already names as missing (PJ-019: a refusal, and by
# the same logic a correction, needs something real to act on). Commented
# on #146 instead.
#
# **Yes, LabKit has somewhere to put an infrastructure/compute-cost
# finding -- it needed no new structure, just its own line of enquiry.**
# `COMPUTE_COST_DESIGN.md`/`COMPUTE_COST_FINDINGS.md` answer a genuinely
# different question from Q_6 (does the oscillator ever get *cheaper*, not
# does it *classify better*) with a real method, a real input, and a real
# negative finding -- transcribed below as an ordinary `pose`/`pursue`/
# `analyse`/`close`, same shape as everything else in this project.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="${1:-${LABKIT_HOME:-}}"
[ -n "$db" ] || { echo "usage: LABKIT_HOME=<dir> $0, or $0 <db-dir>" >&2; exit 2; }

lab() { bun "$root/src/cli/cli.ts" --db "$db" --author probe-bonsai-2a.sh "$@"; }
ask() { printf '\n\033[1m$ labkit %s\033[0m\n' "$*"; lab "$@"; }
say() { printf '\n\n=== %s\n' "$1"; }

say "found via search, not hardcoded: the Level-3 question the prior script accepted"
# `search` replaces both the old hardcoded q6="Q_6" and the guard that
# checked it against LOE_6's own wording after the fact -- the search
# itself is the guard now: it fails loudly (empty, or more than one
# match) rather than silently writing Stage 2A's answer onto a question
# a prior script's handle numbering happened to shift onto.
search_out=$(lab search "externally defined task or information-processing objective")
q6_matches=$(printf '%s\n' "$search_out" | grep -oE '\(Q_[0-9]+\)' | tr -d '()')
q6_count=$(printf '%s\n' "$q6_matches" | grep -c '^Q_' || true)
if [ "$q6_count" -ne 1 ]; then
  echo "probe-bonsai-2a.sh: expected exactly one question for the Level-3 wording, found $q6_count -- refusing to pick" >&2
  exit 1
fi
q6="$q6_matches"
loe6=$(lab pursuits "$q6" | grep -oE 'LOE_[0-9]+')
loe6_count=$(printf '%s\n' "$loe6" | grep -c '^LOE_' || true)
if [ "$loe6_count" -ne 1 ]; then
  echo "probe-bonsai-2a.sh: expected exactly one line of enquiry pursuing $q6, found $loe6_count" >&2
  exit 1
fi
ask enquiry "$loe6"

say "the feasibility ladder's go/no-go gate -- a quality bar, not a hypothesis"

task_ladder=$(lab plan \
  --objective "advance Stage 2A's feasibility ladder (stages 1-3, up to the full 60,000-image official KMNIST training set) to the locked stage-4 confirmatory evaluation against the untouched official test set" \
  --acceptance "zero solver failures, zero non-finite feature vectors, every required fold/C classifier fit converges")
crit_gono=$(lab criterion "Stage 2A go/no-go gate: zero solver failures, zero non-finite feature vectors, and every required fold/C classifier fit converges, across the full feasibility ladder -- a pipeline-health quality bar, not a scientific result, locked before running")
gate_gono=$(lab declare --governed-by "$crit_gono" --consequence "stage 4 does not run against the official test set, pending investigation" --protecting "$task_ladder")
art_gono=$(lab observe "$loe6" --name stage2a_go_no_go \
  --finding "0/240,000 (image,topology) evolutions failed; 0 non-finite features in any condition, any topology; 270/270 fold/C fits converged, 6/6 final refits converged" \
  --hash sha256:9da6b908)
lab evaluate "$crit_gono" --value "0/240,000 solver failures, 0 non-finite features, 270/270 + 6/6 classifier fits converged -- OVERALL: GO" --outcome pass --gate "$gate_gono" >/dev/null
ask gate "$gate_gono"

say "#98, checked directly: does the ladder's own task know why it exists?"
ask contract "$task_ladder"

say "the locked confirmatory result: T-evolved vs. encoded-pre-evolution, and three secondary graphs"

art_confirm2=$(lab observe "$loe6" --name stage2a_confirmatory_test_results \
  --finding "six conditions (raw pixels, encoded pre-evolution, evolved T/lattice/rewired/curr_random), each refit once at its already-selected C on the full 60,000-image official training set, then applied unchanged to the untouched 10,000-image official test set; 20,000 paired class-stratified bootstrap resamples per comparison" \
  --hash sha256:203e56ff)
out=$(lab analyse "$loe6" \
  --method "paired class-stratified bootstrap on per-image log-loss difference (evolved minus pre-evolution), 20,000 resamples, two-sided 95% percentile interval; locked success criterion: the entire interval below zero; secondary confirmation via exact McNemar's test on classification disagreement" \
  --from "$art_confirm2" \
  --concludes '{"proposition": "runtime graph evolution on T improves classification over the already dynamically-encoded pre-evolution state", "finding": "mean d_i=-0.2491, 95% CI [-0.2721,-0.2266], entirely below zero; McNemar p=6.68e-104 (1,234 test images correct only under evolved_T vs 384 only under pre-evolution)", "bearing": "supports"}' \
  --concludes '{"proposition": "runtime graph evolution on the matched lattice control improves classification over pre-evolution", "finding": "mean d_i=-0.1743, 95% CI [-0.1930,-0.1557], entirely below zero, McNemar p=1.55e-56", "bearing": "supports"}' \
  --concludes '{"proposition": "runtime graph evolution on the canonical rewired control improves classification over pre-evolution", "finding": "mean d_i=-0.2819, 95% CI [-0.3074,-0.2570], entirely below zero, McNemar p=9.76e-133", "bearing": "supports"}' \
  --concludes '{"proposition": "runtime graph evolution on the canonical current-random control improves classification over pre-evolution", "finding": "mean d_i=-0.3049, 95% CI [-0.3303,-0.2797], entirely below zero, McNemar p=8.42e-138", "bearing": "supports"}')
comp_confirm2=$(printf '%s\n' "$out" | sed -n 1p)
clm_primary=$(printf '%s\n' "$out" | sed -n 2p)
clm_sec_lattice=$(printf '%s\n' "$out" | sed -n 3p)
clm_sec_rewired=$(printf '%s\n' "$out" | sed -n 4p)
clm_sec_curr=$(printf '%s\n' "$out" | sed -n 5p)

# Promoted: this is the primary, locked, sole confirmatory comparison
# (DESIGN.md) and the strongest positive Level 3 result this project has
# produced. The three secondary claims stay unpromoted -- descriptive
# context per DESIGN.md's own primary/secondary hierarchy, same treatment
# 1D's four non-promoted "challenges" claims got, mirrored here for
# "supports" claims that are real but not the locked primary.
lab promote "$clm_primary" --because "the sole locked primary comparison, DESIGN.md's pre-registered success criterion (entire 95% CI below zero) met unambiguously, confirmed by an independent McNemar test on the same disagreement" >/dev/null

say "closing Q_6/LOE_6, and checking the reopening hesitation a third time"
lab close "$loe6" --answered-by "$clm_primary" >/dev/null
ask enquiry "$loe6"
ask known

say "a genuinely separate research question: does the oscillator ever become cheaper at scale?"

q_cost=$(lab pose "does the oscillator readout's runtime graph evolution ever become cheaper per image than an ordinary MLP baseline, at some deployment scale?")
loe_cost=$(lab pursue "$q_cost" --approach "per-topology train/inference cost accounting (encode, evolve, feature-post, CV search, final refit, single-image latency measured 100 repeats per condition), parameter-matched (H=13) and competent-context (H=128) MLP baselines; cuml.accel gated first (confirmed it does not accelerate MLPClassifier -- identical n_iter, near-identical wall-clock -- so MLP stays CPU sklearn, oscillator stays GPU, a real disclosed hardware asymmetry); break-even N solved algebraically per topology/baseline pair")
art_cost=$(lab observe "$loe_cost" --name stage2a_compute_cost_accounting \
  --finding "at N=1: oscillator (evolved_T, GPU evolution) costs 13.7x MLP_H128; at N=1,000,000: 375.6x; at N=100,000,000: 551.8x; every algebraic break-even point (any topology, either baseline) solves to a negative N" \
  --hash sha256:f9ec47d3)
out=$(lab analyse "$loe_cost" \
  --method "closed-form per-image cost model (Train_readout + N*Infer_readout vs Train_MLP + N*Infer_MLP), solved algebraically for the break-even N at every topology/baseline pair" \
  --from "$art_cost" \
  --concludes '{"proposition": "the oscillator readout becomes cheaper than an MLP baseline at some deployment scale", "finding": "no crossover exists at any plausible deployment scale -- the oscillator is strictly more expensive than either MLP baseline from N=1 to N=100,000,000, and the gap widens with scale rather than narrowing", "bearing": "challenges"}')
comp_cost=$(printf '%s\n' "$out" | sed -n 1p)
clm_cost=$(printf '%s\n' "$out" | sed -n 2p)
lab close "$loe_cost" --answered-by "$clm_cost" >/dev/null
ask enquiry "$loe_cost"

say "the events this script generated"
ask happened

say "read the answers above. This script asserts nothing on purpose."
exit 0
