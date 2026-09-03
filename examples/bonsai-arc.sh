#!/usr/bin/env bash
#
# Nine days of a real research programme, compressed to its turns.
#
# Everything here happened: the questions, the numbers, the dates and the
# order are transcribed from bonsai-2026's own git history (the full
# transcription is `scripts/probe-bonsai-*.sh`, which built the live record
# this is condensed from). What is removed is the ceremony -- the sibling
# comparisons that told the same story, the pilot bookkeeping, the criteria
# that existed only to satisfy a multiplicity family. What is kept is the arc:
# a negative result, a surprise that reopened it, a re-run that disagreed with
# itself, a revision, a bug, and a change of direction that ended in the
# programme's first confirmed positive.
#
# One licence taken: the GPU-port check is framed as its own small question,
# where the real record hangs it off the stage that needed the port. Nothing
# else is rearranged.
#
# Shows LabKit; does not check it. Hermetic: `--db` points at a fresh
# temporary directory, removed on exit.
#
# Usage: bun run example:bonsai
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="$(mktemp -d "${TMPDIR:-/tmp}/labkit-bonsai-arc.XXXXXX")"
trap 'rm -rf "$db"' EXIT

# The styling, narration and handle plumbing are shared with the other
# transcript in this directory -- see ./transcript.sh for the colour argument.
transcript_author=bonsai-arc.sh
# shellcheck source=examples/transcript.sh
. "$root/examples/transcript.sh"

printf '%s%s%s\n' "$S_HEAD" "A real programme, compressed" "$S_OFF"
printf '%s%s%s\n' "$S_RULE" "============================" "$S_OFF"

printf '%s' "$S_PROSE"
cat <<'INTRO'

Bonsai is a research programme asking whether a learned network topology (T)
is dynamically special -- whether its perturbation dynamics can be told apart
from matched control graphs, and later, what the dynamics are good for.

Every `--date` below is the commit that carried the real work, so the record
knows when the research happened, not when it was typed in.
INTRO
printf '%s' "$S_OFF"

chapter "A negative result" \
  "The programme's first question, and the answer is no: none of the" \
  "comparisons reach significance. A negative worth building on is worth" \
  "confirming -- this one had a validated simulator, independent-solver" \
  "agreement and multiplicity control behind it, and the record says a" \
  "person vouched for it and why."

lab --date 2026-07-31T18:48:15.000Z open \
  'does learned topology (T) produce distinguishable perturbation dynamics from matched controls?'
original_question=$(pick Q "$LAST")
original_enquiry=$(pick LOE "$LAST")

lab --date 2026-07-31T18:48:15.000Z observe "$original_enquiry" \
  --name stage1a_all_classes \
  --finding 'AUC per (class, construction) for T vs rewired/random/lattice, all 10 KMNIST classes' \
  --hash sha256:d7a89526
all_classes_observations=$(pick ART "$LAST")

lab --date 2026-07-31T18:48:15.000Z analyse "$original_enquiry" \
  --method 'paired Wilcoxon signed-rank across 10 class-level AUC differences, Bonferroni-corrected' \
  --from "$all_classes_observations"
original_analysis=$(handle COMP "$(printf '%s' "$LAST" | head -1)")

lab --date 2026-07-31T18:48:15.000Z conclude "$original_analysis" \
  --proposition 'learned topology (T) produces distinguishable perturbation dynamics from matched controls' \
  --finding 'none of three comparisons reach significance: T-vs-rewired p=0.695, T-vs-random p=0.275, T-vs-lattice p=0.084' \
  --bearing challenges
original_finding_claim=$(pick CLM "$LAST")

lab --date 2026-07-31T18:48:15.000Z is "$original_finding_claim" confirmed \
  --because 'validated simulator, independent-solver agreement, multiplicity control -- a genuine negative finding, not an exploratory null'

lab --date 2026-07-31T18:48:15.000Z close "$original_enquiry" --answered-by "$original_finding_claim"

chapter "A surprise in a pilot" \
  "The next morning, a class-0 pilot finds the random control's answer" \
  "depends on which seed built it -- the sign of the ratio flips in 7 of 20" \
  "seeds. That does not contradict the null; it reveals variance the" \
  "single-seed design never accounted for. The question is sharpened, and" \
  "the record keeps why it changed."

lab --date 2026-08-01T09:51:27.000Z analyse "$original_enquiry" \
  --method 'class-0-only pilot, 20-seed sweep of the random construction' \
  --from "$all_classes_observations"
pilot_analysis=$(handle COMP "$(printf '%s' "$LAST" | head -1)")

lab --date 2026-08-01T09:51:27.000Z conclude "$pilot_analysis" \
  --proposition 'the T-vs-random AUC ratio direction is stable across construction seeds' \
  --finding 'sign of log(T/random) flips in 7/20 seeds -- undocumented within-class seed variance' \
  --bearing challenges

lab --date 2026-08-01T09:51:27.000Z sharpen "$original_question" \
  --into 'is T still distinguishable from its stochastic controls under proper seed accounting?' \
  --because 'a class-0 pilot found the random control seed-sensitive; the original single-seed-per-class design did not account for that variance'
sharpened_question=$(pick Q "$LAST")

chapter "Saying in advance what would count" \
  "The re-verification is designed before it runs: 25 seeds per class, and" \
  "one robustness rule instantiated per comparison -- the mean-based" \
  "primary test, the median aggregation, and the sign-flip test must all" \
  "agree. A gate binds them, with the consequence written down: if a" \
  "comparison fails its bar, the honest verdict is 'inconclusive', not a" \
  "second opinion shopped after seeing the numbers."

lab --date 2026-08-01T10:11:54.000Z pursue "$sharpened_question" \
  --approach '10-class re-verification, 25 seeds per stochastic control, robustness cascade, Holm-corrected'
reverification_enquiry=$(handle LOE "$LAST")

lab --date 2026-08-01T10:11:54.000Z plan \
  --objective 're-verify the T-vs-control comparisons with 25 seeds per class and proper aggregation' \
  --acceptance 'primary, median-aggregation and sign-flip reads agree for every comparison'
reverification_task=$(handle TASK "$LAST")

rule='primary mean-aggregated Wilcoxon, median aggregation and exact sign-flip must agree'
lab --date 2026-08-01T10:11:54.000Z criterion "T vs random: $rule"
random_criterion=$(handle CRIT "$LAST")
lab --date 2026-08-01T10:11:54.000Z criterion "T vs rewiring: $rule"
rewiring_criterion=$(handle CRIT "$LAST")
lab --date 2026-08-01T10:11:54.000Z criterion "T vs lattice: $rule"
lattice_criterion=$(handle CRIT "$LAST")

lab --date 2026-08-01T10:11:54.000Z declare \
  --governed-by "$random_criterion" --governed-by "$rewiring_criterion" --governed-by "$lattice_criterion" \
  --consequence "the affected comparison cannot be confirmed either way; a further design iteration or an honest 'inconclusive' verdict is required" \
  --protecting "$reverification_task"
robustness_gate=$(handle GATE "$LAST")

chapter "The re-run disagrees with itself" \
  "An hour and a half later: 770 raw AUC values, zero errors -- and the" \
  "aggregations fall apart. The mean-based primary test says significant" \
  "where the median says nothing is there. Two of three comparisons fail" \
  "their own pre-agreed bar; only the lattice, the one comparison with no" \
  "seed axis to disagree over, comes through clean."

lab --date 2026-08-01T11:34:15.000Z observe "$reverification_enquiry" \
  --name stage1a_reverification_results \
  --finding '770 raw AUC values: 10 classes x controls x 25 seeds; zero errors, all pre-run assertions passed' \
  --hash sha256:4a4bf3d7
reverification_observations=$(pick ART "$LAST")

lab --date 2026-08-01T11:34:15.000Z analyse "$reverification_enquiry" \
  --method 'mean-aggregated paired Wilcoxon, 25 seeds per class, Holm-corrected, raw AUC scale' \
  --from "$reverification_observations" --implementing "$reverification_task" \
  --held-to "$random_criterion" --held-to "$rewiring_criterion" --held-to "$lattice_criterion"
raw_scale_analysis=$(handle COMP "$(printf '%s' "$LAST" | head -1)")

lab --date 2026-08-01T11:34:15.000Z conclude "$raw_scale_analysis" \
  --proposition 'T vs random is distinguishable' \
  --finding 'nominally Holm-significant (p=0.00781) but median aggregation collapses it (p=0.92)' \
  --bearing challenges
random_claim=$(pick CLM "$LAST")
lab --date 2026-08-01T11:34:15.000Z conclude "$raw_scale_analysis" \
  --proposition 'T vs rewiring is distinguishable' \
  --finding 'nominally Holm-significant (p=0.04102) but median aggregation collapses it (p=0.19)' \
  --bearing challenges
rewiring_claim=$(pick CLM "$LAST")
lab --date 2026-08-01T11:34:15.000Z conclude "$raw_scale_analysis" \
  --proposition 'T vs lattice is distinguishable' \
  --finding 'not significant (p=0.13086); no seed axis, so no mean/median ambiguity is possible -- reproduces the original conclusion cleanly' \
  --bearing challenges
lattice_claim=$(pick CLM "$LAST")

lab --date 2026-08-01T11:34:15.000Z evaluate "$random_criterion" --gate "$robustness_gate" \
  --value 'primary p=0.00195 vs median p=0.92188 -- disagree' --outcome fail --citing "$random_claim"
lab --date 2026-08-01T11:34:15.000Z evaluate "$rewiring_criterion" --gate "$robustness_gate" \
  --value 'primary p=0.01367 vs median p=0.19336 -- disagree' --outcome fail --citing "$rewiring_claim"
lab --date 2026-08-01T11:34:15.000Z evaluate "$lattice_criterion" --gate "$robustness_gate" \
  --value 'primary, sign-flip, bootstrap all agree non-significant' --outcome pass --citing "$lattice_claim"

lab gate "$robustness_gate"

chapter "The revision: same data, different aggregation" \
  "A review names the cause -- averaging a heavy-tailed distribution by" \
  "arithmetic mean over 25 seeds manufactures significance. The v2 design" \
  "is committed and locked before any log-scale number is computed: same" \
  "770 values, only the aggregation changes. \`keep\` names what survives" \
  "-- the lattice claim, which v2 never revisits -- and each new conclusion" \
  "names the superseded one it stands in place of."

lab --date 2026-08-01T11:41:10.000Z review "$raw_scale_analysis" \
  --verdict 'the nominally significant p-values are artifacts of aggregating a heavy-right-tailed AUC distribution by arithmetic mean across only 25 seeds'
raw_scale_review=$(handle REV "$(printf '%s' "$LAST" | tail -1)")

lab --date 2026-08-01T11:46:49.000Z keep "$lattice_claim" --because "$raw_scale_review" \
  --method 'log-scale (geometric mean) re-aggregation of the same 770 raw AUC values -- no new simulation, pre-committed before running'
log_scale_analysis=$(handle COMP "$(printf '%s' "$LAST" | head -1)")

lab --date 2026-08-01T11:46:49.000Z conclude "$log_scale_analysis" --replacing "$random_claim" \
  --finding 'log-scale resolves the disagreement: primary, median and sign-flip all agree non-significant (p=0.322)' \
  --bearing challenges
random_resolved_claim=$(pick CLM "$LAST")

lab --date 2026-08-01T11:46:49.000Z evaluate "$random_criterion" --gate "$robustness_gate" \
  --value 'log-scale: all reads agree non-significant (p=0.322)' --outcome pass --citing "$random_resolved_claim"

say "The rewiring comparison does not resolve: two reads still say" \
    "significant, one still says not. Per the pre-commitment, no further" \
    "transformation is attempted -- and that verdict has a state of its own." \
    "The finding stays on the record and settles the proposition neither way:"

lab --date 2026-08-01T11:46:49.000Z conclude "$log_scale_analysis" --replacing "$rewiring_claim" \
  --finding 'NOT resolved: primary (p=0.037) and sign-flip (p=0.041) still say significant, median (p=0.084) still says not; genuinely inconclusive at n=10/25 seeds' \
  --bearing challenges
rewiring_inconclusive_evidence=$(pick EV "$LAST")
rewiring_inconclusive_claim=$(pick CLM "$LAST")

lab --date 2026-08-01T11:46:49.000Z is "$rewiring_inconclusive_claim" undecided \
  --because "$rewiring_inconclusive_evidence"

lab --date 2026-08-01T11:46:49.000Z close "$reverification_enquiry" --answered-by "$random_resolved_claim"

say "The gate keeps the honest mix visible: two comparisons re-checked and" \
    "passing, one left without a fresh verdict rather than forced to one:"

lab gate "$robustness_gate"

chapter "A bug, found and superseded" \
  "The confirmatory runs needed a GPU port of the simulator, and the port's" \
  "first pilot number disagreed with the cached CPU value. The buggy run," \
  "the diagnosis and the corrected run are all on the record -- the fix" \
  "does not erase the mistake, it supersedes it."

lab --date 2026-08-02T18:44:36.000Z open 'does the GPU port reproduce the CPU results?'
gpu_enquiry=$(pick LOE "$LAST")

lab --date 2026-08-02T18:44:36.000Z observe "$gpu_enquiry" \
  --name gpu_pilot_buggy \
  --finding 'JAX/GPU pilot on an A100: Delta_map=0.2842 for T seed=3000, vs the cached CPU value 0.3505'
gpu_pilot_observations=$(pick ART "$LAST")

lab --date 2026-08-02T18:44:36.000Z analyse "$gpu_enquiry" \
  --method 'JAX/GPU port of the per-trial simulator, pilot benchmark' \
  --from "$gpu_pilot_observations"
gpu_pilot_analysis=$(handle COMP "$(printf '%s' "$LAST" | head -1)")

lab --date 2026-08-02T18:44:36.000Z conclude "$gpu_pilot_analysis" \
  --proposition 'the GPU port reproduces the CPU Delta_map for T, seed=3000' \
  --finding 'GPU reported 0.2842 vs cached 0.3505 -- a real, non-trivial discrepancy' \
  --bearing challenges
gpu_pilot_claim=$(pick CLM "$LAST")

lab --date 2026-08-02T18:44:36.000Z review "$gpu_pilot_analysis" \
  --verdict 'wrong replica-direction distribution -- uniform(-1,1) instead of normal-then-projected -- fully reproduces the discrepancy on its own, confirmed by a 4-way factorial'
gpu_bug_review=$(handle REV "$(printf '%s' "$LAST" | tail -1)")

lab --date 2026-08-02T19:10:59.000Z replace "$gpu_pilot_analysis" --because "$gpu_bug_review" \
  --method 'corrected port calling the real direction generator; smoke-tested against an independently computed replica state before touching a GPU' \
  --from "$gpu_pilot_observations"
gpu_fix_analysis=$(handle COMP "$(printf '%s' "$LAST" | head -1)")

lab --date 2026-08-02T19:10:59.000Z conclude "$gpu_fix_analysis" --replacing "$gpu_pilot_claim" \
  --finding '0.3505 vs 0.3505 -- exact match, on a fresh GPU session' \
  --bearing supports
gpu_fix_claim=$(pick CLM "$LAST")
lab --date 2026-08-02T19:10:59.000Z close "$gpu_enquiry" --answered-by "$gpu_fix_claim"

chapter "A change of direction" \
  "By now 'is T dynamically special?' has been answered no every way it was" \
  "asked. The programme turns: stop asking whether the topology can be told" \
  "apart, ask what the dynamics can do on a task nobody designed around" \
  "them. The new stage's gate is a quality bar, not a hypothesis -- zero" \
  "solver failures or the confirmatory run does not happen."

lab --date 2026-08-05T00:09:28.000Z open \
  'does runtime graph evolution improve single-step denoising on the official KMNIST task?'
denoising_enquiry=$(pick LOE "$LAST")

lab --date 2026-08-05T00:09:28.000Z plan \
  --objective 'advance the feasibility ladder to the locked stage-4 confirmatory evaluation against the untouched official test set' \
  --acceptance 'zero solver failures, zero non-finite features, every classifier fit converges'
feasibility_ladder_task=$(handle TASK "$LAST")

lab --date 2026-08-05T00:09:28.000Z criterion \
  'go/no-go: zero solver failures, zero non-finite feature vectors, every required fit converges -- a pipeline-health bar, locked before running'
go_no_go_criterion=$(handle CRIT "$LAST")

lab --date 2026-08-05T00:09:28.000Z declare --governed-by "$go_no_go_criterion" \
  --consequence 'stage 4 does not run against the official test set, pending investigation' \
  --protecting "$feasibility_ladder_task"
go_no_go_gate=$(handle GATE "$LAST")

lab --date 2026-08-07T15:54:13.000Z observe "$denoising_enquiry" \
  --name stage2_go_no_go \
  --finding '0/240,000 evolutions failed; 0 non-finite features; 270/270 fold fits converged' \
  --hash sha256:9da6b908
lab --date 2026-08-07T15:54:13.000Z evaluate "$go_no_go_criterion" --gate "$go_no_go_gate" \
  --value '0/240,000 solver failures, 270/270 fits converged -- GO' --outcome pass

say "And the payoff -- after a week of answers that all said no, the" \
    "programme's first confirmed positive, on the one evaluation the locked" \
    "design allowed against the official test set:"

lab --date 2026-08-09T10:16:17.000Z observe "$denoising_enquiry" \
  --name stage4_official_result \
  --finding 'one evaluation on the official 10,000-image KMNIST test corpus, active-support post-clip MSE' \
  --hash sha256:75d8ca29
stage4_observations=$(pick ART "$LAST")

lab --date 2026-08-09T10:16:17.000Z analyse "$denoising_enquiry" \
  --method 'paired class-stratified bootstrap, 20,000 resamples, locked before running' \
  --from "$stage4_observations" --implementing "$feasibility_ladder_task"
stage4_analysis=$(handle COMP "$(printf '%s' "$LAST" | head -1)")

lab --date 2026-08-09T10:16:17.000Z conclude "$stage4_analysis" \
  --proposition 'runtime graph evolution on T improves single-step reconstruction over the pre-evolution state' \
  --finding 'mean difference -0.00445, 95% CI [-0.00460, -0.00430], entirely below zero' \
  --bearing supports
denoising_claim=$(pick CLM "$LAST")

lab --date 2026-08-09T10:16:17.000Z is "$denoising_claim" confirmed \
  --because 'the sole locked primary comparison; the pre-registered success criterion (entire 95% CI below zero) met unambiguously'

lab --date 2026-08-09T10:16:17.000Z close "$denoising_enquiry" --answered-by "$denoising_claim"

chapter "Reading the story back" \
  "Everything above went in over nine days of real dates. The reads below" \
  "are what the record can answer at the end of them."

say "What do we know, and what does each answer rest on?"

lab known

say "Why was the first stage re-verified? The record kept the pilot that" \
    "forced the sharpening:"

lab origin "$sharpened_question"

say "And the comparison that would not resolve? The record does not pick the" \
    "less wrong answer. The finding is real, it stays under the claim, and it" \
    "settles the proposition neither way:"

lab why "$rewiring_inconclusive_claim"

say "And what was known at the moment the v2 design was locked -- before its" \
    "results existed? Answered from durable state as of that instant, not" \
    "from anyone's memory of it:"

lab known --at 2026-08-01T11:41:10.000Z

printf '\n\n%s===%s done %s===%s\n' "$S_RULE" "$S_HEAD" "$S_RULE" "$S_OFF"
printf "${S_PROSE}Nine days of a real programme: one confirmed negative, one honest${S_OFF}\n"
printf "${S_PROSE}inconclusive, one superseded bug, one confirmed positive. The full${S_OFF}\n"
printf "${S_PROSE}transcription is scripts/probe-bonsai-*.sh.${S_OFF}\n\n"
