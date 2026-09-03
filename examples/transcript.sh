# Shared styling and narration for the example transcripts. Sourced, not run:
# the caller sets `root`, `db` and `transcript_author` first, then uses
# `chapter`/`say`/`lab`/`handle`/`pick`.
#
# Four kinds of text share a transcript page and a reader needs to tell them
# apart at a glance:
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
# `NO_COLOR` turns off this styling *and* stops it forcing the CLI's, so one
# variable gets a completely plain transcript. The structure survives it,
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
  LAST="$(FORCE_COLOR=$LAB_COLOUR bun "$root/src/cli/cli.ts" --db "$db" --author "$transcript_author" "$@")"
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

# The one line carrying this prefix, out of a multi-handle answer. `open` and
# `observe` each mint more than one thing -- prose prints every handle the
# act created, one per line -- so `$LAST` after one of those is several lines
# and a caller needing one specific handle has to name which line is theirs.
pick() {
  local prefix="$1" blob="$2" line
  while IFS= read -r line; do
    if [[ "$line" == "$prefix"_* ]]; then
      printf '%s' "$line"
      return 0
    fi
  done <<<"$blob"
  printf '\nno %s_ handle in: %s\n' "$prefix" "$blob" >&2
  exit 1
}
