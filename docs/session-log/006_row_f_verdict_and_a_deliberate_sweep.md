# 006: Row F closed as `boundary`, PJ-027, and the first deliberate sweep for it

**Session wrap, 2026-08-21, on `feat/minion`.** Not a decision record — see
`docs/project-journal/027`, `028` and `docs/consumer-contract/036`, `037` for the
reasoning.

**The range is wider than this session.** `collect.sh` reports twenty commits
since baseline `79de6f3`; most are `labkit-dev`'s and four of those are written
up in entry 005. This entry covers **`afcbc58`, `079798f`, `ecbd29f`, `136fbc4`,
`5204809`, `4dd44a7`, `8afae1c`, `cfb639b`** and the two merges, and nothing else.

## Goal

Close row F. Then — at `labkit-dev`'s request — look *on purpose* for the defect
PJ-027 names, which until now had only ever been found by accident, and answer
whether any of it can be machine-checked. Then fix what the sweep found that
nobody else had claimed.

## Changed

**Row F, and the journal entry that came out of it:**

- `afcbc58` — `reproductionOf().differs` carries `IdentifiedArtefact` instead of
  a bare `logical_name`. Row F's fourth bite (S-10c), same remedy as the three
  before it.
- `079798f` — `docs/consumer-contract/035`, `036`: row F's predictions and its
  verdict, **`boundary`**. Argued from an enumeration of every read that touches
  an artefact, not accumulated to from the four bites.
- `ecbd29f` — `docs/project-journal/027`, plus CLAUDE.md's chain paragraph.

**The sweep's own output:**

- `136fbc4` — `reproducibilityOf()` reported `reproducible: true` for a
  construction with no parts, and for an analysis that was never created.
  Predictions in `037`; scenario `tests/scenarios/s9e_reproducing_nothing.test.ts`
  fails **0/3** against the old predicate and passes **3/3** against the new.
  Two states, two answers: an analysis that consumed nothing is a real record and
  gets `reproducible: false` (unshown, not refuted — `exact.length > 0` is the
  conjunct three empty lists cannot supply); an analysis that does not exist is
  **refused**, as every other absent-subject read on the surface refuses.
  **Not a §3 row** — `labkit-dev` corrected an over-classification of mine: rows
  are claims about the model, and this needed no noun, edge or property.
- `5204809` — `docs/project-journal/028`, `scripts/check-tests-assert.ts`,
  `package.json`, CLAUDE.md.

**Cleanup the sweep found, taken at Dan's direction after `labkit-dev` released
them:**

- `4dd44a7` — `docs/dependency-graph.mmd` regenerated. It predated `src/mcp` and
  the CLI rewrite, so a reader consulting "the module dependency graph" got one
  missing two of `src/`'s five entries plus three test files.
- `8afae1c` — the seven wrong counts, and four stale-symbol comments in the same
  files. **Zero of the seven earned an assertion** — see Open.
- `cfb639b` — PJ-028 corrected by its own repair, plus CLAUDE.md's paragraph.

Merges `70817a2` (fast-forward: `Question.posed_at`, the `whatWasKnown` fixes,
`src/mcp/`, the CLI rewrite) and `2623d02`. Pushed to `origin/feat/minion`.

## Verified

- `bun test` — **261 pass, 0 fail**, 855 expect() calls, 36 files. Run three
  times across this session's second half, clean each time (95.99s, 114.93s).
  An earlier run, with six subagents reading the repo concurrently, gave
  256 pass / 2 fail — both S-11 tests timing out at 6.2s and 7.0s against bun's
  5000ms ceiling. Same code, different machine load: the documented flake, and
  both numbers are recorded rather than only the good one.
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — **0 errors**, 1 pre-existing
  warning (`no-orphans: src/index.ts`).
- `bun run check:ledger`, `check:doc-comments`, `check:stdout` — all green.
- `bun run check:tests-assert` — **green**, after `labkit-dev`'s fixes landed.
  It was committed **red on purpose**, naming the two tests it was written from;
  the failing check was the demonstration, in the same order every other fix here
  is made. Red from here on means a test has stopped testing.

## Open

**Nothing from the sweep is left unowned.** `labkit-dev` cleared its four items
in `7c6853f`, `0c214ca`, `20fef4f` and `30f975b`: both assertion-free tests fixed
and injection-verified, `examples/full-lifecycle.ts` resurrected after 221 dead
commits, the read-only claim widened across both surfaces via
`tests/helpers/read-only.ts` with its residual hole stated, and the row Z detector
repointed. `check-progress-to-stdout.sh` — a transplant that ran green on a
fiction — was replaced by `check:stdout`.

**Zero of the seven counts earned an assertion**, which corrects PJ-028's first
conclusion and is recorded there as a correction rather than a footnote. Six were
decoration on an argument that survives without them. The seventh sat in a test
file beside a real denominator (`NODE_LABELS`/`EDGE_LABELS`) and still did not
earn one: the property it gestures at is already asserted empirically one line
below, by a guard that *tightens* as labels are added where a count assertion
would merely break. **An assertion protecting nothing an existing assertion does
not is a change-detector.** The rule that survives is *a numeral either earns an
assertion or it should not be in the prose*.

The defect fired once more during its own repair — the first version of that test
comment said the counts were "asserted below" before any assertion existed.
Caught by going to write the assertion the sentence promised, then finding it
should not exist.

**The eighth instance added a third branch.** CLAUDE.md's "edge labels 19 → 24"
was wrong against 25, in the paragraph introducing PJ-028. `labkit-dev` did not
delete it, correctly: the figures come from PJ-024, which is a *review*, so they
are a dated measurement and a historical record is legitimate prose. The framing
was the defect — it read as current state. The rule is now **earn an assertion,
be deleted, or be explicitly dated**.

**The sweep's unverified remainder.** Six readers produced 28 candidates of the
guarantee-broken kind; I demonstrated seven and left the rest labelled *inferred*
on purpose. The full report is at `sweep-report.md` in this session's scratchpad
and was sent to `labkit-dev`. Acting on the inferred pile unverified would be the
sweep-driven edit the method exists to avoid.

The one most worth a demonstration before anyone "fixes" it: `write.ts:9` says
every compound verb runs inside `inTransaction()`, and `sharpen`, `openEnquiry`,
`pursue`, `recordReview`, `closeEnquiry` and `declareGate` do not. Either a real
defect or "compound" is narrower than the comment reads — and getting that
backwards wraps things that should not be.

**The wrap hook resolves its state from the wrong worktree.** This session began
in `labkit-domain-consumer` and works in `labkit-minion`. The hook hands over
`/Users/dan/Code/science/labkit-domain-consumer/.claude/.wrap-state/74f9b207-…`,
whose `baseline` is `005465c` — the *other* branch's tip — and then looks for this
entry inside that checkout. Until `labkit-dev` merged, the file was not there and
the hook reported "no entry yet" on every fire, three times. Both state files are
now pointed at this entry. Worth fixing: a session that moves between worktrees
gets another session's baseline and cannot be seen to have wrapped.

## Next

**The sweep is closed. What is left is the inferred pile, and it needs
demonstrations, not edits.**

Start with the one flagged above: take `sharpen` or `closeEnquiry`, show what an
interruption between its writes actually leaves in the graph, and only then
decide whether `write.ts:9` is wrong or its word "compound" is narrower than it
reads. One verb, one demonstration. Do not sweep.

Read `sweep-report.md` in this session's scratchpad first — it labels every item
demonstrated or inferred, and the inferred ones are inferred on purpose. Six
readers looking for one shape find that shape and are silent about others, so
treat the list as a lead sheet, not an inventory.

The wrap hook's worktree bug is still live and will bite the next session that
moves between checkouts. Nothing depends on it; it just makes the hook lie.
