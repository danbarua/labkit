# 014: The read models are value objects — diagnosis, plan, first two fixes

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record — the
diagnosis and the plan are `docs/project-journal/030_which_record_is_this_about.md`
§3–§5.

## Goal

Answer Dan's question — *is the domain API presenting entities as value
objects?* — audit which reads drop identifiers, draft the fix, then start it.

## Changed

Two commits plus this entry.

**`34e8a29` — the diagnosis, audit and plan.** No production code.

- `docs/project-journal/030_which_record_is_this_about.md` (+119) — §3 the
  diagnosis, §4 the audit, §5 the plan. Existing sections renumbered.
- `tests/subject-identity.test.ts` (+128) — five tests asserting the defect.
- `docs/TASKS.md` — one "Ready to build" item pointing at the plan.

**`1865b29` — §5 step 2 for the first two reports.**

- `DependencyReport.claims` / `.enquiries` — bare `string[]` of propositions and
  enquiry names become `{claim, asserts}` and `{enquiry, pursuing}`.
- `EnquiryStatus.question` — the question's **id**, with `asks` beside it, and
  `null` where no question stands behind the enquiry.
- `src/cli.ts`, `src/mcp/schemas.ts`, `docs/mcp-tools.md`, nine scenario files
  and the demonstration updated with them.

**A defect nobody had noticed, fixed on the way:** `whatDependsOn` deduplicated
claims with a `Set` of **names**, so two claims asserting the same sentence in
different lines of enquiry merged into one. S-5 says those are two claims. Now
deduplicated by id.

## Verified

- After `34e8a29`: **299 pass, 0 fail, 101.8s** at load **6.65**.
- After `1865b29`: **299 pass, 0 fail, 132.2s** at load **7.55**. All five gates
  green.

`check:doc-comments` caught a real one: the new interfaces were inserted between
`DependencyReport`'s doc block and its declaration.

**Two failing runs, both the documented flake, both checked rather than
assumed.** 18 failures then 16, every one a timeout, every one in
`s11_invalidate_analysis.test.ts`, wall clock 358s and 320s. That file runs
**alone in 3.33s — against 3.41s before this change**, which is the measurement
that rules the change out as the cause. Both clean full runs were faster at
*higher* load. It also reported `Ran 300` against 299 clean, with one unnamed
failure — the double-count tell `docs/TASKS.md` describes, where a body that
keeps running after the ceiling stops waiting is counted twice. Checked rather
than assumed, because a cascade and a regression print the same summary line.

**The audit was measured, not read off 1,600 lines of `read.ts`.** A scenario
exercising every verb, then every string leaf of every report classified as an
id or as prose. That is what produced §4's table; reading the source would have
produced an argument.

**The plan was wrong and doing it corrected it.** §5 step 2 said *"additive: no
caller breaks."* Where the wording lives in a bare `string[]` or a bare
`string`, there is nowhere to add a reference beside it — both fixes were shape
changes. And the two behaved oppositely:

- `DependencyReport` — `tsc` named **every** call site.
- `EnquiryStatus.question` — `tsc` named **none**. The field changed meaning
  from wording to identity and both are `string`, so `src/cli.ts` would have
  silently printed `Q_1` where the question text used to be. Found by grepping
  readers.

**A field that changes meaning without changing type is the dangerous half of
this plan**, and most of §4's remaining rows are that shape. PJ-030 §5 now says
so, struck through rather than quietly rewritten.

## Open

- **Ten fields carry wording where an identity exists.** `whatDependsOn` is the
  clearest — it exists to say *what would be affected if this were wrong* and
  answers with prose no follow-up verb accepts.
- **Eight of the ten rows in §4 remain**, and they are mostly the dangerous
  shape above: `EnquiryStatus.evidence[]`, `SupportExplanation.support[].via`
  and its siblings, `GateStatus.gating[]`, `evaluations[].basis[]`, both
  `unmet[]`. Grep the readers; `tsc` will not help.
- **The multi-pursuit wrong answer is half fixed**, which is what §5 step 4
  predicted. Bruno can now reach the question by id; `enquiryStatus` still
  answers about the question under his enquiry's name. The test says that rather
  than claiming a fix.
- **Paired-world scenario tests break when ids enter a report.** Natural ids are
  global sequences, so two worlds legitimately draw different ones — `s9b`
  already normalised ids for one field and now does for another. Not a defect on
  either side; the technique has to compare modulo identity, and any future row
  of §4 will hit this again.
- **`tests/subject-identity.test.ts` §4 is red-to-green in reverse** — a row
  fails when its report is fixed, and is then deleted. Said in the file, because
  a failing row there will otherwise read as a regression.
- Multi-pursuit closure is **still undecided**, and PJ-030 §5 step 4 argues it
  may answer itself: once `EnquiryStatus` carries a `QuestionRef`, whether the
  second fact wants its own verb becomes a question about convenience rather
  than expressibility.

## Next

Continue §5 step 2 through the remaining rows of §4, then step 4 — re-ask the
multi-pursuit question now that `EnquiryStatus` can refer to its question.

**One thing worth not repeating.** The first version of this session's template
test was a garbled expression that passed through a `catch` — a test that tested
nothing, written into the file that argues for honest checks, in the same hour
as arguing for them. `bun run check:tests-assert` does not catch that shape: it
finds tests with no assertions, and this one had assertions that could not fail.
