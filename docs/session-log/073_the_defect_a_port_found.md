# 073: the defect a port found, and the one it did not

**Session wrap, 2026-08-29, on `test/survey-after-reinterpretation`.** Not a
decision record — `tests/survey-after-reinterpretation.test.ts` carries the
argument, and PR #116 carries what was and was not concluded.

A new entry rather than more of 071: that entry's goal was making the mockup's
scenarios composable. This is an investigation of somebody else's findings.

## Goal

#114 — the Rust/Grafeo port — found two ordering defects and argued the shape is
transport-independent:

> Neither is a Grafeo problem and neither would be a Cypher problem — it is what
> happens when a report reads a set and prints a sequence.

That is a claim about LabKit too. Check it.

## Changed

**`f04bb83`** — `tests/survey-after-reinterpretation.test.ts`, one test.

No source changed. The range is far wider than this session; #110, #112, #113,
#115 and `ed7abe6` belong to entries 070, 071, 072 and to other sessions, and
are not restated here.

Two ledger writes, not commits:

- a **dispute** on whether a typed graph API makes `src/domain/facts.ts`
  unnecessary or merely removes one of its failure modes (`pair_id`
  `ecb648b2`), with the port's slice-1 argument as the thesis;
- a **claim** recording the ordering result below;
- and **evidence against** the standing claim that LabKit cannot distinguish an
  OS-supplied actor name from an asserted one — #109 shipped `attribution_how`,
  so that claim is overturned by code.

## Verified

`bun run check` — **20/20**.

**One of the port's two defects is not present here.** `sharpen`'s frozen
snapshot lists evidence in traversal order in the port; `originOf` already sorts
in TypeScript after the unordered read. So *"zero `ORDER BY` in `src/domain/`"*
— which is true, and was the first thing checked — is not itself the defect.

**The other one's every precondition is present, and it does not bite.**
`reinterpret` adds a second `SUPPORTS` from the same evidence to the narrowed
claim; `answeringClaimBearing`'s fold is `found ?? row.answering`, a take-first;
measured on a real record, the closing decision's cited evidence reaches **two**
claims and the store returns the narrowed one first. The bucket is stable across
five reads, and two mutations fail to break it:

| mutation | result |
| --- | --- |
| reverse the fold to take the **last** claim | still passes |
| regrain `checksOf` from `byClaim` to `byQuestion` | still passes |

## Open

**Why the pick does not reach the answer is not established.** A mechanism was
proposed — that `checksOf`'s per-claim grain isolates it — and the second
mutation above refutes that story without replacing it. The test asserts the
observable property and deliberately explains nothing, because a comment naming
the wrong reason is PJ-029's shape and passes either way.

**Not filed as an issue.** PJ-011 §5: an unreproducible answer is not a wrong
one, and no wrong answer was produced. What is left is a latent hazard with a
guard on it — a future consumer of `answeringClaim` that depends on *which*
claim came back goes red in that test rather than intermittently in a report.

**The live ledger dispute is the one worth an argument**, not this. #114's
slice 1 claims the duplicated-traversal failure `facts.ts` exists to prevent is
*absent* on a typed API rather than centralised. The counter recorded against it
is that the fact-graph's standard was six occurrences of one silent defect, four
by the author of the previous fix — and a port at 31 of 36 commands has not run
long enough for that class to recur. Neither pole has evidence beyond its own
assertion yet.

## Next

The domain-model conversation that was queued before this: **#98** (a task
cannot name the question it serves — the 29-step programme made it concrete),
and the closure finding from 071 (closure attaches to the question, so two
pursuits of one question get one closing act, and a programme whose threads
resolve separately has no way to say so).

```sh
gh pr view 116        # this entry's test
gh issue view 98
```
