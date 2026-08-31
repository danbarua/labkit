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

q3=$(lab pose "does a structured internal transformation exist in response to local perturbations along a baseline trajectory?")
loe3=$(lab pursue "$q3" --approach "controlled state-conditioning design: one baseline trajectory (KMNIST class 0, T, seed=3000), 4 perturbation times, 6 fixed nearby-state replicas per time, 3 nodes x 2 signs x 3 amplitudes = 432 trials, Delta_map=B-W permutation test")
art_b2=$(lab observe "$loe3" --name stage1b2_results \
  --finding "432 trials' event-aligned q/r vectors across finite, tangent-only, nonlinear-residual, and common-support-excluded response representations" \
  --hash sha256:d5addc8a)
crit_b2=$(lab criterion "Delta_map hits the Monte Carlo permutation floor (p_MC ~ 0.00010, 10,000 permutations) for every response representation tested")

out=$(lab analyse "$loe3" \
  --method "one-sided Monte Carlo permutation test, 10,000 permutations, independent per-replica label shuffling, on Delta_map = B - W (balanced-mean vs. same-input-mean output-space distance)" \
  --from "$art_b2" --held-to "$crit_b2" \
  --concludes '{"proposition": "a structured internal transformation exists in response to local perturbations", "finding": "finite response Delta_map=0.3505, p_MC~0.00010; survives common-support exclusion of all three candidate source coordinates (Delta_map=0.3418, p_MC~0.00010); tangent-only (0.3248) and nonlinear-residual (0.3896) each separately significant; all three input factors (node, sign, amplitude) separately significant, Holm-corrected"}')
comp_b2=$(printf '%s\n' "$out" | sed -n 1p)
clm_b2=$(printf '%s\n' "$out" | sed -n 2p)

lab evaluate "$crit_b2" --value "all four representations hit p_MC~0.00010; 432/432 trials numerically valid" --outcome pass --citing "$clm_b2" >/dev/null
lab promote "$clm_b2" --because "Level 2 (structured internal transformation) established: source-retention objection resolved with an audited common-support mask, both linear and nonlinear structure separately carry the mapping, all three input factors separately significant" >/dev/null
lab close "$loe3" --answered-by "$clm_b2" >/dev/null

say "the three open items, each accepted with its own reopening condition"

q4=$(lab pose "does this structured transformation generalize across independent baseline trajectories, or is it specific to seed=3000?")
loe4=$(lab pursue "$q4" --approach "not yet tested by Stage 1B2, which used exactly one baseline trajectory")
lab accept "$loe4" --because "Stage 1B2's design used one baseline trajectory only; the result is explicitly scoped as conditional on it" \
  --until "run the identical 432-trial design on independent baseline trajectories on the same topology" \
  --in-light-of "$clm_b2" >/dev/null

q5=$(lab pose "does learned topology T produce this mapping more strongly, more stably, or differently structured than matched controls (rewired, random, lattice)?")
loe5=$(lab pursue "$q5" --approach "not yet tested for the Stage 1B2/1C mapping design specifically -- distinct from Stage 1A's own T-vs-controls comparison")
lab accept "$loe5" --because "Stage 1B2 compared no graph controls within this mapping design" \
  --until "run the identical design on rewired/random/lattice controls, matched-trajectory-seed, and compare" \
  --in-light-of "$clm_b2" >/dev/null

q6=$(lab pose "can this structured mapping be linked to an externally defined task or information-processing objective (Level 3)?")
loe6=$(lab pursue "$q6" --approach "no external task or objective defined yet")
lab accept "$loe6" --because "no external task or information-processing objective has been defined or tested" \
  --until "define and run against an external task" \
  --in-light-of "$clm_b2" >/dev/null

say "Stage 1C: does item 1 (generalization) hold? -- and the reopening hesitation"

# No verb reopens loe4. `pursue` on the same question q4 mints a NEW,
# independent line of enquiry -- loe4 itself is untouched by anything
# that follows.
loe7=$(lab pursue "$q4" --approach "identical 432-trial design, 9 further independent baseline trajectories (seeds 3010-3090) plus seed=3000 read read-only from Stage 1B2's own committed results, same permutation test")
art_c=$(lab observe "$loe7" --name stage1c_trajectories \
  --finding "10 trajectories' pooled Delta_map: mean 0.3296, range 0.2964-0.3505, SD 0.0172 (CV ~5.2%); every one of 40 per-t_p values positive; 10/10 hit the permutation floor" \
  --hash sha256:4634d7aa)
out=$(lab analyse "$loe7" \
  --method "same design as Stage 1B2 (stage1b2_core.py functions imported directly, not reimplemented), applied to 9 new independent baseline trajectories plus the frozen seed=3000 reference" \
  --from "$art_c" \
  --concludes '{"proposition": "the structured transformation generalizes across independent baseline trajectories", "finding": "10 of 10 trajectories hit the Monte Carlo floor; mean Delta_map 0.3296, CV ~5.2% -- tight clustering, not a wide scatter with a few outliers"}')
comp_c=$(printf '%s\n' "$out" | sed -n 1p)
clm_c=$(printf '%s\n' "$out" | sed -n 2p)
lab close "$loe7" --answered-by "$clm_c" >/dev/null

say "checking the reopening hesitation with real data, not assumed"
ask enquiry "$loe4"
ask known

say "Stage 1D Part 1: T vs. lattice"

crit_lattice=$(lab criterion "T vs lattice: two-sided paired t-test on d_k=Delta_map(T,k)-Delta_map(lattice,k) across the 10 matched trajectory seeds, rejects at Holm-adjusted alpha (FWER 0.05 across the 4-way fixed-coordinate family, individually bounded at 0.0125 = 0.05/4, the Bonferroni bound), locked before running")
art_lattice=$(lab observe "$loe5" --name stage1d_lattice_trajectories \
  --finding "lattice's own 10-trajectory run on Stage 1C's matched seeds (3000-3090); T's own values read read-only from Stage 1C, not recomputed" \
  --hash sha256:2df1d2c3)
out=$(lab analyse "$loe5" \
  --method "two-sided paired t-test (primary), exact sign-flip and Wilcoxon signed-rank (robustness), on the 10 matched d_k values" \
  --from "$art_c" --from "$art_lattice" --held-to "$crit_lattice" \
  --concludes '{"proposition": "T shows a Delta_map advantage over the matched lattice control", "finding": "mean d_k=-0.0085 (lattice nominally higher), paired t-test p=0.2815, sign-flip p=0.2871, Wilcoxon p=0.4316 -- all three agree, no detectable difference", "bearing": "challenges"}')
comp_lattice=$(printf '%s\n' "$out" | sed -n 1p)
clm_lattice=$(printf '%s\n' "$out" | sed -n 2p)
# Holm-adjusted p=0.2815 is far above the 0.0125 rejection bound -- no
# significant difference detected, matching the conclusion's own
# "challenges" bearing. The criterion asks whether T beats lattice; it
# does not, so this fails rather than passes.
lab evaluate "$crit_lattice" --value "paired t p=0.2815, sign-flip p=0.2871, Wilcoxon p=0.4316 -- above the 0.0125 threshold, H0 not rejected" --outcome fail --citing "$clm_lattice" >/dev/null

say "Stage 1D Part 2: the pilot (non-confirmatory), a fresh-input reverify, and the confirmatory run"

art_pilot=$(lab observe "$loe5" --name stage1d_pilot_realizations \
  --finding "3 graph realizations (seeds 0,1,2) x first 3 of Stage 1C's matched trajectory seeds, for each of rewired/hist_random/curr_random -- a runtime and variance-allocation pilot; no confirmatory inference is drawn from it")
out=$(lab analyse "$loe5" \
  --method "3x3 crossed-variance pilot (mu_g + b_gr + tau_k + epsilon_grk, balanced two-way ANOVA method-of-moments), sizing only -- not confirmatory" \
  --from "$art_pilot" \
  --concludes '{"proposition": "rewired needs the common (R=15,K=3) confirmatory allocation to hit 80% power at delta_min=0.05", "finding": "own minimal (15,3), cost 45, power 0.948, reliable"}' \
  --concludes '{"proposition": "hist_random needs the common (R=15,K=3) confirmatory allocation to hit 80% power at delta_min=0.05", "finding": "own minimal (15,3) nominally, but sigma^2_b fit on df_r=1 after excluding a fully degenerate realization (seed=2, isolated fixed-coordinate node) -- reported indeterminate, not usable as-is"}' \
  --concludes '{"proposition": "curr_random needs the common (R=15,K=3) confirmatory allocation to hit 80% power at delta_min=0.05", "finding": "own minimal (15,3), cost 45, power 0.883, reliable"}')
comp_pilot=$(printf '%s\n' "$out" | sed -n 1p)
clm_pilot_rewired=$(printf '%s\n' "$out" | sed -n 2p)
clm_pilot_hist=$(printf '%s\n' "$out" | sed -n 3p)
clm_pilot_curr=$(printf '%s\n' "$out" | sed -n 4p)
# None promoted -- deliberately. The pilot's own claims stay exploratory,
# and `known` buckets them provisional rather than established, which
# communicates "don't build on this" without needing a dedicated
# pilot/confirmatory flag on the write API.

# reverify, not amend or replace: hist_random's variance estimate is
# re-checked under genuinely FRESH inputs -- two NEW graph realizations
# (seeds 3, 4), not a re-read of the same pilot data. This is the clean
# case reverify's own doc describes ("under fresh inputs"), unlike #125's
# v1->v2 (same pkl, no fresh inputs at all).
art_followup=$(lab observe "$loe5" --name stage1d_hist_random_followup \
  --finding "2 further hist_random realizations (seeds 3, 4), same construction recipe, same 3 matched trajectory seeds, full simulation + permutation validation" \
  --hash sha256:5deaff59)
out=$(lab reverify "$comp_pilot" --enquiry "$loe5" \
  --method "refit crossed variance decomposition on 4 valid realizations (seeds 0,1,3,4; seed 2 still excluded) -- df_r=3 now clears this project's reliability threshold, both variance components get a proper 95% chi-squared bound" \
  --under "$art_followup" \
  --concludes '{"proposition": "hist_random needs the common (R=15,K=3) confirmatory allocation to hit 80% power at delta_min=0.05", "finding": "refit: own minimal design is (R=25,K=3), cost 75, power 0.827 -- larger than the currently-locked common (15,3) and larger than rewired'\''s/curr_random'\''s own requirements", "bearing": "challenges"}')
comp_followup=$(printf '%s\n' "$out" | sed -n 1p)
clm_followup=$(printf '%s\n' "$out" | sed -n 2p)

crit_rewired=$(lab criterion "T vs rewired: two-sided one-sample t-test on realization-level mean differences, rejects at Holm-adjusted alpha (FWER 0.05 across the 4-way fixed-coordinate family, individually bounded at 0.0125 = 0.05/4), locked before running")
crit_hist=$(lab criterion "T vs historical-random: two-sided one-sample t-test on realization-level mean differences (conditional on fixed-coordinate evaluability), rejects at Holm-adjusted alpha (FWER 0.05 across the 4-way fixed-coordinate family, individually bounded at 0.0125 = 0.05/4), locked before running")
crit_curr=$(lab criterion "T vs current-random: two-sided one-sample t-test on realization-level mean differences, rejects at Holm-adjusted alpha (FWER 0.05 across the 4-way fixed-coordinate family, individually bounded at 0.0125 = 0.05/4), locked before running")

art_confirm=$(lab observe "$loe5" --name stage1d_confirmatory_gpu \
  --finding "225 trajectories (25 realizations x 3 matched seeds x 3 families), locked (R=25,K=3) allocation, GPU/JAX; hist_random pre-screened, 7 of 32 candidates rejected for fixed-coordinate isolation before 25 evaluable realizations were reached" \
  --hash sha256:75d8ca29)
out=$(lab analyse "$loe5" \
  --method "two-sided one-sample t-test on realization-level mean differences (primary), studentized bootstrap / Wilcoxon / exact sign-flip (robustness), Holm-corrected across rewired/hist_random/curr_random/lattice" \
  --from "$art_confirm" --held-to "$crit_rewired" --held-to "$crit_hist" --held-to "$crit_curr" \
  --concludes '{"proposition": "T shows a Delta_map advantage over rewired", "finding": "mean d_bar_gr=-0.0020, SD=0.0125, t(24)=-0.812, p=0.4246; sign-flip p=0.4215, Wilcoxon p=0.4418, bootstrap CI [-0.0103,0.0061]", "bearing": "challenges"}' \
  --concludes '{"proposition": "T shows a Delta_map advantage over historical-random", "finding": "conditional on evaluability: mean d_bar_gr=-0.0025, SD=0.0154, t(24)=-0.824, p=0.4179; 21.9% of candidate realizations were unevaluable (95% CI 9.3-40.0%), disclosed separately, not folded into this estimate", "bearing": "challenges"}' \
  --concludes '{"proposition": "T shows a Delta_map advantage over current-random", "finding": "mean d_bar_gr=-0.0004, SD=0.0158, t(24)=-0.132, p=0.8958; sign-flip p=0.8950, Wilcoxon p=0.8119", "bearing": "challenges"}')
comp_confirm=$(printf '%s\n' "$out" | sed -n 1p)
clm_confirm_rewired=$(printf '%s\n' "$out" | sed -n 2p)
clm_confirm_hist=$(printf '%s\n' "$out" | sed -n 3p)
clm_confirm_curr=$(printf '%s\n' "$out" | sed -n 4p)

# All three Holm-adjusted p-values saturate at 1.0000, far above the
# 0.0125 individual bound -- none reject H0. Same reasoning as
# crit_lattice above: these criteria ask whether T beats each control,
# and none do, so each fails.
lab evaluate "$crit_rewired" --value "t(24)=-0.812, p=0.4246, Holm-adjusted 1.0000 -- H0 not rejected" --outcome fail --citing "$clm_confirm_rewired" >/dev/null
lab evaluate "$crit_hist"    --value "t(24)=-0.824, p=0.4179, Holm-adjusted 1.0000 -- H0 not rejected" --outcome fail --citing "$clm_confirm_hist" >/dev/null
lab evaluate "$crit_curr"    --value "t(24)=-0.132, p=0.8958, Holm-adjusted 1.0000 -- H0 not rejected" --outcome fail --citing "$clm_confirm_curr" >/dev/null
# crit_lattice already evaluated in Part 1 -- the 4-way Holm family DESIGN.md
# and FINDINGS.md report together spans both parts, but no new structural
# criterion is minted for that grouping (see the module note on #133,
# above); it stays descriptive, in the finding text and this comment.

say "the GPU bug: a clean, total-supersession replace"

# art_c alone can't support "GPU reported 0.2842" -- that number came out
# of the buggy pilot run itself, never observed as its own artefact. No
# raw file survives locally (only the later, corrected run's results are
# on disk), so this is observed honestly without a hash, the same way
# art_pilot is above.
art_gpu_pilot=$(lab observe "$loe5" --name stage1d_gpu_pilot_buggy \
  --finding "JAX/GPU pilot benchmark on an A100, as-shipped build_432_batch(), Delta_map=0.2842 for T seed=3000 -- no raw output file preserved locally")
out=$(lab analyse "$loe5" \
  --method "JAX/GPU port of the per-trial simulator (run_one_trial_jax_faithful), pilot benchmark on an A100" \
  --from "$art_c" --from "$art_gpu_pilot" \
  --concludes '{"proposition": "the GPU port reproduces Stage 1C'\''s cached Delta_map for T, seed=3000", "finding": "GPU reported 0.2842 vs. Stage 1C'\''s cached 0.3505 -- a real, non-trivial discrepancy", "bearing": "challenges"}')
comp_gpu_bug=$(printf '%s\n' "$out" | sed -n 1p)
clm_gpu_bug=$(printf '%s\n' "$out" | sed -n 2p)

rev_gpu=$(lab review "$comp_gpu_bug" --verdict "wrong replica-direction distribution -- uniform(-1,1) instead of normal-then-rotation-projected-then-normalized -- fully reproduces the discrepancy on its own (confirmed by a 4-way factorial: correct/buggy directions x correct/buggy E_min gating); a dropped E_min validity gate was also found but confirmed inert for this specific trajectory")
# Same reasoning: the corrected run's own 0.3505 is its own observation,
# distinct from art_c's cached Stage 1C value it is being checked against.
# No raw file for this specific smoke-test run survives locally either --
# only the later confirmatory run (art_confirm) is on disk.
art_gpu_fix=$(lab observe "$loe5" --name stage1d_gpu_fix_smoketest \
  --finding "corrected build_432_batch() re-run on a fresh A100 session, Delta_map=0.3505 for T seed=3000, verify_on_gpu.py's field-by-field precision check passed -- no raw output file preserved locally beyond the later confirmatory run")
lab replace "$comp_gpu_bug" --because "$rev_gpu" --enquiry "$loe5" \
  --method "corrected build_432_batch(), calling the real generate_fixed_replica_directions() instead of a hand-rolled uniform draw; smoke-tested against an independently computed replica state before touching a GPU, then re-verified end-to-end on a fresh A100 session" \
  --from "$art_c" --from "$art_gpu_fix" \
  --concludes '{"proposition": "the GPU port reproduces Stage 1C'\''s cached Delta_map for T, seed=3000", "finding": "0.3505 vs. 0.3505 -- exact match, on a fresh GPU session, with verify_on_gpu.py'\''s own field-by-field precision check re-confirmed first"}' >/dev/null

say "closing item 2, and checking whether item 1's promoted claim needed narrowing"

lab close "$loe5" --answered-by "$clm_lattice" >/dev/null

say "checking the reopening hesitation a second time, same method"
ask enquiry "$loe5"
ask known

say "checked, not assumed: does 1B2's promoted claim show any tension with 1D's negative finding?"
ask why "$clm_b2"

say "the events this script generated"
ask happened

say "read the answers above. This script asserts nothing on purpose."
exit 0
