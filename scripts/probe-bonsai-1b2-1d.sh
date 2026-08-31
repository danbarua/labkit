#!/usr/bin/env bash
# Transcribes Bonsai's real Stage 1B.2 -> 1C -> 1D chain into LabKit, by
# hand, through the CLI. Continuation of #135's #125 (scripts/probe-
# bonsai-1a.sh) -- same real record, same rules: no verb pre-picked, every
# invented fact / hesitation / wrong answer is checked against #132/#133/
# #134/#139 before being filed as new.
#
#   LABKIT_HOME=~/Code/pycharm/bonsai-2026 bash scripts/probe-bonsai-1b2-1d.sh
#   bash scripts/probe-bonsai-1b2-1d.sh <db-dir>
#
# **Every write below carries `--date`, mined from bonsai-2026's own git
# history and verified against it (#166), not invented.** Each is the commit
# that introduced or completed the real work the line transcribes -- see the
# comment above each date variable for the commit it came from. `seq` still
# carries recorded order (this script's own order, chained after
# probe-bonsai-1a.sh); `--date` carries when the research itself happened.
#
# Chosen for what Stage 1A did NOT exercise: Stage 1B.2 established
# something LOCALLY (one trajectory) and named three open items; Stage 1C
# resolved item 1 (generalization, positive); Stage 1D resolved item 2
# (topology specificity, negative) in two parts, with its own pilot ->
# variance-follow-up -> confirmatory-run structure and a found-and-fixed
# GPU bug along the way.
#
# ## What transcribing this found
#
# **A deferred-then-answered question drops its deferral condition.**
# Filed as #143, then reframed after `labkit-review` measured against
# source: closure belongs to the QUESTION, not the pursuit
# (src/domain/report.ts:244, S-14's own decision), so `enquiry LOE_4`
# printing "has produced nothing yet" and then "Q_4 closed -- answered" is
# the model working as designed -- every sibling enquiry reports the
# question's closure correctly. `accept` writes Decision -DEFERS->
# Question (src/domain/write.ts:920), never touching the enquiry either,
# so nothing "vanishes" from LOE_4 -- nothing was ever there. The real
# gap: Q_4 was deferred with a named reopening condition ("run the
# identical design on independent trajectories"), Stage 1C satisfied it
# exactly, and no report says so -- the DEFERS edge and the answer both
# exist in the graph, unread together by anything. Two independent
# instances in this transcript (item 1 via LOE_4/LOE_7, item 2 via
# LOE_3/LOE_5); a third predicted for Stage 2A, which establishes Q_6.
#
# **The same criterion-scoped verdict gap as #133, a second time.**
# Stage 1D's own reporting groups T-vs-lattice (Part 1) with T-vs-three-
# stochastic-controls (Part 2) into one 4-way Holm-corrected family --
# the same "one decision rule instantiated per comparison" shape #133
# names. Worked around the same way: four criteria, not one. Commented on
# #133 with this second, independent repro rather than filing a
# duplicate.
#
# **No verb for a pure narrative synthesis.** Stage 1D's headline
# ("T shows no detectable advantage over ANY of the four tested controls")
# rests on four already-recorded claims (Part 1's lattice result, Part 2's
# three) -- it computes nothing new. `analyse` implies a fresh computation;
# using it for a synthesis with no new method would misrepresent one.
# `close`'s `--answered-by` takes exactly one claim, so the enquiry closes
# on the single cleanest comparison (lattice, Part 1's own dedicated
# result) rather than a synthesized headline that has nowhere to live.
# Filed as #146 -- same shape as #134's "no verb corrects a mis-entered
# claim", an absence rather than a wrong answer.
#
# **1B.2's promoted claim needed no narrowing.** Checked, not assumed:
# `why` on 1B.2's "Level 2 established, locally" claim after Stage 1D
# closes topology specificity negatively shows no tension -- "a structured
# mapping exists" and "T's mapping isn't stronger than matched controls'"
# are orthogonal claims, and the record treats them that way without any
# `reinterpret`.
#
# **A clean, total-supersession control case for #132.** The GPU pilot
# benchmark had a real bug (wrong replica-direction distribution); found,
# reviewed, and `replace`d with a single conclusion, matching the
# analysis's own single conclusion exactly -- no partial-supersession
# ambiguity, because there was nothing partial about it. Worth keeping in
# mind as a control alongside Bonsai's own v1/v2 partial case (#125) when
# #132 gets its regression suite.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="${1:-${LABKIT_HOME:-}}"
[ -n "$db" ] || { echo "usage: LABKIT_HOME=<dir> $0, or $0 <db-dir>" >&2; exit 2; }

lab() { bun "$root/src/cli/cli.ts" --db "$db" --author probe-bonsai-1b2-1d.sh "$@"; }
ask() { printf '\n\033[1m$ labkit %s\033[0m\n' "$*"; lab "$@"; }
say() { printf '\n\n=== %s\n' "$1"; }

say "Stage 1B.2: structured internal transformation, established locally"

# Stage 1B2's FINDINGS.md, like Stage 1A's, was already substantially
# written by "Restructure project: split closed benchmark programme from
# active dynamics lineage", 2026-07-31T19:48:15+01:00 -- the earliest
# evidence in git of this finding, and of the three open items it names.
STAGE1B2_ORIGINAL=2026-07-31T18:48:15.000Z

q3=$(lab --date "$STAGE1B2_ORIGINAL" pose "does a structured internal transformation exist in response to local perturbations along a baseline trajectory?")
loe3=$(lab --date "$STAGE1B2_ORIGINAL" pursue "$q3" --approach "controlled state-conditioning design: one baseline trajectory (KMNIST class 0, T, seed=3000), 4 perturbation times, 6 fixed nearby-state replicas per time, 3 nodes x 2 signs x 3 amplitudes = 432 trials, Delta_map=B-W permutation test")
art_b2=$(lab --date "$STAGE1B2_ORIGINAL" observe "$loe3" --name stage1b2_results \
  --finding "432 trials' event-aligned q/r vectors across finite, tangent-only, nonlinear-residual, and common-support-excluded response representations" \
  --hash sha256:d5addc8a | grep '^ART_')
crit_b2=$(lab --date "$STAGE1B2_ORIGINAL" criterion "Delta_map hits the Monte Carlo permutation floor (p_MC ~ 0.00010, 10,000 permutations) for every response representation tested")

out=$(lab --date "$STAGE1B2_ORIGINAL" analyse "$loe3" \
  --method "one-sided Monte Carlo permutation test, 10,000 permutations, independent per-replica label shuffling, on Delta_map = B - W (balanced-mean vs. same-input-mean output-space distance)" \
  --from "$art_b2" --held-to "$crit_b2" \
  --concludes '{"proposition": "a structured internal transformation exists in response to local perturbations", "finding": "finite response Delta_map=0.3505, p_MC~0.00010; survives common-support exclusion of all three candidate source coordinates (Delta_map=0.3418, p_MC~0.00010); tangent-only (0.3248) and nonlinear-residual (0.3896) each separately significant; all three input factors (node, sign, amplitude) separately significant, Holm-corrected"}')
comp_b2=$(printf '%s\n' "$out" | sed -n 1p)
clm_b2=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)

lab --date "$STAGE1B2_ORIGINAL" evaluate "$crit_b2" --value "all four representations hit p_MC~0.00010; 432/432 trials numerically valid" --outcome pass --citing "$clm_b2" >/dev/null
lab --date "$STAGE1B2_ORIGINAL" promote "$clm_b2" --because "Level 2 (structured internal transformation) established: source-retention objection resolved with an audited common-support mask, both linear and nonlinear structure separately carry the mapping, all three input factors separately significant" >/dev/null
lab --date "$STAGE1B2_ORIGINAL" close "$loe3" --answered-by "$clm_b2" >/dev/null

say "the three open items, each accepted with its own reopening condition"

q4=$(lab --date "$STAGE1B2_ORIGINAL" pose "does this structured transformation generalize across independent baseline trajectories, or is it specific to seed=3000?")
loe4=$(lab --date "$STAGE1B2_ORIGINAL" pursue "$q4" --approach "not yet tested by Stage 1B2, which used exactly one baseline trajectory")
lab --date "$STAGE1B2_ORIGINAL" accept "$loe4" --because "Stage 1B2's design used one baseline trajectory only; the result is explicitly scoped as conditional on it" \
  --until "run the identical 432-trial design on independent baseline trajectories on the same topology" \
  --in-light-of "$clm_b2" >/dev/null

q5=$(lab --date "$STAGE1B2_ORIGINAL" pose "does learned topology T produce this mapping more strongly, more stably, or differently structured than matched controls (rewired, random, lattice)?")
loe5=$(lab --date "$STAGE1B2_ORIGINAL" pursue "$q5" --approach "not yet tested for the Stage 1B2/1C mapping design specifically -- distinct from Stage 1A's own T-vs-controls comparison")
lab --date "$STAGE1B2_ORIGINAL" accept "$loe5" --because "Stage 1B2 compared no graph controls within this mapping design" \
  --until "run the identical design on rewired/random/lattice controls, matched-trajectory-seed, and compare" \
  --in-light-of "$clm_b2" >/dev/null

q6=$(lab --date "$STAGE1B2_ORIGINAL" pose "can this structured mapping be linked to an externally defined task or information-processing objective (Level 3)?")
loe6=$(lab --date "$STAGE1B2_ORIGINAL" pursue "$q6" --approach "no external task or objective defined yet")
lab --date "$STAGE1B2_ORIGINAL" accept "$loe6" --because "no external task or information-processing objective has been defined or tested" \
  --until "define and run against an external task" \
  --in-light-of "$clm_b2" >/dev/null

say "Stage 1C: does item 1 (generalization) hold? -- and the reopening hesitation"

# "Add Stage 1C: trajectory generalization, confirmed across 10
# trajectories", 2026-08-01T12:01:38+01:00.
STAGE1C_RESULTS=2026-08-01T11:01:38.000Z

# No verb reopens loe4. `pursue` on the same question q4 mints a NEW,
# independent line of enquiry -- loe4 itself is untouched by anything
# that follows.
loe7=$(lab --date "$STAGE1C_RESULTS" pursue "$q4" --approach "identical 432-trial design, 9 further independent baseline trajectories (seeds 3010-3090) plus seed=3000 read read-only from Stage 1B2's own committed results, same permutation test")
art_c=$(lab --date "$STAGE1C_RESULTS" observe "$loe7" --name stage1c_trajectories \
  --finding "10 trajectories' pooled Delta_map: mean 0.3296, range 0.2964-0.3505, SD 0.0172 (CV ~5.2%); every one of 40 per-t_p values positive; 10/10 hit the permutation floor" \
  --hash sha256:4634d7aa | grep '^ART_')
out=$(lab --date "$STAGE1C_RESULTS" analyse "$loe7" \
  --method "same design as Stage 1B2 (stage1b2_core.py functions imported directly, not reimplemented), applied to 9 new independent baseline trajectories plus the frozen seed=3000 reference" \
  --from "$art_c" \
  --concludes '{"proposition": "the structured transformation generalizes across independent baseline trajectories", "finding": "10 of 10 trajectories hit the Monte Carlo floor; mean Delta_map 0.3296, CV ~5.2% -- tight clustering, not a wide scatter with a few outliers"}')
comp_c=$(printf '%s\n' "$out" | sed -n 1p)
clm_c=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)
lab --date "$STAGE1C_RESULTS" close "$loe7" --answered-by "$clm_c" >/dev/null

say "checking the reopening hesitation with real data, not assumed"
ask enquiry "$loe4"
ask known

say "Stage 1D Part 1: T vs. lattice"

# "Add Stage 1D lattice comparison findings and pilot results",
# 2026-08-02T01:40:46+01:00 -- Part 1 (lattice) and Part 2's pilot were
# committed together.
STAGE1D_LATTICE_AND_PILOT=2026-08-02T00:40:46.000Z

crit_lattice=$(lab --date "$STAGE1D_LATTICE_AND_PILOT" criterion "T vs lattice: agreement standard -- the primary paired t-test, exact sign-flip, and Wilcoxon signed-rank on the 10 matched d_k=Delta_map(T,k)-Delta_map(lattice,k) values must agree on rejecting or not rejecting the null at the Holm-adjusted bound (individually 0.0125 = 0.05/4, FWER 0.05 across the 4-way fixed-coordinate family), locked before running")
art_lattice=$(lab --date "$STAGE1D_LATTICE_AND_PILOT" observe "$loe5" --name stage1d_lattice_trajectories \
  --finding "lattice's own 10-trajectory run on Stage 1C's matched seeds (3000-3090); T's own values read read-only from Stage 1C, not recomputed" \
  --hash sha256:2df1d2c3 | grep '^ART_')
out=$(lab --date "$STAGE1D_LATTICE_AND_PILOT" analyse "$loe5" \
  --method "two-sided paired t-test (primary), exact sign-flip and Wilcoxon signed-rank (robustness), on the 10 matched d_k values" \
  --from "$art_c" --from "$art_lattice" --held-to "$crit_lattice" \
  --concludes '{"proposition": "T shows a Delta_map advantage over the matched lattice control", "finding": "mean d_k=-0.0085 (lattice nominally higher), paired t-test p=0.2815, sign-flip p=0.2871, Wilcoxon p=0.4316 -- all three agree, no detectable difference", "bearing": "challenges"}')
comp_lattice=$(printf '%s\n' "$out" | sed -n 1p)
clm_lattice=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)
# The criterion is a QUALITY BAR (do the methods agree?), not the
# hypothesis (does T beat lattice?) -- direction lives in the
# conclusion's own bearing, above. All three methods agree on
# non-rejection at 0.0125, so the criterion is satisfied: pass.
lab --date "$STAGE1D_LATTICE_AND_PILOT" evaluate "$crit_lattice" --value "paired t p=0.2815, sign-flip p=0.2871, Wilcoxon p=0.4316 -- all three agree: no rejection at 0.0125" --outcome pass --citing "$clm_lattice" >/dev/null

say "Stage 1D Part 2: the pilot (non-confirmatory), a fresh-input reverify, and the confirmatory run"

art_pilot=$(lab --date "$STAGE1D_LATTICE_AND_PILOT" observe "$loe5" --name stage1d_pilot_realizations \
  --finding "3 graph realizations (seeds 0,1,2) x first 3 of Stage 1C's matched trajectory seeds, for each of rewired/hist_random/curr_random -- a runtime and variance-allocation pilot; no confirmatory inference is drawn from it" | grep '^ART_')
out=$(lab --date "$STAGE1D_LATTICE_AND_PILOT" analyse "$loe5" \
  --method "3x3 crossed-variance pilot (mu_g + b_gr + tau_k + epsilon_grk, balanced two-way ANOVA method-of-moments), sizing only -- not confirmatory" \
  --from "$art_pilot" \
  --concludes '{"proposition": "rewired needs the common (R=15,K=3) confirmatory allocation to hit 80% power at delta_min=0.05", "finding": "own minimal (15,3), cost 45, power 0.948, reliable"}' \
  --concludes '{"proposition": "hist_random needs the common (R=15,K=3) confirmatory allocation to hit 80% power at delta_min=0.05", "finding": "own minimal (15,3) nominally, but sigma^2_b fit on df_r=1 after excluding a fully degenerate realization (seed=2, isolated fixed-coordinate node) -- reported indeterminate, not usable as-is"}' \
  --concludes '{"proposition": "curr_random needs the common (R=15,K=3) confirmatory allocation to hit 80% power at delta_min=0.05", "finding": "own minimal (15,3), cost 45, power 0.883, reliable"}')
comp_pilot=$(printf '%s\n' "$out" | sed -n 1p)
clm_pilot_rewired=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)
clm_pilot_hist=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 2p)
clm_pilot_curr=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 3p)
# None promoted -- deliberately. The pilot's own claims stay exploratory,
# and `known` buckets them provisional rather than established, which
# communicates "don't build on this" without needing a dedicated
# pilot/confirmatory flag on the write API.

# "Refit hist_random's pilot variance from 2 more realizations (seeds
# 3,4)", 2026-08-02T05:49:51+01:00 -- genuinely fresh inputs, unlike
# #125's v1->v2.
STAGE1D_HIST_REFIT=2026-08-02T04:49:51.000Z

# reverify, not amend or replace: hist_random's variance estimate is
# re-checked under genuinely FRESH inputs -- two NEW graph realizations
# (seeds 3, 4), not a re-read of the same pilot data. This is the clean
# case reverify's own doc describes ("under fresh inputs"), unlike #125's
# v1->v2 (same pkl, no fresh inputs at all).
art_followup=$(lab --date "$STAGE1D_HIST_REFIT" observe "$loe5" --name stage1d_hist_random_followup \
  --finding "2 further hist_random realizations (seeds 3, 4), same construction recipe, same 3 matched trajectory seeds, full simulation + permutation validation" \
  --hash sha256:5deaff59 | grep '^ART_')
out=$(lab --date "$STAGE1D_HIST_REFIT" reverify "$comp_pilot" --enquiry "$loe5" \
  --method "refit crossed variance decomposition on 4 valid realizations (seeds 0,1,3,4; seed 2 still excluded) -- df_r=3 now clears this project's reliability threshold, both variance components get a proper 95% chi-squared bound" \
  --under "$art_followup" \
  --concludes '{"proposition": "hist_random needs the common (R=15,K=3) confirmatory allocation to hit 80% power at delta_min=0.05", "finding": "refit: own minimal design is (R=25,K=3), cost 75, power 0.827 -- larger than the currently-locked common (15,3) and larger than rewired'\''s/curr_random'\''s own requirements", "bearing": "challenges"}')
comp_followup=$(printf '%s\n' "$out" | sed -n 1p)
clm_followup=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)

# "Stage 1D: lock common stochastic-control allocation to (R=25, K=3)"
# and "...add conditional-estimand pre-screening rule for hist_random",
# 2026-08-02T21:00:08+01:00 / 21:01:50+01:00.
STAGE1D_CONFIRM_LOCK=2026-08-02T20:00:08.000Z

crit_rewired=$(lab --date "$STAGE1D_CONFIRM_LOCK" criterion "T vs rewired: agreement standard -- the primary t-test, exact sign-flip, Wilcoxon signed-rank, and studentised bootstrap CI on the realization-level mean differences must agree on rejecting or not rejecting the null at the Holm-adjusted bound (individually 0.0125 = 0.05/4, FWER 0.05 across the 4-way fixed-coordinate family), locked before running")
crit_hist=$(lab --date "$STAGE1D_CONFIRM_LOCK" criterion "T vs historical-random: agreement standard -- the primary t-test, exact sign-flip, Wilcoxon signed-rank, and studentised bootstrap CI on the realization-level mean differences (conditional on fixed-coordinate evaluability) must agree on rejecting or not rejecting the null at the Holm-adjusted bound (individually 0.0125 = 0.05/4, FWER 0.05 across the 4-way fixed-coordinate family), locked before running")
crit_curr=$(lab --date "$STAGE1D_CONFIRM_LOCK" criterion "T vs current-random: agreement standard -- the primary t-test, exact sign-flip, Wilcoxon signed-rank, and studentised bootstrap CI on the realization-level mean differences must agree on rejecting or not rejecting the null at the Holm-adjusted bound (individually 0.0125 = 0.05/4, FWER 0.05 across the 4-way fixed-coordinate family), locked before running")

# "Stage 1D: confirmatory run -- T vs. rewired/hist_random/curr_random",
# 2026-08-02T21:44:21+01:00.
STAGE1D_CONFIRM_RESULTS=2026-08-02T20:44:21.000Z

art_confirm=$(lab --date "$STAGE1D_CONFIRM_RESULTS" observe "$loe5" --name stage1d_confirmatory_gpu \
  --finding "225 trajectories (25 realizations x 3 matched seeds x 3 families), locked (R=25,K=3) allocation, GPU/JAX; hist_random pre-screened, 7 of 32 candidates rejected for fixed-coordinate isolation before 25 evaluable realizations were reached" \
  --hash sha256:75d8ca29 | grep '^ART_')
out=$(lab --date "$STAGE1D_CONFIRM_RESULTS" analyse "$loe5" \
  --method "two-sided one-sample t-test on realization-level mean differences (primary), studentized bootstrap / Wilcoxon / exact sign-flip (robustness), Holm-corrected across rewired/hist_random/curr_random/lattice" \
  --from "$art_confirm" --held-to "$crit_rewired" --held-to "$crit_hist" --held-to "$crit_curr" \
  --concludes '{"proposition": "T shows a Delta_map advantage over rewired", "finding": "mean d_bar_gr=-0.0020, SD=0.0125, t(24)=-0.812, p=0.4246; sign-flip p=0.4215, Wilcoxon p=0.4418, bootstrap CI [-0.0103,0.0061]", "bearing": "challenges"}' \
  --concludes '{"proposition": "T shows a Delta_map advantage over historical-random", "finding": "conditional on evaluability: mean d_bar_gr=-0.0025, SD=0.0154, t(24)=-0.824, p=0.4179; sign-flip p=0.4217, Wilcoxon p=0.2521, bootstrap 95% CI [-0.0109,0.0060]; 21.9% of candidate realizations were unevaluable (95% CI 9.3-40.0%), disclosed separately, not folded into this estimate", "bearing": "challenges"}' \
  --concludes '{"proposition": "T shows a Delta_map advantage over current-random", "finding": "mean d_bar_gr=-0.0004, SD=0.0158, t(24)=-0.132, p=0.8958; sign-flip p=0.8950, Wilcoxon p=0.8119, bootstrap 95% CI [-0.0096,0.0084]", "bearing": "challenges"}')
comp_confirm=$(printf '%s\n' "$out" | sed -n 1p)
clm_confirm_rewired=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)
clm_confirm_hist=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 2p)
clm_confirm_curr=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 3p)

# Same reasoning as crit_lattice: these criteria ask whether the four
# methods agree, not which way the science came out. All four methods
# agree on non-rejection at 0.0125 for each control (Holm-adjusted
# p saturates at 1.0000 for all three), so each criterion is satisfied.
lab --date "$STAGE1D_CONFIRM_RESULTS" evaluate "$crit_rewired" --value "t(24)=-0.812 p=0.4246, sign-flip p=0.4215, Wilcoxon p=0.4418, bootstrap CI [-0.0103,0.0061], Holm-adjusted 1.0000 -- all four agree: no rejection at 0.0125" --outcome pass --citing "$clm_confirm_rewired" >/dev/null
lab --date "$STAGE1D_CONFIRM_RESULTS" evaluate "$crit_hist"    --value "t(24)=-0.824 p=0.4179, sign-flip p=0.4217, Wilcoxon p=0.2521, bootstrap CI [-0.0109,0.0060], Holm-adjusted 1.0000 -- all four agree: no rejection at 0.0125" --outcome pass --citing "$clm_confirm_hist" >/dev/null
lab --date "$STAGE1D_CONFIRM_RESULTS" evaluate "$crit_curr"    --value "t(24)=-0.132 p=0.8958, sign-flip p=0.8950, Wilcoxon p=0.8119, bootstrap CI [-0.0096,0.0084], Holm-adjusted 1.0000 -- all four agree: no rejection at 0.0125" --outcome pass --citing "$clm_confirm_curr" >/dev/null
# crit_lattice already evaluated in Part 1 -- the 4-way Holm family DESIGN.md
# and FINDINGS.md report together spans both parts, but no new structural
# criterion is minted for that grouping (see the module note on #133,
# above); it stays descriptive, in the finding text and this comment.

say "the GPU bug: a clean, total-supersession replace"

# "Diagnose and confirm root cause of Stage 1D GPU pilot's Delta_map
# mismatch", 2026-08-02T19:44:36+01:00 -- the earliest evidence in git of
# the buggy pilot; its own run left no separate commit.
STAGE1D_GPU_BUG=2026-08-02T18:44:36.000Z

# art_c alone can't support "GPU reported 0.2842" -- that number came out
# of the buggy pilot run itself, never observed as its own artefact. No
# raw file survives locally (only the later, corrected run's results are
# on disk), so this is observed honestly without a hash, the same way
# art_pilot is above.
art_gpu_pilot=$(lab --date "$STAGE1D_GPU_BUG" observe "$loe5" --name stage1d_gpu_pilot_buggy \
  --finding "JAX/GPU pilot benchmark on an A100, as-shipped build_432_batch(), Delta_map=0.2842 for T seed=3000 -- no raw output file preserved locally" | grep '^ART_')
out=$(lab --date "$STAGE1D_GPU_BUG" analyse "$loe5" \
  --method "JAX/GPU port of the per-trial simulator (run_one_trial_jax_faithful), pilot benchmark on an A100" \
  --from "$art_c" --from "$art_gpu_pilot" \
  --concludes '{"proposition": "the GPU port reproduces Stage 1C'\''s cached Delta_map for T, seed=3000", "finding": "GPU reported 0.2842 vs. Stage 1C'\''s cached 0.3505 -- a real, non-trivial discrepancy", "bearing": "challenges"}')
comp_gpu_bug=$(printf '%s\n' "$out" | sed -n 1p)
clm_gpu_bug=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)

rev_gpu=$(lab --date "$STAGE1D_GPU_BUG" review "$comp_gpu_bug" --verdict "wrong replica-direction distribution -- uniform(-1,1) instead of normal-then-rotation-projected-then-normalized -- fully reproduces the discrepancy on its own (confirmed by a 4-way factorial: correct/buggy directions x correct/buggy E_min gating); a dropped E_min validity gate was also found but confirmed inert for this specific trajectory")

# "Fix Stage 1D GPU pilot's Delta_map bug, confirmed end-to-end on GPU",
# 2026-08-02T20:10:59+01:00.
STAGE1D_GPU_FIX=2026-08-02T19:10:59.000Z

# Same reasoning: the corrected run's own 0.3505 is its own observation,
# distinct from art_c's cached Stage 1C value it is being checked against.
# No raw file for this specific smoke-test run survives locally either --
# only the later confirmatory run (art_confirm) is on disk.
art_gpu_fix=$(lab --date "$STAGE1D_GPU_FIX" observe "$loe5" --name stage1d_gpu_fix_smoketest \
  --finding "corrected build_432_batch() re-run on a fresh A100 session, Delta_map=0.3505 for T seed=3000, verify_on_gpu.py's field-by-field precision check passed -- no raw output file preserved locally beyond the later confirmatory run" | grep '^ART_')
lab --date "$STAGE1D_GPU_FIX" replace "$comp_gpu_bug" --because "$rev_gpu" --enquiry "$loe5" \
  --method "corrected build_432_batch(), calling the real generate_fixed_replica_directions() instead of a hand-rolled uniform draw; smoke-tested against an independently computed replica state before touching a GPU, then re-verified end-to-end on a fresh A100 session" \
  --from "$art_c" --from "$art_gpu_fix" \
  --concludes '{"proposition": "the GPU port reproduces Stage 1C'\''s cached Delta_map for T, seed=3000", "finding": "0.3505 vs. 0.3505 -- exact match, on a fresh GPU session, with verify_on_gpu.py'\''s own field-by-field precision check re-confirmed first"}' >/dev/null

say "closing item 2, and checking whether item 1's promoted claim needed narrowing"

lab --date "$STAGE1D_CONFIRM_RESULTS" close "$loe5" --answered-by "$clm_lattice" >/dev/null

say "checking the reopening hesitation a second time, same method"
ask enquiry "$loe5"

printf '\n-- what was known the moment this stage actually closed (#166)?\n'
ask known --at "$STAGE1D_CONFIRM_RESULTS"

say "checked, not assumed: does 1B2's promoted claim show any tension with 1D's negative finding?"
ask why "$clm_b2"

say "the events this script generated"
ask happened

say "read the answers above. This script asserts nothing on purpose."
exit 0
