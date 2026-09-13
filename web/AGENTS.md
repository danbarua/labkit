# web/

Read-only overseer for one LabKit graph. A researcher opens a handle and follows hypermedia links. This package does not run CLI or MCP verbs.

LabKit core stays in `../src`. This directory is the HTTP and browser surface.

## Boot

From `web/`:

1. Start Docker Postgres: `bun run db:up`. This calls `scripts/compose.sh`, which exports this worktree's `LABKIT_PORT_DB`. Do not run bare `docker compose up -d db`. That always binds 5432.
2. Copy the overlap_bench graph: `bun run ingest`.
3. Start the API: `bun run server`.
4. Start Vite: `bun run dev`.

Print this checkout's ports: `cd web && bun run ports`. The main checkout keeps **5432** (db), **8899** (API), **5173** (Vite). Other worktrees add a path-hash offset. `web` scripts load those env vars. Do not hard-code the bases.

Ingest is idempotent. If `Q_1` and `NOTE_68` already exist, it prints counts and exits.

PGlite source, as a sibling of this repo: `../08_overlap_bench/.labkit`. From `web/` that is `../../08_overlap_bench/.labkit`. The ingest script joins from `web/scripts/`, so its default is `../../../08_overlap_bench/.labkit`. Override with `LABKIT_SOURCE`. Dest default is `postgresql://postgres:agens@127.0.0.1:$LABKIT_PORT_DB/labkit`. Override with `LABKIT_DB_URL`. Tenant slug default: `overlap-bench`. Override with `LABKIT_TENANT`.

## Two Postgres

The overseer image is **built**, not a pulled `postgres` tag. `docker/postgres/Dockerfile` starts from `apache/age:release_PG18_1.7.0` and adds `CREATE DATABASE`. Compose names the result `labkit-web-db`. Host port is `LABKIT_PORT_DB` (5432 on main).

| Port (main) | Process | Role |
|------|---------|------|
| **5432** | Docker `labkit-web-db-1` | Overseer. API, ingest, and Playwright use this. |
| **5433** | pg0 instance `labkit` (`~/.pg0/instances/labkit`) | Native Postgres 18.1.0 with AGE 1.7.0 installed. Not the overseer default. |

pg0 is not a failed install. AGE is present (`CREATE EXTENSION age` works). A session that skips `LOAD 'age'` / `search_path = ag_catalog, public` fails with `type "agtype" does not exist`. That is why v1 uses the AGE image, which preloads the library. Do not retarget the overseer to 5433 unless the operator says so.

The image also creates `labkit_tests`. Root `bun run test:pg` truncates that database. **Never** give `test:pg` URL `.../labkit`. `reset()` would empty the overseer copy.

## Hypermedia

Identity is a JIRA-style handle (`Q_1`, `NOTE_68`). URL path is collection plus numeric suffix:

- `GET /questions/1` → `Q_1`
- `GET /notes/68` → `NOTE_68`

A relation is a link, or it is absent. Do not invent links. Neighbor queries filter `n.retracted IS NULL AND m.retracted IS NULL`. Unlabelled Cypher matches skip per-label RLS. A link to a retracted node 404s on the next GET.

JSON root is `GET /` with `Accept: application/json`, or `GET /api` through Vite. Shape: `{ id: "labkit", href: "/", links: { start, collections } }`. `links.start` is `Q_1`. HTML `GET /` is the explorer.

API binds `127.0.0.1:$LABKIT_PORT_WEB`. Vite proxies `/api` and each collection prefix to that port. The explorer fetches `/api`, then `links.start.href`.

A second process on the same port exiting 1 is a duplicate bind. Probe `/healthz` on the live port. Do not debug the duplicate if the live endpoint answers.

## Walk

Acceptance: a headless browser starts at the first pose and walks to the last minted note.

```
Q_1 → LOE_7 → NOTE_68
```

From `web/`: `bun run test:walk`. Playwright reuses a live API and Vite on this worktree's ports.

If `.current-handle` stays empty and the banner shows `404: Not Found`, Vite is stale. It is serving the SPA for `/questions/1` instead of proxying. Restart Vite. Then `curl -H 'accept: application/json' http://127.0.0.1:$LABKIT_PORT_UI/questions/1` must return `"id":"Q_1"`.

Chrome channel is required (`playwright.config.ts`). Do not pipe the test.

## Layout

```
web/
  src/server/     hypermedia HTTP (session, resources)
  src/ui/         explorer (App, GraphView, ResourcePanel)
  src/hypermedia.ts
  scripts/ingest-overlap-bench.ts
  scripts/with-ports.sh
  tests/walk.spec.ts
  docs/           architecture notes for humans and agents
  biome.jsonc     package-local. Root biome.jsonc does not include web/.
```

Lint and format from `web/`: `bun run check:lint`, `bun run check:format`. Root `bun run typecheck` also typechecks `web/tsconfig.json`. Root `bun test` runs `./tests` only. It does not run Playwright.

`biome lint` warns on `src/styles.css` (`.field span` after `#bar h1 span`). Specificity order matches the deleted explorer. Do not reorder those selectors to silence the warning.

## Do not

- Batch-generate a datamodel from the graph.
- Port architecture from `~/Code/AI/labkit-notebook`.
- Add write verbs on this surface.
- Use `MERGE` for edges. AGE can create an edge with `start_id` and `end_id` both 0. Ingest uses MATCH then CREATE.
- Point ingest or the API at `labkit_tests`.
- Hide or strip explorer colour, layout, or 2D/3D chrome to "simplify" the UI.

v1 is read-only graph exploration. `known` → `learned`, criterion → evaluation as a first-class view, and an agent harness around this module are later work.
