# 006: Row F closed as `boundary`, PJ-027, and the first deliberate sweep for it

**Session wrap, 2026-08-21, on `feat/minion`.** Not a decision record — see
`docs/project-journal/027`, `028` and `docs/consumer-contract/036`, `037` for the
reasoning.

**The range is wider than this session.** Most commits since baseline `79de6f3`
are `labkit-dev`'s, and several are written up in entry 005. This entry covers
**`afcbc58`, `079798f`, `ecbd29f`, `136fbc4`, `5204809`, `4dd44a7`, `8afae1c`,
`cfb639b`, `1dfc224`** and the merges listed below, and nothing else.

No count of the range here, deliberately: `collect.sh` recomputes it on every
fire, and this line carried "seventeen" and then "twenty" while the number was
something else. A numeral either earns an assertion, is deleted, or is dated
(PJ-028) — and in a document rewritten whole each time, deleting is the only one
of the three that stays true.

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
- `1dfc224` — PJ-028's third branch (dated measurements) and the transplanted
  check that could not fail.
- `b2047f4` — PJ-028's four self-instances, collected from three scattered
  sections into the entry's actual argument. See Open.
- `a4b7898` — **the first item off the sweep's inferred pile, and it was not a
  defect.** `docs/consumer-contract/038`/`039`, `write.ts`'s header, and one test.
  No code change. See Open.
- `4d6b767` — `close-entry.sh` and `collect.sh` got the worktree fix that only
  `wrap-hook.sh` received.

Merges `70817a2`, `2623d02`, `20fef4f`, `b451955` and `20cfcca`. Pushed to
`origin/feat/minion`; `labkit-dev` merges it back as it goes.

## Verified

- `bun test` — **261 pass, 0 fail**, 867 expect() calls, 36 files, most recently
  88.98s serial on an unloaded machine. Clean on six of eight runs this session.
  **The two that were not are recorded here on purpose**, because a wrap that
  reports only the runs agreeing with it is the shape this session spent the day
  removing:
  - 256 pass / 2 fail, with six subagents reading the repo concurrently — two S-11
    tests crossing bun's 5000ms ceiling at 6.2s and 7.0s.
  - 256 pass / **5 fail, 5 errors**, 856 expects, **280.87s** — a natural flake on
    an unloaded machine, same tree as a clean 88.98s run minutes later.
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — **no violations at all**, 81
  modules, 237 dependencies. The standing `no-orphans: src/index.ts` warning was
  cleared by `labkit-dev`'s work in this range; it had been there all session.
- `bun run check:ledger`, `check:doc-comments`, `check:stdout` — all green.
- `bun run check:tests-assert` — **green**, after `labkit-dev`'s fixes landed.
  It was committed **red on purpose**, naming the two tests it was written from;
  the failing check was the demonstration, in the same order every other fix here
  is made. Red from here on means a test has stopped testing.

## Open

**A flake detector was proposed, published and refuted inside an hour, and the
refutation is the useful part.** `labkit-dev` derived the suite's test count
exactly — 249 static declarations, minus the one generator at
`domain-graph.test.ts:362`, plus its `NODE_LABELS.length` expansions, equals 261 —
and inferred that a count above it means a test crossed bun's ceiling and was
reported twice. True in that direction. It was written into `docs/TASKS.md` as a
detector, which needs the *converse*, and the natural flake above killed it: **five
tests lost, count still 261.** Withdrawn in `20cfcca`.

Duration separated the two runs where count did not (280.87s against 88.98s), and
the `expect()` total is better than either — 856 against 867 counts *work that did
not happen*, so it does not move with machine load. Neither is in a document as a
number; a duration in prose earns no assertion.

**The failure signature is gone, and that is mine.** I piped the flaking run
through `tail -5`, discarding the only evidence that could distinguish a teardown
cascade from real assertion failures — ten minutes after agreeing in writing that
this was the mistake worth recording. The re-run came back clean. **The next
person to see this flake should capture the full output before anything else.**

**PJ-028's argument changed shape because of that.** Four instances in one day of
someone committing the defect they were holding — `918f420`, my "asserted below"
comment, my `tail`, and the detector generalised from one observation inside the
correction for my `tail` — support a conclusion one instance could not: *"be more
careful" is not available as a remedy, because these are what being careful looks
like*. Each is an asymmetry, and attention does not distribute evenly across one.

**The inferred pile's first item was not a defect, and that is the result.**
`write.ts`'s header said a *compound* verb runs inside `inTransaction()` and six
multi-write verbs do not. Both readings on offer — the comment is wrong, or
"compound" is narrower — assume one answer covers all six, and this project has
never worked that way. The rule is PJ-011 §5 pointed at interruption:

> A partial state is acceptable exactly when some other verb could legitimately
> have produced it, or when no reader can reach it at all.

I predicted `sharpen` needed a transaction and was **wrong**. Interrupt its
`BASED_ON` loop and the decision keeps a subset of what was standing — which
`originOf()` would report as complete and wrong, except it cannot see it:
`originOf()` is the only reader of `NARROWS` and matches `MOTIVATES` first, which
`sharpen` writes **last**. Interrupt at `MOTIVATES` instead and the sharper
question survives with no origin, which is exactly what `pose()` produces.
**The order of the writes was doing a transaction's work and nobody wrote it
down.** No code changed; the header states the real rule, and a test now fails the
day a `NARROWS` reader stops requiring `MOTIVATES`.

Base rate so far: **one examined, one not a defect.** The five remaining verbs are
`undecided, not cleared`. `evaluateCriterion` is next by its own comment.

**A fifth self-instance, in the fix for the fourth.** `labkit-dev` fixed the wrap
hook's worktree bug in `wrap-hook.sh` — and `close-entry.sh` and `collect.sh` kept
the same wrong line. Running `close-entry.sh` from this worktree would have taken
the *other* checkout's HEAD as this session's new baseline, silently skipping a
range. Found by going to use the script. Fixed here, same one-line resolution.

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

**The wrap hook read its state from the wrong worktree — found here, fixed by
`labkit-dev` in `b451955`.** This session began in `labkit-domain-consumer` and
works in `labkit-minion`, and the hook took `state_dir` from `$CLAUDE_PROJECT_DIR`,
which names where a session *started* rather than the tree it is working in. So it
read the other checkout's state — that branch's baseline, and an `entry=` naming a
file absent on this side — and reported "no entry yet" three times about a session
that had wrapped. It now resolves from `git rev-parse --show-toplevel`, which names
the same directory for a session that is not in a worktree, so there is no special
case beside the normal path.

Verified from this side rather than accepted: `--show-toplevel` gives
`/Users/dan/Code/science/labkit-minion`, the state file it now reads carries
`baseline=79de6f3` and this entry's path, and the file exists here. All three were
wrong before. **The fix does not replace the seeding recipe** — the state file is
now in the right tree, but a fork into a fresh worktree still finds that tree empty
and self-baselines at whatever HEAD is then.

**Worth more than the fix: the shape of the bug.** The hook did not error and was
not missing anything. It returned a well-formed, confident answer computed from the
wrong subject, and that answer was indistinguishable from a true one. Two others
found today are the same shape — `whatWasKnown()` reporting a question `open` in a
month before it was posed, and `reproducibilityOf()` reporting that an analysis
nobody ever created reproduces. **None of the three would have been caught by this
session's sweep**, because all three code paths do exactly what their comments say.
All three were found by someone noticing an answer was wrong. Not written up: three
instances argued from is the bar PJ-027 sets for *not* generalising yet, and a
fourth should earn it.

## Next

**This entry is closed here.** Row F, the sweep, its fixes and its first verified
item are one arc and it is finished; the inferred pile is open-ended work that
belongs in its own entry. Re-baselined with `close-entry.sh`, so the next fire
opens **008**.

Next item: **`evaluateCriterion`**, the strongest remaining candidate. Its own
comment argues a malformed evaluation "sits in the graph as durable nonsense"
because `gateStatus()` traverses from `GOVERNS` — then it writes a node and three
edges untransacted. Under the rule above the question is whether that partial
state is *reachable*; `sharpen`'s was not, and this one's comment claims it is.
Demonstrate before touching it, and stop if it comes back clean.

Read `sweep-report.md` in this session's scratchpad first — it labels every item
demonstrated or inferred, and the inferred ones are inferred on purpose. Six
readers looking for one shape find that shape and are silent about others, so
treat the list as a lead sheet, not an inventory. One of one examined so far was
not a defect.

If the flake appears again, **capture the full run before doing anything else** —
`bun test > some.log 2>&1`, never through a pipe. The open question is whether the
failures carry the teardown signature (`graph "labkit_t1" does not exist`,
`Connection terminated`) or are genuine assertion failures; if the latter,
contention is the wrong story and CLAUDE.md's account needs revisiting. One
captured signature settles it and nothing else will.

Nothing else is outstanding on either branch. The ledger is unchanged: **AF is the
only open row**, unowned, and earns nothing under §5 by its own cell.
