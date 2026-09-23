#!/usr/bin/env zsh
# Transcribes Bonsai's real Stage 1A -> re-verification v1 -> v2 -> closure
# chain into LabKit, by hand, through the CLI. #125.
#
# **`probe:`, not `check:`.** Its interesting outcome is one still-open design
# gap (#133), not a red/green signal. This script REPRODUCES it on every run
# rather than working around it -- that is what a probe is for.
#
#   LK='bun packages/app-cli/cli.ts --db ~/Code/pycharm/bonsai-2026' scripts/db/probe-bonsai-1a.sh
#   LABKIT_DB_URL=... LK='bun packages/app-cli/cli.ts --tenant <slug>' scripts/db/probe-bonsai-1a.sh
#
# No default and no throwaway db: unlike probe-dogfood.sh this writes into a
# REAL research record meant to persist and be rendered by the Explorer
# (#126), so there is no `mktemp -d` fallback and nothing here deletes
# anything. Rebuilding the record is `rm -rf <db>/.labkit` by hand, then
# re-running this script -- see the PR this shipped in for why that was done
# once already.
#
# **Every write below carries `--date`, mined from bonsai-2026's own git
# history and verified against it (#166), not invented.** Each is the commit
# that introduced or completed the real work the line transcribes -- see the
# comment above each block for the commit it came from. `seq` still carries
# recorded order (this script's own order); `--date` carries when the
# research itself happened.
#
# Variables are named for what the handle IS, not the short/positional form
# the pre-#173 script used.
#
# ## What transcribing this by hand found
#
# **One still-open design gap.** `why <claim>`'s "Held to" line is
# criterion-scoped by design (`checkStatusOf`, packages/core-domain/read/checks.ts)
# -- every standing evaluation of a criterion counts, and one failure fails it
# for every claim held to it. Bonsai's re-verification decision rule is ONE
# rule instantiated PER COMPARISON (4 of them), which LabKit has no way to
# represent as one criterion -- there is no (criterion, claim)-scoped verdict.
# Worked around here by minting four criteria, one per comparison, each
# evaluated exactly once -- see the `--held-to` / `evaluate` calls below.
# Filed as an `open question` (labkit#133), not a bug: the query does exactly
# what it was designed to do, and the design has a real gap.
#
# **Below, v2 replaces three of v1's four conclusions and simply never names
# the fourth.** `conclude --replacing <old-claim>` names historical random,
# current random and rewiring; lattice is never named, so its original
# evaluation and claim stand untouched -- which is what Bonsai's own record
# has always said. `why "$lattice_claim"` demonstrates it reads correctly on
# every run. Was filed as `domain model` (labkit#132, GATE_1 cascade
# labkit#137); PJ-008 §3 rows AM/AN, and PJ-035 for the mechanism this
# replaced.
#
# A third thing worth knowing, filed on its own even though it is an
# absence and PJ-011 §5 says an absence earns nothing alone: there is no
# verb that corrects a mis-entered claim. Named so nobody rediscovers it as a
# gap (labkit#134), no verb proposed.
set -euo pipefail

root=${0:A:h:h:h}
[[ -n ${LK:-} ]] || { print -u2 "usage: LK='bun packages/app-cli/cli.ts --db <dir>' $0   (or LABKIT_DB_URL=... LK='bun packages/app-cli/cli.ts --tenant <slug>')"; exit 2 }
source "$root/scripts/lib/labkit-macros.zsh"
LK="$LK --author probe-bonsai-1a.sh"
# Nothing here was watched happening: every act below is transcribed from a
# source, so every event it writes says which one. One export covers the file;
# `labkit happened` shows it on each act, which is what makes a stale one
# visible rather than silent.
export LABKIT_RECONSTRUCTED_FROM="bonsai-2026 git history"

lab() { ${=LK} "$@"; }
ask() { printf '\n\033[1m$ labkit %s\033[0m\n' "$*"; lab "$@"; }
say() { printf '\n\n=== %s\n' "$1"; }

say "Stage 1A: the original finding"

# The whole of Stage 1A's FINDINGS.md (243 lines) landed in one commit --
# "Restructure project: split closed benchmark programme from active
# dynamics lineage", 2026-07-31T19:48:15+01:00 -- the earliest evidence in
# git of this finding, already closed by the time it was committed.
STAGE1A_ORIGINAL=2026-07-31T18:48:15.000Z

original_question=$(lab --date "$STAGE1A_ORIGINAL" pose "does learned topology (T) produce distinguishable finite-time infinitesimal perturbation dynamics from matched controls (rewired, random, lattice)?")
original_enquiry=$(lab --date "$STAGE1A_ORIGINAL" pursue "$original_question" --approach "tangent-linear response vs three matched controls (degree-preserving rewiring, matched-sparsity random, regular lattice) across 10 KMNIST class topologies, joint tangent-matrix integration")
all_classes_observations=$(lab --date "$STAGE1A_ORIGINAL" observe "$original_enquiry" --name stage1a_all_classes \
  --finding "AUC per (class, construction) for T vs rewired/random/lattice, all 10 KMNIST classes, joint tangent-matrix response, RK45+DOP853 cross-checked, revalidated against finite differences under the actual inference solver" \
  --hash sha256:d7a89526 --json | jq -er .observations)
no_significant_difference_criterion=$(lab --date "$STAGE1A_ORIGINAL" criterion "no T-vs-control comparison reaches significance under paired Wilcoxon, Bonferroni threshold 0.05/3 ~ 0.0167")

original_finding_analysis=$(lab --date "$STAGE1A_ORIGINAL" analyse "$original_enquiry" \
  --method "paired Wilcoxon signed-rank across 10 class-level AUC differences (T minus control), primary; paired t-test on log-AUC, secondary" \
  --from "$all_classes_observations" --held-to "$no_significant_difference_criterion" \
  --json | jq -er .analysis)
original_finding_claim=$(lab --date "$STAGE1A_ORIGINAL" conclude "$original_finding_analysis" \
  --proposition "learned topology (T) produces distinguishable finite-time infinitesimal perturbation dynamics from matched controls" \
  --finding "none of three comparisons reach significance: T-vs-rewired p=0.695, T-vs-random p=0.275, T-vs-lattice p=0.084 (closest, still above uncorrected 0.05)" \
  --bearing challenges --json | jq -er '.claims[0].claim')

lab --date "$STAGE1A_ORIGINAL" evaluate "$no_significant_difference_criterion" --value "T-vs-rewired p=0.695, T-vs-random p=0.275, T-vs-lattice p=0.084; all above 0.0167" --outcome pass --citing "$original_finding_claim" >/dev/null
lab --date "$STAGE1A_ORIGINAL" is confirmed "$original_finding_claim" --because "high evidence strength: validated simulator, adaptive integration, independent-solver agreement, tangent-linear verification against finite differences, paired comparisons with multiplicity control; a genuine negative finding, not an exploratory null" >/dev/null

# "Add Post-hoc robustness note: class-0 pilot on T-vs-random seed-sensitivity",
# 2026-08-01T10:51:27+01:00 -- the pilot that motivates the sharpening below.
STAGE1A_PILOT=2026-08-01T09:51:27.000Z

class0_pilot_analysis=$(lab --date "$STAGE1A_PILOT" analyse "$original_enquiry" \
  --method "class-0-only pilot, 20-seed sweep of the random construction under both available random-control definitions, fresh initial condition" \
  --from "$all_classes_observations" --json | jq -er .analysis)
lab --date "$STAGE1A_PILOT" conclude "$class0_pilot_analysis" \
  --proposition "the T-vs-random AUC ratio direction is stable across random-construction seeds" \
  --finding "sign of log(T/random) flips in 7/20 seeds (historical control, CV=2.37) and 2/20 seeds (current control, CV=1.08); reinforces rather than contradicts the original null but reveals undocumented within-class seed variance" \
  --bearing challenges >/dev/null

lab --date "$STAGE1A_ORIGINAL" close enquiry "$original_enquiry" --answered-by "$original_finding_claim" >/dev/null

say "the sharpened question"

sharpened_question=$(lab --date "$STAGE1A_PILOT" pose "does the T-vs-stochastic-control comparison hold up under proper seed accounting (multiple seeds per class, explicit within-class aggregation and robustness checks)?" --json | jq -er .question)

say "re-verification v1: raw-scale aggregation, and its own gate"

# "Add Stage 1A re-verification design document...", 2026-08-01T11:11:54+01:00.
STAGE1A_V1_DESIGN=2026-08-01T10:11:54.000Z

reverification_enquiry=$(lab --date "$STAGE1A_V1_DESIGN" pursue "$sharpened_question" --approach "10-class re-verification: 25 seeds per stochastic control, mean-aggregated paired Wilcoxon primary, median-aggregation + exact sign-flip + within-class MCSE robustness cascade, Holm correction across 4 comparisons")
reverification_task=$(lab --date "$STAGE1A_V1_DESIGN" plan --objective "re-verify the T-vs-stochastic-control comparisons with 25 seeds per class, proper within-class aggregation and robustness checks" \
  --acceptance "consistent across primary mean-Wilcoxon, median aggregation, exact sign-flip test, and small within-class MCSE relative to the class-level difference" \
  --may-read stage1a_all_classes)

# **One rule, judged per comparison** (labkit#133, fixed). Bonsai's DESIGN.md
# states the decision rule once, generically, and applies it separately per
# comparison — which is what it is. Until `evaluate --about` existed, four
# verdicts meant four criteria carrying one rule, so `why` on any of them read
# correctly only because nothing else evaluated the same criterion.
robustness_criterion=$(lab --date "$STAGE1A_V1_DESIGN" criterion "the null (no T-vs-control difference) is robust only if primary mean-aggregated Wilcoxon, median aggregation, exact sign-flip test, and within-class MCSE (small relative to |d|) all agree")

robustness_gate=$(lab --date "$STAGE1A_V1_DESIGN" declare \
  --governed-by "$robustness_criterion" \
  --consequence "the affected comparison's robustness cannot be confirmed either way; a further design iteration or an honest 'inconclusive' verdict is required" \
  --protecting "$reverification_task")

# "Implement Stage 1A re-verification (DESIGN.md): 25-seed sweep exposes
# mean-aggregation instability...", 2026-08-01T12:34:15+01:00.
STAGE1A_V1_RESULTS=2026-08-01T11:34:15.000Z

reverification_observations=$(lab --date "$STAGE1A_V1_RESULTS" observe "$reverification_enquiry" --name stage1a_reverification_results \
  --finding "770 raw AUC values: 10 classes x (T + lattice, 1 each) + 10 classes x 3 stochastic controls x 25 seeds; zero errors, all pre-run assertions passed (T rebuild byte-exact against cached pkl for all 10 classes)" \
  --hash sha256:4a4bf3d7 --json | jq -er .observations)

reverification_v1_analysis=$(lab --date "$STAGE1A_V1_RESULTS" analyse "$reverification_enquiry" \
  --method "mean-aggregated paired Wilcoxon signed-rank across 10 class-level differences, 25 seeds per class per stochastic control, Holm-corrected across 4 comparisons (raw AUC scale, as DESIGN.md specifies)" \
  --from "$reverification_observations" --implementing "$reverification_task" \
  --held-to "$robustness_criterion" \
  --json | jq -er .analysis)
historical_random_claim=$(lab --date "$STAGE1A_V1_RESULTS" conclude "$reverification_v1_analysis" \
  --proposition "T vs historical half-edge random is distinguishable" --standing confirmatory \
  --finding "nominally Holm-significant (p_holm=0.00781, 0/10 sign+) but median aggregation collapses it to non-significant (p=0.92188, 5/10 sign+); within-class MCSE exceeds |d| in 2/10 classes" \
  --bearing challenges --json | jq -er '.claims[0].claim')
current_random_claim=$(lab --date "$STAGE1A_V1_RESULTS" conclude "$reverification_v1_analysis" \
  --proposition "T vs current edge-count-matched random is distinguishable" --standing confirmatory \
  --finding "not Holm-significant (p_holm=0.05469); median aggregation also disagrees with primary (p=0.492 vs 0.027)" \
  --bearing challenges --json | jq -er '.claims[0].claim')
rewiring_claim=$(lab --date "$STAGE1A_V1_RESULTS" conclude "$reverification_v1_analysis" \
  --proposition "T vs degree-preserving rewiring is distinguishable" --standing confirmatory \
  --finding "nominally Holm-significant (p_holm=0.04102, 1/10 sign+) but median aggregation collapses it (p=0.19336, 3/10 sign+)" \
  --bearing challenges --json | jq -er '.claims[0].claim')
lattice_claim=$(lab --date "$STAGE1A_V1_RESULTS" conclude "$reverification_v1_analysis" \
  --proposition "T vs lattice is distinguishable" --standing confirmatory \
  --finding "not significant (p_holm=0.13086); the one comparison with no seed axis, so no mean/median/MCSE ambiguity is possible; reproduces the original Stage 1A conclusion cleanly" \
  --bearing challenges --json | jq -er '.claims[0].claim')

lab --date "$STAGE1A_V1_RESULTS" evaluate "$robustness_criterion" --about "$historical_random_claim" --gate "$robustness_gate" --value "primary p=0.00195 vs median p=0.92188; MCSE exceeds |d| in class 6 (93.5 vs 58.9)" --outcome fail --citing "$historical_random_claim" >/dev/null
lab --date "$STAGE1A_V1_RESULTS" evaluate "$robustness_criterion" --about "$current_random_claim" --gate "$robustness_gate" --value "primary p=0.02734 vs median p=0.49219; MCSE exceeds |d| in 1/10 classes" --outcome fail --citing "$current_random_claim" >/dev/null
lab --date "$STAGE1A_V1_RESULTS" evaluate "$robustness_criterion" --about "$rewiring_claim" --gate "$robustness_gate" --value "primary p=0.01367 vs median p=0.19336" --outcome fail --citing "$rewiring_claim" >/dev/null
lab --date "$STAGE1A_V1_RESULTS" evaluate "$robustness_criterion" --about "$lattice_claim" --gate "$robustness_gate" --value "primary, sign-flip, bootstrap all agree non-significant; no seed axis" --outcome pass --citing "$lattice_claim" >/dev/null

say "re-verification v2: log-scale re-analysis of the SAME data"

# "Add DESIGN_v2_log_scale.md...", 2026-08-01T12:41:10+01:00 -- its own
# header: "committed and locked before running any log-scale analysis."
STAGE1A_V2_LOCK=2026-08-01T11:41:10.000Z

raw_scale_review=$(lab --date "$STAGE1A_V2_LOCK" conclude "$reverification_v1_analysis" --proposition "raw-scale mean aggregation across 25 seeds gives a stable read on the stochastic-control comparisons" --finding "the nominally Holm-significant p-values (historical random, rewiring) are artifacts of aggregating a heavy-right-tailed AUC distribution by arithmetic mean across only 25 seeds; raw-scale aggregation is not sufficient to get a stable read on the stochastic-control comparisons" --bearing challenges --json | jq -er '.claims[0].claim')

v2_lock_instant="$STAGE1A_V2_LOCK"

# "Stage 1A re-verification v2: log-scale re-analysis resolves 2 of 3
# mean-vs-median disagreements...", 2026-08-01T12:46:49+01:00.
STAGE1A_V2_RESULTS=2026-08-01T11:46:49.000Z

# v2 is a second analysis over v1's observations; its conclusions replace v1's.
log_scale_replacement=$(lab --date "$STAGE1A_V2_RESULTS" analyse "$reverification_enquiry" \
  --method "log-scale (geometric mean) re-aggregation of the same 770 raw AUC values from ART_4 -- no new simulation, no new seeds, only the aggregation function changes; pre-committed before running, decision rule not revised after seeing results" \
  --from "$reverification_observations" --implementing "$reverification_task" \
  --held-to "$robustness_criterion" \
  --json | jq -er .analysis)
historical_random_resolved_claim=$(lab --date "$STAGE1A_V2_RESULTS" conclude "$log_scale_replacement" --replacing "$historical_random_claim" \
  --finding "log-scale resolves the disagreement: primary/median/sign-flip/mixed-model all agree non-significant (p_holm=0.322); 95% CI on multiplicative scale x[0.280, 1.541] brackets 1.0" --standing confirmatory \
  --bearing challenges \
  --json | jq -er '.claims[0].claim')
current_random_resolved_claim=$(lab --date "$STAGE1A_V2_RESULTS" conclude "$log_scale_replacement" --replacing "$current_random_claim" \
  --finding "log-scale resolves the disagreement: primary/median/sign-flip/mixed-model all agree non-significant (p_holm=0.320); 95% CI x[0.146, 1.250] brackets 1.0" --standing confirmatory \
  --bearing challenges \
  --json | jq -er '.claims[0].claim')
rewiring_resolved_claim=$(lab --date "$STAGE1A_V2_RESULTS" conclude "$log_scale_replacement" --replacing "$rewiring_claim" \
  --finding "NOT resolved: primary (p=0.037) and sign-flip (p=0.041) still say significant, median (p=0.084) still says not -- narrowed from v1 but not closed; per pre-commitment, no further transformation attempted, reported as genuinely inconclusive at n=10/25 seeds. LabKit's bearing is binary (supports/challenges); there is no way to record \" --standing confirmatoryinconclusive\", so the criterion below is left without a fresh evaluation rather than forced to one." \
  --bearing challenges \
  --json | jq -er '.claims[0].claim')

# #189: the two comparisons v2 actually resolved get a fresh evaluation
# citing the new claim -- their v1 evaluation is now `no-standing-verdict`
# (correctly: what it cited was superseded), and without this GATE_1 would
# read as though nobody had ever re-checked them. the rewiring comparison gets
# none: v2's own finding is genuinely inconclusive (see above), and an
# honest "no verdict yet" is the correct read, not a forced pass or fail.
# The lattice comparison's v1 verdict is untouched -- it was never re-run.
lab --date "$STAGE1A_V2_RESULTS" evaluate "$robustness_criterion" --about "$historical_random_resolved_claim" --gate "$robustness_gate" --value "log-scale: primary/median/sign-flip/mixed-model all agree non-significant (p_holm=0.322)" --outcome pass --citing "$historical_random_resolved_claim" >/dev/null
lab --date "$STAGE1A_V2_RESULTS" evaluate "$robustness_criterion" --about "$current_random_resolved_claim" --gate "$robustness_gate" --value "log-scale: primary/median/sign-flip/mixed-model all agree non-significant (p_holm=0.320)" --outcome pass --citing "$current_random_resolved_claim" >/dev/null

lab --date "$STAGE1A_V2_RESULTS" close enquiry "$reverification_enquiry" --answered-by "$historical_random_resolved_claim" >/dev/null

say "lattice, reproduced: untouched by v2 and still reading correctly (#132, fixed)"
ask why "$lattice_claim"

say "closure, and the five questions PROJECT_MEMORY.md answers in prose"

printf '\n-- why was Stage 1A re-verified?\n'
ask why "$sharpened_question"

printf '\n-- what was known when v2 was locked?\n'
ask now

printf '\n-- what was known the moment the stage actually closed (#166)?\n'
ask now

printf '\n-- what closed the stage, and how?\n'
ask why "$reverification_enquiry"

printf '\n-- what work exists and why?\n'
ask work
ask why "$reverification_task"

say "the gate, with the honest inconclusive left visible"
ask why "$robustness_gate"

say "the events this script generated"
ask happened

say "read the answers above. This script asserts nothing on purpose."
exit 0
