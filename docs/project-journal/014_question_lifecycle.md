# PJ-014: The question lifecycle — what closure and sharpening cost the model

**Status: implemented (2026-08-19), on `spike/drizzle-age`. Covers S-4
(`a58ea3d`, `c1f4cb1`) and S-1 (`c64b7eb`, `9d5944a`). Rows H and Q resolved,
row D resolved with one new endpoint pair, rows I and Z extended, rows Y and
AC added. Verification at the time of writing: 130 pass / 0 fail, typecheck
clean, `npx depcruise src tests --output-type err` 0 errors.**

## Context

PJ-011 left the control chain exercised and the *question* side untouched.
Every scenario to that point had opened exactly one line of enquiry per
question, never closed one, and never asked where a question came from. S-4
and S-1 are the two scenarios that put weight on it.

They belong together because they pull in opposite directions on the same
pair of nouns. S-4 asks what it means to **finish** with a question; S-1 asks
what it means to have one **before you know what the experiment is**. Between
them they turn `Question` and `LineOfEnquiry` from two labels that happened to
exist into two labels that do different jobs.

## 1. `Question` and `LineOfEnquiry` were collapsed by the service layer, not missing from the model

Row Q's original wording accused the model. That was wrong, and the
distinction matters for how the fix was found.

`openEnquiry()` created a `LineOfEnquiry` and nothing else. No `Question`
node, no `MOTIVATES` edge, anywhere in `src/domain/`. But `MOTIVATES` and
`RESOLVES` had existed in `EDGE_SCHEMA` since PJ-004 and were already tested
in the persistence layer. The graph could express the split perfectly well;
the service layer simply never used it.

What made it a defect rather than an untidiness: **closure attaches to the
question, not to the pursuit.** With no `Question` node to resolve, closing an
enquiry wrote a `Decision` that resolved nothing, and `enquiryStatus()` went
on reporting the enquiry open. State was written and the query contradicted
it — the wrong-answer bar, cleared by the first ladder rung.

## 2. Row H refuted: closure polarity is derived, not stored

PJ-008 predicted that `RESOLVES` carrying no outcome field would force one.
It didn't. A question answered "no" is answered by evidence that *challenges*
the proposition it was closed on, and that bearing is already an edge.

The subtlety S-4's review caught, and the reason `ConclusionRef` exists: an
analysis can support the proposition that answers one question while
challenging a secondary one. Deriving polarity from "does any cited finding
challenge anything" is too coarse and produced a wrong `"no"` on an analysis
that had answered `"yes"`. Closure therefore cites **one specific
conclusion** — `{ analysis, proposition }` — and polarity comes from that
finding's bearing alone.

Row H stays in the ledger as refuted rather than being deleted. A prediction
that fails is a result about the model, and this one says something useful:
the edges already carried the polarity, so a field would have been a second
place for it to disagree with itself.

## 3. Three states of knowledge, and why "untested" is not a weak "unresolved"

S-1's opening exchange asks what is already known, and requires three answers:
established, unresolved, **untested**. PJ-001's doctrine that absence of
evidence must not read as a negative result is the reason they cannot be two.

All three are derived structurally, and no text is compared anywhere:

| State | Structure |
| --- | --- |
| established | a `RESOLVES` decision citing evidence |
| unresolved | something `ADDRESSES` one of its enquiries, nothing resolved it |
| untested | nothing has ever addressed any of its enquiries |

Making *untested* a state of the record rather than a reader's invention is
what earned `pose()` — a question on the books with no pursuit at all. Without
it, "what has not been tested" could only be answered by manufacturing
questions nobody had asked, which is the failure PJ-011 §5 rules out.

Row Y records the boundary this leaves: a question closed *without* cited
evidence lands in `unresolved` if anything ever addressed it, and a deferred
one lands in `untested` if nothing did. S-1 poses neither, so it has no
standing to say where they belong. S-14 should decide it alongside row J.

## 4. Row D: the one model change, earned by a confidently wrong answer

Sharpening a vague hunch into a testable question records a `Decision` that
`NARROWS` the original. That much the model already had. What nothing
recorded was **what the act produced**.

The demonstration, not the argument: one hunch sharpened twice with a result
landing in between. `originOf(secondQuestion)` returned the knowledge that
existed before the *first* sharpening — populated, plausible, and belonging to
a different event. An empty result would have earned nothing; a back-dated one
is the model asserting something it cannot support.

`MOTIVATES` gained `Decision → Question`. The alternative — direct
`Question → Question` lineage — lost on capability rather than taste: it says
where a question came from but not what was known when it was asked, because
the reason and the frozen evidence set live on the decision. PJ-011's
record-both-pick-neither rule needs two models that fit *equally*; these did
not.

## 5. The temporal seam took real pressure and held

S-1's hardest Afterward question is *what was the state of knowledge at the
moment this question was sharpened* — asked deliberately **after** later
evidence has arrived, so that a naive "everything standing now" answer would
be visibly wrong.

It is answered from durable state, with a second reader open beside it whose
event log is asserted empty. `sharpen()` freezes the standing findings onto
the decision when the act is recorded, so the answer cannot drift.

What that does **not** reach is the level above: whether a given question was
*established* at that moment needs an ordering between two `Decision`s, and
there is none. Natural ids happen to be allocated in order, which is an
accident of the sequence and not a modelled fact — CLAUDE.md already forbids
reading meaning into their values. Row Z records this as a real gap, narrowed
rather than closed, and S-7 narrowed it further still (see PJ-015 §4).

The consequence worth stating plainly: **the two scenarios PJ-009 named as the
first consumers of a durable event store both refuted the need.** That is
recorded in `src/domain/events.ts` rather than left as an assumption nobody
rechecked.

## 6. Identity is the handle, never the wording

S-1 probes this from both sides, and both had to hold:

- two pursuits of one question, worded similarly, stay **one** question;
- two questions worded identically stay **two**.

Neither is achievable by comparing strings, and the second is only expressible
because `pose()` returns a handle. This is the first appearance in the corpus
of what later became the arc's dominant defect class — see PJ-015 §1.

## 7. What the follow-up reviews caught

Both scenarios shipped a `fix(...)` commit after the `feat(...)` one, and
neither was a tidy-up:

- `closeEnquiry()` accepted an analysis from a **different enquiry** and cited
  its findings as the basis for resolving this question. Now everything is
  validated before anything is written, with two negative tests asserting the
  enquiry is untouched after a rejection.
- Activating `CHALLENGES` exposed three SUPPORTS-only assumptions elsewhere.
  The worst: `conclusionsOf()` returned *no conclusions at all* for an analysis
  whose findings all challenged, so replacing it reported nothing as affected.
- `sharpen()` validated its input but nothing asserted it. The test that now
  pins it asserts on the **guard's own message**, because failing later — at
  the narrowing edge — would also throw, with a decision already on the record.

## Judgment calls

- **`openEnquiry` is sugar, and records one event.** It composes `pose` and
  `pursue`; making it emit three events would describe the implementation
  rather than the researcher's action. The rule is now in CLAUDE.md.
- **Question identity is not deduplicated.** Two people can ask the same thing
  for different reasons and only the asker knows whether they meant one. Row N
  and S-5 later showed the same principle applies to claims.
- **No `Question → Question` edge, then or now.** Row D is resolved by the
  decision that produced the question, and PJ-015 §2 records why the remedy
  did *not* generalise when the same shape appeared again.
