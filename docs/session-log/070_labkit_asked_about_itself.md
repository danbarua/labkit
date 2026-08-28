# 070: LabKit asked about itself

**Session wrap, 2026-08-28, on `feat/probe-dogfood`.** Not a decision record —
`scripts/probe-dogfood.sh`'s header carries why it is a `probe:` and not a
`check:`, and #56 carries the run's findings.

**A sixth entry for this session**; 061 is #83's, 064 #66's, 066 #57's, 068 the
adapter rename, 069 #81's grade. `062`, `063`, `065` and `067` are a peer
session's.

## Goal

Run #56 — can LabKit hold a research queue without markdown beside it — against
this repository's own recursive work.

## Changed

**`583dced`** — the run, as a script.

- `scripts/probe-dogfood.sh` **new**; `package.json` gains `probe:dogfood`.
- `CLAUDE.md` — the sweep's absences, which that paragraph demanded a reason for
  rather than letting a second omission join a habit.

Working tree clean. Open as PR **#111**. Findings on **#56**.

## Verified

`bun run check` — **all 19 passed**, and the sweep correctly does *not* run the
probe, deriving its list from the `check:` prefix.

The probe itself asserts nothing, on purpose. Its output is four answers a
person reads.

## Open

**Three of #56's four criteria are met; the fourth is #55's residual.** *What to
investigate next*, *the chain under a conclusion*, and *what is deliberately not
being done with what would reopen it* all came back without reading a file — the
last including the reason, the reopening condition, and the finding it was
decided in light of, which is the part markdown was doing.

***Why* a piece of work exists is unanswerable.** A `Task` hangs off nothing but
a gate; `plan` takes no question and `TaskContract` carries none.

**And the probe went looking for a wrong answer and did not find one.**
`contract TASK_2` declines — *"Not enforced. The record states what this work may
look at"* — rather than inventing a purpose. So this is a negative result that
could have been positive: PJ-011 §5 wants a confidently wrong answer before an
edge is earned, and the surface refuses honestly instead. #55's verdict stands,
now on evidence rather than argument.

**A smaller finding, not filed.** `known`'s *Unresolved* bucket mixes *nobody
has answered* with *answered, nobody closed it out* — the probe's `Q_1` has a
concluded analysis and a passed gate and still reads unresolved. Correct by
design, and one hop from `enquiry`. Same shape `provisional` had before S-19: a
distinction that matters only once somebody is misled by it.

## Next

`gh pr view 111`.

The domain-model open questions — **#63**, **#64**, **#65** — are the live
queue, and by CLAUDE.md's convention `domain model` + `open question` means
defined and tracked rather than ready to work on: they want a decision rather
than an implementation.

**Re-run `probe:dogfood` after any change to `plan` or `TaskContract`.** That is
the one thing expected to move its fourth answer, and the reason the script
exists rather than a transcript.
