# PJ-036: two days of the usage era, from the reviewer's seat

**Status: dated record, 2026-09-01.** Written by `labkit-review`, the session
that reviewed rather than built, so this is the account of what the first real
record did to the model and the rules — not of any one change. PJ-035 is the
build record of the largest of those changes, the `conclude` primitive, and is
written by the session that built it. PJ-008b is the decision that opened this
era; this is what came through the door.

## What went in

The real Bonsai programme — coupled-oscillator dynamics over topologies learned
from image populations, 700 commits between 2026-07-31 and 2026-08-14 — entered
LabKit as a record on 2026-08-31, by hand, through the CLI, from inside its own
repository. Four transcription chains (Stage 1A and its re-verification; 1B.2 →
1C → 1D; 2A; 2B) in four probe scripts, each a `probe:` because its interesting
outcomes were things the tool could not do. By the end of the second day the
record held 133 events with the research's own dates (`--date`, a backfill the
CLI hides from `--help`), was provably script-derived (a replay checker that
byte-diffs `happened` and `known` against a fresh build, and whose first run was
red for a reason nobody had bothered to fix), and answered its owner's question
in his words: *what am I blocked on right now, and what are my priorities?*

## What it found, in the order it found it

Every one of these was a hand-transcriber hesitating over which verb to use, or
a read answering wrongly, on real data. None came from an authored scenario.

1. **A criterion evaluated per comparison has no home.** Bonsai's one decision
   rule applied to four comparisons; LabKit's verdict is criterion-scoped, so
   four criteria were minted where the researcher had one. An open question.
2. **`replace` retracted a conclusion the researchers had explicitly kept.**
   Bonsai's v2 re-analysed three of four; the record said the fourth was
   superseded, citing a review that never mentioned it. The demonstrated wrong
   answer, and the P0 for two days.
3. **A gate whose only verdict was retracted read `satisfied`.** Four branches,
   a fifth check state added later, the fall-through was the default. Cleared
   the same day, by making `satisfied` require positive proof.
4. **A negative result read as a positive.** The survey printed the question,
   not the answer; an outside reader took an established *no* for a *yes*.
   Cleared by printing the polarity.
5. **A deferred question, later answered, lost its deferral.** The reopening
   condition sat on a Decision nothing read once an answer existed.
6. **A genuinely inconclusive finding had to be recorded as a bearing.**
   `supports` or `challenges`; the researcher had said neither.
7. **A measured quality-bar check recorded as asserted**, because a verdict can
   cite only a claim and a pipeline-health check produces a count.
8. **Every event carried the transcription's date**, so *what was known when
   the reviewer ruled* answered nothing. Decided by `--date`, with `seq` as the
   observed order and `at` the claimed instant — attribution's own split,
   applied to time.
9. **The refusals hid the shape they enforced.** The domain refused an
   out-of-sequence write in language that assumed you could see the structure.
   Every refusal now says what it expected, what it got, and what would
   satisfy it — and the audit found the obvious `grep` undercounted a file,
   because one module throws a different error class.
10. **Four verbs returned nothing while minting a Decision; `analyse`
    withheld every finding's handle; `--json` reported the handle acted on,
    not the one minted.** Fixed by one mechanism rather than eighteen edits:
    every write returns the events it recorded, and `created` is drained at
    the one seam.

## What fell

Four rules from the corpus era, each an excellent experimental control and a
terrible product constraint — the phrase is the rules' own author's, the day
the last of them went:

- **An empty result earns nothing.** Right when the question was *is the model
  correct*; it parked the one edge a real task needed for a month. Split into
  two bars: correctness changes still need a demonstrated wrong answer;
  capability changes are earned by a demonstrated consumer need, measured
  against the cost — *would this have saved the user weeks of frustration
  building it in Markdown and Git?*
- **An edge needs a reader.** Declined the link from a replacement to what it
  replaced; the read side then inferred a fact the act had in hand, and the
  first verb to need the edge found it missing. A relationship the act plainly
  states is recorded when the act is.
- **One research act is one command.** Exactly three of eighteen write
  commands took a JSON argument, and they were exactly the three that mint
  conclusions. The unit of work was drawn around the graph's convenience, not
  the person's. `conclude` is the primitive; a compound act is a fragment.
- **Hide the handles.** Never a rule, only a religion; the branded-handle
  machinery existed for callers all along.

And one rule that had been given to the reviewer by the reviewer, corrected by
the owner in twenty-five inline comments on one PR: **a comment describes what
the code does and what would trip a reader**. The argument that produced the
code is a commit message, a PR body, or an entry like this one — not a
screen-full of lore above a schema declaration, and never a sentence in a tool
description that a stranger's agent will read.

## What the vocabulary became

Three verbs in three tenses, the owner's own: **`now`** — what stands, and
`--since <seq>` for what moved, derived from the acts since the cursor and
never from a snapshot; **`why <handle>`** — the causes behind one thing,
dispatched on the handle's kind, with the compiler refusing a kind nobody
explains; **`is <handle> … --because`** — assert a new present, still to come,
into which the six revision verbs collapse as one act understood differently.
`search` turns wording into handles. `conclude` records one conclusion per
call. Outside the CLI these are the researcher's words; inside, they map onto
labels and edges by rules that are the implementation's business, and *triples
on the outside are not the triples on the inside*.

Two lines drawn in the schema, in the owner's image, because a reader broke
without them: **supersedes** is a substitution of one record for another — the
research journey takes a different fork in the road; **changes** is looking
back at the map — the same thing, interpreted differently from further down.
The interpretation history walks the map and must never see a fork.

## What the reviewer got wrong

Recorded because the method says a negative result is a result:

- Shipped a shell script that failed on every run, verified with a `grep`
  whose alternation this userland does not support; read the silence as green.
- Pushed a file carrying git conflict markers, because a failed heredoc step
  was not chained to the `git add` that followed; the owner merged it minutes
  later. The pre-push hook refused the fix — correctly — because the PR was
  already merged.
- Asked a builder to write into the ledger this era had just closed; the
  builder refused, correctly, citing the rule.
- Approved a fix that suppressed events to dodge a drain bug; the builder had
  the finding and the wrong half of the fix, and the reviewer had to be told
  the argument that decided it — that event grain must not depend on which
  client wrote the record — was one nobody had reached.
- Spent the week asking for arguments to be written into doc comments.

Each is the same shape: a check that could not fail, or a rule applied one era
late. The remedies were mechanical — chain the verification to the action,
open pull requests as drafts until verified — and none was *be more careful*.

## What stays open, on purpose

The revision verb `is` (#184), parked until the primitive it composes has
settled. Undo (#134), parked until the dispatch scaffold it reuses exists. The
open questions the corpus raised — one rule per comparison, the inconclusive
bearing, the deferral that vanished, the verdict that can only cite a claim, a
rule about rules — each with its candidates written and its demonstrated
instance on the record, waiting for the decision to be earned by the next
person who hits it. The importer for a hundred gate rows, until someone asks
for the hundred rows.

## The measure

An outside reader was shown one screen of `labkit now` against the record and
asked what its owner had been doing when he downed tools on the science to
build the instrument. It answered correctly, from the screen alone: four
results finished, four live questions provisional, one gate blocked on
reviewer process rather than research, one task a zombie. Then it misread one
line, and that misreading became finding 4. *You downed tools because the
record could not answer "are we allowed to build on this?" It can now.*
