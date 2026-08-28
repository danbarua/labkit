# LabKit

A research control plane: it tracks **why** a computation was run, what evidence
resulted, what claims and decisions depend on it, and what is still unresolved.

It is not experiment telemetry — W&B and MLflow own metrics, run logs and
sweeps. LabKit owns provenance, justification and dependency propagation, and
answers questions like *why does this conclusion count as supported?*, *what
breaks if this record turns out to be wrong?* and *is this gate actually
satisfied, or has nobody checked?*

The primary interface is an **MCP server**, so the caller is usually an agent.

## Running the MCP server

```sh
bun install
bun run build        # compiles bin/labkit
./bin/labkit mcp     # speaks MCP over stdio
```

**One binary.** `labkit mcp` is the server; everything else `labkit` does is a
command for a person. Two executables would have been two copies of the same
77MB runtime.

On first run it creates `.labkit/` — an embedded PostgreSQL (PGlite, with Apache
AGE for the graph) — and runs its migrations. **That directory is the database.**
It goes wherever `LABKIT_HOME` points, or in the working directory if that is
unset.

The file is single-writer, so a process takes an exclusive lock for the length
of a unit of work and gives it back: several agents can share one project, and
one waits briefly while another is mid-command.

Three environment variables, and all have working defaults:

| variable | default | what it does |
| --- | --- | --- |
| `LABKIT_HOME` | the working directory | which directory holds `.labkit/`. The CLI's `--db` says the same thing; `labkit mcp` takes no such flag. |
| `LABKIT_TENANT` | `labkit` | which tenant's graph to open, within one database. |
| `LABKIT_DB_URL` | unset | connect to a real PostgreSQL instead of the embedded one. **Migrations are not run** on this path — an out-of-band deploy step by design. |

**Most projects never touch `LABKIT_TENANT`**, provided each has its own
`.labkit/`. A directory is a database, so one project is one record and the
default tenant is all of it. Tenants separate programmes that share *one*
database — a real PostgreSQL over `LABKIT_DB_URL`, or two clients deliberately
pointed at one directory.

### Wiring it into a client

Put `labkit` on your `PATH`, then:

```json
{
  "mcpServers": {
    "labkit": {
      "command": "labkit",
      "args": ["mcp"]
    }
  }
}
```

**No paths and no environment.** That is the point of the binary: there is
nothing in this block for a client to expand, mis-expand, or leave literal, and
nothing that differs between your machine and a colleague's. It is safe to
commit. If `labkit` is not on `PATH`, give `command` the absolute path to the
binary and change nothing else.

Or, for Claude Code, from the project directory:

```sh
claude mcp add labkit -- labkit mcp
```

**The record lands where the client starts the server.** With no `LABKIT_HOME`
that is the working directory, and a client launched from a subdirectory of your
project puts `.labkit/` in the subdirectory. Set `LABKIT_HOME` if you want it
pinned regardless — but then it is a literal path, and a literal path in a
committed file is right on one machine only.

**Do not put LabKit in `user` scope**, or whatever your client calls a config
that applies everywhere. One entry then makes every directory you open a LabKit
record, including the ones with nothing to do with research. If you do want a
shared record across projects, say so deliberately: a fixed `LABKIT_HOME`, and a
`LABKIT_TENANT` per programme.

The server reads and writes. Nothing is exposed that the domain layer does not
already offer, and every tool is listed — with its arguments and its answer — at
`labkit://docs/tools`, which a client can fetch without leaving the session. It
is rendered from the tool declarations on each read and stored nowhere, so it
cannot disagree with the server.

### Where to start, as an agent

`known` answers *what does this programme know?* and hands back question ids.
`pursuits_of` turns one of those into the enquiry ids every recording verb
takes. From there the usual loop is `open_enquiry` → `record_observations` →
`record_analysis` → `close_enquiry`, and the reads (`why_supported`,
`what_depends_on`, `gate_status`) answer about what those put on the record.

Every handle is an opaque short id — `Q_3`, `LOE_7`, `COMP_12`, `CLM_4` — and
every verb takes handles, never wording. `claims_asserting` is the single place
text becomes a handle, and it returns *every* match rather than picking: two
lines of enquiry can assert the same sentence about different endpoints, and
they are two different claims.

## The CLI

The same binary, without the `mcp` subcommand:

```sh
labkit --help
labkit known           # what does this programme know?
bun run dev --help     # the same thing, from source
bun run example        # a narrated lifecycle, for reading
```

It reads **and writes** — every verb the MCP server exposes has a command — and
`--json` gives the same document an MCP client gets. `--db <dir>` picks the
record; `--author` names who is acting, since a script driving LabKit is not the
account it runs under.

Running `labkit known` in a terminal while an agent session is open is the
ordinary case, not an edge one: the server holds the database only for the
length of a tool call, so the two take turns rather than colliding.

## Developing

`CLAUDE.md` is the guide — architecture, the traps, and why things are the way
they are. Before committing:

```sh
bun run check          # the whole sweep: tests, types, layering, every check:*
```

It derives its own list, so this line does not go stale as checks are added.
Never pipe `bun test` — `$?` reports the pipe, and the `(fail)` lines are what
you needed.

```sh
bun run test:pg        # the same suite against a real Postgres + AGE container
```

Not in the sweep, because it needs Docker. Cloud Build runs it, and
`bun run check`, on every pull request to `main`; see `infra/ci/`.

The reasoning behind the domain model is in `docs/project-journal/`, oldest
first; `gh issue list` is the work queue.

## Licence

See [LICENSE](LICENSE).
