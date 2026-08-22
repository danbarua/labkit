# 029 — Two agents, one record, and the checks that came from having two

**2026-08-22.** Method, not model. Nothing in `src/` changes because of this
entry; `docs/project-journal/008` §3 stays authoritative on what the model
knows.

`025` through `028` are each about one failure of documents. This one is about
what a **second agent** turned out to be for, which was not what it was set up
for. It was set up to parallelise work. What it actually did was catch four
wrong claims, three of them mine, none of which the tests or the checkers could
see.

---

## 1. The setup, briefly

Two sessions on one repository, in separate git worktrees on separate branches,
merging into each other continuously. One (`labkit-dev`) held the read surface,
the adapters and the test harness; the other (`labkit-minion`) held a list of
twenty-eight suspected defects that six read-only review agents had *read* and
never *run*.

The split was for throughput. Throughput is the least of what it produced.

---

## 2. What a second agent is actually for

**It verifies reasoning, not verdicts.** This is the whole finding.

A reviewer that checks conclusions catches wrong conclusions. Every useful catch
this day involved a conclusion that was **right** and reasoning underneath it
that was **wrong** — which no test can detect, because the tests pass either way:

- *"The surviving `dropTenantGraph` caller targets a different graph."* It does
  not. `"drop-me"` is the first tenant resolved in that file, `tenants.id` is
  truncated with `RESTART IDENTITY`, so it gets the same `labkit_t1` as
  everything else. The conclusion — that the drop is safe — held, because
  `setupTestDb()` builds one PGlite instance per test file. **The stated reason
  would have licensed dropping `labkit_t1` from a scenario file; the real one
  forbids it.** A future reader deciding whether some other drop was safe would
  have relied on the wrong one.
- *"`closeEnquiry` inverts the recorded answer, because it writes one
  `BASED_ON` per finding."* It writes one, and the answer cannot be inverted —
  the empty case is guarded explicitly. The verdict, that there is a defect, was
  right. Acting on the prediction would have fixed the correct function while
  believing something false about why.
- *"The entire teardown vocabulary is gone."* Measured on a tree carrying two
  changes and credited to one. Two of the three signatures were still there.

None of these is a mistake a checker finds. `check:doc-comments`,
`check:tests-assert` and `check:stdout` all passed throughout.

## 3. The asymmetry, restated as a property of verification

`027` says the defect is an asymmetry: the rule gets applied where the author
happens to be looking. `028` shows four instances committed by authors who had
that written down in front of them. This day added the form that generalises
furthest, and it is about *checking* rather than *writing*:

> **A passing check on the file I edited told me nothing about the two I
> didn't.**

The wrap hook resolved its state directory from the wrong place. Three scripts
carried the identical line; one was edited; the commit message described the
fix as a property of the skill. It was tested — the hook was run and its output
read, and the output was right. **The check was real, correctly performed, and
scoped to exactly the half that had been changed.** Nothing about carelessness
explains a passing check.

That is why a second agent is worth more than a second checker. It arrives at
the file from a different direction and therefore has a different set of things
it happens to be looking at.

## 4. The measurement disciplines, and what forced each one

Each of these came from a specific failure on this day, not from principle.

**Paired and interleaved, one tree, one session.** A fix was measured against a
baseline taken hours earlier under different load; it produced one confident
wrong finding and nearly a second in the opposite direction. Interleaving
`BASE FIX BASE FIX` puts load drift on both arms.

**One variable per comparison.** An earlier attempt bundled two changes and was
refuted as a bundle, which said nothing about either half. The rerun changed one
thing.

**Round one is not the result.** The first paired round said both arms were
identical and the fix marginally faster. Round two, at the *lowest* load of the
four runs, gave eighteen failures — and had a mechanism: the change had moved a
graph drop and a truncate *inside* bun's per-test budget, trading a cascade for
more crossings, which is what causes the cascade. **Stopping at round one would
have shipped it.**

**A negative result is not evidence unless it could have been positive.** Two
instances, in unrelated subsystems, on the same day:

- Three clean suite runs were offered as confirmation of a claim about what
  happens *during* a flake. A clean run cannot test that. Three of them is three
  times not testing it.
- A probe for an arbitrary-pick defect closed an enquiry with the answer and
  *then* abandoned it. The arbitrary pick happened to choose correctly; the
  defect was invisible. Reversing the order exposed it. **A latent
  arbitrary-pick defect reproduces on one ordering and not the other**, so *"I
  tried it and it was fine"* carries almost no information.

Both were caught only by asking what the negative result would have meant.

**Predictions committed before the run, including the wrong answer you expect
to be tempted by.** `026` established the protocol. This day added: when two
sessions hold *competing* rules, commit both first, and the run discriminates
between them rather than confirming one. That is a better experiment than either
session had designed alone, and it arrived because one was reading the code
while the other was reading the rule.

**A prediction must be falsifiable against the baseline, not just against
hope.** *"A crossing should now produce roughly one failure, not a burst"* was
withdrawn: the unpatched baseline already produced roughly one-to-one, so a
post-fix run at one-to-one would have confirmed nothing. The testable form was
about the **error vocabulary** — no failure whose cause is another test's
teardown — which does not move with load. It is currently a **live
disagreement**: it held on one tree and failed on the other, and is recorded
that way rather than as a success.

## 5. Counting: per route, not per verb

The suspected-defect list was per function, so the results were counted per
function until one function turned out to carry **two independent defects with
different remedies** — an interrupted write, and a second clean call. Counting
per verb hides the second and invites stopping at the first fix in a file.

The count is worth keeping honestly because it prices the input: twenty-eight
items produced by agents *told what shape to look for*. Five routes examined,
three defects. **Establishing the base rate is worth more than clearing the
list** — it is the only thing that says what reading was worth.

## 6. Order-dependent fixes need to say so in both places

Two sessions fixed one function from different directions on the same day. Each
fix is correct. **Neither is sufficient alone, and one ordering is actively
harmful:** applied before the other, the guard would have refused the retry
after an interrupted close, permanently, converting a repairable erasure into a
question that could never be closed again.

Neither commit message would tell you that. It is only visible to someone
holding both, which on that day was a person and not a program. **Where two
changes are order-dependent, both messages have to say so** — the reader who
reverts one will be reading only that one.

## 7. What this does not claim

Two agents did not make the work faster in any way that was measured, and the
coordination cost was real: a machine shared between two suites confounded a
measurement badly enough to need re-running, and a whole exchange was spent
establishing who held which file.

The claim is narrower and, I think, more useful: **a second agent that checks
your reasoning rather than your results finds a class of error that has no
other detector in this repository.** Four instances in one day, none visible to
the tests, all in work that was green.
