# compose-scenario — a research arc, written as moves

Write a new arc for LabKit to record, by composing moves from `fragments/`.

**You are writing what a researcher did. You are not writing a graph.** The
nodes and edges are LabKit's answer, read back off the event log after your
composition runs. If you find yourself typing a node label or an edge name, the
composition is wrong — see §4.

## 1. Read the moves first

```sh
grep -n "^export async function" fragments/index.ts
```

That is the list. **This file does not repeat it**, because a copy of a
derivable list is a second thing to go stale — the same reason CLAUDE.md keeps
no count of labels or tools. Each fragment's doc comment says what it is for and
why it exists in that shape; read the two or three you mean to use.

## 2. Write the composition

Add one to `fragments/compositions.ts`. It is a `ref`, a `name`, and a `run`
that calls fragments in order:

```ts
const somethingHappened: Composition = {
  ref: "S-nn",
  name: "A short title",
  run: async (w) => {
    const { enquiry } = await askAndPursue(w, { question: "…" });
    const { claims } = await observeAndAnalyse(w, { enquiry, /* … */ });
    await closeOnEvidence(w, { enquiry, answeredBy: claims[0]!.claim });
  },
};
```

Then add it to `COMPOSITIONS`. Composition is **variable binding** — a move
returns the handles the next one needs, and there is no registry or builder to
learn.

`ref` is the acceptance scenario whose arc you are borrowing, so a reader can
find the real one. If you are not borrowing one, say so in the `name` and leave
`ref` as the closest match rather than inventing a number.

## 3. Run it

```sh
bun run check:compositions        # every arc runs, and connects only what it made
bun scripts/build-traces.ts       # the traces, to stdout
```

**The domain will refuse a move that does not make sense**, and the refusal is
the useful part. A real one:

```
analysis COMP_1 concluded nothing about "the coefficient is 0.61";
there is nothing to re-verify
```

That composition was perfectly typed. `reverify` re-checks the claim that was
*made*, and it had been handed a different proposition. **Read the refusal
before changing anything** — it usually says the arc is wrong, not the code.

## 4. The one rule

> the Researcher and Agent lines must never name a node or edge label
> — `docs/project-journal/008_user_story_mining.md` §2

A composition cannot break this, because it does not write a graph. That is the
point of the shape: the rule holds by construction rather than by review.

**So do not add a "and this creates a Claim node" comment.** It will be true
until it is not, and nothing checks it. If you want to know what an arc creates,
run it — `bun scripts/build-traces.ts` prints the counts and the trace holds
every node and edge.

## 5. When to add a fragment instead

Add one when a **move a researcher would name** has no fragment. Not when a
composition is long — length is fine, and a fragment that exists to shorten one
caller is a rename.

Two tests before adding:

- **Would a researcher say it in one breath?** `observeAndAnalyse` is one move
  because taking a measurement and analysing it is one thing somebody did.
  `planWorkThenDeclareGate` would be two things wearing one name — which is why
  `gatedWork` is named for what it *is* rather than for its steps.
- **Does the domain force the pairing?** `replaceAnalysis` bundles the review
  because `replaceAnalysis.because` takes a `ReviewRef` — you cannot supersede
  an analysis without a recorded verdict to point at. That is a constraint, not
  a convenience, and bundling it is honest.

A fragment goes in `fragments/index.ts` with a doc comment saying **why it is
shaped that way**, not what it does — the code says what it does.

## 6. What this is not

**Not an acceptance scenario.** `tests/scenarios/` is where a scenario is
*asserted*: each opens on an empty graph, and none shares a fixture with
another. `s9b_rebuild_or_fresh_work.test.ts:86` re-implements S-9's opening by
hand, deliberately, "so that what this scenario adds is visible against it".

If you are writing something that should **fail** when the model is wrong, you
are writing a scenario and this is the wrong tool. A composition asserts
nothing; it produces a record.

**Not a place to reach past the surface.** Every fragment goes through
`WriteSurface` and nothing else. If a move needs something the surface cannot
do, that is a finding about the surface — file it, do not work around it.
