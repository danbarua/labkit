# web/

The package in `web/`. LabKit core stays in `../src`. Import it. Do not change it.

Treat this directory as independent. Own `docs/`, `package.json`, and `scripts/`. Hygiene (pre-commit, pre-push, pre-PR) stays inside `web/`. `biome.jsonc` is package-local; the root one does not include `web/`.

A researcher opens a handle and follows hypermedia links.

The domain shape (event log as WAL, graph as projection, time as how you see it): [docs/map.md](docs/map.md). Infra and Docker Compose: [docs/infra.md](docs/infra.md).

## Running

`bun run dev` from `web/`. Ports come from `bun run ports`; the main checkout keeps the defaults.

Vite does not reload `src/server/` or `src/infra/` on change. Restart it, or you are testing the old code.

A second process on the same port exiting 1 is a duplicate bind. Probe `/healthz` on the live port. Do not debug the duplicate if the live endpoint answers.

## Hypermedia

Identity is a handle (`Q_1`, `NOTE_68`), never wording.

A relation is a link, or it is absent. Do not invent links.

Neighbor queries filter `n.retracted IS NULL AND m.retracted IS NULL`. Unlabelled Cypher matches skip per-label RLS.

The SPA is served at `/` only. Every other path that no handler claims is a 404, never `index.html`.

## Tests

`tests/walk*` are stale and tied to specific data. They are reference for writing tests, not a suite to keep green.

## Do not

- Use `MERGE` for edges. AGE can create an edge with `start_id` and `end_id` both 0. Ingest uses MATCH then CREATE.
- Point ingest or the API at `labkit_tests` or `postgres`. Ingest refuses both.
- Hide or strip explorer colour, layout, or 2D/3D chrome to "simplify" the UI.
- Reorder the selectors in `src/styles.css` to silence the `biome lint` specificity warning.
