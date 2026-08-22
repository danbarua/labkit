# 028 — Prose is not machine-checkable. A test that does not test is.

**2026-08-21, after the first deliberate PJ-027 sweep.** PJ-027 argued that the
defect it named licenses a habit and not a checker, and gave a reason: the claims
are narrative, and a script adjudicating them would be wrong more often than the
comments are. That argument was made from three instances, all found by accident.

`labkit-dev` proposed three shapes worth testing against a real sample, and asked
for the result either way. This entry is that result. **Two of the three found
nothing severe. A fourth that nobody proposed found two, with no false positives,
and it is not about prose at all.**

## The sample

Six read-only agents, one region each, ~19,000 lines: `src/db/`, `src/domain/`
split in two, `tests/scenarios/`, the rest of `tests/`, and
`scripts/` + `.claude/skills/`. Candidates were sorted into a guarantee the code
breaks, prose merely gone stale, and intent — which is not a claim and was
counted, not listed. Nothing counted as a finding until something was run or
grepped; that discipline is PJ-027's own lesson and it had to survive being
delegated.

**28 candidates of the severe kind, 27 stale, ~93 intent.** I verified a subset,
labelling each demonstrated or inferred. The unverified remainder stays
unverified on purpose — acting on it would be the sweep-driven edit this method
exists to avoid.

## The three proposed shapes, tested

**(a) A comment naming a symbol that no longer exists.** Four hits, all real:
`ensureView()` attributed to a file that has not contained it since the views were
removed; `propPattern()`, `asClause` and `TenantGraph.cypher()` named in
`agtype.ts` as things it was written to replace, in the present tense, after it
replaced them; `src/core/progress.ts` named by a script transplanted from another
project, which greps this repo for a pattern that has never occurred and reports
success; `NATURAL_ID_PREFIX` in a migration header.

**Every one is stale prose. None is a broken guarantee.** It is a useful check and
it is not a detector for the thing PJ-027 is about.

**(b) "X is never Y" with a literal Y within N lines.** **Zero hits in that form.**
The shape is real and every instance of it is *cross-file*: the rule that AGE's
internal id never leaves `graph.ts`, against the two decoders `index.ts` exports
by name for exactly that purpose; a hook header calling a tracked file gitignored,
which only `git check-ignore` settles; a comment saying no decision carries a
timestamp, against a property in a different module. Each needs its own lookup.
There is no one check here, and the one that was proposed finds nothing.

**(c) A test saying "must not" while asserting the thing happens.** No exact hits.

## What did generalise, and it is a different thing

> **A test that asserts nothing.**

Two forms, run across the whole suite:

- a test file containing no `expect(` at all — **one file**;
- an `expect` whose two sides are both literals — **one line**.

Two hits. Both are findings, both are the severe kind, and there are no false
positives to weigh against them.

`tests/leader-election.test.ts` is named *"concurrent connectDb() calls elect one
primary and share one database"*, and CLAUDE.md calls it a test that proves the
election works. It contains no assertion. It fetches the tenant count and discards
it. Three processes each electing themselves and opening three separate databases
would pass it.

`tests/trace.test.ts` has a test named *"a throwing query is still cleared from
the in-flight set"* whose comment says **"this test exists so removing it is
loud."** Its assertion is `expect(true).toBe(true)`. Removing the `finally` it
names leaves five tests passing and none failing — demonstrated, then restored.

**The check was landed red**, naming both, and `labkit-dev` fixed them the same
day; it is green now. That order was deliberate: the failing check is the
demonstration, which is how every other fix in this project is made. A red
`check:tests-assert` from here on means a test has stopped testing.

## Why this is the same defect and not a different one

PJ-027's mechanism was that prose and code are checked by different acts, and
doing the first well produces the feeling of having done the second.

A test is prose and code at once. Its name is a claim; its body is the check on
that claim. **Writing the name is the act of understanding what needs proving.
Writing the assertion is the act of proving it.** The same gap opens in the same
way, and it opens wider here, because a passing test is read as evidence — the
green tick is the second copy of the claim, agreeing with the first.

That is the level at which a checker earns its keep. *"Would merge exactly the two
things this scenario exists to keep apart"* has no machine form and never will.
*"This function contains no assertion"* is decidable, needs no judgement, and
cannot be argued with.

## The runner-up, and why it is not one check

**A numeral in a comment adjacent to something countable. Seven instances, seven
wrong** — the highest-yield shape in the sweep:

| the comment says | the count is |
| --- | --- |
| "Eight scenarios have exercised the seam" | 24 |
| "13 node + 19 edge labels" | 13 and 25 |
| "rather than as 32 restated signatures" | 33 |
| "1,051 lines against the write side's 845" | 1,563 and 1,414 |
| "One regex, three call sites" | four, and none is the use the same sentence advertises |
| "in three states rather than two" | five |
| "this is where the next three builds land" | all three landed |

It is tempting to write one check for this and it would be a mistake. **Each has a
different denominator** — scenario files, an exported array's length, a
delegation count, `wc -l`, call sites, interface fields. A generic warning that
numbers in comments go stale would fire on every past-tense measurement in the
repository, and this project keeps those deliberately.

### Corrected the same day, on the way to fixing them

This entry first concluded that seven small assertions would beat one generic
check, because they would be *assertions* and PJ-027 says to prefer those. Fixing
the seven showed that half wrong, and the correction is the more useful sentence:

> **A numeral either earns an assertion, or it should be deleted, or it should be
> explicitly dated.**

Six of the seven were decoration on an argument that survives without them.
*"1,051 lines against the write side's 845"* argues that one half is larger; the
numbers add nothing to that and are a maintenance claim nobody agreed to keep.
Deleting a claim is not giving up on checking it — it is the stronger move,
because what remains is true and what left was never going to be maintained.

The seventh looked like the exception and is the instructive one. A test file
carried *"13 node + 19 edge labels"* next to `NODE_LABELS`/`EDGE_LABELS` — a real
denominator, an assertion for free. But the property that comment gestures at is
**already asserted** one line below, empirically, against the real graphid; and
that guard *tightens* as labels are added, where `expect(EDGE_LABELS.length)
.toBe(25)` would merely break. **An assertion that protects nothing an existing
assertion does not is a change-detector**, and adding one would have been
ceremony wearing the costume of rigour.

So: zero of seven earned an assertion, and all seven stopped being counts. That
is a better result than seven new checks, and it does not weaken this entry's
conclusion — it is the same conclusion applied one level up. The check that
survived, `check:tests-assert`, survived because it catches something nothing
else catches.

**The third branch came from an eighth instance.** CLAUDE.md's arc totals said
*"edge labels 19 → 24"* against 25 — in the paragraph introducing this entry.
It was not deleted, and the reason is a case the two-branch rule does not cover:
those figures come from PJ-024, which is a **review**, so they are a dated
measurement and a historical record is legitimate prose. What was wrong was the
framing — it read as current state. It now says *as they stood when it was
written*, names the live figure, and points at `NODE_LABELS.length` /
`EDGE_LABELS.length` as the only counts anyone should read as current.

So: earn an assertion, be deleted, or be explicitly dated. A number that is none
of the three is a maintenance claim nobody agreed to keep.

**And the defect fired during its own repair** — twice, in the edits making these
very fixes. Both are below, with the two that bracket them.

## Four times on 2026-08-21, by people holding the answer

This is the entry's real argument, and it is worth more than the seven counts.

*The heading is dated rather than counted, per this entry's own third branch. Four
is what 2026-08-21 produced; a fifth followed on the 22nd and is below. The number
will keep moving and the date will not.*

PJ-027 claimed its defect is not carelessness, and reasoned from three instances
whose authors were not thinking about it at the time. The obvious objection is
that attention would fix it. **Four instances in this one day answer that**, and
every one was committed by someone who had the defect in front of them.

1. **`918f420`.** The commit that closed a PJ-027 instance — making a report carry
   identity instead of a name — wrote a comment in the same hunk naming the *new*
   type as the former one, and left the docstring above the changed field still
   advising the reader to key on the name it had just stopped keying on. Two fresh
   instances in the lines being edited to remove one.

2. **"asserted below rather than written here."** A comment in the edit fixing the
   numeral defect, claiming an assertion that did not exist yet. Caught only by
   going to write the assertion the sentence promised, and finding it should not
   exist at all.

3. **A failure signature piped away.** A run producing five failures was piped
   through `tail -5`, discarding the only thing that could distinguish a teardown
   cascade from real assertion failures — **ten minutes after** the author had
   agreed, in writing, that this exact mistake was worth recording. The re-run came
   back clean and the signature is gone for good.

4. **A rule generalised from one observation, inside the correction for (3).**
   A test count seen once — in a run that was racing a second suite — was written
   into `docs/TASKS.md` as a detector. It was refuted within the hour by a run that
   flaked with a *normal* count, so the derivation held in the direction it was
   derived and failed in the direction a detector needs. The same paragraph
   hardcoded `261`: a numeral earning no assertion and carrying no date, three
   hours after this entry closed out the first eight of those.

A fifth followed, in the fix for the fourth's neighbour, and it is recorded here
only because its author's account of *how* is better than anything else in this
entry. The wrap hook's worktree bug was fixed in `wrap-hook.sh`; the identical
line stayed in `close-entry.sh` and `collect.sh`, and the commit message described
the fix as a property of the *skill*. Asked how it happened:

> **A passing check on the file I edited told me nothing about the two I didn't.**

That is this entry's defect stated as a property of **verification** rather than
of authorship, and it is the sharper form. The author did test the fix — ran the
hook, read the output, got the right answer, stopped. The test was real and it was
scoped to the half they were looking at, which is how a one-file fix becomes a
three-file claim. Nothing about carelessness explains that; the check passed.

Two authors, five instances, all under the best conditions anyone is going to get:
the defect named, catalogued, and freshly in mind. **"Be more careful" is not
available as a remedy**, because these are what being careful looks like. Each is
a small asymmetry — the type and not the sentence above it, the code and not the
comment promising it, the counts and not the diagnosis, the direction derived and
not its converse — and attention is precisely the thing that does not distribute
evenly across an asymmetry.

What does help is the shape PJ-027 already named: check the **other side** of the
operation you are looking at. Three of the four were caught that way, by someone
else or by the author going one step further. The fourth was caught by a
disagreeing measurement inside an hour, which is the only remedy with any
generality — and it is the argument for this entry's one checker rather than for
resolving to concentrate harder.

## A check that could not fail

One more, found in the same sweep and one level out from the tests.

`scripts/check-progress-to-stdout.sh` was a transplant from another project. It
cited a version, a source file and three CLI flags that have never existed here,
and greps `src/` for a pattern that has never occurred — then prints a tick. **A
check that cannot fail, wearing the costume of one that passed.**

That is this entry's shape at the next level up: a test that asserts nothing is a
claim with no check behind it; a check that cannot fail is a *suite* with no check
behind it, and it is worse, because it is counted as coverage. It has been
replaced by `check:stdout`, which guards something real now that stdout is the
MCP protocol channel.

The general form, which cost more than the script did and is now in CLAUDE.md:
**a rule that tells readers to ignore a signal removes the only watcher that
signal had.** The broken example script survived 221 commits behind exactly such
a rule. If a signal is unreliable, fix it or delete it — do not annotate it.

## What this does not change

PJ-027's conclusion stands, and this sweep is the evidence for it rather than
against it. Of the severe findings demonstrated here, all but the two
assertion-free tests needed a reader. The boundary is now measured instead of
asserted:

> Prose is not machine-checkable. A test that does not test is — and it is the
> same defect one level up.

Two further things the sweep settled that are worth keeping:

**The sample is still biased, differently.** PJ-027's three were found while
looking for something else. These were found while looking — but by six readers
told what shape to look for, which finds that shape and is silent about others.
A sweep is not a census.

**The self-instances are not irony.** They are the mechanism at the moment it is
easiest to observe: in `918f420` the author was looking at the type and the code,
and the sentence above them was somebody else's job. That is the same sentence one
would write about every one of them, and it is why PJ-027's §"What this licenses"
gives a direction to look rather than a resolution to try harder.

**And one more, in this paragraph's own edit.** Adding the fifth instance above
left the heading saying "four" and the text saying "five" — a numeral in prose
going stale inside the entry that closed out seven of them, in the act of
lengthening the list they belong to. Fixed by dating the heading rather than
correcting the number, which is this entry's own third branch applied to itself.
