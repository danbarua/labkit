# PJ-013: What happened when two AIs iterated on a domain model

**Read-only sweep. Covers `5003eea..51b70d6` (27 commits), branch
`spike/drizzle-age`, working tree clean at time of review. Nothing was
modified.**

> **Superseded in part — read with a date in mind.** All five improvement items
> in §3 were acted on: §3.1 by PJ-014 and PJ-015, §3.2 by the ledger
> restructure, §3.3 by CLAUDE.md's deferral rule, §3.4 by the restated trigger
> in `src/domain/events.ts`, §3.5 by the `scenario.current()` backfill — whose
> §3.5 table is therefore stale, and whose premise turned out weaker than
> stated (a second reader proves nothing a re-query does not while the session
> holds no query state; see `tests/helpers/scenario.ts`). §3.6's `incomplete`
> flag was cleared by S-8. The newer external review is **017**.

Verification basis: `bun run typecheck` clean; `npx depcruise src tests
--output-type err` reports **0 errors** (2 warnings, both orphaned CLI
stubs — the two layering rules hold). I did **not** run `bun test` — another
Claude session is live in this repo and the suite shares a PGlite temp
directory, so a run would be both intrusive and a noisy signal. Test counts
below are the ones the tip commits report themselves (132 pass, 0 fail).

---

## 1. What actually got built

Eight PJ-008 scenarios were turned into executable conversations, in this
order: **S-11 → S-17 → S-3 → S-4 → S-1 → S-7 → S-12 → S-5**.

That produced ~6,800 lines: a domain service layer (`src/domain/session.ts`,
1,715 lines, 26 verbs), a return-type module (`src/domain/report.ts`), a
temporal seam (`src/domain/events.ts`), and eight scenario test files
(~2,300 lines).

**The headline number: eight scenarios, three new edges.** In the whole arc
`src/db/domain.ts` — the graph model itself — was touched by exactly four
commits, adding `CONSUMES`, `GOVERNS`, one extra `EVALUATES` endpoint, and
two new `MOTIVATES` endpoints. **Zero new node labels. Zero migrations.**
The thirteen entity nouns from PJ-001 absorbed a real research programme's
messiness without one being added, removed or split.

The rhythm was consistent and visible in the git log:

> `docs: S-N predictions, recorded before the build`
> `feat(domain): S-N complete — <what the result actually was>`
> `fix(domain): <what the follow-up review found>`

Five of the eight scenarios have that third commit. That is the single
healthiest signal in the arc — see §3.

---

## 2. What's working well

### 2.1 Predictions written down before the build, and kept when refuted

Before each of S-7, S-12 and S-5, the agent committed a prediction table to
PJ-008 *before writing code*. These are not hedged. The S-5 one says flatly:

> PJ-008 called S-5 "the one most likely to force a real model change". The
> prediction is the opposite: **no schema change at all**.

It was right, and the ledger says so. Elsewhere it was wrong and the ledger
*also* says so — row A ("a criterion evaluation has no inconclusive
outcome") is marked refuted; row H ("closure carries no polarity") refuted;
row AB's prediction that S-7's remedy would transfer to S-12 is marked
**REFUTED** in the same cell that records the original prediction.

This is the part hardest to get an AI to do unsupervised, and it held for
27 commits without you in the loop. Refuted predictions were kept as
results rather than quietly edited into hindsight.

### 2.2 A stated evidence bar that was actually enforced against itself

The rule in CLAUDE.md is: a new relationship must be shown to produce a
**wrong answer** without it, demonstrated by running the test, not argued
from an ugly query. An **empty** result doesn't count — that's merely
unanswerable.

The agent held itself to this in the awkward direction. S-7 wired
`IMPLEMENTS` *before* demonstrating what it prevented, and rather than
leave it, went back, deleted the edge, and reconstructed the wrong answer
that returned. Row V (`whySupported()` reports `supported: true` for a
finding whose own prespecified robustness checks failed) is a *confirmed*
wrong answer that was deliberately **not fixed**, because two models both
fit and S-3 doesn't discriminate between them — "record both and pick
neither".

### 2.3 The loop closed its own loops

PJ-012 (the agent's own opinion entry, written after S-3) listed four things
to watch. Later scenarios answered three of them without being told to:

| PJ-012 watch item | Answered by |
| --- | --- |
| Does row I hold outside the gate machinery? | S-4 (claim level), S-1 (question level). Held. |
| Do the nouns survive claim identity? | **S-12 and S-5. They did** — resolved with zero schema change. |
| Does conflation keep being the failure mode? | Yes — see §2.4. |
| What does the first non-additive change cost? | Still untested. |

That second row is the strongest result in the arc. PJ-012 named claim
identity as "where an entity change would first become plausible", and the
two scenarios aimed at it resolved by *deriving* scope through edges that
already existed rather than adding anything.

### 2.4 One defect class recurs across the entire arc, and it was named

PJ-012 called it "two things treated as one". It has now appeared four
times, and it is the plain-English finding of this whole exercise:
**identity by wording.**

- `gateStatus()` keyed aggregation by proposition *text*, so two distinct
  criteria worded identically collapsed into one check (`9804de5`).
- Every read verb addressed a claim by its sentence, so two lines of
  enquiry asserting the same words about different endpoints reported one
  claim simultaneously supported and challenged — and `reinterpret()`
  silently retracted an unrelated line of work (`8aaa17c`, the S-5 core).
- `decidedOnTheStrengthOf()` was *still* keyed on wording alone **inside
  S-5's own fix** (`51b70d6`).
- `interpretationHistory()` remains keyed by wording — logged as a named
  boundary rather than fixed.

PJ-012 also drew the method claim from it that I'd underline: **a single
scenario cannot detect conflation.** It takes two consumers of one
structure wanting different things. S-17 alone never needed criterion
scope; S-3 alone never noticed it was missing; the pair caught it in one
assertion. That argues scenario *overlap* is worth more than scenario
*coverage*, which is not the obvious way to plan this work.

### 2.5 Self-review that finds real things

The `fix(...)` commits are not tidy-ups. A sample of what post-completion
review caught, each demonstrated before being fixed:

- `closeEnquiry()` accepted an analysis from a **different enquiry** and
  cited its findings as the basis for resolving this question.
- `evaluateCriterion()` accepted a gate the criterion didn't govern —
  durable nonsense in the graph with no visibly wrong report.
- Amending an already-amended setting **forked the design**, and
  `designHistory()` then threw on read.
- `Artefact.invalidated` had two spellings (absent vs explicit `false`) and
  two branches of `whySupported()` disagreed on which counted — the two
  layers already disagreed in their own fixtures.
- Recording an analysis that concluded a withdrawn proposition made the
  withdrawal **flip back to false**: the record un-retracted itself while
  the reviewer's objection still stood.

Each fix commit reports its test count, and several state the guard was
"verified by deletion" — i.e. they proved the new test fails without the
fix. That's the project's own bar applied to its own patches.

### 2.6 Structural discipline that held under no supervision

- Scenario tests are **mechanically barred** from importing `src/db`
  (dependency-cruiser error, still 0 violations after eight scenarios).
- Verbs are verb-first: no `createClaim()` / `createEvidence()` anywhere.
- A composite verb records **one** event, not one per step.
- When the model was undecided, the agent **removed** speculative API
  rather than leaving it (a verb written to probe row V was deleted).
- Commands that would produce unreadable state **refuse** rather than
  guess — S-7's principle, then reused in S-12 and S-5. Ambiguous claim
  text is rejected with a count, not resolved to whichever came first.

---

## 3. What could be improved before work picks up again

### 3.1 The journal chain stalled at PJ-012 — this is the biggest one

Entries run 001→012. **Five scenarios have been built since 012** (S-4,
S-1, S-7, S-12, S-5) and none has a journal entry. Their record lives in two
places: cells of PJ-008's §3 ledger, and commit messages.

Two problems follow:

- CLAUDE.md tells a reader to skim the journal "newest-first for what's
  true now". The newest entry is PJ-012, which is explicitly labelled
  **opinion, not decision**, and is now partly stale — its central open
  question ("do the nouns survive claim identity?") has since been answered
  by S-5 and S-12. A cold reader is pointed at the least authoritative and
  most out-of-date document in the chain.
- The good reasoning is in commit messages, which are excellent but are the
  one artefact nobody re-reads. `8aaa17c`'s message is a better account of
  S-5 than anything in `docs/`.

**Recommendation:** before the next scenario, write one entry (PJ-013)
covering S-4 through S-5 — what resolved, what the recurring identity-by-
wording finding means, and supersede PJ-012's stale watch items.

### 3.2 Ledger cells have outgrown the table

Row N is now a single table cell containing three dated verdicts (the
original open question, "S-12: NARROWED, prediction half refuted", "S-5:
RESOLVED") plus a named untested boundary — roughly 400 words in one cell.
Row AB is similar. The append-per-scenario habit is exactly right; the
*container* has stopped fitting it. The chronology is genuinely valuable and
is currently hard to read, which raises the odds it stops being maintained.

**Recommendation:** keep the table as a one-line-per-row status index, and
move the per-scenario verdicts to a section below it.

### 3.3 The deferral stack is growing, still with no stated trigger

PJ-012 flagged this and named eight open rows. Since then N and Q resolved —
but O, W, X, Y, Z, AA, AC and more were added. Net, the stack grew. PJ-012's
own words for the failure mode are worth repeating because they still apply:

> the model stays technically undecided while the code quietly encodes one
> reading anyway.

Every individual deferral looks right to me. There is still no stated
condition under which the stack itself becomes the problem.

**Concretely:** row **V** is the only *confirmed wrong answer still shipping
green* — `whySupported()` reports `supported: true` for a finding whose own
prespecified checks failed. It's commented, tracked, and deliberately
asserted as-is, which relies on everyone continuing to remember why. The
ledger already says what would settle it: a scenario where criteria qualify
a finding but gate nothing, or the reverse. That's the strongest candidate
for what to build next.

### 3.4 The event log is an IOU that keeps growing

`src/domain/events.ts` is a real seam with an `inMemoryEventLog()` behind it
and no durable sink. Rows I, O and the whole temporal story are being routed
toward a store that doesn't exist. Each row routed there raises the bar its
eventual shape has to clear. The seam was the right call — API discipline is
the part that can't be retrofitted — but this is now three scenarios past
where PJ-009 said the first real consumer would appear.

### 3.5 The "assert twice" discipline strengthened silently rather than uniformly

CLAUDE.md's rule — every Afterward answer asserted once from the return
value and once from a query afterwards — was written at PJ-009. All eight
scenarios satisfy it literally. But the *stronger* form, re-reading through
`scenario.current()` (a second reader over the same graph, proving state is
durable rather than held in session memory), was adopted progressively:

| | S-11 | S-17 | S-3 | S-4 | S-1 | S-7 | S-12 | S-5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `scenario.current()` uses | 1 | 0 | 0 | 1 | 6 | 8 | 7 | 5 |

S-17, S-3 and S-4 postdate the rule and re-query through the same session
instead. Not a violation, and backfill is cheap — but the earlier four
scenarios are demonstrating something weaker than the later four, and
nothing surfaces that.

Minor related nuance: `scenario.current()` re-resolves the tenant and builds
a fresh `TenantGraph` but reuses the same connection. That's deliberate
given the pglite-socket concurrency bug, and it still proves the point that
matters (state is in the graph, not in session memory) — worth knowing
rather than worth changing.

### 3.6 One thing the agent flagged against itself, which I'd keep flagged

PJ-012: "`incomplete` is the one gate state no test forced. I reasoned it
should exist. By this project's own bar that is a weaker warrant than
everything around it, and I would not defend it as earned." Still true, still
in the code.

---

## 4. Overall read

For an unsupervised run of 27 commits between two models passing messages
through you, this held its own rules better than most supervised work does.
The three things I'd point at as genuinely unusual:

1. **Predictions committed before the build, and refutations kept.** The
   ledger records what the project got wrong at least as prominently as what
   it got right, including a prediction refuted inside the same row that
   made it.
2. **It found a defect class it wasn't looking for, then generalised it
   correctly.** Identity-by-wording appeared four times in structurally
   unrelated regions. The agent named the shape, and — importantly —
   *resisted* generalising the remedy: three instances of the act→product
   omission got three different fixes, and it explicitly recorded that as an
   argument against a blanket relationship. That restraint is rarer than the
   pattern-finding.
3. **The model didn't inflate.** Eight scenarios of a real research
   programme's messiness, and the entity inventory did not move. The
   pressure all landed on relationships, properties and query semantics.

The weakness is uniformly the same: **the record has drifted from the
narrative form a human reads to the append-only forms an agent writes** —
ledger cells and commit messages. Nothing is lost, but it's getting harder
to pick up cold, and the entry a cold reader is pointed at first is a stale
opinion piece. One consolidating journal entry before S-N+1 would fix most
of it.

**If I had to name one thing to do next:** build the scenario that
discriminates row V. It's the only known-wrong answer still green, the
ledger already specifies what would settle it, and it's the deferral most
likely to have quietly hardened into code while nobody was deciding.
