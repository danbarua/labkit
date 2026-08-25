# 033: the constraint protected the wrong thing

The CLI was read-only by construction. It built a `ReadSurface` and never a
`WriteSurface`, so no write verb was in scope to call by accident, and two tests
in `tests/cli.test.ts` held it there — one asserting `WriteSurface` did not
appear in the file, one deriving every write verb name from both surfaces the
CLI held and asserting none was called.

Both are deleted. This records why, because the property was real and the tests
were not wrong about it.

## 1. It was never a design position

It arrived as a consequence of building the read half first (PJ-023), and the
comment at the top of `src/cli.ts` then argued for it as though it had been
chosen: *"Read-only on purpose, and structurally rather than by discipline."*
That sentence is the same shape as the one `src/mcp/tools.ts` used to carry and
had to retract — *"a record nothing can write to has nothing in it"* — and it
had the same defect, only for longer.

What it produced: **no way to put anything into a LabKit record** except by
wiring up an agent and an MCP server. Every scenario in the corpus is a
researcher's conversation, and there was no way for a researcher to have one.

## 2. The only writer was the bypass the tests existed to prevent

This is the part worth keeping.

`tests/helpers/read-only.ts` derived its forbidden list from **both**
`WriteSurface.prototype` and `TenantGraph.prototype`, and its header says why:
PJ-028 found that a list derived from `WriteSurface` alone could never contain
`createNode`, and an adapter holding a `TenantGraph` can write without touching
a domain verb. Good finding, correctly generalised.

Meanwhile `examples/full-lifecycle.ts` — the one script in the repository that
wrote to a LabKit database — was built entirely out of `graph.createNode` and
`graph.createEdge` calls. It put a Question, a LineOfEnquiry, an EvidenceUnit, a
Computation and an Evidence onto the record, and **no verb recorded that any of
them had been made**. It is the exact shape the test was written against, in the
only writer there was, and it was never in the test's scope because the test
reads `src/cli.ts`.

So the constraint held perfectly on the surface that did not write, while the
thing it was protecting against happened in the surface that did. A structural
guarantee is only as good as its choice of subject.

**What survives, narrowed:** the CLI reaches the graph only through domain
verbs. It constructs a `TenantGraph` — the surfaces need one — and calls nothing
on it. That is the property that was actually worth having, and it is now
asserted about a file that can write.

## 3. The replacement had to be a shell script, not a smaller TypeScript one

`examples/full-lifecycle.sh` drives the CLI and nothing else, so every line is a
command a person could type. That is not presentation: a script that reaches
past the CLI can demonstrate that the persistence layer works while saying
nothing about whether the research verbs are usable, which is what the previous
one did for 221 commits without anybody noticing it had also stopped running.

Two properties it inherits from that history, both already in CLAUDE.md:
**exit 0 means it worked and nothing else does**, and no status through a pipe.

One it did not have: **it asserts on the answers, not on whether the commands
ran.** Fifteen assertions, each one a claim a reader can check.

## 4. A negative control found an assertion that asserted nothing

The script's strongest-looking claim was that the answered question comes back
under `established` rather than `provisional` — the S-18 distinction, an answer
resting on promoted work against one resting on scratch. It passed.

It also passed with the `labkit promote` line removed.

`whatIsKnown` reads `Claim.kind === "confirmatory"`, and **two unrelated acts
write that field**: `promote()` sets it, and `recordAnalysis()` sets it from a
conclusion's `standing`. The script's conclusion had been written
`"standing": "confirmatory"` because that read naturally, so the claim was
already what `promote` would have made it and the promotion changed nothing the
survey could see.

Fixed by recording the conclusion as exploratory — the default — which makes the
promote line load-bearing and makes removing it redden the run. That was
verified in both directions.

The generalisation is PJ-029's, arriving from a new direction: **a negative
result is not evidence unless it could have been positive**, and its mirror — a
positive one is not evidence unless it could have been negative. Nothing about
the assertion looked wrong. Running the control took thirty seconds.

**And a question for the model, not for this change.** `Claim.kind` carries two
different facts under one value: *this was prespecified* and *this has been
promoted*. They are the same word for good reasons — both mean "not scratch" —
but a reader cannot tell them apart, and `whatIsKnown` does not try. Whether
that matters is a domain question and is not settled here.

## 5. Attribution stopped being a mock, and the prediction held

`src/attribution.ts` said, of a real `GitContextProvider`: *"Nothing under
`src/` spawns a subprocess today, and [it] would be the first. Keeping it here
means that when it arrives it arrives in one file that the graph and the verbs
do not import."*

It arrived, in that file, and the graph and the verbs did not learn about it.
The CLI is the first caller with a genuine answer to either question a
`CommandContext` asks: a person at a terminal has a name, and the tree they are
standing in has a HEAD. The MCP server keeps the stubs, because *which agent*
and *which session* are facts the protocol does not carry and this repository
cannot invent.

`--author` overrides the username, because a script driving LabKit is not the
account it runs under — `full-lifecycle.sh` attributes its writes to itself, and
the run asserts that it does.

## 6. What the writes cost the argument parser

Two changes, both forced by writes rather than chosen:

**A flag may now be given more than once.** Six write verbs take a list of
handles. Repetition carries a list of handles; a list of *records* —
conclusions, which carry two sentences of a researcher's prose — is given as
JSON, and not as a delimited string, for the reason `PlanWorkCommand.mayRead`'s
own doc comment already gives: an entry containing the delimiter splits
silently.

**An unknown flag is refused rather than ignored.** It was dropped on the floor
before, on the reasoning that a missing positional would surface the mistake
anyway. True while every command was a read: the worst case was an answer to a
slightly different question, and the caller could see it. A mistyped
`--becuase` on a write puts a record on the permanent register with a field the
caller believes they set.
