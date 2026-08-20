# 003: clearing ledger rows — S-3c, S-10, S-9, S-14, S-18, and two reviews

**Session wrap, 2026-08-20, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/` 018 (S-3c), 019 (S-10), 020 (the third review), 021
(S-9), 022 (S-14) and 023 (S-18), and PJ-008 §3 rows E, F, J, K, P, R, X, Y and
AB for the ledger.

Renamed twice as the session outgrew its title; the slug is now generic so a
further scenario would not need a third rename.

**Scope warning: the range is wider than the session.** Baseline is pinned at
`b3d6f33` and never moves, so `b3d6f33..HEAD` interleaves two sessions —
`002_cold_context_reviews.md` ran either side of this one, and its commits are
in the window at both ends.

> **This session's commits are `45ec5fa`..`dba40f2`.** Anything in the window
> outside that range belongs to 002. Read 002 for that work; this entry does
> not restate it.

Stated as *this* session's boundaries rather than as a list of theirs, which is
the third and last form this warning took. A total was wrong the moment the file
was committed; a list of foreign shas was wrong the moment the other session
committed again. Own boundaries are fixed once a session stops committing, and
that is the only version of this fact that stays true. (`collect.sh` prints its
own warning too, and since `4692559` says "at least these commits" — it inspects
only commits touching `docs/session-log/`, so a peer's code-only commits are
invisible to it. `e386027` and `4692559` are two such.)

## Goal

Prepare an external-review handoff, act on the review that came back, then build
the scenarios that would move the ledger — row X's discriminator first, then a
corpus scenario owning an open row. An unplanned review arrived mid-way and was
acted on in full; S-9, S-14 and finally S-18 followed, and with S-18 **the
Bonsai corpus is exhausted**.

*Met.* One correction to how the second build was justified: S-10 was described
in `e1665bf` and in an earlier draft of this entry as "the **only** unbuilt
corpus scenario that solely owns an open row". It was not — row F is solely
owned by S-9, equally unbuilt, then and now. The real grounds were the other two
given at the time: S-10 is **mined**, following two consecutive authored
scenarios, and it exercises the support machinery S-3c had just changed.

## Changed

Five scenarios built (S-3c, S-10, S-9, S-14, S-18), five ledger rows cleared
(X, E, P, J, K), one half-settled (F) and one half-settled + swept (Y), one AGE
bug found, two reviews acted on in full, six journal entries written.
Every compound domain verb is now atomic, each earned by its own negative test.

*No commit count or total diffstat here, deliberately.* Both go stale the moment
this file is committed, and the Stop hook then re-fires on the commit that fixed
them. `git log b3d6f33..` is authoritative. **Which** commit did what is
durable; how many there were is not.

- `d6a34c8` — another session's rewrite of `docs/session-log/002`. Input, not
  authored here.
- `d9e1180` — PJ-008 §3 made scannable: unbuilt owners marked `°`, the legend
  states the `open + owned` / `open + unowned` / `boundary` split, row X gains
  the **S-3c** brief from the first review.
- `3023cb1`, `ced0388`, `b0ed208`, `a20b9a1` — **S-3c**: predictions, build, the
  AGE column-name fix, then PJ-018 and the ledger.
- `e1665bf`, `dd5c683`, `3b12e61`, `29a58ab` — **S-10**: predictions, build,
  ledger, PJ-019.
- `e2fa5ff`, `2b6c80d`, `116a719` — **the third review**: seven fixes, PJ-020,
  then the remaining two compound verbs made atomic on their own evidence.
- `2f937bf`, `b55ff09`, `a987a68` — **S-9**: predictions, build, PJ-021 and the
  ledger. Row P **resolved** against two consecutive predictions that it would
  not move; `content_hash` gained its first reader since PJ-004.
- `2656bd1`, `e09ccfa`, `5d65065` — **the fourth review, on S-9, in two
  passes.** Six findings across both, all verified before acting, all correct.
  First pass: row F un-refuted and returned to `open`; `notRebuilt` added to
  `reproducibilityOf()`; the corpus-exhaustion claim withdrawn. Second pass
  (two reviewers, independently, on the same three items): the row F boundary
  test was removed for pinning the public handle shape rather than the absence
  it claimed; the withdrawn corpus claim was still standing in this entry's own
  *Open* section; and two comments still said "three outcomes" after a fourth
  was added. See errors 10–14 below — the reason this session ends with more
  recorded mistakes than it started with is that later reviews found what
  earlier ones missed, including in the corrections themselves.
- `177549f` — **the Stop hook no longer fires for the wrap's own commit.** It
  used to ask whether a commit whose entire content is the write-up had been
  written up — a category error, yes by construction, and a full agent turn
  each time to say so. Narrow on purpose: a wrap commit that also carries real
  work still fires. Fixed a second defect in the same place, which is why the
  hook's message read oddly all session: "N commit(s) ... have not been written
  up" was false whenever the entry already covered them. Tested across five
  cases in a scratch repo; `bash -n` caught an apostrophe that would have
  broken the hook at runtime.
- `a7c5a73` — **the `wrap` skill now commits its own entry**, stages by
  explicit path, and refuses an empty commit. The old rule handed `git
  add`/`git commit` to the user to avoid interleaving doc commits into work in
  progress; the entry got committed a round-trip later anyway, so the
  interleaving happened regardless and the handoff only added a message someone
  had to act on. The concurrency rules it now carries are both drawn from this
  session's own mistakes.
- `28d4ca5` — **a bug in the `wrap` skill's own `collect.sh`**, reported by a
  peer session that copied the skill into a two-commit repo and hit it on the
  first run. `git rev-parse <root-sha>^` prints the unparseable ref to *stdout*
  before failing, so `2>/dev/null` does not suppress it and the `||` fallback
  leaves `$baseline` two lines long, breaking every downstream `git log/diff`.
  `--verify` fixes it. Reproduced in a scratch root-commit repo before applying.
  Unreachable from labkit's own Stop hook, which always passes a state file.
- `387e056`, `7f7d2a3`, `d017ea4` — **S-14**: predictions, build, PJ-022 and the
  ledger. Row J **resolved** with no new structure, and the last unwalked edge
  walked.
- `17ca909`, `a449392`, `4c4d417` — **S-18**: predictions, build, PJ-023 and the
  ledger. Row **K resolved**, row **R**'s successor question answered. One new
  edge, `PROMOTES`, earned by refuting the prediction that `CHANGES` would serve
  — `withdrawalOf()` reads any `Decision -CHANGES-> Claim` as a retraction, so
  promoting a finding made it report `withdrawn: true`. Promotion retracted the
  thing it promoted. The other prediction, that standing would become *conferred*
  rather than declared, is **half refuted**: both paths stand, separated by
  whether the standing was knowable in advance.
- `2de3e2b` — row Y's stale `°` cleared and S-14's owed verdict written. See
  error 16.
- `cc68056` — **row F's missing verdict**, the one open item in the other
  session's PJ-024. Row F's narrative was five lines with no verdict at all,
  while S-9 was built against it, refuted it, and a review reopened it the same
  day; and the S-9 outcomes prose still read "row F is refuted" with nothing
  adjacent, so a reader following the index hit a refutation against a status of
  `open`. Now dated, split into the identity half S-9 settled and the direction
  half it did not, with the discriminator named as the deferral rule requires.
  The original prose stays verbatim under a superseded-note. Same class as row
  Y, and again found by someone else reading cold.
- `45ec5fa`, `7e36b31`, `f6ca9cc`, `0740eea`, `21dc34d`, `248b3f5`, `b7e473f`,
  `191f7e0`, `c2d9828`, `f6ec763`, `c6fedb0`, `701d868`, `4988938`, `0dd0d2d`
  (the user's dependency-graph regeneration), and this file's own commit —
  bookkeeping.

Source: `src/domain/session.ts`, `src/domain/report.ts`, `src/db/domain.ts` (the
`REVERIFIES` and `PROMOTES` edges), `src/db/graph.ts` (`inTransaction`),
`src/db/agtype.ts` (the column-name guard). Three new scenario files, one
existing scenario fixture changed (S-1 — see below), plus three tests added to
`tests/domain-session.test.ts` — the right home for an invariant no researcher
would ask about.

**S-18 was the first build to change an existing scenario.** Narrowing
`whatIsKnown().established` to require a promoted finding broke S-1, which was
the only place in the corpus asserting `established` positively and did so on the
free default. Its fixture now declares `standing: "confirmatory"` at creation,
which is what its prespecified prior work is. Not a notation change: until S-18
`established` could be told apart by nothing at all.

**One file landed that was not this session's work.** `docs/dependency-graph.svg`
was already modified in the working tree when the session began, and a `git
add -A` swept it into `e2fa5ff`, whose message does not mention it. Verified
after the fact by regenerating: it matches current output, so what is committed
is correct — but it was not reviewed before being committed, and the sweep is
the same mistake made earlier in this session with another session's journal
entry.

## Verified

Run at `a449392`, after S-18:

- `bun test` — **188 pass, 0 fail**, 611 expect() calls, 20 files. Was 145/15 at
  session start. (Exit code ignored, per CLAUDE.md.)
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — **0 errors**, 2 `no-orphans`
  warnings on the empty CLI stubs.

The wrap tooling was verified separately, in a scratch repo rather than this
one: `collect.sh` against a single-root-commit repo, and `wrap-hook.sh` across
five fire/silence cases. `bun test` does not cover it.

- `bun examples/full-lifecycle.ts` — ends `closed connection cleanly`, no raw
  graphids (last run at `2b6c80d`).
- `bun run dev:dependency-cruiser` — regenerated to a byte-identical graph at
  `2b6c80d`; not re-run since, and neither S-9, S-14 nor S-18 added a module.

**Ten deletion verifications**, each removing the thing and watching the wrong
answer return: S-3c's narrowing, S-10's `REVERIFIES` write, and `inTransaction()`
twice — once for the two verbs a scenario can reach, once for the two it cannot.
S-9's two fixes separately — removing the consumer traversal fails three
assertions, removing the name refusal fails one — S-14's two, where removing the
`DEFERS` write fails four and restoring the old `open: false` fails one, and
S-18's two: removing the `established`/`provisional` discriminator puts a
lunchtime notebook sweep back into `established`, and swapping `PROMOTES` back to
`CHANGES` reports the promoted finding withdrawn. Both S-18 restores were
diffed byte-identical against a pre-change copy.

S-3c's was also run in the *opposite* direction — widening the rule to "the last
verdict wins" fails S-3's own two tests, which is what distinguishes a narrowing
from a removal. S-18's widening direction is covered by two passing tests rather
than a manual run: Afterward 2 (promoted) and S-1 (declared) both still reach
`established`.

**The AGE findings were measured, not reasoned.** Six `OPTIONAL MATCH` shapes
probed directly; all six bind. The failing shape is a camelCase `RETURN` name,
which silently returns the column present and `NULL`.

## Open

**Self-inflicted errors, all found and fixed, all worth knowing:**

1. *A wrong diagnosis committed as fact.* `ced0388` shipped a docstring claiming
   AGE cannot bind a two-hop `OPTIONAL MATCH`, with a query restructured around
   it. The real cause was a camelCase column name; the same file's other query
   disproved the general claim. `b0ed208` refuses such names at the seam — and
   on its first run that guard found a live pre-existing instance,
   `enquiryStatus()`'s `forClaim`, decoding as null since it was written.
2. *An unqualified string replace in `d9e1180`* rewrote a **shared** blockquote,
   making rows O, T, Z and AA all claim S-3c owned them. Restored in `a20b9a1`,
   diffed against the pre-edit file. Several PJ-008 rows share verbatim text —
   scope any replace to the row's own section.
3. *An unchecked "only".* See Goal.
4. *A `git add -A` sweeping a pre-existing working-tree change.* See Changed.
   This is the second occurrence in this session's lineage; `git add <paths>` is
   the cheap fix.
5. *The wrong bar applied to a non-model change.* `reinterpret()` and
   `amendDesign()` were left non-atomic on the grounds that nothing had
   demonstrated harm — but that bar governs new labels and edges, not service-
   layer invariants, and no scenario could ever have reached the harm because
   "does this roll back?" is not a researcher's question. Corrected in
   `116a719`. Two tests, both harms demonstrated first.
6. *A guess about where a compound verb hurts, wrong.* For `reinterpret()` the
   obvious failure point leaves both sentences standing (the S-5/S-12 duplicate
   state) and changes no reader's answer. The damage is one write later:
   original withdrawn, evidence not yet carried across. Found by probing each
   write in turn rather than by reasoning. PJ-020 carries it.
7. *A tautological assertion*, comparing `interpretationHistory` to itself, in
   the first draft of that same test.
8. *Identity-by-wording, nearly reintroduced inside the fix for it.*
   `reproducibilityOf()` first took its rebuilt hashes keyed by `logical_name`
   — one function away from the refusal being added, in the scenario about two
   artefacts sharing a name. Caught while writing the test.
9. *Two wrong assertions about the model in S-9's first draft*: that a freshly
   opened question is `unresolved` (it is `untested`, and the distinction is
   correct), and that `whatDependsOn` on an input would conflate two artefacts
   — it returned nothing at all, which is a different and worse defect.
10. **A claim contradicting a summary written in the same commit.** PJ-021
   declared the corpus exhausted — "S-2, S-13 and S-14 own nothing outstanding
   between them" — while PJ-008's ownership table, edited in that same commit,
   reads `open + owned: J, K`. S-14 owns row J; story 18 owns row K and has
   carried a promotion condition since PJ-008 was written ("if row K survives
   the build, promote this to a scenario") which fired when S-8 gave no verdict
   and had been sitting fired, unnoticed, ever since. Caught by external review.

   This one is a **different class** from the eight above it, and worse. Those
   were claims made without checking; this was a claim contradicting evidence
   this same session had just written down two sections away. The ledger is the
   authority precisely so prose cannot drift from it — and the prose drifted
   anyway, in the same breath. **The check that would have caught it is
   mechanical: before asserting anything about what is or is not outstanding,
   read the ownership table, not your memory of it.**
11. *A durable property asserted that the code does not have.* PJ-021 argued row
   F needed no lineage edge because "direction is in the act". There is no such
   act — the regenerated artefact is written by an ordinary
   `recordObservations()` naming nothing historical. Row F is back to `open`,
   with the gap recorded in PJ-021 and the ledger — but **the ledger narrative
   itself did not get the correction for four commits**, and the S-9 outcomes
   prose went on saying "refuted" beside a status of `open`. PJ-024 §5 found it;
   fixed in `cc68056`. Withdrawing a claim means finding every place it was made
   is error 13's lesson, and this is its third instance in one session.
12. *Absence-vs-difference, missed inside the function written to respect it.*
   `reproducibilityOf()` reported a part the caller had not rebuilt as
   `differing`. New `notRebuilt` state.
13. **Error 10, committed a second time in the same file.** The corpus-exhaustion
   claim was corrected in PJ-021 and in this entry's *Next* — and left standing
   in this entry's *Open*, where a cold reader would hit it first. Withdrawing
   a claim means finding every place it was made, and "I fixed that" is not the
   same as having checked. Caught by the fourth review's second pass, not by me.
14. *A boundary test that pinned nothing.* The row F test ended with
   `expect(Object.keys(regenerated)).toEqual(["kind", "id"])`, commented as
   "what changes when lineage is earned". It would not have: an
   `Artefact -> Artefact` edge could be added and the opaque handle stay
   `{ kind, id }`. A confident claim about coverage the test did not have.
   Removed; the limitation lives in PJ-021 and the ledger, where a limitation
   belongs.
15. **Error 2, a third time, and in code rather than prose.** An unqualified
   replace of `OPTIONAL MATCH (d:Decision)-[:CHANGES]->(c)` during S-18 hit
   `designHistory()` as well as the intended query, breaking all six S-7 tests.
   Fixed by restoring that one site. The pattern is now clear enough to state as
   a rule: **Cypher fragments and PJ-008 row text are the two places in this
   repo where the same string legitimately appears more than once.** Never
   `replace_all` in either; include enough enclosing context that the match is
   provably unique, and let the edit tool refuse the ambiguous case. An LSP
   rename would not have helped — these are string literals and prose, not
   symbols, and the tool available here is read-only anyway.
16. *A stale `°` left in the table whose own legend forbids it.* Row Y still
   carried `S-14°` two builds after S-14 was built, and its S-14 verdict was
   never written. The legend says to clear the marker "everywhere in this table"
   when a scenario is built, and to update the Rows-today column in the same
   change — derived state that "goes stale silently", in its own words. Swept in
   `2de3e2b`, along with the owed verdict: S-14 settled the *accepted* half of
   row Y and the *abandoned* half is still a boundary.
17. *Non-ASCII silently dropped from two commit messages.* `§4` reached
   `a449392` and `4c4d417` as bare `4` — the `§` was eaten writing the message
   through a shell heredoc. Not worth rewriting history for, but keep commit
   messages ASCII on that path.

**One datum handed to the other session, not acted on here.** They asked what
`collect.sh` shows against an entry numbered 003, and whether compaction issues
a new session id. It does not: this session was auto-compacted once on context
exhaustion and manually `/compact`ed once, and the session id, state file path
and file contents survived both untouched. Their `SessionStart` inheritance
branch is therefore unreachable for auto-compaction as well as the manual case
they had already disproved. Their fix is theirs to make; nothing changed here.

**What the third review exposed about the method**, and the most portable thing
here: the scenario discipline is structurally poor at states that exist only
*between* two steps, and at failures occurring *during* a compound action. Both
of that review's most serious findings were of that kind, and neither was
reachable from a conversation that runs to completion. PJ-020 §"What this says
about the method" carries it.

**What S-18 exposed about the method**, and it is the same shape one level up: a
promotion condition recorded in PJ-008 §4 fired at S-8 and sat fired, unnoticed,
through three external reviews. The ledger's machinery is built to make *state*
scannable; nothing made a *condition becoming due* scannable. A rule nobody
re-reads is not a mechanism. PJ-023 carries it.

**Genuinely open, not fixed:**

- **Who may declare a check defective** (S-3c). "The check was defective" is now
  a lever that clears a failure. It requires a recorded `Review` and a
  replacement, so there is a trail; whether that suffices is an authority
  question, and there is no actor model by decision.
- **The authored-versus-mined precedent.** S-3c is the second authored scenario;
  S-10, S-9, S-14 and S-18 are all mined, and S-18 was promoted by the corpus's
  own recorded condition rather than authored at all. PJ-016's argument took no
  further weight this session.
- **Row P's structural anomaly survives its own row.** `recordObservations()`
  still creates `Evidence` with no producing `EvidenceUnit`, which PJ-001 calls
  impossible, and `whySupported()` still cannot count an observation as support.
  Three scenarios have been pointed at it; each found a reader's defect, not a
  structural one. Recorded as fact now rather than carried as a prediction.
- **Ledger:** no row is a live defect shipping green. **No row names an unbuilt
  owner** — K was the last, and it was built as S-18. `open` + unowned: **F**, O,
  S, T, Z. `boundary`: Y (accepted half settled by S-14), AA. Row F joined the
  unowned set when S-9 settled artefact identity but not reconstruction
  direction.
- **The no-cull policy now protects nothing, and that is the result.** As of
  S-18 every `EDGE_SCHEMA` label has a writer and a reader, and every node label
  is created by a verb — `DEFERS` was the last unwalked edge, and `PROMOTES`
  arrived with both together. When S-14 finally entered the `DEFERS` branch it
  was wrong twice over (`open: false` for a question deliberately left open,
  under a token naming a state nothing could write). Neither was findable by
  inspection. Keep the policy for what it catches next; it has now paid out
  twice.

## Next

Left for the peer session to decide, not changed here: when today's earliest
commit *is* the root, `collect.sh` falls back to the root itself, so
`$baseline..HEAD` excludes it and a young repo's first wrap misses its first
commit. Pre-existing intent, not introduced by the `--verify` fix, and fixing
it means deciding what "everything since the beginning" should mean.

**The Bonsai corpus is frozen — checkable, not asserted.** PJ-008's ownership
table shows no row with an unbuilt owner; S-2 and S-13 own nothing outstanding
and were never built. Fifteen scenario files: twelve of the fourteen promoted in
PJ-008, plus S-3b and S-3c as authored discriminators, plus S-18 promoted from
§4. No freeze *act* is needed and none was taken — the ledger is the record.
(PJ-021 got this claim wrong once while its own table said otherwise; verify it
the same way rather than from this sentence.)

**The next step is a real consumer above the domain layer**, done contract-first,
and it is a new phase rather than a continuation — it needs cold-context agents
the user has not launched. Recorded here so it is not re-derived:

1. Cold-context agents design the researcher-facing read surface from the
   research questions and journals, **without** being shown the graph ontology.
2. Then the thinnest read-only MCP/CLI adapter that answers those questions.

That applies a kind of pressure no scenario does — discoverability, navigation,
summaries, "where am I and what can happen next" — and is far likelier to expose
a missing noun (`Actor`, programme boundaries, projections, authority, stable
references) than another Bonsai-shaped scenario. Five consecutive builds have
pressed only on relationships, query semantics and identity, and the noun
inventory has not moved in fifteen. The adversarial PJ-001 review runs
*alongside*, not instead: a reviewer can propose ten alternative ontologies, and
the consumer is what makes one of those disagreements consequential. A second
mined corpus — from a real research programme, not authored to attack the model
— comes third.

Two standing questions to carry into whatever comes next. PJ-019: nothing
distinguishes "re-verify a finding" from "re-run an analysis wholesale". PJ-020:
ask of every step **"what does this look like halfway through?"** and **"what if
the second half fails?"** — the questions a happy-path conversation cannot ask,
and the source of that review's two most serious findings.

And one from S-18, which is about this document rather than the model: when a
build records a condition for a *future* build, the condition needs a home
somewhere it will be read. Prose in §4 was not one.
