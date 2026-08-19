# Review: S-3b and the closing of row V

**Read-only sweep of `399cbb1..77c7227` (4 commits), branch
`spike/drizzle-age`, working tree clean. Nothing modified.**

**Verified independently, not taken from the commit messages:**

| Check | Result |
| --- | --- |
| `bun test` | **145 pass, 0 fail, 471 expect() calls**, 15 files |
| `bun run typecheck` | clean |
| `npx depcruise src tests --output-type err` | **0 errors** (2 orphan warnings, the CLI stubs) |

Matches PJ-016's claims exactly.

---

## 1. The verdict: this is the strongest single increment in the arc

A cold-context agent picked up row V from CLAUDE.md's deferral rule, took the
option my re-review flagged as riskier — **authoring** the discriminator
rather than declaring V unowned — and then defended against that exact risk
with four independent guards. That's better than the choice I would have made.

### The evidence artefact is excellent

Since S-3 was built, `s3_robustness_disagrees.test.ts` has carried this:

```ts
expect(why.supported).toBe(true); // WRONG: two prespecified checks failed
```

left asserting the wrong answer on purpose, with a comment telling whoever
fixed it to update the assertion rather than let it drift. S-3b flipped it:

```ts
expect(why.supported).toBe(false);
expect([...why.unmet].sort()).toEqual([MEDIAN, SEED].sort());
expect(why.support).toEqual([{ finding: "p = 0.002, Holm-corrected", via: "holm-pairwise" }]);
```

A defect demonstrated in one scenario, deliberately pinned as a failing
expectation for the whole intervening arc, and cleared by a later scenario
inverting that same assertion. That is a stronger proof than any prose, and
it only exists because someone resisted the urge to delete an ugly test.

### The self-fulfilling-scenario risk was handled properly

My concern about authoring was that a scenario written to settle a ledger row
gets written by people who already hold both models. The mitigations actually
used:

1. **The research shape is mined, not invented** — S-3b is S-3's conversation
   with the tertiary model removed. Prespecified robustness checks with nothing
   planned off the back of them is what most confirmatory analysis looks like;
   S-3's downstream model was the addition, not the baseline.
2. **Both wrong answers were measured against shipped code *before* the
   prediction table was written** — `gateStatus()` returning `blocked` with
   `gating: []`, and `whySupported()` returning `supported: true`.
3. **The endpoint and the API shape were deliberately left unpredicted**, with
   the reason stated: "Naming it here would be the self-fulfilling refactor
   §3's judgment calls warn about." The endpoint was then settled by an
   Afterward bullet — the write moment is *forced* (a check nobody ran must
   still count against the finding, so the edge cannot be minted by
   evaluation), which is a genuine derivation rather than a preference.
4. **The write-up states plainly what it did not prove** (§3 below).

One edge, no new node label, no migration — consistent with every scenario
since S-11. Reader written in the same commit, which is row W's lesson applied
in the right order.

### `supported` now has three distinct ways to be false

Nothing run (`support` empty) / withdrawn (S-12) / fails the standard set for
it (`unmet` non-empty). And `standard: []` — held to no agreed standard — is a
fourth state that deliberately must not read as "met its standard", which is
why it is a list and not a boolean. That is the row I discipline holding at a
fourth level.

---

## 2. Row V is `resolved`; half of it was argued, not demonstrated

PJ-016 §4 and row V's own narrative say this outright:

> Model (b) was closed by argument, not by demonstration. … A row cleared by
> argument is weaker than one cleared by demonstration, and the ledger says so
> rather than filing them alike.

The disclosure is exactly right. But structurally the ledger *does* file them
alike: row V's **Status** column reads `resolved`, identical to rows cleared
by demonstration, and only the prose below distinguishes them. The whole point
of the restructured §3 is that the status column is scannable.

**Suggestion:** a distinct status token — `resolved (argued)` or similar — so
the distinction survives scanning rather than living only in a paragraph
someone has to reach. Cheap, and precisely in the spirit of the change that
made the ledger an index.

---

## 3. The one thing to watch: row X's clean-ledger status now rests on an absence

CLAUDE.md now reads: *"No row is currently that one"* — no confirmed wrong
answer shipping green, a first for the project. That is real.

But look at what happened to row X in the same change. PJ-016 §4:

> a decisive failure now disqualifies a finding as well as blocking work,
> permanently. A check re-run correctly after a coding error *in the check
> itself* leaves the finding not standing forever.

So S-3b **widened** X's blast radius, and X stays off the "one wrong answer"
ledger because *nothing has demonstrated it*. By the project's own bar
(shown wrong, not argued wrong) that is consistent — an undemonstrated
suspicion genuinely isn't a live defect.

The wrinkle is that two things just changed at once:

- X became **more severe** (it now marks findings, not just work).
- Authoring a scenario became **legitimate** when the corpus lacks one — S-3b
  is the precedent.

Which means X is now both more consequential and more clearable than it was,
while the rule that would have forced someone to clear it no longer bites,
because clearing requires a demonstration nobody has written. This is the
first place in the arc where a clean ledger depends on a test not existing.

I don't think anything dishonest has happened — the reasoning is stated openly
in PJ-016 and CLAUDE.md, which is why I can see it at all. But it is the
obvious next target, and the deferral rule will not nominate it.

**Suggestion:** either author X's discriminator next (the sympathetic case is
already written down — a check re-run correctly after a coding error in the
check itself), or add a line to CLAUDE.md's rule 1 saying that a row whose
*severity* was widened by the change that cleared another row gets nominated
regardless of whether it has been demonstrated.

---

## 4. Two items from my re-review are still open — and why

Neither was picked up, and the reason is worth more than the items:

- **Row K still has no S-8 verdict.** S-8 is one of K's two named scenarios,
  it is built, and K's narrative is still the single original line
  ("`exploratory` already is this distinction"). §4 hangs story 18's promotion
  trigger on exactly that verdict.
- **PJ-013 has no status banner**, though its §3.5 table and §3.6 flag are both
  superseded now. PJ-015 and PJ-016 both demonstrate the idiom.

Row V *was* picked up. The difference: **row V was written into CLAUDE.md and
the ledger; the other two existed only in a chat message.** The cold-context
agent resumed from the repository, so it saw everything in the repository and
nothing else.

That is the actual lesson of the `/resume` mishap, and it generalises to the
whole hand-off loop: a review that isn't committed didn't happen. PJ-013
survived because you filed it. This one should be filed too, or its findings
will evaporate the same way.

---

## 5. Ledger position

**15 resolved, 2 refuted, 2 boundary, 10 open** (E, F, J, K, O, P, S, T, X, Z).
Ten of fourteen corpus scenarios built plus S-3b; five corpus entries remain
(S-2, S-9, S-10, S-13, S-14), and they are well aimed at E, F, J and P — the
rows open merely because nothing has reached them.

The nouns still have not moved. Ten scenarios, zero new node labels, zero
migrations.
