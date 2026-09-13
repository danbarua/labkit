# Infra

## Docker Postgres

`docker/postgres/Dockerfile` builds from `apache/age:release_PG18_1.7.0`. It is not a pulled `postgres` image. Initdb creates database `labkit` only. Extensions, roles, and schema come from LabKit migrations.

Start it from `web/`:

```
bun run db:up
```

That runs `scripts/compose.sh`, which exports this worktree's `LABKIT_PORT_DB` first and sets `--project-name` to `labkit-overseer` (or `labkit-overseer-<offset>` in a worktree). Bare `docker compose up -d db` binds **5432** and uses project name `web`. `bun run db:down` stops this worktree's `db` service. It does not delete the volume.

Ingest refuses destination databases named `labkit_tests` or `postgres`.

## pg0

A native Postgres 18.1.0 lives at `~/.pg0/instances/labkit` on **5433**. AGE 1.7.0 is installed there (`age.dylib`, `CREATE EXTENSION age`).

pg0 is compatible. `bootstrapSession()` in `src/db/backend.ts` always runs `LOAD 'age'` and `SET search_path = ag_catalog, "$user", public` on every direct connection. Docker won because it is this package's default URL and skips the one-time native AGE compile. This pg0 instance already holds the same 290/452 graph.

Leave 5433 alone unless an operator names it.

## Ports

`scripts/worktree-ports.sh` (this package) hashes the worktree path. Offset 0 is the main checkout. Other worktrees use `10000 + cksum(path) % 10000`. A hash collision is refused.

| Env | Main | Use |
|-----|------|-----|
| `LABKIT_PORT_DB` | 5432 | Docker Postgres host port |
| `LABKIT_PORT_WEB` | 8899 | Overseer API |
| `LABKIT_PORT_EXPLORER` | 8850 | Vite explorer |

`web/scripts/with-ports.sh` exports these, then execs. `bun run server`, `dev`, `ingest`, and `test:walk` all go through it.

Vite `strictPort` is on. If 8850 (or the worktree explorer port) is taken, Vite exits. Playwright `reuseExistingServer` will keep a **stale** Vite that was started without the current proxy. Symptom: UI banner `404: Not Found`, `.current-handle` empty, `GET /questions/1` through Vite returns `index.html`. Restart Vite. Confirm JSON:

```
curl -H 'accept: application/json' http://127.0.0.1:$LABKIT_PORT_EXPLORER/questions/1
```

Two API processes on one port: the second exits 1. If `/healthz` on that port already returns `ok`, ignore the failed duplicate.

## Ingest

`bun run ingest` copies `../08_overlap_bench/.labkit` (repo-sibling path) into Docker `labkit`, tenant `overlap-bench`.

The live PGlite directory is locked. Ingest copies it to a temp dir first. Nodes keep stored `natural_id` values so `Q_1` and `NOTE_68` survive. Edges are MATCH then CREATE. Do not `MERGE` relationships. AGE can mint an edge whose `start_id` and `end_id` are both 0.

Expected counts on overlap_bench: **290** nodes, **452** edges.

## Cull (`207a96e2`, 2026-09-08)

Deleted on purpose: `explorer/` (static 2D/3D), `docker/webapp`, compose `spike`/`pooler`/`migrate` services, and a large comment/markdown pass.

Kept as facts, not restored as code:

- Explorer colour tokens and `#bar` layout (now `web/src/styles.css`).
- Compose `db` service and `LABKIT_PORT_DB`.
- Worktree port hash (the 2026-08-28 failure: one worktree's `/healthz` looked like yours).

Not restored: HTTP MCP spike, `labkit_spike` database, batch datamodel generation from a LabKit dump.
