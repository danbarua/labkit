# 025 — A condition recorded where nobody re-reads it is not a mechanism

**2026-08-21, after row AD.** Three ledger rows have now closed because someone
re-read a sentence written scenarios earlier and noticed it had come true. Three
is a pattern about how this record gets read, not three accidents.

## The three

Each cell recorded a condition of the form *"if X, then this row moves"*. In all
three cases X happened, and in all three the sentence sat unread while it did.

| Row | The condition, as written | How long it sat fired |
| --- | --- | --- |
| **K** | "S-8 was built and gave no verdict; the ledger records *that* as the verdict" — with §4's nomination condition applying to it | Through **three external reviews**, until S-18 |
| **Z** | "neither a durable event sink nor a `decided_at` property is earned by a question nobody has yet been unable to answer" | Until the consumer probe made someone unable to answer it, then until someone re-read the cell |
| **P** | "three scenarios have now been pointed at it and the harm they found was a reader's, not a structure's. **If it is a defect, something else will have to demonstrate it**" | **Four scenarios**, and its own status column was stale for the same four |

Row P is the sharpest, because two independent things had gone wrong in one
cell: the condition had fired *and* the status said `open` while the index said
`resolved`. Neither was noticed by anyone reading the index, which is what a
reader reads.

## Why it keeps happening, and it is not carelessness

**A ledger's conditions are written by someone who will not be the one reading
them.**

The author of a deferral knows exactly what would settle it — that is why they
can write the condition down. They are also, at that moment, the person least
likely to be present when it is met, because the whole point of deferring is
that settling it needs work nobody is doing yet. So the sentence is composed with
full context and read, if at all, by someone with none.

That is the same mechanism behind two other things this project found on the same
day, which is what makes it a pattern rather than an observation about ledgers:

- **Both checks written that day had the blind spot of the class they closed.**
  `check-doc-comments`'s first version could not see one-line comments, and the
  repair built on it stranded a fresh comment in exactly that gap.
  `check-ledger`'s first version read one of *two* copies of a fact whose failure
  mode is copies drifting. In both cases the instrument inherited its author's
  model of the defect, and the author's model was the thing that had just failed.
- **A CLAUDE.md sentence outlived its truth by a day.** "No item on the ledger's
  index is now known-open" was written when it was true and survived the edits
  that falsified it, three paragraphs above the paragraph naming the known-open
  row.

## What this does and does not license

**It does not license a checker over the conditions.** They are narrative — *"if
it is a defect, something else will have to demonstrate it"* has no machine
form, and a script adjudicating it would be wrong more often than the sentence
is. That is the same argument that keeps `check:ledger` to one rule.

**It does license checking the things that are not narrative**, and two now are:

- `bun run check:ledger` fails when two §3 rows carry `demonstrated`, which turns
  CLAUDE.md's one-wrong-answer-at-a-time rule from a precondition established by
  reading prose into an invariant. Row K's failure was precisely that this
  precondition had no scannable form.
- The same check fails when a row's index status disagrees with its own cell.
  That is row P's second defect, and it is equality between two copies of one
  fact rather than judgment.

**And it licenses one habit, which is the actual remedy.** A row's condition
should be re-read when the row is *touched for any reason* — not on a schedule,
which nobody keeps, but at the only moment someone is reliably looking at the
cell. Row P's condition was found by a review of row AD, which is adjacent to it
and not the same row; row Z's was found while writing predictions for a different
build. Both times the reader was already there.

## The status vocabulary gained a fourth entry, and this is why

`demonstrated` was added to §3 on the same day, for a row whose discriminator is
built, whose wrong answer is on the record, and whose *fix* is what is unbuilt.
The argument for it is this entry's argument: **the deferral rule already
referenced that state and the vocabulary could not express it.** "At most one
confirmed wrong answer ships green" had a precondition the ledger had no way to
mark.

A fourth label that nothing counted would have repeated row K exactly — a
condition expressed where only a careful reader would find it. So it is counted.

## What is not fixed

Rows O, S and T still carry conditions in prose, and nothing will notice when
they fire. Row O's fired already in a sense: its cell defers to "when the event
model is under real pressure" while its own verified-state line describes a
present-tense question, and that contradiction was found by a reviewer reading
the cell, not by anything structural. The remedy is the habit above, and the
honest position is that the habit has a hit rate rather than a guarantee.
