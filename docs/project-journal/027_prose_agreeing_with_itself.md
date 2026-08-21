# 027 — Prose agreeing with itself is not evidence the code agrees with it

**2026-08-21, after row F's verdict.** Three unrelated places were found holding
a rule in a comment and code that does not follow it. Three is a pattern, and
this project keeps its reasoning in prose, which is exactly what makes the
pattern dangerous here rather than merely untidy.

## The three

**`reproducibilityOf()` argued for reference-keying and then reported names.**
S-9 offered parts by reference on the way in, with a comment saying a name-keyed
map "would merge exactly the two things this scenario exists to keep apart" — and
returned bare `logical_name` on the way out. With an original and its
regeneration under one name, that put a single string in `exact` **and**
`differing` at once (S-9c). The guard was written down, argued for, and applied
to one direction only.

**`wrap-hook.sh` called a branch unreachable insurance, and a fork reaches it.**
The comment stated that the compact/resume branch existed against a build that
behaves differently, that the premise had been *tested*, and that the branch is
never entered. True for compaction, where it was tested. Never tested for forks,
which re-issue the session id — demonstrated when this session forked and its
state file was absent.

**S-10's own test named the defect and asserted it as correct.** The comment
reads *"Identical names, two artefacts, two differences"* — and the assertion
below compared the two entries by their identical names, which cannot tell them
apart. The situation was described accurately and the wrong behaviour locked in,
in the same test, eleven scenarios before anyone noticed (S-10c).

## What they share, and why it is not carelessness

Each author knew the rule. In two of the three they wrote it down *well* — the
`reproducibilityOf()` comment is the clearest statement of identity-is-never-
wording anywhere in this repository, and it sits directly above code that
violates it.

The mechanism is that **prose and code are checked by different acts**. Writing
the comment is the act of understanding the rule; writing the code is the act of
applying it. Doing the first well produces the feeling of having done the second,
and nothing in a review catches the gap, because a reviewer reading the comment
and then the code reads *agreement* — the comment tells them what the code means,
and they see what they were told.

This is the same shape as PJ-025's fired conditions and PJ-026's editorialising
predictions, one level down. PJ-025: a condition written where nobody re-reads it
is not a mechanism. PJ-026: a predictions document that ranks its outcomes has
leant on the scale it exists to hold level. **Here: a rule stated beside code is
not a rule the code follows.** All three are cases of a document doing the work
of a check.

## What this licenses

**Not a checker.** These are narrative claims — *"would merge exactly the two
things this scenario exists to keep apart"* has no machine form, and a script
adjudicating it would be wrong more often than the comments are. That is the same
argument that keeps `check:ledger` to one rule.

**A habit, at one moment.** When a comment states a rule, the next act is to
check the code on the *other side* of the operation it describes. All three
instances were asymmetries: input guarded and output not, one trigger tested and
another not, the case described and the assertion not. **The rule was applied
where the author was looking.**

**And a test-shaped preference where one exists.** S-10c asserts the enumeration
behind row F's verdict — *a name is never enough, and a reference always is* —
rather than writing it in a comment, precisely because the finding that produced
it was a comment nobody had checked. Where a prose guard can be an assertion, it
should be.

## What is not claimed

Three instances is a pattern, not a proof, and the sample is biased: all three
were found while looking for something else, so this says nothing about how many
went unfound. Nor is the remedy "write fewer comments" — the comments are what
made two of these findable at all. The defect is the gap, not the prose.

## Cost

Row F spent five scenarios open because three of its four bites were this shape:
the model was never missing identity, and the reads were not using it. Had the
`reproducibilityOf()` comment been checked against the return type when it was
written, S-9c, S-9d and S-10c would have been one fix rather than four
scenarios — and row F would have reached `boundary` considerably earlier.
