# 068: the field named for the wrong axis

**Session wrap, 2026-08-28, on `refactor/adapter-not-surface`.** Not a decision
record — `Adapter` in `src/request-log.ts` carries why the name changed and why
the mcp value splits by transport.

**A fourth entry for this session**; 061 is #83's, 064 is #66's, 066 is #57's.
`062`, `063`, `065` and `067` are a peer session's. The baseline is still 061's,
so the range is far wider than what is below.

## Goal

Name the log field for the axis it actually belongs to, before anything binds to
it — groundwork for #81 and `agent-bus`#104.

## Changed

**`fe43a20`** — `surface` becomes `adapter` in the request log.

- `src/request-log.ts` — an `Adapter` type, `"cli" | "mcp-stdio" | "mcp-http"`,
  with the naming argument on the declaration.
- `src/mcp/server.ts`, `src/cli/cli.ts` — the two call sites, each
  `satisfies Adapter`.
- `tests/request-log.test.ts` — the fixture.

Working tree clean. Open as PR **#103**.

## Verified

`bun run check` — **all 19 passed**.

**The type is checked by mutation, not by convention.** `logFailedRequest` takes
`unknown`, so nothing stopped a third spelling; `adapter: "CLI"` now gives
`TS1360: Type '"CLI"' does not satisfy the expected type 'Adapter'`.

The collision was measured rather than felt: `ReadSurface`/`WriteSurface` is 78
references, `adapter` is 8, `entrypoint` 61.

## Open

**A cold review of #93 found four defects, all mine, and the first is the one
worth carrying.** It is `e6fae86`, already on main.

`labkit gates --state blockd` **exited 1 in silence and created a database on
the way out**. `gateState` was called inside `.action()` rather than passed to
commander as the option parser, so its `InvalidArgumentError` — which extends
`CommanderError` and carries `exitCode = 1` — hit `main()`'s early return, the
one that exists because *"commander has already printed the argument error"*. It
had not. And validation ran after the run wrapper had opened a connection, so a
typo minted a fresh record before failing.

**The comment I wrote on `oneOf` argued for exactly the behaviour that did not
happen**: *"a typo means the caller asked for something and is owed a message
naming what was available, not a silent full list."* Prose asserting behaviour
the code lacks, written by someone who had just finished arguing that prose
should not do that.

**And the miss underneath it: I mutation-tested the computation and never tested
the plumbing.** `gateStateFrom` was checked by replacing it with a constant and
watching five tests fall over. `gateList(state)` — the filter, which is the
entire feature — had no test at all, and the "fixture really contains all four
states" control checked the *fixture* rather than the filter path. A control can
be rigorous about the wrong half.

The other three: `work_list`'s description told agents `blocked` means an
unsatisfied gate when the code blocks only on `blocked` itself; neither
enumeration had a stable order, both building from a `Map` in query order with
no `ORDER BY`; and two tool names had dropped out of a comment in
`mcp-smoke.test.ts`.

**One thing named and not built.** `adapter: cli` does not say whether a person
typed it or a script did — `--author` exists precisely because they differ. That
belongs on the attribution axis as a `how`, not as a fourth adapter value.
Raised with Dan, not yet on #81.

## Next

`gh pr view 103`.

Then #81, whose shape changed after this entry was written — **twice, and both
corrections are on the issue rather than here.**

`trace_id` on `CommandContext` was going to be the first commit *because* it
needs no migration. It also has **no producer**: the CLI has none, stdio MCP has
none, and `Mcp-Session-Id` exists only in stateful HTTP mode. A field nothing
fills is the objection this session made twice to other people's enums, and it
applies here.

And `how` is **not** earned by #91. The HTTP transport is not in `src/` —
`grep -rln "StreamableHTTP" src/` finds nothing — so the shared-registry
failure is a spike finding against unshipped code, and this entry called it a
demonstrated defect. What earns it is live and simpler: `labkit pose` and
`labkit --author dan pose` write **byte-identical** attribution, one observed
from the OS and one asserted by whoever typed it. Measured, on `main`.
