# 003: clearing ledger rows — S-3c, S-10, S-9, and a third review

**Session wrap, 2026-08-20, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/` 018 (S-3c), 019 (S-10), 020 (the review) and 021
(S-9), and PJ-008 §3 rows E, F, P, X and AB for the ledger.

Renamed twice as the session outgrew its title; the slug is now generic so a
further scenario would not need a third rename.

## Goal

Prepare an external-review handoff, act on the review that came back, then build
the scenarios that would move the ledger — row X's discriminator first, then a
corpus scenario owning an open row. An unplanned review arrived mid-way and was
acted on in full; S-9 followed, and with it the last mined scenario that owned
an open row outright.

*Met.* One correction to how the second build was justified: S-10 was described
in `e1665bf` and in an earlier draft of this entry as "the **only** unbuilt
corpus scenario that solely owns an open row". It was not — row F is solely
owned by S-9, equally unbuilt, then and now. The real grounds were the other two
given at the time: S-10 is **mined**, following two consecutive authored
scenarios, and it exercises the support machinery S-3c had just changed.

## Changed

Three scenarios built (S-3c, S-10, S-9), three ledger rows cleared (X, E, P) and
one half-settled (F), one AGE bug found, **two** reviews acted on in full, four
journal entries written.
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
- `2656bd1`, `e09ccfa` — **the fourth review, on S-9.** Three findings, all
  verified before acting, all correct. Row F un-refuted and returned to `open`
  with a boundary test; `notRebuilt` added to `reproducibilityOf()`; the
  corpus-exhaustion claim withdrawn. See errors 10–12 below — the reason this
  session ends with more recorded mistakes than it started with is that the
  last review found the ones the first three missed.
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
- `45ec5fa`, `7e36b31`, `f6ca9cc`, `0740eea`, `21dc34d`, `248b3f5`, `b7e473f`,
  `191f7e0`, `c2d9828`, `f6ec763`, `c6fedb0`, and this file's own commit — wrap
  bookkeeping.

Source: `src/domain/session.ts`, `src/domain/report.ts`, `src/db/domain.ts` (the
`REVERIFIES` edge), `src/db/graph.ts` (`inTransaction`), `src/db/agtype.ts` (the
column-name guard). Two new scenario files, plus three tests added to
`tests/domain-session.test.ts` — the right home for an invariant no researcher
would ask about.

**One file landed that was not this session's work.** `docs/dependency-graph.svg`
was already modified in the working tree when the session began, and a `git
add -A` swept it into `e2fa5ff`, whose message does not mention it. Verified
after the fact by regenerating: it matches current output, so what is committed
is correct — but it was not reviewed before being committed, and the sweep is
the same mistake made earlier in this session with another session's journal
entry.

## Verified

Run at `1172e9c` plus the fourth review's second pass:

- `bun test` — **176 pass, 0 fail**, 568 expect() calls, 18 files. Was 145/15 at
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
  `2b6c80d`; not re-run since, and S-9 added no module.

**Six deletion verifications**, each removing the thing and watching the wrong
answer return: S-3c's narrowing, S-10's `REVERIFIES` write, and `inTransaction()`
twice — once for the two verbs a scenario can reach, once for the two it cannot.
and S-9's two fixes separately — removing the consumer traversal fails three
assertions, removing the name refusal fails one. S-3c's was also run in the
*opposite* direction — widening
the rule to "the last verdict wins" fails S-3's own two tests, which is what
distinguishes a narrowing from a removal. Worth repeating if either is revisited.

**The AGE findings were measured, not reasoned.** Six `OPTIONAL MATCH` shapes
probed directly; all six bind. The failing shape is a camelCase `RETURN` name,
which silently returns the column present and `NULL`.

## Open

**Four self-inflicted errors, all found and fixed, all worth knowing:**

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
   with a boundary test making the gap durable.
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

**What the third review exposed about the method**, and the most portable thing
here: the scenario discipline is structurally poor at states that exist only
*between* two steps, and at failures occurring *during* a compound action. Both
of that review's most serious findings were of that kind, and neither was
reachable from a conversation that runs to completion. PJ-020 §"What this says
about the method" carries it.

**Genuinely open, not fixed:**

- **Who may declare a check defective** (S-3c). "The check was defective" is now
  a lever that clears a failure. It requires a recorded `Review` and a
  replacement, so there is a trail; whether that suffices is an authority
  question, and there is no actor model by decision.
- **The authored-versus-mined precedent.** S-3c is the second authored scenario.
  S-10 being mined takes pressure off; PJ-016's argument is load-bearing twice.
- **Where the next kind of pressure comes from.** Thirteen scenarios, zero new
  node labels; five consecutive have pressed only on relationships, query
  semantics and identity. That is a real signal — but it is *not* the claim
  this entry made first, which was that the corpus was exhausted. It is not:
  **S-14 owns row J and story 18 owns row K**, and both are scheduled (see
  Next). What is true is that after those two, more of this corpus is unlikely
  to move the noun inventory, and the leading candidate for different pressure
  is a real consumer above the domain layer. PJ-021 carries the argument.
- **Row P's structural anomaly survives its own row.** `recordObservations()`
  still creates `Evidence` with no producing `EvidenceUnit`, which PJ-001 calls
  impossible, and `whySupported()` still cannot count an observation as support.
  Three scenarios have been pointed at it; each found a reader's defect, not a
  structural one. Recorded as fact now rather than carried as a prediction.
- **Ledger:** no row is a live defect shipping green. `open` + unowned: **F**,
  O, S, T, Z. `open` with an unbuilt owner: J (owned by **S-14, a corpus
  scenario**) and K (owned by **story 18**, whose promotion condition has
  fired). Row F joined the unowned set when S-9 settled artefact identity but
  not reconstruction direction.

## Next

Left for the peer session to decide, not changed here: when today's earliest
commit *is* the root, `collect.sh` falls back to the root itself, so
`$baseline..HEAD` excludes it and a young repo's first wrap misses its first
commit. Pre-existing intent, not introduced by the `--verify` fix, and fixing
it means deciding what "everything since the beginning" should mean.

**S-14, then story 18, then freeze the corpus.** Set by external review after
this entry first claimed, wrongly, that the corpus was exhausted.

1. **S-14 — "deliberately leaving something unresolved."** It genuinely owns row
   J (deferred versus accepted-as-unresolved), which is also the only row whose
   `DEFERS` edge has a reader and no writer, making `closure: "deferred"` an
   unreachable branch today. One constraint from the review to carry in: it
   should **not** derive scientific standing from the presence of a `Task`.
2. **Promote story 18 — "scratch work that unexpectedly matters."** PJ-008 §4
   has carried its promotion condition from the start — *"if row K survives the
   build, promote this to a scenario"* — and row K survived S-8. The condition
   fired and nobody noticed. It owns row K: scratch → citable standing.
3. **Then freeze this corpus.** S-2 and S-13 own nothing outstanding. S-13 in
   particular revisits machinery that has already moved.

Open `docs/project-journal/008_user_story_mining.md` at `### S-14 —`, and commit
predictions before building, as every build this session did — that discipline
is why this session's wrong predictions are legible rather than invisible.

**After the corpus freeze**, the review's direction, recorded here so it is not
re-derived: a **real consumer above the domain layer**, done contract-first —
cold-context agents design the researcher-facing read surface from the research
questions and journals *without* being shown the graph ontology, then the
thinnest read-only MCP/CLI adapter that answers those questions. That applies a
kind of pressure no scenario does — discoverability, navigation, summaries,
"where am I and what can happen next" — and is far likelier to expose a missing
noun (`Actor`, programme boundaries, projections, authority, stable references)
than another Bonsai-shaped scenario. The adversarial PJ-001 review runs
*alongside* it, not instead: a reviewer can propose ten alternative ontologies,
and the consumer is what makes one of those disagreements consequential. A second
mined corpus — from a real research programme, not authored to attack the model
— comes third.

Two standing questions to carry into whatever comes next. PJ-019: nothing
distinguishes "re-verify a finding" from "re-run an analysis wholesale". PJ-020:
ask of every step **"what does this look like halfway through?"** and **"what if
the second half fails?"** — the questions a happy-path conversation cannot ask,
and the source of that review's two most serious findings.
