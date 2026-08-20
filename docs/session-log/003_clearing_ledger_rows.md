# 003: clearing ledger rows — S-3c (row X), S-10 (row E), and a third review

**Session wrap, 2026-08-20, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/` 018 (S-3c), 019 (S-10) and 020 (the review), and
PJ-008 §3 rows E, P, X and AB for the ledger.

Renamed twice as the session outgrew its title; the slug is now generic so a
further scenario would not need a third rename.

## Goal

Prepare an external-review handoff, act on the review that came back, then build
the scenarios that would move the ledger — row X's discriminator first, then a
corpus scenario owning an open row. A second, unplanned review arrived at the
end and was acted on in full.

*Met.* One correction to how the second build was justified: S-10 was described
in `e1665bf` and in an earlier draft of this entry as "the **only** unbuilt
corpus scenario that solely owns an open row". It was not — row F is solely
owned by S-9, equally unbuilt, then and now. The real grounds were the other two
given at the time: S-10 is **mined**, following two consecutive authored
scenarios, and it exercises the support machinery S-3c had just changed.

## Changed

Two scenarios built, two ledger rows cleared, one AGE bug found, one review
acted on in full, three journal entries written. Every compound domain verb is
now atomic, each earned by its own negative test.

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
- `45ec5fa`, `7e36b31`, `f6ca9cc`, `0740eea`, `21dc34d`, `248b3f5`, and this
  file's own commit — wrap bookkeeping.

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

Run at `116a719`:

- `bun test` — **168 pass, 0 fail**, 543 expect() calls, 17 files. Was 145/15 at
  session start. (Exit code ignored, per CLAUDE.md.)
- `bun run typecheck` — clean.
- `npx depcruise src tests --output-type err` — **0 errors**, 2 `no-orphans`
  warnings on the empty CLI stubs.
- `bun examples/full-lifecycle.ts` — ends `closed connection cleanly`, no raw
  graphids.
- `bun run dev:dependency-cruiser` — regenerates to a byte-identical graph.

**Four deletion verifications**, each removing the thing and watching the wrong
answer return: S-3c's narrowing, S-10's `REVERIFIES` write, and `inTransaction()`
twice — once for the two verbs a scenario can reach, once for the two it cannot.
S-3c's was also run in the *opposite* direction — widening
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
- **The noun inventory has not moved in twelve scenarios.** PJ-018, PJ-019 and
  PJ-020 all close on this and none can answer it.
- **Ledger:** no row is a live defect shipping green. `open` + unowned: O, S, T,
  Z. `open` with an unbuilt owner: F, J, K, P.

## Next

**S-9, "the artefact survived; its provenance didn't."** It solely owns rows F
and P, and P's cell says explicitly that S-9 is the scenario that has to produce
that wrong answer or leave the row where it is — S-10 was predicted to fire P
and did not.

Open `docs/project-journal/008_user_story_mining.md` at `### S-9 —`. Its stated
expressibility route is content-hash equality plus an open question, and it
deliberately does not ask for a recovered-artefact type: if the general entities
cannot carry it, that is the finding. Commit predictions before building, as
`3023cb1` and `e1665bf` did — that discipline is why this session's wrong
predictions are legible rather than invisible.

Two things to carry in: PJ-019 notes that nothing yet distinguishes "re-verify a
finding" from "re-run an analysis wholesale", and S-9 regenerating an artefact
is close to that. And per PJ-020, ask of every step **"what does this look like
halfway through?"** and **"what if the second half fails?"** — the questions the
happy-path conversation cannot ask.

Remaining corpus after S-9: S-2, S-13, S-14.
