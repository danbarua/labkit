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
bun run mcp        # speaks MCP over stdio
```

That is the whole setup. On first run it creates `.labkit/` **in the working
directory**, holding an embedded PostgreSQL (PGlite, with Apache AGE for the
graph), and runs its migrations. That directory is the database, so where you
launch the server from decides which record you are working in — the `--cwd`
in the client configurations below is what pins it. Several processes may share
one directory: they elect a leader and the rest connect to it over a local
socket.

Two environment variables, and both have working defaults:

| variable | default | what it does |
| --- | --- | --- |
| `LABKIT_TENANT` | `labkit` | which tenant's graph to open. Each tenant is a separate research programme with its own graph; the slug is created on first use. |
| `LABKIT_DB_URL` | unset | connect to a real PostgreSQL instead of the embedded one. **Migrations are not run** on this path — that is an out-of-band deploy step by design. |

### Wiring it into a client

Claude Code:

```sh
claude mcp add labkit -- bun run --cwd /path/to/labkit mcp
```

Anything that reads an `mcpServers` block:

```json
{
  "mcpServers": {
    "labkit": {
      "command": "bun",
      "args": ["run", "--cwd", "/path/to/labkit", "mcp"],
      "env": { "LABKIT_TENANT": "my-programme" }
    }
  }
}
```

The server reads and writes. Nothing is exposed that the domain layer does not
already offer, and every tool is listed — with its arguments and its answer —
in [`docs/mcp-tools.md`](docs/mcp-tools.md). The same document is served live at
`labkit://docs/tools`, so a client can fetch it without leaving the session.

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

```sh
bun run dev            # the CLI
bun run build          # compiles it to bin/labkit
```

**Read-only by construction**: it builds a read surface and never a write one,
so it cannot change the record. `bun run mcp` is the half that writes.

## Developing

`CLAUDE.md` is the guide — architecture, the gates to run before committing,
and the AGE-specific traps. In short:

```sh
bun test                                    # read the pass/fail counts, not the exit code
bun run typecheck
npx depcruise src tests --output-type err
```

The reasoning behind the domain model is in `docs/project-journal/`, oldest
first; `docs/TASKS.md` is the work queue.

## Licence

See [LICENSE](LICENSE).
