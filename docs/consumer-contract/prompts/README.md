# Prompts as sent — the reproducibility half of the record

The **outputs** of every run are committed verbatim (`010`–`015`, `020`), and
verified byte-identical to raw stdout. This directory preserves the **inputs**,
which otherwise existed only in a session-scoped scratchpad and would have been
lost with the session. A frozen output whose prompt nobody can reconstruct is not
a reproducible result.

## What was actually sent, with hashes

SHA-256, first 16 hex chars, of the exact bytes handed to `omp` via `@path`:

| Prompt | Bytes | SHA-256 |
| --- | --- | --- |
| Stage A packet — all three designers, identical | 5,441 | `bf0c8c1341759644` |
| Stage B prompt — claude | 69,754 | `6425d23514fde366` |
| Stage B prompt — gpt | 60,605 | `51a0b01372d866a5` |
| Stage B prompt — grok | 59,742 | `70abec78f98b337f` |
| Synthesis prompt | 163,688 | `aa9abe6d9557db3d` |

## How each was assembled

Kept as a recipe rather than five files, because three of them are 60–164KB and
are ~97% material already committed elsewhere in this directory. Duplicating it
would bury the parts that are actually irreducible — which are the two files
beside this one.

**Stage A packet** = `002_stage_a_packet.md`, **everything below its first
horizontal rule**. The preamble above the rule is repo commentary and was not
sent: it explains which glosses were stripped *by naming them*, so a designer
given the file whole would read the redaction notice and learn the words.

```sh
awk '/^---$/{f=1;next} f' 002_stage_a_packet.md
```

**Stage B prompt** (per designer) = `stage_b_wrapper.md`'s preamble, then

- PART 1: the Stage A packet, as above;
- PART 2: that designer's **own** `01N_stage_a_*.md` below its rule — its own
  only, no designer saw another's;
- PART 3: `003_stage_b_packet.md` below its rule, with `> ` blockquote markers
  stripped;
- then `stage_b_wrapper.md`'s task section.

Reconstruction was necessary because `--no-session` leaves each run a fresh
process with no memory of the earlier one.

**Synthesis prompt** = `synthesis_instruction.md`, then the three Stage A outputs
below their rules, each under `# ===================== Designer N =====================`,
in the order claude, gpt, grok. **The synthesiser was not told that mapping** —
verified zero provider or model strings in its prompt.

## The two files that are irreducible

`synthesis_instruction.md` and `stage_b_wrapper.md` exist nowhere else. Both
carry edits that matter to how the results should be read:

- The Stage B wrapper's task heading reads **"Your task"**, not "The Stage B
  question" as `003` has it. A designer told it is inside a staged experiment is
  being invited to perform a revision. The instruction also states that no change
  is a legitimate answer and more useful than a manufactured one, so the demand
  characteristic runs the other way.
- The synthesis instruction never says what the map is for, never mentions
  LabKit's model, and labels the designs 1/2/3 with model identity withheld. It
  asks for meaning over vocabulary explicitly, because a map organised by shared
  wording would have been worthless.

## Run parameters

All runs: `omp -p --no-session --no-title --auto-approve --no-tools --thinking
high --mode text`, `--cwd` an empty scratch directory, stdin detached.

`--no-tools` and the empty `--cwd` are what make "no repository access" a fact
rather than a wish — `omp`'s default is the full tool set with `--cwd "$PWD"`,
which would have put `src/db/domain.ts` and `CLAUDE.md` one read away.

| Run | Model |
| --- | --- |
| Designer 1 | `anthropic/claude-opus-5` |
| Designer 2 | `openai-codex/gpt-5.6-sol` |
| Designer 3 | `xai-oauth/grok-4.6` |
| Synthesiser | `openai-codex/gpt-5.6-terra` |

The synthesiser necessarily shares a family with Designer 2: only three providers
are authenticated on the machine and all three are designers. Blinding means it
cannot know which output that is; a nudge toward that framing cannot be ruled out.
