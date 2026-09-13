# web/

This is **labkit-web**, the package in `web/`. It is the outer peel: HTTP and browser. LabKit core stays in `../src`. Import it. Do not change it.

Treat this directory as independent. Own `docs/`, `package.json`, Docker, and `scripts/`. Hygiene (pre-commit, pre-push, pre-PR) stays inside `web/`.

A researcher opens a handle and follows hypermedia links.

## Boot

From `web/`: `bun run dev`.

Postgres is the pg0 instance `labkit` at `127.0.0.1:5433` (`~/.pg0/instances/labkit`). Not hindsight (5432). Not PGlite. Vite migrates and seeds overlap_bench once, then serves UI + API.

HTTP port: **8850** on this checkout (`bun run ports`).

## Two Postgres

The labkit-web image is **built**, not a pulled `postgres` tag. `docker/postgres/Dockerfile` starts from `apache/age:release_PG18_1.7.0` and adds `CREATE DATABASE`. Compose names the result `labkit-web-db`. Host port is `LABKIT_PORT_DB` (5432 on main).

| Port (main) | Process | Role |
|------|---------|------|
| **5432** | Docker `labkit-web-db-1` | labkit-web. API, ingest, and Playwright use this. |
| **5433** | pg0 instance `labkit` (`~/.pg0/instances/labkit`) | Native Postgres 18.1.0 with AGE 1.7.0 installed. Not the labkit-web default. |

pg0 is not a failed install. AGE 1.7.0 is present, and `bootstrapSession()` always runs `LOAD 'age'` plus `SET search_path`. Docker won because it is this package's default `LABKIT_DB_URL` and skips a one-time native AGE build. pg0 already holds the same graph. Do not retarget labkit-web to 5433 unless the operator says so.

Ingest refuses destination databases named `labkit_tests` or `postgres`.

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

If `.current-handle` stays empty and the banner shows `404: Not Found`, Vite is stale. It is serving the SPA for `/questions/1` instead of proxying. Restart Vite. Then `curl -H 'accept: application/json' http://127.0.0.1:$LABKIT_PORT_EXPLORER/questions/1` must return `"id":"Q_1"`.

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
- Point ingest or the API at `labkit_tests` or `postgres`.
- Hide or strip explorer colour, layout, or 2D/3D chrome to "simplify" the UI.

v1 is read-only graph exploration. `known` → `learned`, criterion → evaluation as a first-class view, and an agent harness around this module are later work.
