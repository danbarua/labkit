#!/usr/bin/env bash
#
# A research lifecycle, end to end, through the CLI. See ./full-lifecycle.md.
#
# Shows LabKit; does not check it. The assertions over this same path live in
# `scripts/smoke-cli.sh` (`bun run check:cli`), so this file can stay readable
# and that one can check things nobody wants narrated.
#
# Hermetic: `--db` points at a fresh temporary directory, removed on exit, and
# `derivePort` hashes that path so this gets its own port too. It cannot touch
# or contend with a working database.
#
# Usage: bun run example
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="$(mktemp -d "${TMPDIR:-/tmp}/labkit-lifecycle.XXXXXX")"
trap 'rm -rf "$db"' EXIT

# ---------------------------------------------------------------------------
# The transcript's own styling
# ---------------------------------------------------------------------------
#
# Four kinds of text share this page and a reader needs to tell them apart at a
# glance:
#
#   heading    magenta, between rules
#   prose      bright cyan -- the document's voice, not the terminal's default
#   command    bold yellow after a dim `$` -- the line you would type
#   output     **whatever LabKit printed, untouched**
#
# No code is shared with the CLI's palette, which was checked rather than
# assumed: prose is bright cyan (96) because LabKit's *handles* are plain cyan
# (36), and a reader should never have to work out which vocabulary a colour
# belongs to. The command's bold yellow (1;33) and LabKit's `provisional` (33)
# differ by the bold, and never appear in the same block.
#
# The fourth one is the rule the other three exist to serve. LabKit already
# colours its own output by meaning, and re-tinting it here would either fight
# that vocabulary or destroy it: the CLI emits `ESC[39m` between fields to reset
# to the terminal's default foreground, so an outer tint dies partway along
# every line, and chasing that with a post-processor is the kind of clever that
# breaks on the first sequence nobody thought of. What LabKit spat out is what
# appears.
#
# So the discrimination is carried by the other three being *not* default
# colours. Output is the only text on the page in the reader's own foreground,
# which is what makes it stand out rather than blend in.
#
# `NO_COLOR` turns off this script's styling *and* stops it forcing the CLI's,
# so one variable gets a completely plain transcript. The structure survives it,
# which is what keeps this readable by something that is not a person:
# `=== ===` around a heading, `$ ` before a command, and output on its own lines.

if [ -n "${NO_COLOR:-}" ]; then
  S_RULE="" S_HEAD="" S_PROSE="" S_PROMPT="" S_CMD="" S_OFF=""
  LAB_COLOUR=""
else
  esc=$(printf '\033')
  S_RULE="${esc}[35m"    # the rules around a heading
  S_HEAD="${esc}[1;35m"  # the heading itself
  S_PROSE="${esc}[96m"   # the document's voice
  S_PROMPT="${esc}[2m"   # the `$` — punctuation, not content
  S_CMD="${esc}[1;33m"   # the command as typed: what you would copy
  S_OFF="${esc}[0m"
  LAB_COLOUR="1"
fi

# ---------------------------------------------------------------------------
# Narration and running
# ---------------------------------------------------------------------------

say() {
  printf '\n'
  printf "${S_PROSE}%s${S_OFF}\n" "$@"
}

# A section heading with the researcher's intent under it. The intent is the
# half a transcript cannot supply: a reader can see what was typed and cannot
# see why it was worth typing.
chapter() {
  printf '\n\n%s===%s %s %s===%s\n' "$S_RULE" "$S_HEAD" "$1" "$S_RULE" "$S_OFF"
  shift
  [ $# -gt 0 ] && printf "${S_PROSE}%s${S_OFF}\n" "$@"
  return 0
}

# Re-quotes an argument for display, so what is shown is what a person would
# type. Without it, `--objective sweep depth 4 through 20` appears as five
# arguments and is not a runnable line.
quoted() {
  local out="" arg
  for arg in "$@"; do
    case "$arg" in
      *[[:space:]\'\"]*) out="$out '$(printf '%s' "$arg" | sed "s/'/'\\\\''/g")'" ;;
      *) out="$out $arg" ;;
    esac
  done
  printf '%s' "${out# }"
}

# Runs a labkit command, showing it as typed and printing what it answered.
#
# The answer lands in `$LAST` rather than on this function's stdout, and that is
# load-bearing: stdout is where the transcript goes, so capturing it with
# `$(lab …)` would take the echoed command line along with the answer and the
# reader would lose the thing this script exists to show.
LAST=""
lab() {
  printf '\n%s$%s %slabkit %s%s\n' "$S_PROMPT" "$S_OFF" "$S_CMD" "$(quoted "$@")" "$S_OFF"
  # `FORCE_COLOR=1` because `$( )` is a pipe: the CLI correctly turns colour off
  # when stdout is not a terminal, so without this an example about what LabKit
  # *shows you* would print in white the moment it captured anything.
  #
  # Safe only because a handle-only answer is never coloured, even forced — see
  # `asHandles` in `src/cli/output.ts`. A write verb's `$LAST` is therefore a
  # bare id that `handle()` can prefix-check and the next command can consume,
  # while a read's `$LAST` carries the colour a reader is here to see.
  LAST="$(FORCE_COLOR=$LAB_COLOUR bun "$root/src/cli/cli.ts" --db "$db" --author full-lifecycle.sh "$@")"
  printf '%s\n' "$LAST"
}

# Passes a minted handle through, refusing one of the wrong shape.
#
# Not a test of the verb -- `scripts/smoke-cli.sh` does that. It is here so the
# transcript stops at the first real problem instead of feeding an empty string
# to the next five commands and showing a reader five consequences of it.
handle() {
  local prefix="$1" value="$2"
  if [[ "$value" != "$prefix"_* ]]; then
    printf '\nexpected a %s_ handle, got: %s\n' "$prefix" "$value" >&2
    exit 1
  fi
  printf '%s' "$value"
}

# ---------------------------------------------------------------------------

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
enquiry=$(handle LOE "$LAST")

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
observations=$(handle ART "$LAST")

say "One act, many records: a computation, an evidence unit, an output" \
    "artefact, and one claim per conclusion. It answers with the analysis" \
    "first, then a claim per conclusion in the order they were given."

lab analyse "$enquiry" \
  --method 'paired comparison against the unpruned baseline' \
  --from "$observations" \
  --implementing "$work" \
  --held-to "$criterion" \
  --concludes '{"proposition": "the pruning schedule moves convergence", "finding": "converges ~3 steps earlier at every depth"}'
analysis=$(handle COMP "$(printf '%s' "$LAST" | head -1)")
claim=$(handle CLM "$(printf '%s' "$LAST" | tail -1)")

chapter "Checking, promoting, closing" \
  "Record the prespecified check's outcome. A gate's state is computed from the" \
  "checks under it -- there is no field anyone can set to 'satisfied'."

lab evaluate "$criterion" --gate "$gate" --value 'n=24 at every depth' --outcome pass

lab gate "$gate"

say "Promotion is a separate act from concluding. Until a finding is promoted" \
    "it is scratch, and an answer resting on it is provisional rather than" \
    "established. LabKit keeps those two apart on purpose."

lab promote "$claim" --because 'the prespecified check passed at every depth'

lab close "$enquiry" --answered-by "$claim"

chapter "Reading the record back" \
  "Everything below is derived from durable state, not replayed from a log."

say "What does the programme know? Answers are partitioned by how well each one" \
    "is held up, and those buckets are the distinction that matters:"

lab known

say "Every command takes --json, and it is the same document an MCP client gets:"

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
