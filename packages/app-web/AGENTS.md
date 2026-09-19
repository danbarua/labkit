# app-web

The package in `packages/app-web`. LabKit core is `../core-db` and `../core-domain`. Import it as `@labkit/core-db/…`. Do not change it.

Treat this directory as independent. Own `docs/`, `package.json`, and `scripts/`. Hygiene (pre-commit, pre-push, pre-PR) runs from the repo root, and `bun run check:changed origin/main` narrows the tests to what a change reaches. `biome.jsonc` here is a nested config for this package.

A researcher opens a handle and follows hypermedia links.

The domain shape (event log as WAL, graph as projection, time as how you see it): [docs/map.md](docs/map.md). Infra and Docker Compose: [docs/infra.md](docs/infra.md).

## Running

`bun run dev` from here starts the API under `bun --watch` and Vite for the browser app, and Vite proxies the API's paths to it. One public port, and an edit to server code restarts the API by itself. `dev:api` and `dev:ui` run either half alone.

The paths Vite proxies are listed in `vite.config.ts`. A new top-level API route in `src/server/handler.ts` needs adding there too, or Vite answers it with a 404.

The browser app lives under `/app` and nowhere else. `/` sends a browser there, and every other path that neither the API nor Vite claims is a 404, never `index.html`. Routes are files in `src/routes`; the Vite plugin writes `src/routeTree.gen.ts` from them, and it is committed so typecheck works without running Vite.

A second process on the same port exiting 1 is a duplicate bind. Probe `/healthz` on the live port. Do not debug the duplicate if the live endpoint answers.

## Hypermedia

Identity is a handle (`Q_1`, `NOTE_68`), never wording.

A relation is a link, or it is absent. Do not invent links.

Neighbor queries filter `n.retracted IS NULL AND m.retracted IS NULL`. Unlabelled Cypher matches skip per-label RLS.

## Tests

`LABKIT_DB_URL=… bun run test` from here. Each run creates its own database on that server, seeds two workspaces, and drops it afterwards. Without the variable the suite skips, and reports it as skipped.

## Do not

- Use `MERGE` for edges. AGE can create an edge with `start_id` and `end_id` both 0. Ingest uses MATCH then CREATE.
- Point ingest or the API at `labkit_tests` or `postgres`. Ingest refuses both.
- Hide or strip explorer colour, layout, or 2D/3D chrome to "simplify" the UI.
- Reorder the selectors in `src/styles.css` to silence the `biome lint` specificity warning.
