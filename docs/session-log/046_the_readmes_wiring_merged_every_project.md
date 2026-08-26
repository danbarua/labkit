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
about `LABKIT_TENANT`. Then, on Dan's follow-up, say *which* MCP scope the
`mcpServers` example belongs in — the wrong one reintroduces the same defect.
Then, on a second review pass, stop implying a portable variable exists.

## Changed

**`e488d18` — the README's own wiring merged every project into one record.**

- `README.md` — both wiring examples name the server file by absolute path and
  set `LABKIT_HOME`; `--cwd` is gone. The sentence naming `--cwd` as the pinning
  mechanism is replaced. The `LABKIT_TENANT` paragraph gains the condition it
  was missing.

**`884c645` — say which MCP scope, because the wrong one merges every project.**

- `README.md` — the three Claude Code scopes and what each needs: `local` (the
  default) takes a literal path, `project` (`.mcp.json`, committed) needs
  `${PWD}` or it is wrong on every other clone, and `user` should not be used
  at all.

**`3c5bf35` — a portable variable is only as portable as the client reading
it.** The previous commit had reproduced the original defect one level down.

- `README.md` — the generic `mcpServers` block takes a literal absolute path;
  project scope joins user scope as something to avoid, with its reason;
  `local` is stated as the one to use.

Working tree clean at `3c5bf35`; pushed.

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

`claude mcp add`'s env-flag syntax and its `--scope` values were read from
`--help` rather than guessed.

**Two more facts measured for the scope commit**, by wiring a probe MCP server
through a real project-scoped `.mcp.json` and having it report its own
environment:

- Claude Code **expands `${VAR}`** in an `mcpServers` env value.
- It launches the server with **the project directory as its working
  directory**.

The second means the default would in fact have been correct for project scope.
`LABKIT_HOME` is still set explicitly, because relying on the working directory
is what put every record in the LabKit checkout to begin with — the mechanism
was right there too, and the configuration pointed it somewhere nobody intended.

**Three more measurements for `3c5bf35`, all 2026-08-26.** The peer reported the
first and flagged the second as unmeasured; the third came from chasing it.

- An unexpanded `${PWD}` reaching LabKit creates a directory **literally named
  `${PWD}`** with a `.labkit/pglite` inside, and reports an empty record. No
  error. Indistinguishable from a correctly wired new project — worse than the
  defect this branch began with, which at least showed a stranger's question.
- **`${PWD}` expands to the launch directory, not the project root.** A git
  repo with `.mcp.json` at its root, `claude -p` run from `packages/foo`,
  expanded to `.../packages/foo`. A committed config therefore yields one record
  per launch directory.
- **`${CLAUDE_PROJECT_DIR}` is not a substitute.** It does not expand in
  `.mcp.json` — it arrives as the literal string — and the value Claude Code
  puts in the server's environment under that name is *also* the launch
  directory. So the file is located by walking up to the git root and "project
  dir" is reported by a different rule.

`bun run check` all 16 green.

## Open

**No check was added, and the argument for that got stronger.** A check
asserting the README contains `${PWD}` would have passed against the wording
carrying the second defect — and against the wording that caused the third. The
reviewer made that point and it is better than the original reasoning, which was
only that the documentation-gate genre had been retired.

 The
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

**And the same defect had a second route in, found by Dan rather than by the
review.** Saying "anything that reads an `mcpServers` block" without saying
*where* leaves the reader to pick a scope, and `user` scope applies one entry to
every project opened — a literal `LABKIT_HOME` there merges every record exactly
as `--cwd` did. Fixing the wiring did not fix the advice about where to put it.

**User scope stays discouraged even though `${PWD}` would make it safe.** The
expansion works, so records would stay separate; every directory ever opened
would still become a LabKit database. That is a second reason, independent of
the first, and it is the one that decides it.

**There is no variable that names the project root**, which is the finding this
branch ends on. Project scope cannot express "one record for this repository"
portably, so a committed `.mcp.json` is now listed as something to avoid rather
than shown as an example. **Unresolved:** someone who wants a committed team
config will reasonably ignore that warning, and the README offers them nothing
better than a literal path each colleague edits. Raised with the reviewer; no
answer yet.

**A sentence-sized fix was proposed and was correctly sized to the finding that
had been verified.** What made it larger was the corollary the reviewer
explicitly declined to assert — it moved the recommendation from
under-qualified to wrong. Worth remembering that the flagged-as-unmeasured part
of a report is where the leverage was, twice now on this branch.

## Next

PR #34 awaits review.

Then the CLAUDE.md stale-prose sweep, still the next item in `docs/TASKS.md`'s
documents group, followed by `docs/persistence-spikes.md` becoming
`docs/persistence.md`.
