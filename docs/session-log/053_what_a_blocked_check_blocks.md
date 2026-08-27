# 053: a blocked check says what it blocks

**Session wrap, 2026-08-27, on `work`.** Not a decision record — the reasoning
is in `UnmetCheck.blocks`'s comment and in `docs/digest-design.md`.

A new entry rather than more of 052: that entry's subject merged in PR #47.

## Goal

Dan answered the four open questions from the digest design, having not been
party to the design discussion. Two of the four were buildable straight away.

## Changed

**`3d56689`** — `UnmetCheck` gains `blocks`; `whySupported` and `gateStatus`
compute it through a new `blockedBy`; the `why` view renders it; `known` prints
every handle; `src/mcp/schemas.ts` un-aliases `Condition` from `UnmetCheck`.

## Verified

`bun run check` — all 18. Driven on a real record before and after, which is
how the rendering was settled: the first version bulleted the consequence lines
as siblings of the check rather than nesting them beneath it.

**Two failures the type system produced and review would not have.**
`src/mcp/schemas.ts` declared `const condition = unmetCheck`, because
`Condition` and `UnmetCheck` are separate interfaces that happened to share a
shape; the moment one gained a field the `Exact<>` assertions refused it. And
`check:no-stringly-typed` refused `Map<string, BlockedWork[]>` — the key is a
criterion handle. Both were right.

## Open

**Dan's question was the good one, and it changes the shape of the work.** *If
we can query for the things blocked by the thing being viewed, can those things
not be embedded in that thing's report view?* They can. A researcher reaches a
criterion through `claims` then `why`, is told a check failed, and until now no
read verb on either surface took a criterion — `GOVERNS` was written from
criterion to gate and walked only from the gate's end, and the gate's
`consequence` exists for no other purpose than to answer this. The record knew
and could not say.

**It does not serve the standup case**, and saying so is the point rather than a
caveat. Embedding answers the drill-down — *I am looking at a claim, tell me the
consequences*. *Show me everything blocked* has no claim to start from and still
needs an enumeration. So the proposal goes from three list verbs to two, and the
one that remains is the one that was actually asked for.

**`known`'s handles: the old argument was true and about the wrong thing.** It
printed an id only on a wording collision, reasoning from ambiguity. A handle is
not a disambiguator — it is what the next command takes, and `known` was the
only route to a question at all, so the remedy was to re-run as `--json` to
recover what the prose view had dropped. Worth keeping as a shape: **a correct
argument can be aimed at the wrong property of the thing it is about.**

**Still open — the bucket, and Dan's aside may dissolve it.** *"Contested"?
"Unverified"? It's a new instance of a Claim?!* PJ-008's row AH already records
that `Claim.kind` carries two facts under one value. If the distinction belongs
on the claim rather than in a sixth survey bucket, that is one open row
answering another, and it should be checked before any bucket is named.

**These two commits were briefly orphaned**, which is the fourth instance of
the same shape this week. `work` was reset to `origin/main` on the assumption
they had merged; they had not, and only `origin/work` still held them. Recovered
by cherry-pick. The `pre-push` hook cannot catch this one — the branch was never
merged, so there was no merged PR to refuse a push to. **The tell is the same as
every other time: compare against `origin/main` before assuming.**

## Next

The remaining answers: the standup view as an assembled convenience, and the
enumeration behind it.

Before either, the bucket question above. `docs/digest-design.md` is current on
`main` as of PR #48.

**Work tracking is GitHub issues now** — `gh issue list`. The bucket question
belongs there when it is asked properly; the two items it touches are already
open as issues.
