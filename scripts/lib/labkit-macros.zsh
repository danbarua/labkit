#!/usr/bin/env zsh
# Shorthands for the command sequences the Bonsai transcription types out by hand.
#
#   source scripts/lib/labkit-macros.zsh
#
# Each one runs the same commands you would type, so the record it writes is identical.
# They exist because the sequences are fixed: across the five probe scripts, 167 calls,
# `observe -> analyse -> conclude` appears nine times and never in another order.
#
# `$LK` is the command they call, and it names the record: a directory through `--db`, or a
# tenant on the Postgres `LABKIT_DB_URL` names.
#   export LK="bin/labkit --db ~/somewhere"
#   export LK="bun packages/app-cli/cli.ts --tenant museum"

: ${LK:="bun packages/app-cli/cli.ts"}

# One handle, or nothing.
#
# `search` returns every match and refuses to pick, which is right. This is the caller
# side of that: take the single match, or fail loudly naming how many there were.
lk_one() {
  local kind=$1 wording=$2 matches n
  matches=$(${=LK} search "$wording" --json \
    | jq -er --arg kind "$kind" '[.[] | .matches[].handle | select(startswith($kind + "_"))] | unique | .[]') \
    || matches=""
  n=$(print -r -- "$matches" | grep -c . || true)
  if (( n != 1 )); then
    print -u2 "lk_one: wanted one ${kind} matching \"$wording\", found $n"
    return 1
  fi
  print -r -- "$matches"
}

# A run and what it found, in one call.
#
#   lk_record <enquiry> <name> <observation> <method> <proposition> [bearing]
#
# Prints the claim's handle. `bearing` is `supports` (the default) or `challenges`.
lk_record() {
  local enquiry=$1 name=$2 observation=$3 method=$4 proposition=$5 bearing=${6:-supports}
  local artefact analysis
  artefact=$(${=LK} observe "$enquiry" --name "$name" --finding "$observation" --json \
    | jq -er .observations) || return 1
  analysis=$(${=LK} analyse "$enquiry" --method "$method" --from "$artefact" --json \
    | jq -er .analysis) || return 1
  ${=LK} conclude "$analysis" --proposition "$proposition" --finding "$observation" \
    --bearing "$bearing" --json | jq -er '.claims[0].claim'
}

# One more conclusion from a run already on the record.
#
# Separate because `conclude` follows `conclude` fourteen times in the corpus: a run
# answers several propositions, and only the first needs the run recorded first.
lk_also() {
  local analysis=$1 proposition=$2 finding=$3 bearing=${4:-supports}
  ${=LK} conclude "$analysis" --proposition "$proposition" --finding "$finding" \
    --bearing "$bearing" --json | jq -er '.claims[0].claim'
}

# A condition, and the gate that holds work up until it is met.
#
#   lk_gate <condition> <consequence> <work>
#
# Prints the gate's handle.
lk_gate() {
  local condition=$1 consequence=$2 work=$3 criterion
  criterion=$(${=LK} criterion "$condition" --json | jq -er .criterion) || return 1
  ${=LK} declare --governed-by "$criterion" --consequence "$consequence" \
    --protecting "$work" --json | jq -er .gate
}

# A question, pursued, in one call — which `labkit open` already does.
#
# Here only because the Bonsai scripts call `pose` then `pursue` seven times and `open`
# zero times. It records one act where `pose` then `pursue` record two, so a transcription
# that must reproduce an existing record keeps the pair; new work uses `labkit open`.
lk_open() {
  ${=LK} open "$1" --json | jq -er .enquiry
}
