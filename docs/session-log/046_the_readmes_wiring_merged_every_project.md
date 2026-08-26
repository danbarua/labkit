# 046: the README's wiring merged every project into one record

**Session wrap, 2026-08-26, on `fix/readme-tenant-wiring`.** Not a decision
record — the corrected wiring and the reason for it are in `README.md` itself.

Open as **PR #34**.

**The range is one commit wider than this entry.** The baseline was re-pinned at
`9c65dd0`, and `e1433d9` — the merge of PR #33 — is covered by entry 045. Only
`e488d18` is this entry's.

## Goal

Act on a cold-review finding from a peer session (`labkit-review`) against
`main` at `e1433d9`: the README's own wiring examples contradicted its advice
about `LABKIT_TENANT`.

## Changed

**`e488d18` — the README's own wiring merged every project into one record.**

- `README.md` — both wiring examples name the server file by absolute path and
  set `LABKIT_HOME`; `--cwd` is gone. The sentence naming `--cwd` as the pinning
  mechanism is replaced. The `LABKIT_TENANT` paragraph gains the condition it
  was missing.

Working tree clean at `e488d18`; pushed.

## Verified

The report was re-measured rather than taken on trust, and all four of its
claims hold: `bun --cwd <dir>` sets the process's working directory to `<dir>`;
`src/mcp/server.ts` calls `connectDb()` with no argument; `connectDb` falls
through to `LABKIT_HOME ?? process.cwd()`; and a `.labkit/` exists in this
checkout.

**The leak was then reproduced, which the report had not done:**

- **Old wiring** — two MCP clients launched `bun run --cwd <checkout> mcp` with
  no `LABKIT_HOME`, against a *stand-in* checkout so the real one was untouched.
  The second client's `known` returned the first client's question, and
  `.labkit/` appeared inside the stand-in checkout.
- **New wiring** — the same two clients with an absolute server path and
  `LABKIT_HOME` per project, and the process's working directory deliberately
  set somewhere else entirely. Each got its own `.labkit/` in its own directory;
  neither saw the other.

Setting cwd elsewhere is what makes the second result mean something: without
it, a pass would not distinguish `LABKIT_HOME` working from cwd happening to be
right.

`claude mcp add`'s env-flag syntax was read from `--help` rather than guessed.
`bun run check` all 16 green.

## Open

**No check was added, and that is a decision rather than an omission.** The
defect is a paragraph and a code block twenty lines apart describing different
deployments. The only thing a check could assert is that the README contains a
particular string — the documentation-gate genre this repo retired on
2026-08-26, which had cost a CI path-filter exception and invited proposals for
parity documents on the other surface. `bun run check:cli` cannot see it either:
it drives the CLI with `--db` into a temporary directory and never exercises the
no-argument `connectDb()` the MCP server takes. That gap is real and unclosed.

**The stray `.labkit/` in this checkout is left alone.** It may be real working
data, and a review finding is not licence to delete someone's database.

**The finding is a better example of the pinned header's first rule than any of
the six incidents that rule cites**, and it arrived an hour after the header
merged. Every sentence in the README was individually accurate; the defect lived
in the gap between two of them.

## Next

PR #34 awaits review.

Then the CLAUDE.md stale-prose sweep, still the next item in `docs/TASKS.md`'s
documents group, followed by `docs/persistence-spikes.md` becoming
`docs/persistence.md`.
