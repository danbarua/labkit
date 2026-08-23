# 014: The read models are value objects

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record — the
diagnosis and the plan are `docs/project-journal/030_which_record_is_this_about.md`
§3–§5.

## Goal

Answer Dan's question — *is the domain API presenting entities as value
objects?* — then audit which reads drop identifiers and draft the fix.

## Changed

One commit, `34e8a29`. No production code.

- `docs/project-journal/030_which_record_is_this_about.md` (+119) — §3 the
  diagnosis, §4 the audit, §5 the plan. Existing sections renumbered.
- `tests/subject-identity.test.ts` (+128) — five tests asserting the defect.
- `docs/TASKS.md` — one "Ready to build" item pointing at the plan.

## Verified

- **`bun test` 299 pass, 0 fail, 39 files, 101.8s**, at load average **6.65**.
  typecheck, depcruise, `check:doc-comments`, `check:tests-assert` green.

**A failing run first, and it was the documented flake.** 18 failures, every one
a timeout, every one in `s11_invalidate_analysis.test.ts`, wall clock 358s.
That file passes **alone in 3.4s**, and the clean full run was faster at
*higher* load. It also reported `Ran 300` against 299 clean, with one unnamed
failure — the double-count tell `docs/TASKS.md` describes, where a body that
keeps running after the ceiling stops waiting is counted twice. Checked rather
than assumed, because a cascade and a regression print the same summary line.

**The audit was measured, not read off 1,600 lines of `read.ts`.** A scenario
exercising every verb, then every string leaf of every report classified as an
id or as prose. That is what produced §4's table; reading the source would have
produced an argument.

## Open

- **Ten fields carry wording where an identity exists.** `whatDependsOn` is the
  clearest — it exists to say *what would be affected if this were wrong* and
  answers with prose no follow-up verb accepts.
- **The plan is unstarted past step 1.** `DependencyReport` first (its answer is
  unusable without ids), `EnquiryStatus` second (it is the one shipping a wrong
  answer). No graph change: every id is already in the query that builds the
  report.
- **`tests/subject-identity.test.ts` §4 is red-to-green in reverse** — a row
  fails when its report is fixed, and is then deleted. Said in the file, because
  a failing row there will otherwise read as a regression.
- Multi-pursuit closure is **still undecided**, and PJ-030 §5 step 4 argues it
  may answer itself: once `EnquiryStatus` carries a `QuestionRef`, whether the
  second fact wants its own verb becomes a question about convenience rather
  than expressibility.

## Next

PJ-030 §5 step 2 — carry the reference beside the wording in
`DependencyReport`, then `EnquiryStatus`. Additive, so no caller breaks.

**One thing worth not repeating.** The first version of this session's template
test was a garbled expression that passed through a `catch` — a test that tested
nothing, written into the file that argues for honest checks, in the same hour
as arguing for them. `bun run check:tests-assert` does not catch that shape: it
finds tests with no assertions, and this one had assertions that could not fail.
