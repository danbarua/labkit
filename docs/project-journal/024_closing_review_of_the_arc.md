# PJ-024: Closing review of the domain-discovery arc, PJ-008 → PJ-023

**Status: external read-only review (2026-08-20), on `spike/drizzle-age`,
written by a different reviewer than the implementing agent. Not a decision —
nothing here was agreed, and §5 records one defect the arc should close.**

**Read-only sweep of `b3d6f33..e89e80c` (45 commits), branch
`spike/drizzle-age`, working tree clean. Nothing modified.** This covers
everything since PJ-017; the arc as a whole runs from `5003eea`.

**Verified independently at the tip, not read from commit messages:**

| Check | Result |
| --- | --- |
| `bun test` | **188 pass, 0 fail, 611 expect() calls**, 20 files |
| `bun run typecheck` | clean |
| `npx depcruise src tests --output-type err` | **0 errors** (2 orphan warnings, CLI stubs) |

---

## 1. The closing result

Measured across the whole arc, `5003eea` → `e89e80c`:

| | start | end |
| --- | --- | --- |
| Node labels | 13 | **13** |
| Edge labels | 19 | 24 |
| Migrations | — | **0** |
| Scenarios | 0 | 15 |

Fifteen scenarios of a real research programme's messiness, and **the noun
inventory never moved once.** Five edges were added across the entire arc —
`CONSUMES`, `GOVERNS`, `QUALIFIES`, `REVERIFIES`, `PROMOTES` — each earned by a
demonstrated wrong answer, several verified by deletion.

That is the result the exercise existed to produce, and it is the one an
up-front design exercise could not have given you: not "the model was right",
but *the model was put under fifteen independent pressures and the pressure
landed on relationships, query semantics and identity every time.*

## 2. The exhaustion claim checks out

I verified it the way PJ-023 says it should be verified — against the ownership
table, not the prose:

| Kind | Rows |
| --- | --- |
| `open` + **owned** (unbuilt discriminator named, `°`) | **none** |
| `open` + unowned (new discriminator needed) | F, O, S, T, Z |
| `boundary` (characterised on purpose) | Y, AA |
| resolved / refuted | 20 / 2 |

Fifteen built: twelve of PJ-008's fourteen, plus S-3b and S-3c authored as
discriminators, plus S-18 promoted from §4. S-2 and S-13 own nothing
outstanding. The arithmetic and the ownership marks both hold.

Note what "exhausted" honestly means here: five rows are still open. They are
open because **every named probe has been built and a new one would have to be
invented** — which is a different and much better position than five rows nobody
got to.

## 3. What improved since PJ-017

Every item from that review was acted on, and two of them turned out to matter
more than I expected:

- **`resolved (argued)`** entered the status vocabulary. Row V still carries it.
  A row cleared by argument is now scannable as weaker without reading prose.
- **The nomination-rule amendment fired and did its job.** I offered two routes
  for row X; the amendment was taken — *a row whose severity is widened by the
  change that cleared another row is nominated too, demonstrated or not*. Row X
  was then nominated under exactly that rule, demonstrated, and cleared by S-3c
  (PJ-018). The rule caught a row that the old rule would have let sit. That is
  a policy change validated end-to-end rather than adopted and forgotten.
- **The `°` marker and the three-way ownership taxonomy** were added because row
  K got misread as unowned. They make "we haven't decided" stop collapsing into
  one undifferentiated pile — the single most useful structural change to the
  ledger in the whole arc.

## 4. The best thing in the last stretch is a process finding, and it's theirs

PJ-023 §"A condition nobody re-reads is not a mechanism":

> Row K survived S-8, which gave it no verdict. So the condition **fired at
> S-8** and then sat fired, unnoticed, through three external reviews. The
> fourth reviewer found it by reading §4. … The ledger's machinery — `°`
> markers, the ownership taxonomy, "every deferred row names the scenario that
> would settle it" — is all designed so that state is *scannable*. None of it
> helps for a condition expressed as prose in a section nobody revisits.

That is a real, transferable finding about the method, not about the domain,
and it is stated against the project's own tooling. Three reviews walked past
it — including mine. My PJ-017 flagged row K's missing verdict as a one-line
omission and did not notice it had *fired a promotion condition*.

Equally good: when the first S-9 write-up claimed the corpus was exhausted and
its own ownership table said otherwise, the false claim was **kept verbatim**
with a bracketed correction and a note that the table is authoritative — rather
than quietly edited into hindsight. That is the same discipline the arc opened
with, still intact at commit 45 of 45.

## 5. One defect: row F never got its verdict

Row F's narrative section is five lines — header, scenarios, current state, and
the original 2026-08-18 prediction. **No verdict at all.**

But S-9 was built against it (no `°`), refuted it, and a review then reopened
it. Compare narrative depth: row E has 25 lines, row J 22, row P 34, row X 67.
F has none of it.

Worse, PJ-008's S-9 outcomes prose still reads:

> *Held, and this was the interesting call:* **row F is refuted.**

with no adjacent correction, while the ledger status says `open`. The
correction exists only in PJ-021's title and body. By the ledger's own stated
convention — *"A row's Status is taken from its latest dated verdict; earlier
verdicts are kept verbatim"* — the verbatim retention is right, but the later
verdict has to exist somewhere a reader following the index will reach. For row
F it does not.

This is the row-K shape recurring, which is pointed: the `°` marker exists
*because* of row K, and the marker on F is correct. The index got better; this
one narrative went missing.

**Fix:** one paragraph under Row F recording what S-9 found (identity fixed by
content hash, no `Artefact → Artefact` edge earned) and what the review reopened
(the half it did not settle), dated. Ten minutes, and it closes the last hole in
a document that is otherwise the most complete artefact here.

## 6. Closing assessment

The three things I would tell someone who wasn't here:

1. **The predictions held their value because refutations were kept.** Rows A,
   H and F were predicted gaps that dissolved; the prediction that S-7's remedy
   would transfer to S-12 was refuted in the same cell that made it. A ledger
   that records what the project got wrong as prominently as what it got right
   is why the "no new nouns" result is believable rather than self-congratulatory.
2. **The recurring defect was identity by wording**, found five or six times in
   structurally unrelated regions, named as a class, and — importantly — the
   *remedy* was explicitly refused generalisation. Three instances of the
   act→product omission got three different fixes and the project wrote down
   that this argues against a blanket relationship. That restraint is rarer
   than the pattern-finding.
3. **The method survived its own scale.** Twenty-three journal entries, four
   external reviews, a ledger of 29 rows, and a self-correcting session log —
   and at the end the index is scannable, the authoritative source is named,
   and the one contradiction found was flagged by the project itself.

What is *not* established, and the journal says so: no non-additive schema
change has ever been attempted, so "cheap to change" remains a one-directional
claim; the event log is still an in-memory decision awaiting a trigger that has
been tested twice and did not fire; and five rows need discriminators that
would have to be invented rather than mined.

The corpus is exhausted. The model is not finished — but for the first time
nothing on the ledger is waiting on a probe that already exists.
