#!/usr/bin/env bash
# Transcribes Bonsai's real Stage 2B into LabKit, by hand, through the CLI.
# Continuation of #135/#125 -> #144/#147 -> #149 (Stage 1B.2/1C/1D, Stage
# 2A). Same real record, same rules: no verb pre-picked, every invented
# fact / hesitation / wrong answer checked against #132/#133/#134/#137/
# #139/#143/#146/#150/#151 before being filed as new.
#
#   LABKIT_HOME=~/Code/pycharm/bonsai-2026 bash scripts/probe-bonsai-2b.sh
#   bash scripts/probe-bonsai-2b.sh <db-dir>
#
# Two distinct things get transcribed here, deliberately not merged:
#
# 1. **The research arc** -- Stage 2B's own scientific question (does
#    runtime graph evolution improve single-step active-support denoising,
#    the Stage-2A-shaped question for reconstruction instead of
#    classification), compressed feasibility ladder, and the locked
#    stage-4 confirmatory result. Same shape as #149's Stage 2A.
#
# 2. **The governance arc** -- `gates.toml`, the ~89-row binding-clause
#    inventory Reviewer requirement 4 (ruling of 2026-08-08) demands, and
#    which #127 is about importing wholesale. THIS SCRIPT DOES NOT IMPORT
#    IT. Per instruction: every binding_gate/binding_value row is #150's
#    exact shape (a measured pipeline-health check, no scientific claim,
#    evaluated uncited) -- transcribing all ~89 by hand would be #127's
#    job restated one row at a time, not a research act. Six representative
#    rows are transcribed instead, chosen to tell the whole shape: three
#    binding_gate (a clean pass; the row that IS the origin story for why
#    this inventory exists at all; a deliberately UNWRITTEN one that stays
#    binding_gate under the anti-gaming rule), one binding_claim (a
#    discharged document-scope obligation, a different shape from
#    binding_gate), one not_binding (a dispositioned non-obligation), and
#    one meta-criterion for the Reviewer's own sign-off. Findings below are
#    written up on #127 as the worked mapping it asked for.
#
# ## What transcribing this found
#
# **#150 reproduced deliberately, six times, not worked around.** Every
# criterion below evaluates uncited (`--gate`, no `--citing`) -- a
# measured pipeline-health check has no scientific claim to cite, exactly
# #150's finding. Left as-is rather than manufacturing claims, per #149's
# own precedent.
#
# **Both of #127's candidate verb guesses were tried and neither survived
# contact.** `accept` (for `not_binding`) takes an ENQUIRY to defer --
# there is no open question a `not_binding` disposition defers; it is a
# classification judgement about a sentence, not research left
# unresolved. `review` (for `[semantic_review]`) resolves `of` through
# `unitOf()`, which requires an existing ANALYSIS -- the Reviewer signed
# off on the whole inventory and its classification scheme, not on any one
# scientific analysis, so there is nothing for `review`'s `of` to name
# without misrepresenting the scope of what was actually reviewed. Both
# rows are transcribed via `criterion`+`evaluate` instead -- the same
# uncited-verdict shape as every other row here, which is what the
# `[semantic_review]` block's own text already reads like ("12/12
# findings resolved... SIGNED OFF").
#
# **Reviewer attribution, checked rather than assumed.** `gates.toml`
# itself distinguishes `reviewer` ("Dan Barua...; earlier rulings by
# ChatGPT / Stage 2B Reviewer") from `recorded_by` ("stage2b-lead (Claude
# Code), transcribing the ruling") -- explicitly, on the Reviewer's own
# instruction ("Claude Code can encode my ruling mechanically; it cannot
# independently make my attestation"). `--author` is per-CLI-invocation,
# not per-session -- confirmed in `src/attribution.ts`/`src/domain/
# events.ts`: `personContext(override)` stamps `attribution_how: claimed`
# whenever `--author` is given, which is exactly the honest reading here.
# The one `evaluate` call for the Reviewer's own sign-off below runs with
# `--author "Dan Barua (2026-08-10, 2026-08-11); earlier rulings by
# ChatGPT / Stage 2B Reviewer"` -- a distinct, one-off override from every
# other call in this script, which stays under `probe-bonsai-2b.sh`. This
# does not lie: `claimed` means asserted on the caller's word, not
# independently verified, and the assertion here is exactly the one
# `gates.toml`'s own text already makes.
#
# **The anti-gaming rule has no home, and none was forced.** "A clause
# cannot be moved from binding_gate to another kind merely because
# enforcement is absent" is a constraint on the CLASSIFICATION PROCESS
# itself, not a condition any one result is held to. Checked `amendDesign`
# -- it requires an already-governed criterion and a scientific claim to
# cite as the diagnosis; this rule replaces no criterion's wording and
# has no scientific finding behind it, it is methodology laid down by the
# 2026-08-08 ruling before any row existed. Checked plain `criterion` too
# -- LabKit's criteria are conditions a RESULT is held to, evaluated once;
# this rule instead governs every future re-evaluation of every other
# criterion in the file, which is a different grammatical object (a rule
# about rules) than anything `criterion`/`evaluate` models today. Left
# untranscribed. Worth a question on its own if a second instance of
# "a rule constraining how criteria may be reclassified" turns up
# somewhere that isn't gates.toml.
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

q2b=$(lab --date "$STAGE2B_DESIGN_LOCK" pose "does runtime graph evolution, on top of an already dynamically-encoded local phase state, improve single-step active-support reconstruction under a fixed, majority-censored clipped-Gaussian corruption -- the Stage-2A-shaped question for denoising instead of classification?")
loe2b=$(lab --date "$STAGE2B_DESIGN_LOCK" pursue "$q2b" --approach "a four-stage feasibility ladder (n=1,000, n=5,000, Phase A/B at 60,000, one locked stage-4 confirmatory evaluation) reusing Stage 2A's encoder/evolution machinery against a ridge-based reconstruction readout, plus a separately-tested CNN baseline; corruption/RNG, the intercept-aware SVD ridge, studentized sign-flip and two Holm families locked before any ladder rung ran")

# "Build the Phase B driver, and clear two blockers found before
# provisioning", 2026-08-07T16:54:13+01:00 -- the last of the ladder
# milestones this one observation bundles (stages 1/2, the encoder-gate
# fix, Phase A, Phase B) to land.
STAGE2B_LADDER=2026-08-07T15:54:13.000Z

art_ladder2b=$(lab --date "$STAGE2B_LADDER" observe "$loe2b" --name stage2b_feasibility_ladder \
  --finding "stages 1 (n=1,000) and 2 (n=5,000) both _OK; Phase A (corrupt+encode, 60,000 images, moved to local CPU, 11.3 min) and Phase B (evolution/ridge/CNN on GPU) both complete; the encoder gate's own first real run FAILED honestly at ENCODER_STEPS=150 (rho=169.851 vs threshold 10), diagnosed as slow convergence not a floor, and re-ran PASS at 1,200 steps -- disclosed as a post-lock amendment, not silently raised" | grep '^ART_')

say "the locked stage-4 confirmatory result"

# "Record the Stage 4 official result: T is the unique winner",
# 2026-08-09T11:16:17+01:00 -- the commit that produced this observation,
# analysis and closure; "commit 431d90a" the finding text cites is the
# fix ("Fix the CNN test-evaluation shape bug...") one run earlier that
# made this result possible.
STAGE2B_STAGE4=2026-08-09T10:16:17.000Z

art_confirm2b=$(lab --date "$STAGE2B_STAGE4" observe "$loe2b" --name stage2b_stage4_official_result \
  --finding "STAGE4_OK, run_ladder_stage4.py, commit 431d90a, one evaluation on the official 10,000-image KMNIST test corpus, active-support post-clip MSE; primary and denoising-gate tests outside both multiplicity families per the locked design, two Holm families (3-way controls-vs-pre, 6-way pairwise) run separately" | grep '^ART_')
out=$(lab --date "$STAGE2B_STAGE4" analyse "$loe2b" \
  --method "primary paired class-stratified bootstrap (d_i = MSE_i(T) - MSE_i(pre_evolution), 20,000 resamples, seed=42, two-sided 95% percentile interval); denoising gate (T vs identity) evaluated only because the primary succeeded, never rescuing a failed primary; two Holm-corrected families (3-way controls-vs-pre, 6-way pairwise among the four evolved graphs) with a 100,000-flip sign-flip robustness check on family 2" \
  --from "$art_confirm2b" \
  --concludes '{"proposition": "runtime graph evolution on T improves single-step active-support reconstruction over the already dynamically-encoded pre-evolution state", "finding": "primary: mean d_i=-0.0044509, 95% CI [-0.0046028,-0.0043002], entirely below zero; denoising gate (T vs identity) also entirely below zero, CI [-0.1335739,-0.1328960] -- the actual-denoising claim is added to the primary reconstruction claim, not just the weaker relative one", "bearing": "supports"}' \
  --concludes '{"proposition": "T is the unique winner among the four tested evolved graphs on this task", "finding": "all three controls beat pre_evolution (Family 1, Holm-rejected); T beats each of the other three evolved graphs after Family-2 Holm correction (vs lattice t=-8.74 p=2.73e-18; vs rewired t=-38.10; vs curr_random t=-26.85), all six pairwise Holm-rejected, sign-flip robustness agreeing in direction and significance on all six; not established that T beats the CNN overall -- a separate model class outside both statistics families, mean clipped MSE 0.063069 vs T'\''s 0.065623, reported descriptively per DESIGN.md'\''s own framing", "bearing": "supports"}')
comp_confirm2b=$(printf '%s\n' "$out" | sed -n 1p)
clm_primary2b=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 1p)
clm_winner2b=$(printf '%s\n' "$out" | grep '^CLM_' | sed -n 2p)

lab --date "$STAGE2B_STAGE4" promote "$clm_primary2b" --because "the sole locked primary comparison, DESIGN.md's pre-registered success criterion (entire 95% CI below zero) met unambiguously, with the denoising gate against identity also passing on its own paired bootstrap" >/dev/null

say "closing Stage 2B's own line of enquiry"
lab --date "$STAGE2B_STAGE4" close "$loe2b" --answered-by "$clm_primary2b" >/dev/null
ask enquiry "$loe2b"

say "the governance arc: reviewer requirement 4's gate inventory, six representative rows"

# "Start the binding-clause inventory: 6 of 89, and 3 of them fail on
# purpose", 2026-08-08T12:32:07+01:00 -- the commit that opens the
# inventory this plan, these criteria and this gate all describe.
STAGE2B_INVENTORY_START=2026-08-08T11:32:07.000Z

task_inventory=$(lab --date "$STAGE2B_INVENTORY_START" plan \
  --objective "produce and maintain the reviewer-required gate inventory (requirement 4, ruling of 2026-08-08) verifying Stage 2B's binding guarantees are enforced in code, not just documented" \
  --acceptance "every binding_gate/binding_value row has a real break-test demonstrating both that the guard fires and that it fires on the production path; every binding_claim row is discharged against a real artefact or its pending status is honest; every not_binding row's reason fits one of four fixed shapes (narration/rationale/result/plan)")

crit_gate1=$(lab --date "$STAGE2B_INVENTORY_START" criterion "binding_gate 9d4b9ec0ba99: run_ladder_stage3.py::floor_halt_reason halts for review when any production condition selects the ridge grid floor (alpha=1e-6) -- a real code-level halt, not a logged warning, reachable only through the sole production entry point make stage2b-ladder-stage3")
crit_gate2=$(lab --date "$STAGE2B_INVENTORY_START" criterion "binding_gate 7e0f91ff9d81: stage2b_ridge.ridge_equivalence_check halts when JAX and sklearn diverge beyond tolerance on either predictions (1e-8) or alpha selection -- the row that is why this inventory exists at all")
crit_gate3=$(lab --date "$STAGE2B_INVENTORY_START" criterion "binding_gate a375db47a337: the hierarchical identity gate (primary evolved_T-vs-pre_evolution; denoising gate against identity, evaluated only if primary succeeds, never rescuing a failed primary; pre_evolution-vs-identity always reported independently) is enforced in code, not only in DESIGN.md prose")
crit_claim1=$(lab --date "$STAGE2B_INVENTORY_START" criterion "binding_claim 8296ec49b5fa: the ARM/x86 propagation stress set's construction (largest cross-architecture discrepancies, the 79 convergence-tail cases, full class coverage, seeded stratified component) matches what AUDIT_PROTOCOL.md's Companion Protocols section commits to, under identical frozen ridge coefficients")
crit_notbinding1=$(lab --date "$STAGE2B_INVENTORY_START" criterion "not_binding 51fde2dbc946: the S*=1200 selection narrative in DESIGN.md, including its disclosed self-correction (a looser reading satisfied at S*=300 was caught and rejected), is narration/rationale that commits the system to nothing except its own closing REVISIT sentence, which is separately dispositioned non-binding because REVISIT is discretionary")
crit_signoff=$(lab --date "$STAGE2B_INVENTORY_START" criterion "requirement 4's inventory mechanism, as a whole, is complete and its dispositions are honest -- the Reviewer's own sign-off judgement, not a machine-checkable predicate")

gate_inventory=$(lab --date "$STAGE2B_INVENTORY_START" declare \
  --governed-by "$crit_gate1" --governed-by "$crit_gate2" --governed-by "$crit_gate3" \
  --governed-by "$crit_claim1" --governed-by "$crit_notbinding1" --governed-by "$crit_signoff" \
  --consequence "Stage 2B's readiness signal stays red; the independent package-review gate for stage-4 release is separately and additionally blocked" \
  --protecting "$task_inventory")

# "89/89 dispositioned, and a seventh defect in the ridge intercept",
# 2026-08-08T22:53:23+01:00 -- the inventory's own completion, for the
# four rows below whose evaluate calls don't name a later re-evaluation.
STAGE2B_INVENTORY_DONE=2026-08-08T21:53:23.000Z

# Every evaluate below is uncited -- reproducing #150, not working around
# it: a measured pipeline-health check or a dispositional judgement has no
# scientific claim to cite.
lab --date "$STAGE2B_INVENTORY_DONE" evaluate "$crit_gate1" \
  --value "test_selecting_the_grid_floor_is_a_halt: forcing the predicate to never-halt fails it; forcing it to halt-on-everything fails the two neighbouring tests; the whole group fails against commit 817ac08, the exact driver that produced the report, confirming the failure is the absent gate rather than a broken import" \
  --outcome pass --gate "$gate_inventory" >/dev/null

lab --date "$STAGE2B_INVENTORY_DONE" evaluate "$crit_gate2" \
  --value "before this row existed, replacing the equivalence check's passed expression with a literal True left all 142 tests across two files green -- the gate was implemented, reachable, and had no test that could fail it. Two negative-path tests added since, confirmed against two independent deliberate breaks (passed->True; pred_agrees->True alone), each isolating its own gate condition" \
  --outcome pass --gate "$gate_inventory" >/dev/null

# UNWRITTEN. The anti-gaming rule this file's own header quotes -- "a
# clause cannot be moved from binding_gate to another kind merely because
# enforcement is absent" -- is what keeps this row binding_gate rather
# than being reclassified not_binding now that it is convenient to.
lab --date "$STAGE2B_INVENTORY_DONE" evaluate "$crit_gate3" \
  --value "enforcement, production_reachability, input_wiring, decision_consequence, test, and break_demonstrated are all empty: no statistics driver implementing the hierarchical identity gate exists yet. Absence, not a passing predicate -- this kind's own rule is that an empty field fails readiness rather than being reclassified" \
  --outcome fail --gate "$gate_inventory" >/dev/null

# "Re-sign gates.toml after task #49; fix the parallel AUDIT_PROTOCOL.md
# staleness", 2026-08-11T16:52:13+01:00 -- matches this row's own value
# text, "re-evaluated 2026-08-11".
STAGE2B_CLAIM1_REEVAL=2026-08-11T15:52:13.000Z

lab --date "$STAGE2B_CLAIM1_REEVAL" evaluate "$crit_claim1" \
  --value "re-evaluated 2026-08-11: the stress set exists and ran (PROTOCOL1_OK); FINDINGS.md's Construction table matches every element named (regenerated top-100 discrepancies; 89 convergence-tail cases, cap=500 not applied; per-class floor >=20; seed=42); identical frozen ridge coefficients confirmed; grepped the whole tree for the retracted 'basin-boundary candidates' term -- the only two occurrences both describe the retraction itself" \
  --outcome pass --gate "$gate_inventory" >/dev/null

lab --date "$STAGE2B_INVENTORY_DONE" evaluate "$crit_notbinding1" \
  --value "NARRATION, per the four fixed shapes this section is scanned against: a corrected defect kept rather than edited away. The gate it describes binds elsewhere (DESIGN.md:135/:192, rows 5d8386004c11/5908ac408624), and its one prospective sentence (REVISIT if measured full-scale cost differs) was separately checked against the same four shapes and found discretionary, not compelling" \
  --outcome pass --gate "$gate_inventory" >/dev/null

# The one call in this script under a different --author: the Reviewer's
# own sign-off, not this script's transcription of it. gates.toml itself
# keeps `reviewer` and `recorded_by` apart on the Reviewer's explicit
# instruction that a transcribing agent cannot make the attestation
# independently -- this call does the same, in LabKit's own attribution
# fields (`claimed`, not `observed`; see header comment).
#
# "Re-sign the inventory, and write down the protocol that did it",
# 2026-08-10T20:33:18+01:00 -- one of the two dates the --author string
# below names; the other (2026-08-11) is the later re-disposition
# already dated above for crit_claim1's own re-evaluation.
STAGE2B_SIGNOFF=2026-08-10T19:33:18.000Z

lab --date "$STAGE2B_SIGNOFF" --author "Dan Barua (2026-08-10, 2026-08-11); earlier rulings by ChatGPT / Stage 2B Reviewer" \
  evaluate "$crit_signoff" \
  --value "Requirement 4 remediation/inventory mechanism: SIGNED OFF. The twelve findings of 2026-08-09 are 12/12 resolved. NOT a stage-4 release -- it clears requirement 4 as a prerequisite; the independent package-review gate remains separately blocked by rows that are pending_package on purpose, because the audit driver and its artefacts do not exist yet" \
  --outcome pass --gate "$gate_inventory" >/dev/null

ask gate "$gate_inventory"

printf '\n-- what was known the moment this stage actually closed (#166)?\n'
ask known --at "$STAGE2B_STAGE4"

say "standing point-in-time queries (#166), run against the full chain"

# The reviewer's ruling instant -- gates.toml's own header, "ruling of
# 2026-08-08, §5". #166 predicted this would show 1A closed negative, 1B.2
# established locally, 1C confirmed, 2A/2B absent -- checked against the
# real mined dates rather than assumed, and it is NOT what the record
# shows: Stage 2A ran and closed entirely on 2026-08-02 through 2026-08-04
# (STAGE2A_COST_RESULTS in probe-bonsai-2a.sh), four to six days before this
# ruling, so its cost-accounting question (Q_7 in a fresh chain) is already
# `provisional` here, not absent. Only Stage 2B (posed and pursued
# 2026-08-05 under STAGE2B_DESIGN_LOCK, but not analysed until
# STAGE2B_STAGE4 on 2026-08-09) is genuinely `open` -- pursued, nothing
# concluded yet. The prediction was reasonable before the archaeology; the
# record, once dated for real, is the more precise answer.
ask known --at 2026-08-08T00:00:00.000Z

say "the events this script generated"
ask happened

say "read the answers above. This script asserts nothing on purpose."
exit 0
