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

Seven small assertions would not be noise. And they would be *assertions*, which
is what PJ-027 already concluded: where a prose guard can be a test, it should be.
The counts are the largest available supply of prose guards that can.

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

**The best single instance was in the fix.** `918f420` — the commit that closed a
PJ-027 instance by making a report carry identity instead of a name — wrote a
comment in the same hunk naming the *new* type as the former one, and left the
docstring above the changed field still advising the reader to key on the name it
had just stopped keying on. The commit that fixed the defect committed it twice
more, in the lines it was editing.

That is not irony. It is the mechanism, at the moment it is easiest to observe:
the author was looking at the type and the code, and the sentence above them was
somebody else's job.
