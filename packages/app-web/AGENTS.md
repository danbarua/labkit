# app-web

The package in `packages/app-web`. LabKit core is `../core-db` and `../core-domain`. Import it as `@labkit/core-db/…`. Do not change it.

Treat this directory as independent. Own `docs/`, `package.json`, and `scripts/`. Hygiene (pre-commit, pre-push, pre-PR) runs from the repo root, and `bun run check:changed origin/main` narrows the tests to what a change reaches. `biome.jsonc` here is a nested config for this package.

A researcher opens a handle and follows hypermedia links.

The domain shape (event log as WAL, graph as projection, time as how you see it): [docs/map.md](docs/map.md). Infra and Docker Compose: [docs/infra.md](docs/infra.md).

## Running

`bun run dev` from here starts the API under `bun --watch` and Vite for the browser app, and Vite proxies the API's paths to it. One public port, and an edit to server code restarts the API by itself. `dev:api` and `dev:ui` run either half alone.

The paths Vite proxies are listed in `vite.config.ts`. A new top-level API route in `src/server/handler.ts` needs adding there too, or Vite answers it with a 404.

The browser app lives under `/app` and nowhere else. `/` sends a browser there, and every other path that neither the API nor Vite claims is a 404, never `index.html`. Routes are files in `src/routes`; the Vite plugin writes `src/routeTree.gen.ts` from them, and it is committed so typecheck works without running Vite.

`LABKIT_DB_URL=… bun run db:migrate` applies core's migrations to an empty or existing Postgres database. The API never migrates, so run it before starting the API against a new database.

A second process on the same port exiting 1 is a duplicate bind. Probe `/healthz` on the live port. Do not debug the duplicate if the live endpoint answers.

## Hypermedia

Identity is a handle (`Q_1`, `NOTE_68`), never wording.

A relation is a link, or it is absent. Do not invent links.

Neighbor queries filter `n.retracted IS NULL AND m.retracted IS NULL`. Unlabelled Cypher matches skip per-label RLS.

## Tests

`bun run test` from here runs the API tests on in-memory PGlite, with nothing to install. Set `LABKIT_DB_URL` to a Postgres server and the same suite runs on Postgres instead, in a throwaway database it creates and drops. Two tests only mean something on a real pool of connections, so they run on Postgres and skip on PGlite. A bare `bun test` at the repo root finds this suite too.

`bun run e2e` drives the browser app in Chrome, on PGlite. `e2e/stack.ts` starts the API in its own process space, the Vite dev server, and a preview of a fresh build, and the tests run against both the dev server and the built bundle. The specs are named `*.e2e.ts` so `bun test` does not pick them up.

## Do not

- Use `MERGE` for edges. AGE can create an edge with `start_id` and `end_id` both 0. Ingest uses MATCH then CREATE.
- Point ingest or the API at `labkit_tests` or `postgres`. Ingest refuses both.
- Hide or strip explorer colour, layout, or 2D/3D chrome to "simplify" the UI.
- Reorder the selectors in `src/styles.css` to silence the `biome lint` specificity warning.
