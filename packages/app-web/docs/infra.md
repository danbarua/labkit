# Infra

Daily dest is the pg0 instance `labkit` at `127.0.0.1:5433` (`~/.pg0/instances/labkit`). AGE 1.7.0 is installed (`age.dylib`, `CREATE EXTENSION age`). `bootstrapSession()` in `@labkit/core-db/backend` runs `LOAD 'age'` and `SET search_path = ag_catalog, "$user", public` on every direct connection.

## Docker Postgres

Optional. Isolated AGE Postgres for when pg0 is the wrong dest.

`docker/postgres/Dockerfile` builds from `apache/age:release_PG18_1.7.0`. Initdb creates database `labkit` only. Extensions, roles, and schema come from LabKit migrations.

From `web/`:

```
bun run db:up
```

That runs `scripts/dev/compose.sh` with `--project-name labkit-web` and host port **5432**. Every checkout shares this database. `bun run db:down` stops that shared `db` service. It does not delete the volume.

Ingest refuses destination databases named `labkit_tests` or `postgres`.

## Ports

`scripts/dev/worktree-ports.sh` hashes the worktree path for **HTTP**. Daily Postgres is pg0 on **5433**. Docker, when used, is **5432**.

| Env | Main | Use |
|-----|------|-----|
| `LABKIT_PORT_EXPLORER` | 8850 | Vite (UI + API). Other worktrees offset this. |
| `LABKIT_PORT_DB` | 5432 | Optional Docker Postgres (`bun run db:up`) |
| `LABKIT_PORT_WEB` | 8899 | Optional `bun run server` without Vite |

`bun run dev` is the loop. Vite migrates, seeds if source `max(labkit_event.seq)` moved, and serves both surfaces. Restart Vite if `/healthz` 404s because a stale process is sitting on 8850.

## Ingest

`bun run ingest` copies `../08_overlap_bench/.labkit` (repo-sibling path) into dest Postgres, tenant `overlap-bench`. Default dest is pg0 `labkit` on 5433.

The live PGlite directory is locked. Ingest copies it to a temp dir first. Nodes keep stored `natural_id` values so `Q_1` and `NOTE_68` survive. Edges are MATCH then CREATE. Do not `MERGE` relationships. AGE can mint an edge whose `start_id` and `end_id` are both 0.

Expected counts on overlap_bench: **290** nodes, **452** edges.

## Cull (`207a96e2`, 2026-09-08)

Deleted on purpose: `explorer/` (static 2D/3D), `docker/webapp`, compose `spike`/`pooler`/`migrate` services, and a large comment/markdown pass.

Kept as facts, not restored as code:

- Explorer colour tokens and `#bar` layout (now `web/src/styles.css`).
- Compose `db` service and `LABKIT_PORT_DB`.
- Worktree port hash (the 2026-08-28 failure: one worktree's `/healthz` looked like yours).

Not restored: HTTP MCP spike, `labkit_spike` database, batch datamodel generation from a LabKit dump.
