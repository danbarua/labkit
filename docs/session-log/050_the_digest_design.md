# 050: a design for `labkit digest`, and the two defects it found instead

**Session wrap, 2026-08-27, on `feat/digest-design`.** Not a decision record —
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
`labkit-review` refuted its central argument.

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

**Not run:** the `report.ts` reachability table for `GateRef`/`WorkRef`, which
was read. Nor whether each proposed digest section is one Cypher traversal.

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

**Unanswered, asked of `labkit-review` and not yet returned:** whether one of
the two §2 fixes is clearly right on existing evidence; whether §2's scenario
must precede §3's; and whether `whySupported` already carrying
`standard[].state = "failed"` argues for fixing the bucketing rather than
`promote()`.

## Next

Dan reads `docs/digest-design.md`. Its §9 has four questions, the first being
which fix he wants for the contradiction.

Nothing should be built before that answer — the proposed order of work in §8
puts the contradiction first precisely because `digest` built on the current
survey would have two sections contradicting a third.
