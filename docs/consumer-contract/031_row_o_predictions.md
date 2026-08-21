# Row O — predictions, recorded before the build

**Written 2026-08-21 against `20dcfaa`, before a line of test or source.**

Row O is the first row this project has taken up on a **challenge** rather than a
prediction of its own. Its deferral had stood since PJ-008 and was withdrawn when
an external reviewer pointed out the cell contradicts itself: it defers to "when
the event model is under real pressure" on the grounds that this describes *why
state changed*, while its own verified-state line — *"`Review→EvidenceUnit` says
who reviewed, not which review caused an invalidation"* — describes a
present-tense question about what is true now.

A challenge is **a prediction with a different author**, and it is scored the same
way. If the build shows no wrong answer, the deferral was right, and the cell
gets a verdict instead of the shrug it has carried for eleven scenarios.

## What is already known, and what changes the shape of the row

Two facts found while orienting, both verified in the code rather than recalled:

**`replaceAnalysis()` never writes `because` to the graph.** It takes a
`ReviewRef`, asserts the review evaluates the analysis being replaced, and then
uses it for nothing durable — the reference reaches the event stream and stops
there. So "which review caused this invalidation" is not *ambiguous* with several
reviews; it is **absent with one**. The row's cell describes a weaker gap than
the one that exists.

**`whySupported()` invents the answer anyway.** A superseded finding is reported
with `reason: row.r?.verdict ?? "its analysis was replaced"`, where `r` comes
from `OPTIONAL MATCH (r:Review)-[:EVALUATES]->(u)` — **any** review of that
evidence unit. With one review it happens to be right. With two it is a coin
toss presented as a fact.

## Predictions

| Question | Prediction |
| --- | --- |
| **Does row O clear PJ-011 §5?** | **Yes, and it is the cleanest §5 case since row X.** Two reviews of one analysis — one saying the method is unsound, one confirming the numbers — then a replacement citing the first. Predicting `whySupported()` reports the **confirming** verdict as the reason the finding was superseded, at least some of the time. A record that says work was retracted because a reviewer approved it is confidently wrong, not merely thin |
| **A second wrong answer in the same place** | Predicting the `superseded` list also **duplicates**: `findingsBearing()` returns one row per matching review, so a finding superseded once should be reported twice. Less certain than the first — the dedupe may already happen upstream — and worth stating separately so a partial refutation is visible |
| **The reviewer's own discriminator** | **Predicting it cannot be built as stated, and is refuted on its specifics.** It proposed retiring an analysis on a review, then invalidating *that review*, and asking whether the retirement still reads as resting on valid grounds. `invalidated` is a property of `Artefact` alone; `ReviewProps` is `{ verdict }`. **Nothing can invalidate a review.** So the row is settled by a different route than the challenge named, while the challenge's underlying claim — that this is a what-is-true-now question — is vindicated |
| **Rung 1 — reader semantics** | **Removes the wrong answer and cannot restore the right one.** Reporting `"its analysis was replaced"` whenever the causal review is not identifiable is S-5's decline-rather-than-guess, and it is honest. Predicting it is **not sufficient**: `because` is known at write time and thrown away, which is row AB's shape — a consequential act recording what it acted on and not what caused it. Predicting I build rung 1 first anyway, and that the argument for going further is that the information existed and was discarded, not that the query is ugly |
| **Rung 2 — an existing relationship** | Predicting **no existing edge fits**. `EVALUATES: Review → EvidenceUnit` says who reviewed. `BASED_ON` has `Decision` and `CriterionEvaluation` sources and no `Review` endpoint, and `replaceAnalysis()` deliberately mints no `Decision` — PJ-008 row B settled that, and the comment saying so is still in the code |
| **Rung 3 — a new relationship** | Predicting **a new endpoint pair on an existing label, not a new label**, and predicting the endpoint is the *invalidated artefact* rather than the replacement: the question is "why is this no longer valid", asked of the thing that stopped being valid. Predicting no new noun, and **no migration** |
| **Row T rides along or does not** | Row T says edges cannot carry properties. If rung 3 is a plain edge with no property, **T contributes nothing and loses its only named owner**. Predicting exactly that, which orphans T rather than settling it |
| **The wrong answer I expect to write** | Reaching for `SUPERSEDES` because the word fits. It is `Decision → Decision`, this has no `Decision`, and PJ-008 row B's note explains why minting one here points causality backwards. Predicting the temptation |
| **What would refute all of this** | `whySupported()` reports the right review in the two-review world — because the query orders rows in a way that happens to prefer the causal one, or because the dedupe collapses to it. Then no wrong answer exists, the deferral was right, and the reviewer's challenge is refuted in substance as well as in specifics |

## The bar

PJ-011 §5 needs a **confidently incorrect** answer. An empty result is not one.
This build's whole first move is to produce two worlds that differ only in which
review is the causal one, and see whether the record can tell them apart.

`bun run check:ledger` allows one `demonstrated` row at a time and there are
currently none, so if this fires the row may be marked and then must be cleared
next. That is the rule working, not an obstacle.

## Success and failure, stated now

**Success:** a two-world test in which the reason a finding was superseded is
reported as a verdict that did not cause the supersession, asserted twice, from
durable state, with the event log empty beside it — followed by the cheapest rung
that fixes it, walked in order.

**Failure that still counts as a result, and is a real possibility:** no wrong
answer materialises. Row O's cell then records **why the deferral was right**, in
terms of something that was run — and the write-up must say *what the challenge
got wrong*, not merely that it was wrong. Rows A and B are the precedent for
keeping a refuted prediction; a refuted challenge is the same thing with a
different author.

**Failure that does not count:** a wrong answer produced by writing two reviews
that no researcher would write. The two-review world has to be one a working
programme actually produces — a critical review and a confirming one on the same
analysis is ordinary, which is why it is the world chosen.
