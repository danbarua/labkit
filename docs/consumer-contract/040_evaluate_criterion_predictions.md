# `evaluateCriterion` and the reachability rule — predictions

**Written 2026-08-22 against `d1bd931`, before a line of test**, and before any
run at all: `labkit-dev` asked for a quiet machine for a paired A/B, so this is
orientation only. The demonstration waits.

Second item off PJ-028's inferred pile. The first (`sharpen`, `039`) came back
**not a defect**, so the base rate is one-for-one on "reading is not evidence".

## Why this one is a real test of the rule rather than a repeat

`039` established: *a partial state is acceptable exactly when some other verb
could legitimately have produced it, or when no reader can reach it at all.*

`sharpen` cleared it on the second clause — its reachability edge (`MOTIVATES`)
is written **last**, so an interruption leaves nothing a reader can walk to.

**`evaluateCriterion` writes its reachability edge second, not last.** Order is:
validate → `createNode(CriterionEvaluation)` → `EVALUATED_AS` → `TRIGGERS` (if a
gate) → `BASED_ON` (if citing). So from the third write onward the evaluation *is*
reachable, and the later edges are the ones that say what it means.

That is the opposite arrangement, which is why this is a genuine test.

## What the two readers actually require

Read, not run — and this is the load-bearing observation:

| reader | traversal | needs `TRIGGERS`? |
| --- | --- | --- |
| `checks` / `state` / `unmet` | `(c)-[:EVALUATED_AS]->(ev)-[:TRIGGERS]->(g)` | **yes** |
| `everFailed` | `(c)-[:EVALUATED_AS]->(ev)` | **no** |

## Predictions

| | |
| --- | --- |
| **Window 1 — interrupted before `EVALUATED_AS`** | An orphan `CriterionEvaluation` with no edges. Both readers start from `Criterion`, so nothing reaches it. Predicting **absence, not a defect** — the same clause `sharpen` cleared on |
| **Window 2 — interrupted before `TRIGGERS`** | Predicting a **report that contradicts itself**: the gate shows the check `never-run` (it is absent from `checks`) while `everFailed` is `true`, from one interrupted call. Predicting I will *not* be able to call this a defect, because the same state is produced legitimately by the no-gate S-3b path, and `everFailed` is documented as *"deliberately unfiltered by gate"*. Contradictory-looking, and intended |
| **Window 3 — interrupted before `BASED_ON`** | The sharper one. The verdict reads as **asserted rather than measured** — row W's distinction — and, because `isWithdrawn` is `cited > 0 && standing === 0`, it becomes a verdict that **can never be withdrawn**, even when the evidence it actually rested on is retracted. Legitimately reachable (call without `citing`), so the rule says acceptable; but the record now makes a claim about *how* the verdict was reached that is false for this call |
| **Therefore, my actual prediction** | **Not a defect under the rule as stated, and window 3 exposes a gap in the rule.** "Legitimately reachable" and "says something true" are not the same test. Predicting the useful output here is a **refinement of the rule**, not a transaction |
| **What would refute this** | A reader that distinguishes "no basis because none was cited" from "no basis because the write was interrupted". If one exists, window 3 is a demonstrated wrong answer and `evaluateCriterion` becomes transactional |
| **The wrong answer I expect to write** | Calling window 2 a defect because the report *looks* self-contradictory. A contradiction a reader can construct is not the same as a false statement, and `everFailed`'s comment says the unfiltered scope is deliberate. If I reach for the transaction on window 2, I have stopped applying the rule and started pattern-matching on ugliness |

## Constraint

No noun, edge or property. Demonstrate before concluding — and if the answer is
"not a defect, but the rule needs a clause", say that rather than manufacturing a
fix to justify the reading.

## Held

No `bun test` until `labkit-dev` releases the machine. Predictions are recorded
first precisely so the demonstration cannot be tuned to them afterwards.
