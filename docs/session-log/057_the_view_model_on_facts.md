# 057: the view model, composed from named facts

**Session wrap, 2026-08-27, on `feat/view-model-facts`.** Not a decision record
— `src/domain/facts.ts`'s header carries the argument, and PR #72 carries the
evidence.

**057, not 055 or an update to 056.** 055 is on `feat/survey-consults-checks`,
open as draft PR #69 and superseded by this branch, so its number stays claimed
until Dan closes it. 056 is the spike, merged in PR #71; this is the
implementation, which is a different unit of work and gets its own entry rather
than growing that one.

## Goal

Dan, after merging the spike: re-implement the view model on the query builder,
off `main`, and see how far it gets. *"I bet you can ship it."*

## Changed

Four commits carried from PR #69 — S-19's scenario and prose, the glossary, the
five-bucket example — then two of this session's:

**`5413688`** — `src/domain/facts.ts` (machinery) and `src/domain/survey-facts.ts`
(the facts); `whatIsKnown` composed from them.
**`26bbfe6`** — `whySupported` selects by handle, and `checksMetFor` is deleted.

**`13c9551`** — `gateStatus` and the standard read one check fact; `checksFrom`
deleted, and the gate-scoped/criterion-scoped distinction becomes an argument
rather than a paragraph.
**`5faa307`** — the historical survey shares the selection.
**`c85ea7c`**, **`1dcc42d`** — three more one-sided traversals in
`whySupported`, and a refutation worth more than the fixes.
**`73714bf`** — the bearing becomes a parameter, closing the mirror-image
defect `labkit-review` found by reading.
**`94b364a`** — the bearing sweep checked mechanically and closed; one
confusable helper renamed.
**`b0c45f0`** — the prose catches up: CLAUDE.md gains a section on the fact
graph, S-19 gains its fourth case, and ledger row **AL** gains a glossary
entry.
**`dd34e40`** — the last fact holding two names for one subject takes the
bearing too.
**`ffc598b`** — `check:facts` enforces two of the three fact rules; the
glossary gains the severity test and the mutation-coverage numbers.

## Verified

`bun run check` — all 18, at both commits. 175 scenarios green throughout.

**Both of `labkit-review`'s findings on PR #69 are closed**, and the first with
no code aimed at it:

| | before | after |
| --- | --- | --- |
| promoted **negative** result, check never run | `established` | `provisional` |
| `whySupported(A)` with a same-wording claim B | sees B's checks | sees only A's |

**The second was verified reachable before being fixed.** `labkit-review` said
plainly they had established it from the code and had not run it; two analyses
in one enquiry concluding the same sentence do produce two `Claim` nodes, and
the two verbs did contradict each other.

## Open

**Naming a fact fixed a defect nothing in the commit targeted, which is the
whole argument in one case.** AGE has no edge alternation, so reaching a claim
needs a `SUPPORTS` clause and a `CHALLENGES` clause; omitting the second is
**silent** — the row is absent and the reader concludes nothing is wrong.
Written once as `answeringClaim`, the hole closed for every reader at once.

The same constraint had already defeated the author of the fix: the spike
re-introduced the identical blindness twenty minutes later, in a file written to
demonstrate the problem.

**Two machinery bugs, both found by running rather than reading.** `compose`
silently omitted a clause whose variable another clause referenced — no error,
a column never returned, a fact folding to `null` for every subject; a leaf can
now declare the clauses it reads. And `empty: new Set()` was one shared mutable
instance, so one subject's rows leaked into the next subject's answer:
invisible with one subject, wrong with two.

**`checksMetFor` was found dead by biome**, not by me. It was the imperative
helper PR #69 added, and the facts subsumed it entirely — the cleanest available
confirmation that the fact version does the same job rather than a parallel one.

**The selection question was decided here, and `labkit-review` had said it
should not be decided by a PR about something else.** This one is about exactly
that, and the evidence is that all 175 scenarios pass unchanged — nothing in the
corpus depended on wording-based selection. That is weaker than a scenario
proving handle-selection *right*, and it is what there is.

**An existential type is encoded as `any`.** `Fact` is contravariant in its
result, so a heterogeneous list needs *some* `T`, which TypeScript cannot spell.
Confined to one alias with the reason on it.

**Six instances of one defect, four of them found here rather than in review.**
Sweeping for the pattern — a hand-written anchor naming one bearing — turned up
the survey's checks, `whySupported`'s standard, its promotion (a promoted claim
reading `exploratory`), its `restingOn` (empty), the spike, and the historical
survey. All the same cause: AGE has no edge alternation, so naming one edge is
**silent**. The third instance was in an anchor written *after* the fact existed,
in the commit that fixed the second — which is why `checksAnchor` is a function
now and not a template a caller fills in.

**The promotion query needed no traversal at all.** A promotion is an edge on
the claim; reaching it through evidence was the footgun, and deleting the walk
removed it rather than handling it.

**The most valuable result is a refutation.** Everything in `whySupported` now
selects by handle, so unifying findings and `restingOn` the same way looked
obviously right. Both are wrong: findings by handle turns **13 scenarios red**,
S-10's *"the re-run reads as independent confirmation"* among them, and
`restingOn` by handle empties it for a two-stage pipeline in
`tests/subject-identity.test.ts`.

So the two selections differ **on purpose**, which neither `labkit-review` nor I
had stated: a re-run concluding the same sentence **corroborates**, so findings
aggregate over the proposition — but a prespecified check **belongs to** the
analysis held to it. Same nodes, two questions, two answers. Both exceptions are
documented where the query is, with what refuted them.

**`labkit-review` found the mirror image of the defect being fixed, and found
it by reading.** A promoted negative result whose prespecified check *ran and
passed* could never reach `established`. `checksOf` collected criteria from both
bearings into `crit` and `crit2`; the **grain** read `crit`. Two places knew
there were two paths and one was updated.

Their four-cell probe reproduced here cell for cell before anything was
touched, including that `challenges + never-run` was passing **accidentally** —
a dropped row and an unmet check land in the same bucket, so the new scenario
had a right conclusion sitting on wrong reasoning. That is PJ-029's shape, and
the case that could have been positive and was not is `challenges + passed`. It
is now a test, with a negative control: restricted to `SUPPORTS`, it goes red.

**The one-liner was declined.** `crit ?? crit2` fixes the instance and leaves
the class — two places would still know. The bearing is a parameter now, one
query per bearing merged by the caller, so downstream there is one `answering`
and one `crit` and the second name does not exist to be forgotten.

**`WITH coalesce(…)` was measured before choosing, and it works on AGE** —
`UNION` too. It was rejected anyway: `WITH` collapses the query, so every later
clause would have to be projected forward by hand. The constraint is
composition's, not AGE's, and it is written down so nobody reaches for it
expecting a shortcut.

**That is six occurrences of one defect, four of them mine, two written after
the fix for the previous one.** The strongest evidence for the approach and the
least flattering way to make the case.

**And the reviewer's method is the result worth keeping.** They predicted the
bug from four lines — the grain definitions — and only then ran a probe. Dan's
observation on it: *"you were able to construct solid predictions from reading
the code without running it… because the code tells you how it is."* That
prediction was unavailable while the fact lived in whichever loop you were
inside; it became available because this change gave it a name.

**The defect class is closed on the read side, checked mechanically rather
than by eye.** Every query reaching a claim through a bearing edge names both
or takes the bearing as a parameter. Two remain one-sided and both are
deliberate with the reason already written where they are: `enquiryStatus`
fetches only the challenging side because polarity is *no* when something
challenges and *yes* otherwise, and `reproductionOf` asks *whether* evidence
challenges, which is single-bearing by construction.

**`labkit-review` proposed a third answer to Dan's open question, better than
either option he offered: compose facts with more than one reader.** Not "every
query" and not "carries a classification". The defect is *written once and
forgotten the second time*, which requires a second time — a single-reader query
cannot have it, whatever it computes. Carrying a classification is a proxy; what
predicts the bug is **a rule that must agree with another reader**, and all six
occurrences were that.

Measured rather than accepted: 33 queries remain, 13 edges have more than one
reading verb, and only about six traversals reach *the same answer about the
same subject*. Edge-sharing badly overstates it — six verbs walk `PRODUCES` for
six different purposes. `DEFERS` has three readers and they agree, which is the
shape that drifts rather than one that has.

**They also withdrew half of their #69 finding**, publicly on the PR rather than
by editing it, on the grounds that the reasoning is worth more than the
conclusion. Their proposal would have collapsed the very distinction S-10 needs,
and what settled it was running it rather than accepting a plausible argument
from someone who had just been right about something adjacent.

**The write side stays raw Cypher**, on Dan's reasoning that it is the reference
documentation for *why* the graph is shaped as it is.

## Next

**PR #72 is not ready for review**, by Dan's own bar: it ships when the whole
read side is ported or explicitly invalidated. Four verbs are ported and the
rest are surveyed.

**Three parties reproduced the same four-cell table from the same code** — Dan,
`labkit-review` and this session, independently. That is the property the change
was arguing for, demonstrated on the change itself.

**The residual Dan spotted was safe for a bad reason.** `standingAsOf` still
held `supported`/`challenged` in one clause, with a fold reading both. Correct,
and *the exact shape that failed*: `checksOf` held two names and its **grain**
read one. This one survived because its consumer was the fold in the same
object rather than a separate function — safe by **proximity, not by
construction**, and the next fact written beside it would inherit a pattern one
refactor from wrong. Parameterised, so no code in the file holds two names for
one subject.

**A second, independent argument for the line arrived from `exo-ledger` via
`labkit-review`, and was measured here rather than accepted.** Mine was
correctness — spell it once and readers cannot disagree. Theirs is testability:
spell it once and **one mutation exercises every reader**.

| mutation | readers that go red |
| --- | --- |
| `checkState` loses the retraction rule | 4, spanning findings-qualifying *and* work-gating |
| only the `SUPPORTS` bearing is ever walked | 3, across S-18b and S-19 |

The second row is the one that matters: **the defect class that took six
separate discoveries is now reachable by mutating two lines.** Spelled
per-query, there was no single place to point a mutation at.

It sharpens the line rather than widening it — mutation coverage only
multiplies where a fact has more than one reader, so a single-reader query costs
one mutation either way, and the recommendation is unchanged with two
justifications instead of one.

**`labkit-review` mutated S-19's new case expecting to find it vacuous, and
reported that it was not.** `checksMet` is `every(... === "passed")`, and `every`
over an empty set is true — so a dropped challenges arm might have passed
silently. It does not: `checksMet` is itself per-bearing and merged, so a branch
that loses its checks fails to contribute rather than passing. Reproduced here.
Worth recording because they expected the opposite and published the negative
result, and because what saved it was the design rather than the test.

**A sharper severity test than the one in use here**, also from `exo-ledger`:

> A query that returns **too little** makes someone look again. A query that
> re-asks a **settled question** makes someone act.

Better than empty-versus-wrong for deciding where to spend attention. Ours was
the second kind: `established` is not a smaller answer than `provisional`, it is
a prompt to build on something. Not yet written anywhere durable.

**Two of the three fact rules are now a check, and the reason they can be is
the reason they were needed: the type system cannot carry either.** An inline
grain and an undeclared clause dependency are both well-typed; both were live
defects during this port; neither errored at the time.

The third is **not** checked and says so — `empty` returning a shared object
rather than a fresh one satisfies `() => T` either way, and telling them apart
needs to know whether the value escapes. Better admitted than half-checked.

**Two things went wrong writing it, and the second is the one worth keeping.**

The check was first **red for the wrong reason**: `answering` is bound by two
facts since `standingAsOf` was parameterised, and the map held one. It resolves
`needs` by *declaration* rather than by fact name, because a parameterised
factory yields one name for several bearings.

Then the **control for the second rule was a false green.** The substitution
never matched, so nothing was mutated and the check reported OK on a mutation
that did not exist. Caught by asserting the mutation applied before running.
That is this repo's own *a check that cannot fail is not a check* arriving in
the **control** rather than in the check — a place it had not been seen before,
and the reason to assert that a negative control actually changed something.

**PR #72 is ready.** Dan accepted the more-than-one-reader line — his words
for it were better than mine: *"can't find a way to shrink one line of code into
less than one line."* `pursuitsOf` is `MATCH → RETURN ids`, and facts pay where
a rule is duplicated, not where it is not.

Verified at the end: up to date with `main`, `bun run check` 18/18, 176
scenarios, 17 commits, `read.ts` 162 lines lighter net while gaining
correctness.

**One idea of Dan's deferred with a reason rather than declined**: a
`queryBuilder.add("raw clause")` escape hatch, so every read goes through one
machinery and raw clauses visibly flag themselves. Today the raw form already
announces itself — a different function, a template literal, hand-written
decoders. It earns its place when the machinery grows something *every* read
should get: tracing, a row-count guard, a tenant assertion. That reason does not
exist yet.

**The sentence that wanted a durable home has one.** *Findings aggregate over a
proposition; a prespecified check belongs to the one analysis held to it* is
ledger row **AL** and a glossary entry, not a doc comment on one query.

**The prose was imported from #69 and adapted rather than copied**, which is the
part that took judgement. Three things changed on the way:

- **CLAUDE.md gained a section it did not have.** `src/domain/facts.ts` is a new
  architectural module and the architecture document did not mention it — the
  gap was invisible because nothing checks for it.
- **S-19's prose gained a fourth case and an admission.** The first three tests
  were passing partly by luck: a dropped criterion reads as *no checks*, which
  is vacuously met, so the never-run case landed in the right bucket for the
  wrong reason. PJ-029's shape inside the scenario written to demonstrate the
  fix.
- **`WITH coalesce(…)` is recorded as a limit of composition, not of AGE.** It
  parses, which is exactly why someone will reach for it; every clause appended
  after it would have to be projected forward by hand.

**Left alone deliberately:** the session logs and PJ-008's S-3c predictions
still name `checksFrom`, which no longer exists. They are dated records and say
what was true when written; correcting them is what the exemption exists to
prevent.

---

## Afterward, 2026-08-28

The session continued past the entry above. The baseline range is **wider than
this session** — it contains commits belonging to entries 048 through 058, which
this entry does not restate; the shas below are this session's own.

### The design document caught up

**`8585656`** — `docs/digest-design.md` said *"Nothing is built"*, which was true
when written and false by the next morning: §2 shipped in PR #72 and half of §3
in #61. The document was asserting the opposite of the record.

Not a dated record — it sits outside the three exempt directories — so it is
live prose that has to stay true. Status now lives in one header table and
points at **#55** and **#66**, rather than in sentences that go stale again.

**The transcripts are kept exactly as they were**, several of them showing
behaviour since fixed. Editing them would delete the evidence and leave the
conclusion, and the evidence *is* the argument.

Three outcomes recorded against the arguments that produced them, which is the
part worth having:

- **§9's open question was answered the way it asked to be** — by the scenario
  landing somewhere rather than by argument. Both candidate words failed on
  inspection: `contested` is taken by evidence bearing *against*, `unverified`
  fits never-run but not failed.
- **§8 step 2's prediction was wrong, and usefully so.** §3's enumeration did
  not fall out of §2's fix: `checksMet` is keyed by claim and answers one
  boolean, so it cannot be asked *which gates are blocked* — there is no claim
  to start from. The traversal exists and is the **wrong shape**, which narrows
  #66 more than a silent success would have.
- **§2 had a mirror image the document never predicted**: a promoted negative
  result, unreachable in six places.

Re-checked against `main` rather than remembered: two call sites consult
held-to checks, **zero** read verbs take a `CriterionRef`, `UnmetCheck.blocks`
exists, `known` prints handles.


### #70 and #50: the guard comments were never a population

No commits — the deliverable is a measurement posted to both issues.

#50 counts *28 comments matching the present-tense guard shape*; `labkit-review`
said 30 and a recount said 29, which is what earned #70. The five verbs #50
itself names give **12** today, and no filter setting reaches 28-30: dropping the
comment filter entirely and going case-insensitive so identifiers count gives 25
today and 26 at `9527ad8`, the commit where the 28 was written.

So the three counts were not drift. **There was never a defined population**,
only three regexes nobody wrote down. The exact grep is now in #50, so the next
count is a command.

Of the 12, **none** claims a live mechanism: four are explicit negatives, three
are the `ensure*` function-name prefix, four name a purpose, one is already past
tense. The one demonstrated instance — `check-orm-unwrapped`'s comment — was
fixed when found.

**Why the check #70 favours cannot work.** The comments that do claim mechanisms
use `refuses` / `protects` (44 comments), which is this repo's *domain*
vocabulary — `ref()` refuses a mismatch, `claimsAsserting` refuses to pick, a
gate protects work. A tense check cannot separate the vocabulary from the claim,
so it would need an exclusion list, which the pinned header treats as evidence
the check is wrong. Recommended `not-doing`; the close is the owner's.

Two sampled by #50's own discriminator rather than by reading. Deleting
`"0003_tense_hawkeye": m0003,` from `EMBEDDED` (mutation confirmed with
`git diff --stat`, not assumed) gave exit 1 and three failures each naming the
tag. `ref()`'s claim has `tests/subject-identity.test.ts:633`. Both true, both
already backed by a test named after the guard.

### #66 answered by reachability, and a claim of mine corrected

No commits; the answer is on the issue.

**I had reported that no read verb produces a `GateRef`. That is false**, and
`labkit-review` caught it by driving the CLI cold rather than reading types:
`whySupported(claim)` returns `SupportExplanation.unmet`, and each `UnmetCheck`
carries the criterion, `blocks: BlockedWork[]` with its `gate`, and `gating`
with the work. My error was checking which top-level report interfaces name a
`GateRef` and stopping — `BlockedWork` was in my own list and I never asked what
contains it.

The reachability that replaces it, counted from the verb signatures: of **13**
handle kinds, question / claim / observations / enquiry are reachable cold;
criterion, gate and work are reachable **only through a claim**; and five —
evaluation, review, evidence, unit, decision — are consumed by no verb at all.

That answers Dan's *"for every verb, `Noun(plural)`?"* with **no**: eleven of
thirteen already have an entry point or hang off one, and five have nowhere to
pass a handle back to. A uniform surface ships ~11 verbs with no caller, which
is the written-and-never-read shape the repo refuses for edges.

**And it sharpens the case for the two verbs rather than weakening it.** The
gate route runs through a claim, so it works only once something has been
analysed — and a standup is mostly about work that has not. `labkit-review`
demonstrated it: a gate and task with no analysis behind them are invisible to
every cold entry point except `happened`, the event log, which CLAUDE.md forbids
for "what is true now". `workList` is separately owed because `planWork` mints a
`WorkRef` with no gate.

**One of their notes did not reproduce.** `bun run dev` in `$( )` was reported
broken by bun's `$ bun run …` banner. Measured on bun 1.3.14: the banner is on
**stderr**, substitution captures the report only. No `--silent`, no CLAUDE.md
line owed.

### `4727bac` — the references to a deleted work queue

Eight, not the three first spotted. `README.md` told a reader present-tense that
the work queue is a file the repository does not contain.

**`src/domain/report.ts` was worse than a broken link.** It called the `ART_`
prefix's inability to distinguish a raw input from an analysis output *"an open
item"* — which stopped being true on 2026-08-24, when PJ-008's **row AG**
measured it and recorded reference-model debt rather than a gap. A comment
asserting a question that has since been answered is a wrong answer with nothing
watching it.

The other six cited the queue for content the sentence already carried — a count
of documents, a quoted prediction, a named trap. Dropping the citation lost
nothing, which is the test for whether the pointer was load-bearing.
`CLAUDE.md`'s mention stays: past tense, and it records the replacement.

`bun run check` — **19/19**. PR **#74**.

### `24379f9` — culling merged branches found an orphaned entry

Fourteen stale remote branches deleted, leaving `main` and the recovery branch.
Six were `docs/*` and eight `feat/`/`fix/`; `git merge-base --is-ancestor` called
all fourteen **unmerged**, and that reading was wrong for every one — a squash
merge takes the branch as it stood and leaves no ancestry, which is the same
blind spot `.githooks/pre-push` exists for.

`docs/digest-status` is the one worth naming: it had **no PR at all**, having
been merged by hand, so the hook would not have protected it either. Its content
was verified by comparing files rather than subjects — `docs/digest-design.md`
byte-identical to `main`'s.

**The find: `main`'s session log had a gap at 054 → 056.** Entry **055** was
written on `feat/survey-consults-checks`, which closed unmerged as PR #69 once
#72 superseded its work. Every other file on that branch reached `main` by
another route — the S-19 scenario, `read.ts`, `report.ts`, the glossary, the
ledger — and the wrap entry did not. Deleting the branch would have taken the
only copy, **silently**; the gap in the numbering is the only thing that showed
it. Third time a squash has eaten a session-log entry, after the two #40
restored.

Restored verbatim on PR **#75**, `checksMetFor` account included. A session log
is a dated record and says what was true on 2026-08-27.

**Checked rather than assumed before deleting the two closed-unmerged
branches.** #34's work is genuinely superseded by #35, and `main`'s entry 046
says so itself — it names PR #34 as *"to be closed unmerged"* and explains it
merged the two write-ups rather than describing one surface twice. The README
defect is gone: `main` wires `"command": "labkit"` with `LABKIT_HOME` and has no
`--cwd`.

One correction to the record: #69's prose was imported into **#72**, not #74.
