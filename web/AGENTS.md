# web/

The package in `web/`. LabKit core stays in `../src`. Import it. Do not change it.

Treat this directory as independent. Own `docs/`, `package.json`, and `scripts/`. Hygiene (pre-commit, pre-push, pre-PR) stays inside `web/`.

A researcher opens a handle and follows hypermedia links.

The domain shape (event log as WAL, graph as projection, time as how you see it): [docs/map.md](docs/map.md).

## Boot

From `web/`: `bun run dev`.

Postgres is the pg0 instance `labkit` at `127.0.0.1:5433` (`~/.pg0/instances/labkit`). Vite migrates and seeds overlap_bench once, then serves UI + API.

HTTP port: **8850** on this checkout (`bun run ports`).

Docker Compose is optional. When you need it: [docs/infra.md](docs/infra.md).

Ingest refuses destination databases named `labkit_tests` or `postgres`.

## Hypermedia

Identity is a JIRA-style handle (`Q_1`, `NOTE_68`). URL path is collection plus numeric suffix:

- `GET /questions/1` → `Q_1`
- `GET /notes/68` → `NOTE_68`

A relation is a link, or it is absent. Do not invent links. Neighbor queries filter `n.retracted IS NULL AND m.retracted IS NULL`. Unlabelled Cypher matches skip per-label RLS. A link to a retracted node 404s on the next GET.

The HAL API is JSON for every GET, including a browser `Accept: text/html`. `GET /api` is the root document (`application/hal+json`). Rel names are EdgeLabel. Direction is `_links.*.dir` / `_embedded.*.dir`, not `in`/`out` keys. `_links.start` is `Q_1`. HTML `GET /` is the explorer. Missing resources are `application/problem+json`.

Vite serves the explorer and the API on `$LABKIT_PORT_EXPLORER` (8850 on this checkout). The explorer fetches `/api`, then `_links.start.href`.

A second process on the same port exiting 1 is a duplicate bind. Probe `/healthz` on the live port. Do not debug the duplicate if the live endpoint answers.

## Walk

UI hop (Playwright): first pose to last minted note.

```
Q_1 → LOE_7 → NOTE_68
```

`bun run test:walk`. Chrome channel. Do not pipe the test.

API walk (no browser): `Q_1` to last non-Note (`CLM_27`) following HAL `_links`, skipping Notes and `CONCERNS`. Notes attach to anything; they are not the graph.

`bun run test:walk-api`.

If `.current-handle` stays empty and the banner shows `404: Not Found`, Vite is stale. Restart Vite. Then `curl -H 'accept: application/hal+json' http://127.0.0.1:$LABKIT_PORT_EXPLORER/questions/1` must return `"id":"Q_1"` and `"_links"`.

## Layout

```
web/
  src/server/     hypermedia HTTP (runtime, resources)
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

- Use `MERGE` for edges. AGE can create an edge with `start_id` and `end_id` both 0. Ingest uses MATCH then CREATE.
- Point ingest or the API at `labkit_tests` or `postgres`.
- Hide or strip explorer colour, layout, or 2D/3D chrome to "simplify" the UI.