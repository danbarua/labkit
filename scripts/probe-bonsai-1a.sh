#!/usr/bin/env bash
# Transcribes Bonsai's real Stage 1A -> re-verification v1 -> v2 -> closure
# chain into LabKit, by hand, through the CLI. #125.
#
# **`probe:`, not `check:`.** Its interesting outcomes are two demonstrated
# wrong answers, not a red/green signal. This script REPRODUCES them on every
# run rather than working around them -- that is what a probe is for.
#
#   LABKIT_HOME=~/Code/pycharm/bonsai-2026 bash scripts/probe-bonsai-1a.sh
#   bash scripts/probe-bonsai-1a.sh <db-dir>
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
# research itself happened, which is what makes `known --at` at the end of
# this file answerable.
#
# ## What transcribing this by hand found
#
# **Two demonstrated wrong answers, both real, both left in the record.**
#
# 1. `why <claim>`'s "Held to" line is criterion-scoped by design
#    (`checkStatusOver`, src/domain/survey-facts.ts) -- every standing
#    evaluation of a criterion counts, and one failure fails it for every
#    claim held to it. Bonsai's re-verification decision rule is ONE rule
#    instantiated PER COMPARISON (4 of them), which LabKit has no way to
#    represent as one criterion -- there is no (criterion, claim)-scoped
#    verdict. Worked around here by minting four criteria, one per
#    comparison, each evaluated exactly once -- see the `--held-to` /
#    `evaluate` calls below. Filed as an `open question` (labkit#133),
#    not a bug: the query does exactly what it was designed to do, and the
#    design has a real gap.
# 2. `replace` invalidates the WHOLE prior analysis's claims, not just the
#    ones the replacement addresses (`replaceAnalysis`, S-3c -- an analysis
#    is the unit, all-or-nothing by construction). Bonsai's v2 is a partial
#    re-analysis: 3 of v1's 4 conclusions, the 4th (lattice) excluded
#    explicitly and deliberately by `DESIGN_v2_log_scale.md`, standing as
#    final. `replace COMP_3 --because <review>` with only 3 of the 4
#    conclusions still marks the 4th claim "Superseded", citing a review
#    that never mentions it. **Not worked around** -- splitting v1 into
#    separate per-comparison analyses to dodge this would be Bonsai's shape
#    bent to fit the model, which PJ-008 §1 forbids. `why CLM_6` below
#    reproduces the wrong answer on every run. This is the demonstrated
#    wrong answer per CLAUDE.md's "When a deferral stops being acceptable"
#    -- the slot #81 held until 2026-08-31. Filed as `domain model`
#    (labkit#132); PJ-008 §3 row AM.
#
#    **A related but SEPARATE bug, found reviewing this script, not caused
#    by the partial supersession above:** the same `replace` call also
#    withdraws every `CriterionEvaluation` that had cited any of v1's four
#    claims, and `labkit gate GATE_1` afterward reports the
#    self-contradictory "satisfied (has failed at least once)" with every
#    evaluation shown withdrawn. Reproduced independently with a FULL,
#    non-partial replacement (`gateStateFrom`, src/domain/read.ts:2032, has
#    no branch for S-3c's `no-standing-verdict` check state and falls
#    through to `satisfied`). Filed separately as `domain model`
#    (labkit#137); PJ-008 §3 row AN.
#
# A third thing worth knowing, filed on its own even though it is an
# absence and PJ-011 §5 says an absence earns nothing alone: there is no
# verb that corrects a mis-entered claim. `review` + `replace` is the
# nearest, and finding 2 shows what that costs. Named so nobody
# rediscovers it as a gap (labkit#134), no verb proposed.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="${1:-${LABKIT_HOME:-}}"
[ -n "$db" ] || { echo "usage: LABKIT_HOME=<dir> $0, or $0 <db-dir>" >&2; exit 2; }

lab() { bun "$root/src/cli/cli.ts" --db "$db" --author probe-bonsai-1a.sh "$@"; }
ask() { printf '\n\033[1m$ labkit %s\033[0m\n' "$*"; lab "$@"; }
say() { printf '\n\n=== %s\n' "$1"; }

say "Stage 1A: the original finding"

# The whole of Stage 1A's FINDINGS.md (243 lines) landed in one commit --
# "Restructure project: split closed benchmark programme from active
# dynamics lineage", 2026-07-31T19:48:15+01:00 -- the earliest evidence in
# git of this finding, already closed by the time it was committed.
STAGE1A_ORIGINAL=2026-07-31T18:48:15.000Z

q1=$(lab --date "$STAGE1A_ORIGINAL" pose "does learned topology (T) produce distinguishable finite-time infinitesimal perturbation dynamics from matched controls (rewired, random, lattice)?")
loe1=$(lab --date "$STAGE1A_ORIGINAL" pursue "$q1" --approach "tangent-linear response vs three matched controls (degree-preserving rewiring, matched-sparsity random, regular lattice) across 10 KMNIST class topologies, joint tangent-matrix integration")
art1=$(lab --date "$STAGE1A_ORIGINAL" observe "$loe1" --name stage1a_all_classes \
  --finding "AUC per (class, construction) for T vs rewired/random/lattice, all 10 KMNIST classes, joint tangent-matrix response, RK45+DOP853 cross-checked, revalidated against finite differences under the actual inference solver" \
  --hash sha256:d7a89526 | grep '^ART_')
crit_orig=$(lab --date "$STAGE1A_ORIGINAL" criterion "no T-vs-control comparison reaches significance under paired Wilcoxon, Bonferroni threshold 0.05/3 ~ 0.0167")

out=$(lab --date "$STAGE1A_ORIGINAL" analyse "$loe1" \
  --method "paired Wilcoxon signed-rank across 10 class-level AUC differences (T minus control), primary; paired t-test on log-AUC, secondary" \
  --from "$art1" --held-to "$crit_orig" \
  --concludes '{"proposition": "learned topology (T) produces distinguishable finite-time infinitesimal perturbation dynamics from matched controls", "finding": "none of three comparisons reach significance: T-vs-rewired p=0.695, T-vs-random p=0.275, T-vs-lattice p=0.084 (closest, still above uncorrected 0.05)", "bearing": "challenges"}')
comp1=$(printf '%s\n' "$out" | sed -n 1p)
clm1=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)

lab --date "$STAGE1A_ORIGINAL" evaluate "$crit_orig" --value "T-vs-rewired p=0.695, T-vs-random p=0.275, T-vs-lattice p=0.084; all above 0.0167" --outcome pass --citing "$clm1" >/dev/null
lab --date "$STAGE1A_ORIGINAL" promote "$clm1" --because "high evidence strength: validated simulator, adaptive integration, independent-solver agreement, tangent-linear verification against finite differences, paired comparisons with multiplicity control; a genuine negative finding, not an exploratory null" >/dev/null

# "Add Post-hoc robustness note: class-0 pilot on T-vs-random seed-sensitivity",
# 2026-08-01T10:51:27+01:00 -- the pilot that motivates the sharpening below.
STAGE1A_PILOT=2026-08-01T09:51:27.000Z

out=$(lab --date "$STAGE1A_PILOT" analyse "$loe1" \
  --method "class-0-only pilot, 20-seed sweep of the random construction under both available random-control definitions, fresh initial condition" \
  --from "$art1" \
  --concludes '{"proposition": "the T-vs-random AUC ratio direction is stable across random-construction seeds", "finding": "sign of log(T/random) flips in 7/20 seeds (historical control, CV=2.37) and 2/20 seeds (current control, CV=1.08); reinforces rather than contradicts the original null but reveals undocumented within-class seed variance", "bearing": "challenges"}')
comp2=$(printf '%s\n' "$out" | sed -n 1p)
clm2=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)

lab --date "$STAGE1A_ORIGINAL" close "$loe1" --answered-by "$clm1" >/dev/null

say "the sharpening: why a re-verification"

q2=$(lab --date "$STAGE1A_PILOT" sharpen "$q1" \
  --into "does the T-vs-stochastic-control comparison hold up under proper seed accounting (multiple seeds per class, explicit within-class aggregation and robustness checks)?" \
  --because "a class-0 pilot found the random control's AUC ratio sign is seed-sensitive (7/20 flips under the historical definition), an undocumented source of within-class variance the original single-seed-per-class design did not account for" \
  | grep '^Q_')

say "re-verification v1: raw-scale aggregation, and its own gate"

# "Add Stage 1A re-verification design document...", 2026-08-01T11:11:54+01:00.
STAGE1A_V1_DESIGN=2026-08-01T10:11:54.000Z

loe2=$(lab --date "$STAGE1A_V1_DESIGN" pursue "$q2" --approach "10-class re-verification: 25 seeds per stochastic control, mean-aggregated paired Wilcoxon primary, median-aggregation + exact sign-flip + within-class MCSE robustness cascade, Holm correction across 4 comparisons")
task1=$(lab --date "$STAGE1A_V1_DESIGN" plan --objective "re-verify the T-vs-stochastic-control comparisons with 25 seeds per class, proper within-class aggregation and robustness checks" \
  --acceptance "consistent across primary mean-Wilcoxon, median aggregation, exact sign-flip test, and small within-class MCSE relative to the class-level difference" \
  --may-read stage1a_all_classes)

# Four criteria, not one -- the workaround for finding 1 (labkit#133). Bonsai's
# DESIGN.md states the decision rule once, generically, but applies it
# separately per comparison; giving each comparison its own criterion means
# each has exactly one evaluation, so `why`'s criterion-scoped "Held to" read
# is correct for each -- there is nothing else evaluating the same criterion
# to conflict with it.
rule="the null (no T-vs-control difference) is robust only if primary mean-aggregated Wilcoxon, median aggregation, exact sign-flip test, and within-class MCSE (small relative to |d|) all agree"
crit_hist=$(lab --date "$STAGE1A_V1_DESIGN" criterion "T vs historical half-edge random: $rule")
crit_curr=$(lab --date "$STAGE1A_V1_DESIGN" criterion "T vs current edge-count-matched random: $rule")
crit_rewire=$(lab --date "$STAGE1A_V1_DESIGN" criterion "T vs degree-preserving rewiring: $rule")
crit_lattice=$(lab --date "$STAGE1A_V1_DESIGN" criterion "T vs lattice: $rule")

gate1=$(lab --date "$STAGE1A_V1_DESIGN" declare \
  --governed-by "$crit_hist" --governed-by "$crit_curr" --governed-by "$crit_rewire" --governed-by "$crit_lattice" \
  --consequence "the affected comparison's robustness cannot be confirmed either way; a further design iteration or an honest 'inconclusive' verdict is required" \
  --protecting "$task1")

# "Implement Stage 1A re-verification (DESIGN.md): 25-seed sweep exposes
# mean-aggregation instability...", 2026-08-01T12:34:15+01:00.
STAGE1A_V1_RESULTS=2026-08-01T11:34:15.000Z

art2=$(lab --date "$STAGE1A_V1_RESULTS" observe "$loe2" --name stage1a_reverification_results \
  --finding "770 raw AUC values: 10 classes x (T + lattice, 1 each) + 10 classes x 3 stochastic controls x 25 seeds; zero errors, all pre-run assertions passed (T rebuild byte-exact against cached pkl for all 10 classes)" \
  --hash sha256:4a4bf3d7 | grep '^ART_')

out=$(lab --date "$STAGE1A_V1_RESULTS" analyse "$loe2" \
  --method "mean-aggregated paired Wilcoxon signed-rank across 10 class-level differences, 25 seeds per class per stochastic control, Holm-corrected across 4 comparisons (raw AUC scale, as DESIGN.md specifies)" \
  --from "$art2" --implementing "$task1" \
  --held-to "$crit_hist" --held-to "$crit_curr" --held-to "$crit_rewire" --held-to "$crit_lattice" \
  --concludes '{"proposition": "T vs historical half-edge random is distinguishable", "finding": "nominally Holm-significant (p_holm=0.00781, 0/10 sign+) but median aggregation collapses it to non-significant (p=0.92188, 5/10 sign+); within-class MCSE exceeds |d| in 2/10 classes", "bearing": "challenges"}' \
  --concludes '{"proposition": "T vs current edge-count-matched random is distinguishable", "finding": "not Holm-significant (p_holm=0.05469); median aggregation also disagrees with primary (p=0.492 vs 0.027)", "bearing": "challenges"}' \
  --concludes '{"proposition": "T vs degree-preserving rewiring is distinguishable", "finding": "nominally Holm-significant (p_holm=0.04102, 1/10 sign+) but median aggregation collapses it (p=0.19336, 3/10 sign+)", "bearing": "challenges"}' \
  --concludes '{"proposition": "T vs lattice is distinguishable", "finding": "not significant (p_holm=0.13086); the one comparison with no seed axis, so no mean/median/MCSE ambiguity is possible; reproduces the original Stage 1A conclusion cleanly", "bearing": "challenges"}')
comp3=$(printf '%s\n' "$out" | sed -n 1p)
clm3=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)  # historical random
clm4=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 2p)  # current random
clm5=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 3p)  # rewiring
clm6=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 4p)  # lattice

lab --date "$STAGE1A_V1_RESULTS" evaluate "$crit_hist"    --gate "$gate1" --value "primary p=0.00195 vs median p=0.92188; MCSE exceeds |d| in class 6 (93.5 vs 58.9)" --outcome fail --citing "$clm3" >/dev/null
lab --date "$STAGE1A_V1_RESULTS" evaluate "$crit_curr"    --gate "$gate1" --value "primary p=0.02734 vs median p=0.49219; MCSE exceeds |d| in 1/10 classes" --outcome fail --citing "$clm4" >/dev/null
lab --date "$STAGE1A_V1_RESULTS" evaluate "$crit_rewire"  --gate "$gate1" --value "primary p=0.01367 vs median p=0.19336" --outcome fail --citing "$clm5" >/dev/null
lab --date "$STAGE1A_V1_RESULTS" evaluate "$crit_lattice" --gate "$gate1" --value "primary, sign-flip, bootstrap all agree non-significant; no seed axis" --outcome pass --citing "$clm6" >/dev/null

say "re-verification v2: log-scale re-analysis of the SAME data -- and finding 2"

# "Add DESIGN_v2_log_scale.md...", 2026-08-01T12:41:10+01:00 -- its own
# header: "committed and locked before running any log-scale analysis."
STAGE1A_V2_LOCK=2026-08-01T11:41:10.000Z

rev1=$(lab --date "$STAGE1A_V2_LOCK" review "$comp3" --verdict "the nominally Holm-significant p-values (historical random, rewiring) are artifacts of aggregating a heavy-right-tailed AUC distribution by arithmetic mean across only 25 seeds; raw-scale aggregation is not sufficient to get a stable read on the stochastic-control comparisons")

# The moment v2 was locked, in Bonsai's own sense -- DESIGN_v2_log_scale.md's
# own header: "committed and locked before running any log-scale analysis."
# That is here: after the review that motivated it, before the replacement
# that runs it. `known --at` answers what #125 first called unanswerable --
# it wasn't; `sharpen`'s freeze isn't the only way to ask "what was known
# then", `known --at <instant>` reads durable state as of any moment.
#
# No longer captured live (`date -u ...`): the real commit that added this
# document names the instant, mined and verified against git for #166.
locked="$STAGE1A_V2_LOCK"

# "Stage 1A re-verification v2: log-scale re-analysis resolves 2 of 3
# mean-vs-median disagreements...", 2026-08-01T12:46:49+01:00.
STAGE1A_V2_RESULTS=2026-08-01T11:46:49.000Z

# `replace`, not `amend` or `reverify` -- the verb choice #125 asks for.
# `reverify` means "under fresh inputs"; v2 reuses v1's SAME 770 raw values
# by design (DESIGN_v2_log_scale.md: "no new simulation ... only the
# aggregation function ... changes"), so it is not that. `amend` means a
# locked CRITERION is revised; the decision rule's logic is unchanged
# between v1 and v2 ("same gate, applied in log space") -- what changes is
# the analysis method, not the standard being held to. `replace` fits best
# of the three: a review found the prior analysis's significant results
# untrustworthy, and a corrected analysis supersedes it. It is still an
# imperfect fit, and finding 2 (above) is exactly that imperfection: v2 only
# revisits 3 of v1's 4 conclusions, but `replace` invalidates all 4 anyway.
out=$(lab --date "$STAGE1A_V2_RESULTS" replace "$comp3" --because "$rev1" --enquiry "$loe2" \
  --method "log-scale (geometric mean) re-aggregation of the same 770 raw AUC values from ART_4 -- no new simulation, no new seeds, only the aggregation function changes; pre-committed before running, decision rule not revised after seeing results" \
  --from "$art2" \
  --concludes '{"proposition": "T vs historical half-edge random is distinguishable", "finding": "log-scale resolves the disagreement: primary/median/sign-flip/mixed-model all agree non-significant (p_holm=0.322); 95% CI on multiplicative scale x[0.280, 1.541] brackets 1.0", "bearing": "challenges"}' \
  --concludes '{"proposition": "T vs current edge-count-matched random is distinguishable", "finding": "log-scale resolves the disagreement: primary/median/sign-flip/mixed-model all agree non-significant (p_holm=0.320); 95% CI x[0.146, 1.250] brackets 1.0", "bearing": "challenges"}' \
  --concludes '{"proposition": "T vs degree-preserving rewiring is distinguishable", "finding": "NOT resolved: primary (p=0.037) and sign-flip (p=0.041) still say significant, median (p=0.084) still says not -- narrowed from v1 but not closed; per pre-commitment, no further transformation attempted, reported as genuinely inconclusive at n=10/25 seeds. Bearing set to challenges as the least-wrong of two choices -- LabKit'\''s bearing is binary (supports/challenges); there is no way to record \"inconclusive\".", "bearing": "challenges"}')
comp4=$(printf '%s\n' "$out" | sed -n 1p)
clm7=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)  # historical random, resolved
clm8=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 2p)  # current random, resolved
clm9=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 3p)  # rewiring, still inconclusive

lab --date "$STAGE1A_V2_RESULTS" close "$loe2" --answered-by "$clm7" >/dev/null

say "finding 2, reproduced: CLM_6 (lattice) was never touched by v2 and stands as final in Bonsai's own record"
ask why "$clm6"

say "closure, and the five questions PROJECT_MEMORY.md answers in prose"

printf '\n-- why was Stage 1A re-verified?\n'
ask origin "$q2"

printf '\n-- what was known when v2 was locked?\n'
ask known --at "$locked"

printf '\n-- what was known the moment the stage actually closed (#166)?\n'
ask known --at "$STAGE1A_V2_RESULTS"

printf '\n-- what closed the stage, and how?\n'
ask enquiry "$loe2"

printf '\n-- which claims rest on results/stage1a_reverification_results.pkl?\n'
ask affects stage1a_reverification_results

printf '\n-- what work exists and why?\n'
ask work
ask contract "$task1"

say "the events this script generated"
ask happened

say "read the answers above. This script asserts nothing on purpose."
exit 0
