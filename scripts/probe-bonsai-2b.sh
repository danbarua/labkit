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
# **The standing was simply wrong, and no fix was needed to correct it.**
# `conclude --standing` has always taken it and this transcript never passed
# it, so a locked stage-4 confirmatory result sat on the record as
# `exploratory`. The design was locked on 2026-08-05
# (`STAGE2B_DESIGN_LOCK`) and the run is four days later, so both
# conclusions below are prespecified and now say so.
#
# Prespecified is not promoted: `--standing confirmatory` is what the design
# locked, `is <claim> confirmed` is what the result earned, and only the
# primary gets the second. #63 is where that distinction is argued.
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

say "the encoder gate: locked before any data existed, failed honestly, amended in the open"

# DESIGN.md states this gate before the ladder runs: "The 10x multiplier is
# arbitrary but pre-registered, locked before any data exists."
encoder_gate_criterion=$(lab --date "$STAGE2B_DESIGN_LOCK" criterion "encoder gate: rho = median(Delta_noisy) / max(median(Delta_clean), 1e-15) must be at most 10, with any non-finite encoded phase or final-Delta an automatic failure regardless of rho -- the 10x multiplier arbitrary but pre-registered, locked before any data exists")
ladder_task=$(lab --date "$STAGE2B_DESIGN_LOCK" plan \
  --objective "advance Stage 2B's four-stage feasibility ladder to the locked stage-4 confirmatory evaluation on the official KMNIST test corpus" \
  --acceptance "every rung passes its own gate on real majority-censored data, with any post-lock change disclosed rather than silently applied" \
  --enquiry "$denoising_enquiry")
encoder_gate=$(lab --date "$STAGE2B_DESIGN_LOCK" declare --governed-by "$encoder_gate_criterion" \
  --consequence "the stage halts pending investigation; no rung beyond stage 1 runs" \
  --protecting "$ladder_task")

# "Add the Stage 2B ladder stage-1 driver and the targets that run it",
# 2026-08-05T22:43:36+01:00 -- the gate's first execution on real,
# majority-censored KMNIST.
STAGE2B_GATE_FAILED=2026-08-05T21:43:36.000Z

encoder_gate_observations=$(lab --date "$STAGE2B_GATE_FAILED" observe "$denoising_enquiry" --name encoder_gate_s150 \
  --finding "median final-Delta clean 2.177e-07, noisy 3.698e-05, rho=169.851 against a threshold of 10; zero non-finite values anywhere -- a clean ratio failure, not a numerical blow-up" | grep '^ART_')
lab --date "$STAGE2B_GATE_FAILED" evaluate "$encoder_gate_criterion" --gate "$encoder_gate" \
  --value "rho=169.851 at ENCODER_STEPS=150, against a threshold of 10" --outcome fail \
  --citing "$encoder_gate_observations" >/dev/null
ask gate "$encoder_gate"

# "Diagnose why Stage 2B's encoder gate failed at ladder stage 1",
# 2026-08-06T00:02:13+01:00. Diagnostic-only: no locked pipeline code was
# touched by it, and it verified its own reconstruction of the failed run's
# corpus bit-for-bit before trusting anything computed from it.
STAGE2B_GATE_DIAGNOSIS=2026-08-05T23:02:13.000Z

diagnosis_observations=$(lab --date "$STAGE2B_GATE_DIAGNOSIS" observe "$denoising_enquiry" --name encoder_gate_failure_diagnostic \
  --finding "convergence curve across five step counts (75, 150, 300, 600, 1200) and per-image state drift from 150 to 600 steps, both pre-committed before either was run; the reconstruction of the failed run's corpus verified bit-for-bit against its own reported identity-baseline MSE, relative diff 0.000e+00" | grep '^ART_')
diagnosis_analysis=$(lab --date "$STAGE2B_GATE_DIAGNOSIS" analyse "$denoising_enquiry" \
  --method "two pre-committed measurements: the noisy final-Delta convergence curve across five step counts, and per-image phase drift from 150 to 600 steps measured against the typical between-image circular distance" \
  --from "$diagnosis_observations" | grep '^COMP_')
slow_convergence_claim=$(lab --date "$STAGE2B_GATE_DIAGNOSIS" conclude "$diagnosis_analysis" \
  --proposition "the encoder fails to converge on majority-censored inputs" \
  --finding "noisy final-Delta decays geometrically to exact float64 zero -- median and p95, every one of 1,000 images -- by 1,200 steps, the same fixed point clean reaches; median 150-to-600 drift is 4e-4 of the between-image distance. Genuine, if slow, convergence, not a qualitatively different regime" \
  --bearing challenges | grep '^CLM_')

# The second defect, found in the same investigation and independent of the
# first: the gate's own formula, not the encoder.
unstable_ratio_claim=$(lab --date "$STAGE2B_GATE_DIAGNOSIS" conclude "$diagnosis_analysis" \
  --proposition "the ratio gate is stable wherever the threshold sits" \
  --finding "at 600 steps clean's median was exact 0.0 while noisy's sat at 1.776e-14, nine orders below the smallest meaningful final-Delta measured anywhere -- and max(0.0, 1e-15) silently turned a RATIO gate into an ABSOLUTE test against the floor, reporting FAIL at rho=17.76. The rho trajectory (14.98, 169.9, 1.915e4, 17.76, 0.0) is non-monotone because it tracks which series crossed its float64 floor first" \
  --bearing challenges | grep '^CLM_')

# "Raise ENCODER_STEPS to 1200 and add an absolute-convergence escape",
# 2026-08-06T01:41:24+01:00. **`amend`, and this is what it is for**: a
# locked condition replaced by another, the original left readable, the
# reason and its evidence surviving. Disclosed as a post-lock amendment
# rather than silently raised, which is the whole of why it is an act.
STAGE2B_GATE_AMENDED=2026-08-06T00:41:24.000Z

amended_encoder_criterion=$(lab --date "$STAGE2B_GATE_AMENDED" amend "$encoder_gate_criterion" \
  --now-requires "encoder gate: rho at most 10, OR both medians below 1e-12 -- an absolute-convergence escape, because a threshold sitting inside the float64 crossover band is fragile by construction whatever ENCODER_STEPS ends up being" \
  --because "the gate's first real run failed on genuine slow convergence rather than a floor, and the same investigation found the ratio formula unstable near either series' own numerical floor" \
  --citing "$unstable_ratio_claim" | grep '^CRIT_')

encoder_gate_pass_observations=$(lab --date "$STAGE2B_GATE_AMENDED" observe "$denoising_enquiry" --name encoder_gate_s1200 \
  --finding "at ENCODER_STEPS=1200 both medians reach exact float64 zero, clearing the amended gate by the absolute-convergence escape rather than by the ratio" | grep '^ART_')
lab --date "$STAGE2B_GATE_AMENDED" evaluate "$amended_encoder_criterion" --gate "$encoder_gate" \
  --value "both medians exact 0.0 at ENCODER_STEPS=1200 -- the escape clause, not the ratio" --outcome pass \
  --citing "$encoder_gate_pass_observations" >/dev/null

ask gate "$encoder_gate"
printf '\n-- how the locked condition was amended, and on what\n'
ask design "$encoder_gate"

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
# DESIGN.md's second locked check, and its ordering is the point: it is
# evaluated only because the primary succeeded, and never rescues a failed
# primary. LabKit records the verdict and the order it was reached in; the
# conditionality lives in the criterion's own wording, which is where Bonsai
# states it.
denoising_gate_criterion=$(lab --date "$STAGE2B_DESIGN_LOCK" criterion "denoising gate: T's active-support reconstruction must beat the identity baseline on its own paired bootstrap -- evaluated only if the primary comparison succeeds, and never rescuing a failed primary")

stage4_confirmatory_analysis=$(lab --date "$STAGE2B_STAGE4" analyse "$denoising_enquiry" \
  --method "primary paired class-stratified bootstrap (d_i = MSE_i(T) - MSE_i(pre_evolution), 20,000 resamples, seed=42, two-sided 95% percentile interval); denoising gate (T vs identity) evaluated only because the primary succeeded, never rescuing a failed primary; two Holm-corrected families (3-way controls-vs-pre, 6-way pairwise among the four evolved graphs) with a 100,000-flip sign-flip robustness check on family 2" \
  --from "$stage4_confirmatory_observations" --held-to "$denoising_gate_criterion" \
  --implementing "$ladder_task" | grep '^COMP_')
primary_denoising_claim=$(lab --date "$STAGE2B_STAGE4" conclude "$stage4_confirmatory_analysis" \
  --proposition "runtime graph evolution on T improves single-step active-support reconstruction over the already dynamically-encoded pre-evolution state" --standing confirmatory \
  --finding "primary: mean d_i=-0.0044509, 95% CI [-0.0046028,-0.0043002], entirely below zero; denoising gate (T vs identity) also entirely below zero, CI [-0.1335739,-0.1328960] -- the actual-denoising claim is added to the primary reconstruction claim, not just the weaker relative one" \
  --bearing supports | grep '^CLM_')
unique_winner_claim=$(lab --date "$STAGE2B_STAGE4" conclude "$stage4_confirmatory_analysis" \
  --proposition "T is the unique winner among the four tested evolved graphs on this task" --standing confirmatory \
  --finding "all three controls beat pre_evolution (Family 1, Holm-rejected); T beats each of the other three evolved graphs after Family-2 Holm correction (vs lattice t=-8.74 p=2.73e-18; vs rewired t=-38.10; vs curr_random t=-26.85), all six pairwise Holm-rejected, sign-flip robustness agreeing in direction and significance on all six; not established that T beats the CNN overall -- a separate model class outside both statistics families, mean clipped MSE 0.063069 vs T's 0.065623, reported descriptively per DESIGN.md's own framing" \
  --bearing supports | grep '^CLM_')

lab --date "$STAGE2B_STAGE4" evaluate "$denoising_gate_criterion" --about "$primary_denoising_claim" \
  --value "T vs identity entirely below zero, CI [-0.1335739,-0.1328960] -- reached only because the primary succeeded" \
  --outcome pass --citing "$primary_denoising_claim" >/dev/null

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
