# 019: making the MCP server usable

**Session wrap, 2026-08-23, on `feat/mcp-server`.** Not a decision record — see
`docs/project-journal/030_which_record_is_this_about.md` for the identity
argument the first half of this work came out of.

**The range is wider than this entry.** The pinned baseline is `72dbe15` and
covers eight commits. `ad5f99b`/`f293ee1` are entry 017's, `fd51642`/`a07898f`/
`2553201` are entry 018's. This entry covers `494306a..64fca8e` — a distinct
goal, given after 018 was written.

## Goal

Dan: *"The goal is to make the mcp server **usable**, not sit here debating it
in Markdown."*

## Changed

Three commits.

**`494306a` — one input handle across the three recording verbs.**
`record_analysis` accepted an earlier analysis's id; `replace_analysis` and
`reverify` accepted observations alone, though all three write the same
`Computation -CONSUMES-> Artefact` edge. An agent that recorded stage two holds
`COMP_2` and never the `ART_` id underneath it, so repairing that stage came
back `CONSUMES does not allow Computation -> Computation`; the workaround was
to call `why_supported` on a claim in order to learn what a computation read.
One `InputRef`, no new edge. Three defects fell out that the change did not
need: `UnaffectedRecord.named` had been returning the raw id since it landed
(it queried `a.name`; artefacts carry `logical_name`); `docs/mcp-tools.md`
rendered unions as `object | object` with fields taken from the first branch
and `required` read off the parent, which was also wrong for every nullable
object already in the document; and a failing MCP call in tests reported
`Expected: false / Received: true` and nothing about which tool or why.

**`8239a1d` — `tests/mcp-smoke.test.ts`, every tool called once.** Eleven of
thirty-three had never been called by any test, `bun test` green throughout,
because `tests/mcp.test.ts` asserts every verb is *exposed* and exposed is not
working. It found `gate_status` **broken over MCP** for any evaluated gate:
`GateStatus.evaluations` declared `{value, outcome, at}[]` while the code has
always put `EvaluationRecord[]` there. Nothing caught it — excess-property
checking applies only to object literals, and the `Exact<>` gate compared two
declarations that agreed with each other. Also three tool descriptions naming
arguments that do not exist, all true of earlier signatures.

**`64fca8e` — the real process, and a README.** Everything above ran over
`InMemoryTransport`. `tests/mcp-stdio.test.ts` spawns `bun run mcp`, connects
the SDK stdio client, and exercises tools/list, a write, a read-back through a
different tool, and `labkit://docs/tools`. And there was no README at all:
`LABKIT_TENANT` existed in one place in the repo, a parameter default in
`src/mcp/server.ts`.

Working tree clean; all three pushed to `origin/feat/mcp-server` (PR #2).

## Verified

Full run after `64fca8e`: **308 pass, 0 fail**, 308 tests across 41 files,
133.24s. `bun run typecheck` clean. `npx depcruise src tests --output-type err`
— `no dependency violations found (93 modules, 307 dependencies cruised)`.
`check:doc-comments`, `check:tests-assert`, `check:stdout` all OK.

Not run: `check:migrations` (no `drizzle/` change),
`bun examples/full-lifecycle.ts`, `check:pglite-concurrency`.

Two intermediate full runs failed 28 and 2 tests, **all at bun's 5000/10000ms
ceiling**, on different tests each time, at 430s and 197s against the 125s of a
clean run. The five files involved passed in isolation, 46 pass / 0 fail in
13.65s. That is the flake in `docs/TASKS.md`, discriminated by failure mode as
CLAUDE.md instructs — timeouts, not assertion diffs.

The README's two client invocations were run, not written from memory.

## Open

**A claim in `tests/mcp-stdio.test.ts` was written, tested and refuted.** Its
first version said this is the test that catches stdout pollution. Prefixing
`src/db/tenant.ts` with `console.log("POLLUTION")` put that line on stdout ahead
of the responses and all three tests still passed — the SDK's read buffer skips
lines it cannot parse. A fourth test now reads the raw pipe; against the same
pollution it fails while the other three pass. `check:stdout` stays, because
this SDK's tolerance is not the protocol's.

**What the smoke test does and does not prove:** every tool answers in *one*
state. The `gate_status` bug class — a declared type narrower than the runtime
payload, invisible to `tsc` and to the `Exact<>` gates — lives in
state-dependent branches (`withdrawn`, `decidedBy`, `replacedBy`, `superseded`).
Some are covered by existing flows; the coverage gate guarantees none of them.

**Recorded, not fixed:** a replacement may name the analysis it supersedes in
`from` and so consume the output it just invalidated. In `docs/TASKS.md` under
"needs a discriminator" — adding a refusal without a demonstrated wrong answer
is manufacturing one (PJ-019).

## Next

`docs/TASKS.md` → "Ready to build" holds **one** item, and it is a model
question rather than a build: `interpretationHistory` still *walks* by wording
(`MATCH (d:Decision)-[:MOTIVATES]->(nxt:Claim {name: $name})`). Walking by id
wants the revision chain to carry an edge, which has to clear the wrong-answer
bar first — and PJ-011 §5 says today's behaviour being merely *unanswerable*
does not clear it. Someone has to decide whether to look for the discriminator
or leave the row.

Everything else outstanding is under "Needs a discriminator" and none of it is
buildable as written.
