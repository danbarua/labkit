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
# **Every write below carries `--date`, mined from bonsai-2026's own git
# history and verified against it (#166), not invented.** Each is the commit
# that introduced or completed the real work the line transcribes -- see the
# comment above each block for the commit it came from.
#
# **Rewritten for #173** (`conclude` is the primitive; `analyse` no longer
# takes `--concludes` JSON). Variables are named for what the handle IS.
#
# Answers the externally-defined-task question -- accepted as unresolved in
# the previous chain's Stage 1B.2 ("can this structured mapping be linked to
# an externally defined task or information-processing objective (Level
# 3)?"), reopening condition "define and run against an external task." The
# question and enquiry are FOUND, not hardcoded (#155's `labkit search`,
# added 2026-08-31) -- this script's inheritance from the prior script's
# `accept` call is real (the wording is theirs, not this script's own), but
# the handle numbering is not this script's to assume. `search` finds the
# question by its distinctive wording, refuses to pick if more than one
# match comes back, and `pursuits` finds the one line of enquiry pursuing
# it -- both fail loudly rather than silently writing Stage 2A's answer onto
# a question a prior script's handle numbering happened to shift onto.
#
# ## What transcribing this found
#
# **Third instance of #143's shape, as predicted.** Stage 2A resolves the
# externally-defined-task question by `close`-ing its enquiry with a real
# answer -- watch #143's own comment thread for whether this recurs
# identically (a sibling enquiry never existed here, unlike items 1/2's
# generalization/topology-specificity pattern in probe-bonsai-1b2-1d.sh, so
# this enquiry closes on itself rather than being superseded by a second
# pursuit; worth noting as a *different* shape of the same underlying gap,
# not a third identical repro).
#
# **#98, reproduced live, then closed by the same task.** `plan --objective
# --acceptance` used to mint a Task with no question and no enquiry
# parameter; the feasibility ladder's go/no-go gate is real, gated work that
# genuinely exists to serve this question, and `labkit contract` answered
# "what is this work for" with the objective/acceptance text alone --
# nothing connecting it to the question, exactly as #98's own
# `TaskContract = {work, objective, acceptance, mayRead, enforced}` said.
# Commented on #98 with this concrete instance rather than filing a
# duplicate; `plan` now takes `--enquiry`, written below, and `contract`
# reports `addressing`/`pursuing` back.
#
# **#189: the ladder's own confirmatory analyse never named the task it
# carried out.** `--implementing` was missing from the run below, so
# `contract` reported the task as "planned -- ready to start" even after
# Stage 2A ran to completion. Fixed here, in the same pass as the rest of
# #173's rewrite.
#
# **#146 is fixed, and this is the second transcript it was fixed for.**
# Stage 2A's FINDINGS.md originally claimed "the four [evolved] graphs are
# not equivalent [in task utility]" from eyeballing four non-overlapping
# confidence intervals against a shared baseline; external review found
# this overclaimed what separate CIs against one baseline can support, and
# narrowed it to "each graph individually beats pre-evolution". That
# narrowed sentence is what the four conclusions below say together -- no
# new method, no new input, no output of its own -- so `analyse` would mint
# a run that never happened, and until `synthesise` existed it had nowhere
# to live at all. It is recorded below, resting on the four.
#
# The overclaim itself is still not minted. `reinterpret` narrows an
# existing claim's reading, and the overclaim was never a recorded
# conclusion here; minting one so that it could be corrected would
# manufacture the very thing being corrected.
#
# **#150 is fixed, and the go/no-go gate is what it was about.** The
# ladder's verdict is a measured pipeline-health check -- 240,000
# evolutions, 276 classifier fits -- and its numbers came out of a real
# observations record with a real content hash. `evaluate --citing` used to
# take a claim and nothing else, so a check with no scientific claim behind
# it recorded as asserted: the observation was written, captured into a
# variable, and never referenced by the verdict it decided. It is cited
# below.
#
# **The standing was simply wrong, and no fix was needed to correct it.**
# `conclude --standing` has always taken it and this transcript never passed
# it, so Stage 2A's locked, pre-registered primary comparison sat on the
# record as `exploratory` -- the default, meaning scratch captured before
# anyone knew it mattered. Both designs were locked before their runs
# (`STAGE2A_DESIGN_LOCK` and `STAGE2A_COST_DESIGN_LOCK` precede their
# results), so all five conclusions are prespecified and now say so.
#
# Prespecified is not promoted: `--standing confirmatory` is what the design
# locked, `is <claim> confirmed` is what the result earned, and only the
# primary comparison gets the second. #63 is where that distinction is
# argued.
#
# **Yes, LabKit has somewhere to put an infrastructure/compute-cost
# finding -- it needed no new structure, just its own line of enquiry.**
# `COMPUTE_COST_DESIGN.md`/`COMPUTE_COST_FINDINGS.md` answer a genuinely
# different question from the classification one (does the oscillator ever
# get *cheaper*, not does it *classify better*) with a real method, a real
# input, and a real negative finding -- transcribed below as an ordinary
# `pose`/`pursue`/`analyse`/`conclude`/`close`, same shape as everything
# else in this project.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="${1:-${LABKIT_HOME:-}}"
[ -n "$db" ] || { echo "usage: LABKIT_HOME=<dir> $0, or $0 <db-dir>" >&2; exit 2; }

lab() { bun "$root/src/cli/cli.ts" --db "$db" --author probe-bonsai-2a.sh "$@"; }
ask() { printf '\n\033[1m$ labkit %s\033[0m\n' "$*"; lab "$@"; }
say() { printf '\n\n=== %s\n' "$1"; }

say "found via search, not hardcoded: the Level-3 question the prior script accepted"
# `search` replaces both a hardcoded handle and the guard that checked it
# against the enquiry's own wording after the fact -- the search itself is
# the guard now: it fails loudly (empty, or more than one match) rather
# than silently writing Stage 2A's answer onto a question a prior script's
# handle numbering happened to shift onto.
search_out=$(lab search "externally defined task or information-processing objective")
external_task_matches=$(printf '%s\n' "$search_out" | grep -oE '\(Q_[0-9]+\)' | tr -d '()')
external_task_count=$(printf '%s\n' "$external_task_matches" | grep -c '^Q_' || true)
if [ "$external_task_count" -ne 1 ]; then
  echo "probe-bonsai-2a.sh: expected exactly one question for the Level-3 wording, found $external_task_count -- refusing to pick" >&2
  exit 1
fi
external_task_question="$external_task_matches"
external_task_enquiry=$(lab pursuits "$external_task_question" | grep -oE 'LOE_[0-9]+')
external_task_enquiry_count=$(printf '%s\n' "$external_task_enquiry" | grep -c '^LOE_' || true)
if [ "$external_task_enquiry_count" -ne 1 ]; then
  echo "probe-bonsai-2a.sh: expected exactly one line of enquiry pursuing $external_task_question, found $external_task_enquiry_count" >&2
  exit 1
fi
ask enquiry "$external_task_enquiry"

say "the feasibility ladder's go/no-go gate -- a quality bar, not a hypothesis"

# "Stage 2A DESIGN.md: LOCKED -- fourth review round's clarifications",
# 2026-08-02T23:23:11+01:00.
STAGE2A_DESIGN_LOCK=2026-08-02T22:23:11.000Z

feasibility_ladder_task=$(lab --date "$STAGE2A_DESIGN_LOCK" plan \
  --objective "advance Stage 2A's feasibility ladder (stages 1-3, up to the full 60,000-image official KMNIST training set) to the locked stage-4 confirmatory evaluation against the untouched official test set" \
  --acceptance "zero solver failures, zero non-finite feature vectors, every required fold/C classifier fit converges" \
  --enquiry "$external_task_enquiry")
go_no_go_criterion=$(lab --date "$STAGE2A_DESIGN_LOCK" criterion "Stage 2A go/no-go gate: zero solver failures, zero non-finite feature vectors, and every required fold/C classifier fit converges, across the full feasibility ladder -- a pipeline-health quality bar, not a scientific result, locked before running")
go_no_go_gate=$(lab --date "$STAGE2A_DESIGN_LOCK" declare --governed-by "$go_no_go_criterion" --consequence "stage 4 does not run against the official test set, pending investigation" --protecting "$feasibility_ladder_task")

# "Stage 2A: replace fixed gradient norm threshold with C*n_train-scaled
# GRAD_NORM_REL for convergence, update solver interfaces. FINDINGS.md
# updated with mixed GPU/CPU architecture results.", 2026-08-03T19:06:35+01:00
# -- the last stabilization of the feasibility ladder before the confirmatory
# run below.
STAGE2A_LADDER_GO=2026-08-03T18:06:35.000Z

go_no_go_observations=$(lab --date "$STAGE2A_LADDER_GO" observe "$external_task_enquiry" --name stage2a_go_no_go \
  --finding "0/240,000 (image,topology) evolutions failed; 0 non-finite features in any condition, any topology; 270/270 fold/C fits converged, 6/6 final refits converged" \
  --hash sha256:9da6b908 | grep '^ART_')
lab --date "$STAGE2A_LADDER_GO" evaluate "$go_no_go_criterion" --value "0/240,000 solver failures, 0 non-finite features, 270/270 + 6/6 classifier fits converged -- OVERALL: GO" --outcome pass --gate "$go_no_go_gate" --citing "$go_no_go_observations" >/dev/null
ask gate "$go_no_go_gate"

say "#98, checked directly: does the ladder's own task know why it exists?"
ask contract "$feasibility_ladder_task"

say "the locked confirmatory result: T-evolved vs. encoded-pre-evolution, and three secondary graphs"

# "Stage 2A: locked confirmatory result -- graph evolution improves
# classification (official test set, first and only touch)",
# 2026-08-03T19:44:23+01:00.
STAGE2A_CONFIRMATORY=2026-08-03T18:44:23.000Z

classification_confirmatory_observations=$(lab --date "$STAGE2A_CONFIRMATORY" observe "$external_task_enquiry" --name stage2a_confirmatory_test_results \
  --finding "six conditions (raw pixels, encoded pre-evolution, evolved T/lattice/rewired/curr_random), each refit once at its already-selected C on the full 60,000-image official training set, then applied unchanged to the untouched 10,000-image official test set; 20,000 paired class-stratified bootstrap resamples per comparison" \
  --hash sha256:203e56ff | grep '^ART_')
# #189: --implementing names the feasibility ladder task this run carries
# out -- missing before this rewrite, which is why `contract` used to read
# the task as still "planned" after Stage 2A had already finished it.
classification_confirmatory_analysis=$(lab --date "$STAGE2A_CONFIRMATORY" analyse "$external_task_enquiry" \
  --method "paired class-stratified bootstrap on per-image log-loss difference (evolved minus pre-evolution), 20,000 resamples, two-sided 95% percentile interval; locked success criterion: the entire interval below zero; secondary confirmation via exact McNemar's test on classification disagreement" \
  --from "$classification_confirmatory_observations" --implementing "$feasibility_ladder_task" \
  | grep '^COMP_')
primary_classification_claim=$(lab --date "$STAGE2A_CONFIRMATORY" conclude "$classification_confirmatory_analysis" \
  --proposition "runtime graph evolution on T improves classification over the already dynamically-encoded pre-evolution state" --standing confirmatory \
  --finding "mean d_i=-0.2491, 95% CI [-0.2721,-0.2266], entirely below zero; McNemar p=6.68e-104 (1,234 test images correct only under evolved_T vs 384 only under pre-evolution)" \
  --bearing supports | grep '^CLM_')
lattice_secondary_claim=$(lab --date "$STAGE2A_CONFIRMATORY" conclude "$classification_confirmatory_analysis" \
  --proposition "runtime graph evolution on the matched lattice control improves classification over pre-evolution" --standing confirmatory \
  --finding "mean d_i=-0.1743, 95% CI [-0.1930,-0.1557], entirely below zero, McNemar p=1.55e-56" \
  --bearing supports | grep '^CLM_')
rewired_secondary_claim=$(lab --date "$STAGE2A_CONFIRMATORY" conclude "$classification_confirmatory_analysis" \
  --proposition "runtime graph evolution on the canonical rewired control improves classification over pre-evolution" --standing confirmatory \
  --finding "mean d_i=-0.2819, 95% CI [-0.3074,-0.2570], entirely below zero, McNemar p=9.76e-133" \
  --bearing supports | grep '^CLM_')
curr_random_secondary_claim=$(lab --date "$STAGE2A_CONFIRMATORY" conclude "$classification_confirmatory_analysis" \
  --proposition "runtime graph evolution on the canonical current-random control improves classification over pre-evolution" --standing confirmatory \
  --finding "mean d_i=-0.3049, 95% CI [-0.3303,-0.2797], entirely below zero, McNemar p=8.42e-138" \
  --bearing supports | grep '^CLM_')

# Promoted: this is the primary, locked, sole confirmatory comparison
# (DESIGN.md) and the strongest positive Level 3 result this project has
# produced. All four are `--standing confirmatory` above, because all four
# were prespecified; only this one is promoted. The three secondaries stay
# unpromoted -- descriptive context per DESIGN.md's own primary/secondary
# hierarchy, same treatment Stage 1D's four non-promoted "challenges"
# claims got, mirrored here for "supports" claims that are real but not the
# locked primary.
lab --date "$STAGE2A_CONFIRMATORY" is "$primary_classification_claim" confirmed --because "the sole locked primary comparison, DESIGN.md's pre-registered success criterion (entire 95% CI below zero) met unambiguously, confirmed by an independent McNemar test on the same disagreement" >/dev/null

# **The narrowed headline, drawn across all four** (#146). FINDINGS.md's
# first version claimed the four evolved graphs are not equivalent in task
# utility, which four separate CIs against one shared baseline cannot
# support; review narrowed it to what those four CIs do say. That sentence
# computes nothing new -- it is the four conclusions above, together -- so
# `analyse` would mint a run that never happened and there was nowhere else
# to put it.
four_graphs_headline=$(lab --date "$STAGE2A_CONFIRMATORY" synthesise \
  "each of the four tested graphs individually improves classification over the dynamically-encoded pre-evolution state" \
  --resting-on "$primary_classification_claim" \
  --resting-on "$lattice_secondary_claim" \
  --resting-on "$rewired_secondary_claim" \
  --resting-on "$curr_random_secondary_claim" | grep '^CLM_')
ask why "$four_graphs_headline"

say "closing the externally-defined-task question, and checking the reopening hesitation a third time"
# Closed on the primary, not the synthesis: the question asked whether the
# mapping links to an externally defined task, and T's locked comparison is
# what answers it. The synthesis is the wider statement about the controls
# as well, which is context rather than the answer.
lab --date "$STAGE2A_CONFIRMATORY" close "$external_task_enquiry" --answered-by "$primary_classification_claim" >/dev/null
ask enquiry "$external_task_enquiry"
ask known

printf '\n-- what was known the moment this stage actually closed (#166)?\n'
ask known --at "$STAGE2A_CONFIRMATORY"

say "a genuinely separate research question: does the oscillator ever become cheaper at scale?"

# "Stage 2A follow-on: lock compute-cost design (round 2), name 'no crossover'
# as a legitimate outcome", 2026-08-04T05:50:39+01:00.
STAGE2A_COST_DESIGN_LOCK=2026-08-04T04:50:39.000Z

compute_cost_question=$(lab --date "$STAGE2A_COST_DESIGN_LOCK" pose "does the oscillator readout's runtime graph evolution ever become cheaper per image than an ordinary MLP baseline, at some deployment scale?")
compute_cost_enquiry=$(lab --date "$STAGE2A_COST_DESIGN_LOCK" pursue "$compute_cost_question" --approach "per-topology train/inference cost accounting (encode, evolve, feature-post, CV search, final refit, single-image latency measured 100 repeats per condition), parameter-matched (H=13) and competent-context (H=128) MLP baselines; cuml.accel gated first (confirmed it does not accelerate MLPClassifier -- identical n_iter, near-identical wall-clock -- so MLP stays CPU sklearn, oscillator stays GPU, a real disclosed hardware asymmetry); break-even N solved algebraically per topology/baseline pair")

# "Stage 2A follow-on: compute-cost accounting results -- no crossover exists
# at any deployment scale", 2026-08-04T06:19:56+01:00.
STAGE2A_COST_RESULTS=2026-08-04T05:19:56.000Z

compute_cost_observations=$(lab --date "$STAGE2A_COST_RESULTS" observe "$compute_cost_enquiry" --name stage2a_compute_cost_accounting \
  --finding "at N=1: oscillator (evolved_T, GPU evolution) costs 13.7x MLP_H128; at N=1,000,000: 375.6x; at N=100,000,000: 551.8x; every algebraic break-even point (any topology, either baseline) solves to a negative N" \
  --hash sha256:f9ec47d3 | grep '^ART_')
compute_cost_analysis=$(lab --date "$STAGE2A_COST_RESULTS" analyse "$compute_cost_enquiry" \
  --method "closed-form per-image cost model (Train_readout + N*Infer_readout vs Train_MLP + N*Infer_MLP), solved algebraically for the break-even N at every topology/baseline pair" \
  --from "$compute_cost_observations" | grep '^COMP_')
compute_cost_claim=$(lab --date "$STAGE2A_COST_RESULTS" conclude "$compute_cost_analysis" \
  --proposition "the oscillator readout becomes cheaper than an MLP baseline at some deployment scale" --standing confirmatory \
  --finding "no crossover exists at any plausible deployment scale -- the oscillator is strictly more expensive than either MLP baseline from N=1 to N=100,000,000, and the gap widens with scale rather than narrowing" \
  --bearing challenges | grep '^CLM_')
lab --date "$STAGE2A_COST_RESULTS" close "$compute_cost_enquiry" --answered-by "$compute_cost_claim" >/dev/null
ask enquiry "$compute_cost_enquiry"

printf '\n-- what was known the moment this stage actually closed (#166)?\n'
ask known --at "$STAGE2A_COST_RESULTS"

say "the events this script generated"
ask happened

say "read the answers above. This script asserts nothing on purpose."
exit 0
