#!/usr/bin/env bash
#
# The CLI against a real database, asserted — the end-to-end check.
#
# **Split out of `examples/full-lifecycle.sh`, which is now what its name says.**
# One script tried to be both and could only be one: it captured every command's
# answer into a variable, asserted on it, and printed `ok <label>`, so a reader
# running something called "example" watched fifteen assertions pass and learnt
# nothing about what LabKit is or what a command prints. The example now shows
# the commands and their real output; this keeps the checking.
#
# They cover different things on purpose, and are expected to diverge. The
# example shows the happy path a person would follow. This is free to assert
# what nobody wants narrated — an absence, a bucket boundary, a refusal — and
# should grow that way rather than mirroring the transcript.
#
# **What it uniquely covers is the CLI process against a real PGlite database.**
# `bun test` exercises the domain and the command layer in-process;
# `tests/cli/json-contract.test.ts` drives every read command with no database
# at all. Nothing else runs the binary end to end.
#
# Hermetic. `--db` points at a fresh temporary directory, so this cannot touch a
# working database and cannot contend with one: `derivePort` in
# `src/db/connect.ts` hashes that path, so this run gets its own file *and* its
# own port. The directory is removed on exit, success or failure.
#
# **Exit 0 means it worked, and nothing else does.** `set -e` plus explicit
# assertions on what came back — not on whether the commands ran. The
# TypeScript predecessor exited 99 on a completely successful run, so CLAUDE.md
# told everyone to ignore its exit code, and it then sat broken for 221 commits
# with no watcher. A signal nobody trusts has no watcher; that is the lesson,
# and it cost more than the script did.
#
# Nothing here reports status through a pipe. `$?` after a pipeline is the
# *last* command's status, and this repo has been caught by that twice.
#
# Usage: bun run check:cli   (or: bash scripts/smoke-cli.sh)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="$(mktemp -d "${TMPDIR:-/tmp}/labkit-lifecycle.XXXXXX")"
trap 'rm -rf "$db"' EXIT

# One place that knows how to invoke the CLI. `--author` because a script is not
# the account it runs under, and the record should say so rather than naming a
# person who was asleep.
lab() { bun "$root/src/cli/cli.ts" --db "$db" --author full-lifecycle.sh "$@"; }

# Asserts on the *content* of an answer, not on the exit code of the command
# that produced it. A command that runs and answers wrongly is the failure this
# script exists to catch.
step=0
expect() {
  local what="$1" haystack="$2" needle="$3"
  step=$((step + 1))
  if [[ "$haystack" != *"$needle"* ]]; then
    printf '\nFAIL (%d) %s\n  expected to find: %s\n  in:\n%s\n' \
      "$step" "$what" "$needle" "$haystack" >&2
    exit 1
  fi
  printf '  ok  %s\n' "$what"
}

# The opposite assertion, and it is not decoration: three of the checks below
# are only meaningful as absences. A composed verb recording one event is
# indistinguishable from one recording four unless the four are shown missing.
refute() {
  local what="$1" haystack="$2" needle="$3"
  step=$((step + 1))
  if [[ "$haystack" == *"$needle"* ]]; then
    printf '\nFAIL (%d) %s\n  expected NOT to find: %s\n  in:\n%s\n' \
      "$step" "$what" "$needle" "$haystack" >&2
    exit 1
  fi
  printf '  ok  %s\n' "$what"
}

# One value out of a JSON answer, by dotted path.
#
# Needed because `known` prints every bucket it has, so the word "Established"
# is in the output of a programme that has established nothing — asserting on
# the prose would pass whichever bucket the question landed in. Naming the
# bucket is the whole assertion.
pluck() {
  bun -e 'const path = process.argv[1].split("."); let v = JSON.parse(await Bun.stdin.text()); for (const k of path) v = v?.[k]; console.log(JSON.stringify(v));' "$1"
}

# A handle, and a check that it is one. Every verb here mints something and
# returns it; an id of the wrong shape means a verb answered about the wrong
# record, which is the failure PJ-030 is about.
handle() {
  local prefix="$1" value="$2"
  if [[ "$value" != "$prefix"_* ]]; then
    printf '\nFAIL expected a %s_ handle, got: %s\n' "$prefix" "$value" >&2
    exit 1
  fi
  printf '%s' "$value"
}

echo "== asking =="

enquiry=$(handle LOE "$(lab open 'does the pruning schedule move convergence?')")
echo "  enquiry $enquiry"

echo "== prespecifying =="

work=$(handle TASK "$(lab plan \
  --objective 'sweep depth 4 through 20 under the pruning schedule' \
  --acceptance 'a convergence curve with n>=20 at each depth' \
  --may-read 'depth-sweep-raw')")
echo "  work $work"

criterion=$(handle CRIT "$(lab criterion 'the effect holds at n>=20')")
gate=$(handle GATE "$(lab declare \
  --governed-by "$criterion" \
  --consequence 'the result may not be built on until this holds' \
  --protecting "$work")")
echo "  gate $gate governing $criterion"

# Declared and never evaluated: a gate has a state before anybody checks it, and
# it is not "passed".
expect "a gate nobody has evaluated is never-evaluated" \
  "$(lab gate "$gate")" "never-evaluated"

echo "== measuring, then analysing =="

observations=$(handle ART "$(lab observe "$enquiry" \
  --name 'depth-sweep-raw' \
  --finding 'convergence step counts at depths 4, 8, 12, 16, 20' \
  --hash 'sha256:9f2b')")
echo "  observations $observations"

# The compound verb: a computation, its evidence unit, its output artefact, and
# one claim per conclusion -- one act, and the log records one event for it.
analysis_out=$(lab analyse "$enquiry" \
  --method 'paired comparison against the unpruned baseline' \
  --from "$observations" \
  --implementing "$work" \
  --held-to "$criterion" \
  --concludes '{"proposition": "the pruning schedule moves convergence", "finding": "converges ~3 steps earlier at every depth"}')
analysis=$(handle COMP "$(printf '%s' "$analysis_out" | head -1)")
claim=$(handle CLM "$(printf '%s' "$analysis_out" | tail -1)")
echo "  analysis $analysis claiming $claim"

echo "== checking, promoting, closing =="

lab evaluate "$criterion" --gate "$gate" --value 'n=24 at every depth' --outcome pass >/dev/null
expect "the gate is satisfied once its condition passes" \
  "$(lab gate "$gate")" "satisfied"

# **Deliberately left exploratory above**, so this line is load-bearing rather
# than ceremonial. `whatIsKnown` reads `Claim.kind`, and a conclusion recorded
# as `"standing": "confirmatory"` is already promoted as far as that read is
# concerned -- which is how the first version of this script passed with the
# promote step commented out. A negative control found it; the assertion below
# is only worth anything because removing this line reddens it.
lab promote "$claim" --because 'the prespecified check passed at every depth' >/dev/null
lab close "$enquiry" --answered-by "$claim" >/dev/null

echo "== reading it back =="

known=$(lab known --json)
established=$(printf '%s' "$known" | pluck established)
provisional=$(printf '%s' "$known" | pluck provisional)
expect "the answered question is established" "$established" "does the pruning schedule move convergence?"
refute "and not merely provisional -- the claim was promoted" \
  "$provisional" "does the pruning schedule move convergence?"

why=$(lab why "$claim")
expect "the claim is supported" "$why" "supported"
expect "the finding under it is named" "$why" "converges ~3 steps earlier"
expect "the prespecified standard is shown" "$why" "the effect holds at n>=20"

expect "the enquiry reports itself closed" "$(lab enquiry "$enquiry")" "closed"

# The dependency walk is a lower bound and says so; what matters here is that
# the claim is reached from the artefact the analysis read.
expect "the claim is reachable from what it rests on" \
  "$(lab affects depth-sweep-raw)" "$claim"

# The one read that answers from the event log rather than the graph. Nothing
# else can say who did this.
log=$(lab happened)
expect "the log records the analysis" "$log" "recordAnalysis"
expect "and records opening an enquiry as one act" "$log" "openEnquiry"
refute "not as its first part" "$log" " pose "
refute "nor its second" "$log" " pursue "
expect "attribution names the script, not the account it ran under" "$log" "full-lifecycle.sh"

# A handle appears in `created`, not only as a subject: six verbs mint a
# Decision and only one names it as what the act was about.
expect "an act is findable by what it minted" "$(lab happened "$claim")" "recordAnalysis"

echo
echo "full lifecycle: $step assertions, all passed"
