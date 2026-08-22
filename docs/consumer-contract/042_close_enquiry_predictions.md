# `closeEnquiry` — predictions

**2026-08-22, against `f074ebd`, before any run.** Third item off PJ-028's
inferred pile. Machine is `labkit-dev`'s for a paired A/B, so this is orientation
only.

## Found by the heuristic, which is the point of having one

`041` left a shortcut: **order the writes, find the reachability edge, and ask what
a reader can derive from the state between it and the end.** Applied to the five
undecided verbs, `closeEnquiry` came out first on the first look:

```
createNode(Decision) → RESOLVES → BASED_ON per cited finding
```

That is `evaluateCriterion`'s shape exactly — reachability edge **second**,
evidence links **last**. `sharpen` was safe because its reachability edge is last;
this one is not arranged that way.

The heuristic took one grep per verb. It is a lead and not a verdict, and the
demonstration is what decides.

## Predictions

| | |
| --- | --- |
| **The answer can be inverted** | `enquiryStatus()` derives `answer: challenges ? "no" : "yes"` from the closing decision's `BASED_ON` evidence. Interrupt the loop and the surviving subset decides the polarity. Predicting a question closed on challenging evidence reads **"yes"** when the challenging edge is the one lost — the recorded answer to a research question, inverted by a partial write. Strictly worse than `041`'s window 3, which corrupted a verdict's standing rather than its content |
| **`evidence: []` is not the defence** | Its docstring says *"Empty means nothing was cited"* — a positive claim, not an absence, so the same argument that made window 3 a defect applies here without modification |
| **`restsOn` degrades too** | It is `promoted.some(kind === "confirmatory")` over `BASED_ON → SUPPORTS → Claim`. Losing the supporting edge reports **exploratory** work as the basis of a closure that rested on confirmatory work |
| **Therefore a defect, and the remedy is the transaction** | No noun, edge or property. Predicting `inTransaction` around the decision and its edges, as `evaluateCriterion` got |
| **What would refute it** | `closeEnquiry` already being transactional (it is not — checked), or `enquiryStatus` requiring something written *after* `BASED_ON`, which would make the partial state unreachable the way `sharpen`'s is. There is nothing after the loop |
| **The wrong answer I expect to write** | Assuming this follows from `evaluateCriterion` because the shape matches. **The shape is a lead; two verbs sharing an arrangement is not evidence about the second.** `sharpen` looked like a defect on exactly that kind of reasoning and was not. If I skip the demonstration because the heuristic is convincing, the heuristic has replaced the method |

## Constraint

Demonstrate before fixing. If it comes back clean, that is the result and the base
rate becomes three examined, one defect.

## Held

No run until the machine is idle. `labkit-dev` is mid-measurement; its own numbers
were confounded by my load earlier today and mine by its load an hour ago.
