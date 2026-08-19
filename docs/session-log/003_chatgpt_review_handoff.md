# 003: the ChatGPT review handoff, and a ledger row it turned up

**Session wrap, 2026-08-19, on `spike/drizzle-age`.** Not a decision record —
see `docs/project-journal/` for the reasoning behind S-3b, row V and the
deferral rules this handoff summarises.

## Goal

Prepare the external-review handoff for ChatGPT covering everything since the
brief that specified S-5, and verify its claims first-hand rather than citing
numbers from earlier in the arc.

## Changed

**No `src/` or `tests/` change this session** — docs only. The deliverable is
`/tmp/claude-501/chatgpt-handoff.md` (141 lines), written and handed to the
user, outside version control by intent: a message to a reviewer, not a project
record.

`docs/project-journal/008_user_story_mining.md` — §3 ledger edits, on the
user's instruction that 008 is the work tracker and explicitly not append-only.
Unbuilt owners are now marked `°` in the Scenarios column; the legend states the
three-way `open + owned` / `open + unowned` / `boundary` split with the rows in
each; and row X gains **S-3c**, the discriminator brief supplied by external
review, which moves X from unowned to owned.

Commits in the window:

- `d6a34c8` — *docs: update cold-context review of S-3b to reflect open items
  and policy changes*, rewriting `docs/session-log/002`. Another session's work,
  read here as input, not authored here.
- `45ec5fa` — *docs: add ChatGPT review handoff session log for S-5
  verification*, committing this entry at its first draft (+71).

**The tree is dirty**, and deliberately so: this file has ~54 further lines of
correction on top of `45ec5fa`, made after the reviewer caught a stale
conclusion about row K (see Open). Nothing else is modified.

## Verified

All three run against `d6a34c8` during this session, not carried forward from
an earlier commit. `git diff --name-only d6a34c8..HEAD -- src tests` returns
zero files, so they still hold at `45ec5fa`:

- `bun test` — **145 pass, 0 fail**, 471 expect() calls, 15 files, 50.4s.
  (Exit code ignored, per CLAUDE.md.)
- `bun run typecheck` — clean, no output.
- `npx depcruise src tests --output-type err` — **0 errors**, 2 warnings, both
  `no-orphans` on the empty CLI stubs `src/index.ts` and `src/cli.ts`. 47
  modules, 122 dependencies.

Two claims in the handoff draft were checked against the repo rather than
assumed:

- The commit range `a97231e..d6a34c8` is **23 commits** and begins at
  `0aaa3e4 docs: S-5 predictions` — so S-5's own build sits inside the range,
  which the draft had implied it predated. Corrected.
- PJ-008's corpus is **non-contiguous**: grepping every `S-<n>` reference in the
  file yields 14 scenarios with no S-6, S-15 or S-16. 9 built + 5 unbuilt
  reconciles exactly. The "five unbuilt" figure stands, and the entry now says
  why the numbering has gaps.

`bun examples/full-lifecycle.ts` — not run. No `src/` change this session.

## Open

**A miscount in the handoff, corrected after review — not a defect in the
ledger.** Reconciling PJ-008's §3 for the handoff, I counted six rows as `open`
with every named scenario built: K, O, S, T, X, Z. K does not belong in that
set. The ledger lists it as `S-8, story 18`, and **story 18 is still named and
unbuilt**, so K is owned. The correct split:

```text
open + owned      E, F, J, K, P, X   an unbuilt discriminator is named
open + unowned    O, S, T, Z         all named probes exhausted
boundary          Y, AA              characterised, no claim it should be fixed
```

Keeping those three mechanically distinct is what stops "we haven't decided"
collapsing into one undifferentiated backlog, and the handoff blurred the first
two. Corrected in the handoff, and now recorded in PJ-008's legend so the next
reader does not have to hold the build state in their head to see it.

I also proposed giving row K an S-8 verdict. PJ-008 already has one, and a
sharper one than I was going to write: *"S-8: no verdict — the row was not
probed, and saying so is the verdict."* The omission was found and converted
into an explicit result — materially different from a forgotten row — and the
entry there explains that S-7 made `exploratory` reachable while S-8 exercised
no standing *transition*. **K's verdict needed no edit**; what needed one was
the table's inability to show ownership at all, which is what the `°` marker
and the legend split now fix.

Checking that split row by row found the miscount was not only about K: **five**
open rows have an unbuilt owner (E→S-10, F→S-9, J→S-14, K→story 18, P→S-9/S-10),
not one. The handoff and this entry both said five rows were unowned; four are
(O, S, T, Z) once S-3c is recorded against X.

The handoff lives only in `/tmp/claude-501/`, which does not survive a reboot.
If it has not been pasted to the reviewer, it needs re-generating or relocating.

## Next

Build **S-3c**, row X's discriminator. The brief is now in the journal rather
than here — open `docs/project-journal/008_user_story_mining.md` at *Row X* and
work from the "S-3c — the discriminator, specified and not yet built" section:
two cases indistinguishable to the current gate logic (an honest failure re-run
until green; a failure caused by a defect *in the check*, then corrected), what
must hold for each, what not to pre-add, and the five Afterward questions.

Read its last paragraph first. `S-3c` is a provisional handle, and the scenario
would be **authored rather than mined** — PJ-016's precedent for that is the
most contested decision in the arc, and this build should face that question
rather than inherit it silently.

S-13 goes after: it revisits already-productive ground (question lineage,
closure stability, act->product), whereas X attacks a live global policy known
to have spread from gate control into epistemic standing.
