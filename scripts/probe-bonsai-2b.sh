#!/usr/bin/env bash
# Transcribes Bonsai's real Stage 2B research arc into LabKit, by hand,
# through the CLI. Continuation of #135/#125 -> #144/#147 -> #149 (Stage
# 1B.2/1C/1D, Stage 2A). Same real record, same rules: no verb pre-picked,
# every invented fact / hesitation / wrong answer checked against
# #132/#133/#134/#137/#139/#143/#146/#150/#151 before being filed as new.
#
#   LABKIT_HOME=~/Code/pycharm/bonsai-2026 bash scripts/probe-bonsai-2b.sh
#   bash scripts/probe-bonsai-2b.sh <db-dir>
#
# **Rewritten for #173** (`conclude` is the primitive; `analyse` no longer
# takes `--concludes` JSON). Variables are named for what the handle IS.
#
# **Standing is recorded, not left to default** (#63). Stage 2B's design was
# locked on 2026-08-05 (`STAGE2B_DESIGN_LOCK`) and the confirmatory run is
# four days later, so both conclusions below are prespecified and say so.
# That is a different fact from promotion: `--standing confirmatory` is what
# the design locked, `is <claim> confirmed` is what the result earned, and
# only the primary gets the second.
#
# Stage 2B's own scientific question (does runtime graph evolution improve
# single-step active-support denoising, the Stage-2A-shaped question for
# reconstruction instead of classification), compressed feasibility ladder,
# and the locked stage-4 confirmatory result. Same shape as #149's Stage 2A.
#
# `gates.toml` -- the reviewer requirement 4 binding-clause inventory --
# used to have six representative rows transcribed here as a worked sample
# for #127's mapping question. #127's importer (`probe-bonsai-3-gates.sh`)
# now imports the file wholesale and supersedes that sample; the governance
# arc lives there, not here.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="${1:-${LABKIT_HOME:-}}"
[ -n "$db" ] || { echo "usage: LABKIT_HOME=<dir> $0, or $0 <db-dir>" >&2; exit 2; }

lab() { bun "$root/src/cli/cli.ts" --db "$db" --author probe-bonsai-2b.sh "$@"; }
ask() { printf '\n\033[1m$ labkit %s\033[0m\n' "$*"; lab "$@"; }
say() { printf '\n\n=== %s\n' "$1"; }

say "Stage 2B: does runtime graph evolution improve single-step denoising?"

# "Stage 2B: commit locked denoising design, close issue #13",
# 2026-08-05T01:09:28+01:00 -- the design lock this question and approach
# transcribe.
STAGE2B_DESIGN_LOCK=2026-08-05T00:09:28.000Z

denoising_question=$(lab --date "$STAGE2B_DESIGN_LOCK" pose "does runtime graph evolution, on top of an already dynamically-encoded local phase state, improve single-step active-support reconstruction under a fixed, majority-censored clipped-Gaussian corruption -- the Stage-2A-shaped question for denoising instead of classification?")
denoising_enquiry=$(lab --date "$STAGE2B_DESIGN_LOCK" pursue "$denoising_question" --approach "a four-stage feasibility ladder (n=1,000, n=5,000, Phase A/B at 60,000, one locked stage-4 confirmatory evaluation) reusing Stage 2A's encoder/evolution machinery against a ridge-based reconstruction readout, plus a separately-tested CNN baseline; corruption/RNG, the intercept-aware SVD ridge, studentized sign-flip and two Holm families locked before any ladder rung ran")

# "Build the Phase B driver, and clear two blockers found before
# provisioning", 2026-08-07T16:54:13+01:00 -- the last of the ladder
# milestones this one observation bundles (stages 1/2, the encoder-gate
# fix, Phase A, Phase B) to land.
STAGE2B_LADDER=2026-08-07T15:54:13.000Z

feasibility_ladder_observations=$(lab --date "$STAGE2B_LADDER" observe "$denoising_enquiry" --name stage2b_feasibility_ladder \
  --finding "stages 1 (n=1,000) and 2 (n=5,000) both _OK; Phase A (corrupt+encode, 60,000 images, moved to local CPU, 11.3 min) and Phase B (evolution/ridge/CNN on GPU) both complete; the encoder gate's own first real run FAILED honestly at ENCODER_STEPS=150 (rho=169.851 vs threshold 10), diagnosed as slow convergence not a floor, and re-ran PASS at 1,200 steps -- disclosed as a post-lock amendment, not silently raised" | grep '^ART_')

say "the locked stage-4 confirmatory result"

# "Record the Stage 4 official result: T is the unique winner",
# 2026-08-09T11:16:17+01:00 -- the commit that produced this observation,
# analysis and closure; "commit 431d90a" the finding text cites is the
# fix ("Fix the CNN test-evaluation shape bug...") one run earlier that
# made this result possible.
STAGE2B_STAGE4=2026-08-09T10:16:17.000Z

stage4_confirmatory_observations=$(lab --date "$STAGE2B_STAGE4" observe "$denoising_enquiry" --name stage2b_stage4_official_result \
  --finding "STAGE4_OK, run_ladder_stage4.py, commit 431d90a, one evaluation on the official 10,000-image KMNIST test corpus, active-support post-clip MSE; primary and denoising-gate tests outside both multiplicity families per the locked design, two Holm families (3-way controls-vs-pre, 6-way pairwise) run separately" | grep '^ART_')
stage4_confirmatory_analysis=$(lab --date "$STAGE2B_STAGE4" analyse "$denoising_enquiry" \
  --method "primary paired class-stratified bootstrap (d_i = MSE_i(T) - MSE_i(pre_evolution), 20,000 resamples, seed=42, two-sided 95% percentile interval); denoising gate (T vs identity) evaluated only because the primary succeeded, never rescuing a failed primary; two Holm-corrected families (3-way controls-vs-pre, 6-way pairwise among the four evolved graphs) with a 100,000-flip sign-flip robustness check on family 2" \
  --from "$stage4_confirmatory_observations" | grep '^COMP_')
primary_denoising_claim=$(lab --date "$STAGE2B_STAGE4" conclude "$stage4_confirmatory_analysis" \
  --proposition "runtime graph evolution on T improves single-step active-support reconstruction over the already dynamically-encoded pre-evolution state" --standing confirmatory \
  --finding "primary: mean d_i=-0.0044509, 95% CI [-0.0046028,-0.0043002], entirely below zero; denoising gate (T vs identity) also entirely below zero, CI [-0.1335739,-0.1328960] -- the actual-denoising claim is added to the primary reconstruction claim, not just the weaker relative one" \
  --bearing supports | grep '^CLM_')
unique_winner_claim=$(lab --date "$STAGE2B_STAGE4" conclude "$stage4_confirmatory_analysis" \
  --proposition "T is the unique winner among the four tested evolved graphs on this task" --standing confirmatory \
  --finding "all three controls beat pre_evolution (Family 1, Holm-rejected); T beats each of the other three evolved graphs after Family-2 Holm correction (vs lattice t=-8.74 p=2.73e-18; vs rewired t=-38.10; vs curr_random t=-26.85), all six pairwise Holm-rejected, sign-flip robustness agreeing in direction and significance on all six; not established that T beats the CNN overall -- a separate model class outside both statistics families, mean clipped MSE 0.063069 vs T's 0.065623, reported descriptively per DESIGN.md's own framing" \
  --bearing supports | grep '^CLM_')

lab --date "$STAGE2B_STAGE4" is "$primary_denoising_claim" confirmed --because "the sole locked primary comparison, DESIGN.md's pre-registered success criterion (entire 95% CI below zero) met unambiguously, with the denoising gate against identity also passing on its own paired bootstrap" >/dev/null

say "closing Stage 2B's own line of enquiry"
lab --date "$STAGE2B_STAGE4" close "$denoising_enquiry" --answered-by "$primary_denoising_claim" >/dev/null
ask enquiry "$denoising_enquiry"

printf '\n-- what was known the moment this stage actually closed (#166)?\n'
ask known --at "$STAGE2B_STAGE4"

say "standing point-in-time queries (#166), run against the full chain"

# The reviewer's ruling instant -- gates.toml's own header, "ruling of
# 2026-08-08, §5". #166 predicted this would show 1A closed negative, 1B.2
# established locally, 1C confirmed, 2A/2B absent -- checked against the
# real mined dates rather than assumed, and it is NOT what the record
# shows: Stage 2A ran and closed entirely on 2026-08-02 through 2026-08-04
# (STAGE2A_COST_RESULTS in probe-bonsai-2a.sh), four to six days before this
# ruling, so its cost-accounting question is already `provisional` here,
# not absent. Only Stage 2B (posed and pursued 2026-08-05 under
# STAGE2B_DESIGN_LOCK, but not analysed until STAGE2B_STAGE4 on
# 2026-08-09) is genuinely `open` -- pursued, nothing concluded yet. The
# prediction was reasonable before the archaeology; the record, once
# dated for real, is the more precise answer.
ask known --at 2026-08-08T00:00:00.000Z

say "the events this script generated"
ask happened

say "read the answers above. This script asserts nothing on purpose."
exit 0
