#!/usr/bin/env bash
#
# A research lifecycle, end to end, through the CLI. See ./full-lifecycle.md.
#
# Shows LabKit; does not check it. The assertions over this same path live in
# `scripts/smoke-cli.sh` (`bun run check:cli`), so this file can stay readable
# and that one can check things nobody wants narrated.
#
# Hermetic: `--db` points at a fresh temporary directory, removed on exit. Its
# database file and its lock both live in there, so this cannot touch or contend
# with a working database.
#
# Usage: bun run example
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="$(mktemp -d "${TMPDIR:-/tmp}/labkit-lifecycle.XXXXXX")"
trap 'rm -rf "$db"' EXIT

# The styling, narration and handle plumbing are shared with the other
# transcript in this directory -- see ./transcript.sh for the colour argument.
transcript_author=full-lifecycle.sh
# shellcheck source=examples/transcript.sh
. "$root/examples/transcript.sh"

# The document's own title is a heading, not prose. It was inside the prose
# block until someone noticed the one header on the page that was not styled as
# one.
printf '%s%s%s\n' "$S_HEAD" "LabKit, by worked example" "$S_OFF"
printf '%s%s%s\n' "$S_RULE" "=========================" "$S_OFF"

printf '%s' "$S_PROSE"
cat <<'INTRO'

LabKit is a research control plane. It records why a computation was run, what
evidence came out of it, which claims and decisions rest on that evidence, and
what is still unresolved. It is not an experiment tracker -- metrics, run logs
and sweeps belong to W&B or MLflow.

Below is one line of enquiry taken from a question to a settled answer, using
only the CLI. Every command is shown as typed, with what it printed.

It runs against a throwaway database, deleted when this exits.
INTRO
printf '%s' "$S_OFF"

chapter "Asking a question" \
  "Research starts with a question and a line of enquiry pursuing it." \
  "\`open\` does both as one act and answers with the enquiry's handle." \
  "Handles are how every later command names this work."

lab open 'does the pruning schedule move convergence?'
enquiry=$(pick LOE "$LAST")

chapter "Saying in advance what would count" \
  "Before any measurement: the work's objective and what would meet it, then" \
  "the condition its result will be held to, then a gate binding the two." \
  "Stating the condition first is the whole point -- a check agreed after" \
  "seeing the numbers is not the same check."

lab plan \
  --objective 'sweep depth 4 through 20 under the pruning schedule' \
  --acceptance 'a convergence curve with n>=20 at each depth' \
  --may-read 'depth-sweep-raw'
work=$(handle TASK "$LAST")

lab criterion 'the effect holds at n>=20'
criterion=$(handle CRIT "$LAST")

lab declare \
  --governed-by "$criterion" \
  --consequence 'the result may not be built on until this holds' \
  --protecting "$work"
gate=$(handle GATE "$LAST")

say "A gate has a state before anybody checks it, and that state is not 'passed':"

lab gate "$gate"

chapter "Measuring, then analysing" \
  "Observations go on the record before anything is concluded from them." \
  "The analysis then names what it read, which planned work it carries out," \
  "and which prespecified condition its conclusions are held to."

lab observe "$enquiry" \
  --name 'depth-sweep-raw' \
  --finding 'convergence step counts at depths 4, 8, 12, 16, 20' \
  --hash 'sha256:9f2b'
observations=$(pick ART "$LAST")

say "Recording the run: a computation, an evidence unit, and an artefact to" \
    "hold its output. No findings yet, and that is a real state rather than" \
    "an empty one -- the analysis is still being done."

lab analyse "$enquiry" \
  --method 'paired comparison against the unpruned baseline' \
  --from "$observations" \
  --implementing "$work" \
  --held-to "$criterion"
analysis=$(handle COMP "$(printf '%s' "$LAST" | head -1)")

say "Then the finding, as its own act. Findings arrive one at a time, over" \
    "days -- so concluding is its own verb, and the record says when each" \
    "one was reached and by whom."

lab conclude "$analysis" \
  --proposition 'the pruning schedule moves convergence' \
  --finding 'converges ~3 steps earlier at every depth'
claim=$(handle CLM "$(printf '%s' "$LAST" | tail -1)")

chapter "Confirming and closing, before the check has run" \
  "Saying a finding is confirmed is a separate act from concluding it, and" \
  "it is not the same as verification. Doing it in this order shows the" \
  "difference."

say "Until a finding is confirmed it is scratch, and an answer resting on it" \
    "is provisional. So say it is confirmed, and close the question on it:"

lab is "$claim" confirmed --because 'we are relying on this to ship'

lab close "$enquiry" --answered-by "$claim"

say "The question is answered on confirmed work -- and the condition agreed" \
    "before the run has still not been checked. LabKit will not call that" \
    "established:"

lab known

say "Confirmation says a person vouched for it. The prespecified check says" \
    "nobody has confirmed it. A check nobody ran counts against the finding it" \
    "qualifies, exactly as a failing one would."

lab why "$claim"

chapter "Running the check" \
  "A gate's state is computed from the checks under it -- there is no field" \
  "anyone can set to 'satisfied'."

lab evaluate "$criterion" --gate "$gate" --value 'n=24 at every depth' --outcome pass

lab gate "$gate"

chapter "The rest of the programme" \
  "One question in one state says nothing about the partition. A real" \
  "programme has several at once, at different stages -- so here are five" \
  "more, each stopped at a different point."

say "Posed and nothing else. Nobody has pursued it:"

lab pose 'does depth interact with the schedule?'

say "Pursued and measured, with nothing concluded yet:"

lab open 'is the effect stable across seeds?'
seeds=$(pick LOE "$LAST")
lab observe "$seeds" --name 'seed-sweep-raw' --finding 'convergence step counts over 20 seeds'

say "Concluded and closed -- but nobody said the finding is confirmed, so the" \
    "answer rests on scratch:"

lab open 'does it hold on the held-out split?'
holdout=$(pick LOE "$LAST")
lab observe "$holdout" --name 'holdout-raw' --finding 'convergence on the held-out split'
holdout_obs=$(pick ART "$LAST")
lab analyse "$holdout" \
  --method 'paired comparison on the held-out split' \
  --from "$holdout_obs"
holdout_analysis=$(handle COMP "$(printf '%s' "$LAST" | head -1)")
lab conclude "$holdout_analysis" \
  --proposition 'the effect holds on the held-out split' \
  --finding 'converges ~2 steps earlier'
holdout_claim=$(handle CLM "$(printf '%s' "$LAST" | tail -1)")
lab close "$holdout" --answered-by "$holdout_claim"

say "Analysed, and the finding settles the proposition neither way. Saying so" \
    "keeps the evidence on the record without pretending it points anywhere --" \
    "\`why\` will report neither supports nor challenges:"

lab open 'does the effect vary with width?'
width=$(pick LOE "$LAST")
lab observe "$width" --name 'width-sweep-raw' --finding 'convergence at widths 64 through 1024'
width_obs=$(pick ART "$LAST")
lab analyse "$width" --method 'paired comparison across widths' --from "$width_obs"
width_analysis=$(handle COMP "$(printf '%s' "$LAST" | head -1)")
lab conclude "$width_analysis" \
  --proposition 'the effect varies with width' \
  --finding 'noisy in both directions; too few runs per width to call'
width_evidence=$(pick EV "$LAST")
width_claim=$(pick CLM "$LAST")
lab is "$width_claim" undecided --because "$width_evidence"

say "And one left open on purpose, with the condition that would reopen it." \
    "That is not the same as nobody having got round to it:"

lab open 'why does depth 12 behave differently?'
anomaly=$(pick LOE "$LAST")
lab accept "$anomaly" \
  --because 'the confirmatory set is spent and this needs a fresh design' \
  --until 'a data source other than the spent set' \
  --in-light-of "$claim"

chapter "Reading the record back" \
  "Everything below is derived from durable state, not replayed from a log."

say "Six questions, five states. The buckets are the distinction that matters," \
    "and a reader scanning for what still needs doing must not find the" \
    "deliberately-parked one among them:"

lab known

say "Every command takes --json, and it is the same document an MCP client" \
    "gets. Same five buckets, and now with something in each of them:"

lab --json known

say "Why does this conclusion stand? The findings under it, the standard it was" \
    "held to, and anything bearing against it:"

lab why "$claim"

lab enquiry "$enquiry"

say "If the raw measurement turned out to be wrong, what would be affected?" \
    "The answer is a lower bound and says so -- absence is not independence."

lab affects depth-sweep-raw

chapter "What was done, and by whom" \
  "One command answers from the event log rather than from the record. Every" \
  "other read says what is true now; this says what was done to make it so," \
  "when, and by which agent against which commit -- none of which the graph" \
  "holds."

lab happened

say "A composed verb records one event, not one per node it wrote -- a" \
    "researcher who opened an enquiry did one thing. And an act is findable by" \
    "what it *created*, not only by what it was about:"

lab happened "$claim"

printf '\n\n%s===%s done %s===%s\n' "$S_RULE" "$S_HEAD" "$S_RULE" "$S_OFF"
printf "${S_PROSE}That is the whole lifecycle. \`labkit --help\` has the rest, and${S_OFF}\n"
printf "${S_PROSE}\`bun run check:cli\` runs the same path with assertions on it.${S_OFF}\n\n"
