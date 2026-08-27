# 050: a design for `labkit digest`, and the two defects it found instead

**Session wrap, 2026-08-27, on `feat/digest-design` then
`feat/digest-design-2`.** PR #44 merged; the revision after Dan's and Grok's
review is the second branch. Not a decision record —
the design doc is `docs/digest-design.md` and it is awaiting Dan's review.

**The range is wider than this entry.** The wrap baseline still points at the
start of a long housekeeping session; entry 049 covers everything up to PR #42's
merge (`a83381e`). Only `2cf6d6c` and `ce2fad5` are this entry's.

## Goal

First feature work after the housekeeping. Dan: `labkit digest` — *"everything I
need for my daily standup"* — and more generally *"we have no **list** views"*.
Discuss with `labkit-review`, draft a design doc for review in the morning.

## Changed

**`2cf6d6c`** — the first draft. **`ce2fad5`** — a rewrite, because
`labkit-review` refuted its central argument. **`3c3f599`** — a recommendation
in place of a fork, once the deciding test had been run.

**`7abebe4`** (after #44 merged) — Grok's review, which refuted the *shape* of
the recommended fix.

Nothing else. No verbs, no schema, nothing shipped.

## Verified

Everything in the document was run against real records built through the CLI,
in temporary directories, on 2026-08-27.

**The contradiction, end to end.** Criterion, planned work, gate protecting it,
evaluate `fail`, observe, analyse held to that criterion, **promote accepted**,
close answered-by. Then, one record, two verbs:

```
$ labkit gate GATE_1
GATE_1 — blocked   consequence: the result may not be built on until this holds
$ labkit known
Established
  - does the new sampler converge?
```

`promote()` contains no reference to gates — the strings `gate` and `blocked` do
not occur in its body.

**The dead end.** `claims "the sampler converges"` → `CLM_1` → `why CLM_1
--json` carries `unmet[].criterion = CRIT_1` and `standard[].state = "failed"`.
All five read commands taking a handle then refuse it: `affects`, `criteria`,
`gate`, `design`, `contract`. `affects CRIT_1` gives `no artefact named
"CRIT_1"`.

**The test that chose the fix.** `labkit-review` argued a write-time refusal
cannot hold a read-time property. Run rather than accepted:

| | gate | `known` | |
| --- | --- | --- | --- |
| T1 promote while satisfied | `satisfied` | Established | correct — a refusing `promote` allows it |
| T2 re-evaluate the criterion `fail` | `blocked` | **Established** | wrong, and the refusal caught nothing |

So refusing at promote-time catches only the case where the gate was already
blocked at that instant, and creates the appearance of an invariant that does
not hold. That turned two defensible positions into one recommendation.

**Not run:** the `report.ts` reachability table for `GateRef`/`WorkRef`, which
was read. Nor whether each proposed digest section is one Cypher traversal.

**Grok's correction, and it would have shipped a bug.** The recommended walk
was loosely stated as *question → cited claim → criterion → state*. The join is
`held_to`, and the gate is not it. Built to separate them — a gate governing
`CRIT_2` and blocked, a claim held to `CRIT_1` only:

```
$ labkit why CLM_1 --json
  standard: [ CRIT_1 ]   unmet: [ CRIT_1 ]      ← CRIT_2 never appears
```

A survey consulting "any blocked gate on the enquiry" would demote a question
whose answering work was never held to the failing criterion. **In the original
§2 transcript the two coincide**, so that implementation would have passed the
test written for it.

**Standing is per claim, by citation** — nobody predicted this. `evaluate
CRIT_1 --outcome pass` without `--citing` leaves `why` reporting `never-run`;
adding `--citing CLM_1` flips it to `passed`.

**And a simpler demonstration than the one the document opened with**, needing
no gate, no evaluation and no re-evaluation: `analyse --held-to` a criterion
that is never evaluated, promote, close. `why` says `never-run` and `unmet`;
`known` says `Established`. S-3b verbatim — a prespecified check nobody ran must
count against the finding it qualifies — with the survey as the one reader that
ignores it. It also fixes the condition's shape: `never-run` is not `passed`.

## Open

**The document's first central argument was wrong**, and the correction is the
most useful thing in this session. The draft claimed `whatIsKnown()` reporting
four empty buckets in a record with a blocked gate was a confidently wrong
answer. It is not: `whatIsKnown()` is a knowledge survey answering its own
question correctly, and saying nothing about gates is a scope boundary. By that
argument every verb is wrong about everything it does not cover. PJ-011 §5 is
exactly this case — a missing feature manufacturing an empty result.

It is kept in the doc's §4 rather than deleted, because **the failed argument
and the one that works look nearly identical**. Both are "a reader consults
`known` and is misled". They differ on whether the verb makes a positive
assertion another verb contradicts, or merely fails to mention something. That
distinction is the whole bar, and it is easier to see with the near-miss beside
it.

**Two defects are now named and neither is `digest`.** The contradiction earns a
fix — `whatIsKnown()` consulting gate state, or `promote()` refusing over a
blocked gate — and `labkit-review`'s warning is the one to hold onto: spend it
on digest and digest becomes a workaround while the defect stays. The one-way
`GOVERNS` traversal earns an enumeration verb on its own evidence.

**Both want scenarios, not more design.** PJ-008 §2's corpus is where a
researcher's intent that cannot be carried out through research verbs alone gets
settled, and writing the second as a conversation is what will decide whether
the answer is one enumeration verb or three.

**All three questions to `labkit-review` came back and are folded in.** The
fix is the survey; §2 precedes §3, by the rule that at most one confirmed wrong
answer ships green at a time; and `whySupported` already carrying
`standard[].state = "failed"` is a confirming argument rather than a stray
observation — the read side has the fact one hop from the survey, so a
`promote()` fix would add a write-time lookup for something already in hand.

**Two rounds of review each refuted something, and each refutation was
verified here rather than accepted.** `labkit-review` took the central argument
(§4); Grok took the shape of the fix that replaced it. The pattern worth
carrying: both times the refuted version *had a passing demonstration behind
it*, and in Grok's case the demonstration passed only because two objects
coincided in the one record that was built.

**Which bucket is left open on purpose.** `provisional` means "resting on work
nobody promoted", and a promoted claim behind a blocked gate *is* promoted, so
widening it is a decision about what the word means; row Y is the standing
warning against inventing a sixth for nobody. The scenario picks it.

**A correction sent back the other way.** `labkit-review` reported the ledger as
having no open rows. It has three — AH, AI and AJ, added yesterday and therefore
postdating the audit they were recalling. Their conclusion survived, because the
rule turns on `demonstrated` and none of the three is, but the doc now names the
row letters rather than asserting "nothing is open", so a reader who greps the
ledger does not meet a contradiction. Second time today that a peer's conclusion
was right and its stated evidence was not; both were worth checking.

## Next

Dan reads `docs/digest-design.md`. Its §9 has four questions, the first being
which fix he wants for the contradiction.

Nothing should be built before that answer — the proposed order of work in §8
puts the contradiction first precisely because `digest` built on the current
survey would have two sections contradicting a third.
