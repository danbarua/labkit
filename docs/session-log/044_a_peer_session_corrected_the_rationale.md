# 044: a peer session corrected the rationale

**Session wrap, 2026-08-26, on `docs/why-per-call`.** Not a decision record —
the connection model is argued in `src/db/backend.ts` and `src/mcp/server.ts`.

Open as **PR #32**.

**The range is wider than this entry.** The wrap baseline still points at
`7fbc84f`, so `git log` from there contains the merges of PR #30 and PR #31,
covered by entries 042 and 043. Only `4a35238` is this entry's.

## Goal

Answer the `exo-ledger` session's questions about deleting its
leader-election-plus-socket layer, and act on what came back.

## Changed

**`4a35238` — the reason for releasing per call was the rarer one.**

- `src/mcp/server.ts`, `src/db/backend.ts`, `CLAUDE.md` — all three justified
  opening and closing the database around each MCP tool call with "otherwise no
  other agent could work the project", and now name the case that actually
  occurs: a person at a terminal running `labkit` against a record an agent is
  writing.
- `CLAUDE.md` — records `exo-ledger`'s measurement of the arm LabKit cannot
  make.

Working tree clean at `4a35238`; pushed.

## Verified

- `bun run check` — all 16 pass.
- The concurrency itself was verified by hand earlier the same day, before the
  rationale was found wrong: an MCP server and a CLI process writing one
  database at once, four handles, no deadlock.

**Measured by `exo-ledger`, not here**, and recorded because it is the arm this
repo deleted and can therefore no longer time. Same machine, its own store:

| | |
| --- | --- |
| client → live daemon, connect | 1-7ms |
| a unit of work through the socket | 76-88ms |
| the same work in-process | 81-87ms |
| its in-process PGlite open | 72-83ms (LabKit: 70-85ms) |

So the wire hop is free at these shapes, the daemon buys a flat ~78ms per call
and nothing else, and the open cost is the same number twice from two codebases.

## Open

**The design was right and its stated reason was not**, which no test could have
caught. Both PR #29's work and this session's hand-verification exercised the
CLI-and-server-at-once case; the comment beside it named multi-agent, and nobody
read the two together until an outside reader had to choose between the options.

**Two of this repo's scars did not transfer**, which is worth knowing before
offering them as advice again. `exo-ledger` checked and found its one `count(*)`
already coerced with `Number()`, and its tests are `beforeAll`-shaped, so it
never paid the per-test-connection cost that pglite#1046 forced here — deleting
its socket will not buy it the suite simplification it bought us. Both were
volunteered as caveats by the peer, not found here.

**The `$bunfs` extension-streaming hazard is live for them and not for us.**
pgvector is core to `exo-ledger`; PGlite reads an extension tarball through
`createReadStream` and `zlib`, which `$bunfs` does not implement. They ship
`bun build --target bun` rather than `--compile`, so it is filed there as a
hazard rather than a bug.

## Next

PR #32 awaits review.

Then `docs/TASKS.md`'s documents group, which entries 043 and 044 are both
evidence for: a pinned DX Principles header modelled on `agent-bus`'s
`AGENTS.md`, the CLAUDE.md stale-prose sweep, and `docs/persistence-spikes.md`
becoming a `docs/persistence.md` explainer.
