# labkit-web architecture

Audience: a developer or coding agent opening this package on GitHub with no chat history.

labkit-web is (currently) a read-only HTTP module in front of one LabKit AGE graph. 

## Surfaces

| Surface | Bind | Process |
|---------|------|---------|
| Vite (UI + API) | `127.0.0.1:$LABKIT_PORT_EXPLORER` (8850 on main) | `bun run dev` |
| Graph store | `127.0.0.1:5433` | pg0 instance `labkit` |

`GET /healthz` returns `{ ok, worktree, tenant }`. Docker Compose: [infra.md](infra.md).

## Hypermedia

Graph identity is a handle (`Q_1`, `GATE_4`, `NOTE_68`). The URL is `/{collection}/{n}` where `n` is the numeric suffix.

```
GET /notes/68  →  application/hal+json
{
  id: "NOTE_68",
  type: "Note",
  properties,
  _links: { self: { href: "/notes/68", name: "NOTE_68" }, CONCERNS: [{ href, name, dir }] },
  _embedded: { CONCERNS: [{ id, type, dir, _links: { self } }] }
}
```

Rel names are EdgeLabel. No `links.in` / `links.out`. Direction is `dir` on the link and on the embedded neighbor. No edge means no rel. Do not add a link to make a test green.

HAL root (`Accept: application/hal+json` on `/`, or `/api` through Vite):

```
{ id: "labkit", _links: { self: { href: "/" }, start: { href: "/questions/1", name: "Q_1" }, questions: { href: "/questions" }, ... } }
```

The Trace Console starts at `/collections/workspace`.

## Trace Console

The browser app's page for the graph, at `/app/<API path>`: `/app/workspace/overlap_bench/Q_1` opens
`/workspace/overlap_bench/Q_1`. The page fetches that path and shows a resource or a collection
according to what the API answers, never by the shape of the path. Its code is `src/ui/trace/`.

| Column | Shows |
|--------|-------|
| Left | Two collections: the one picked (`?list=`) and the collection it is listed in. |
| Centre | The open resource. Tabs: Overview (properties, then a card for each related resource, outbound then inbound), Graph (the 2D/3D canvas, `GraphView`), Debug (the response and the record's events). `?tab=` names the tab. |

Every resource is requested at `depth=2`, so its neighbours arrive with their properties. The page
keeps each response as it arrived and draws from them; a resource's own response is the only one
that lists all of its relations. The palette comes from `@labkit/design`.

The Graph tab colours nodes by record type or by how they relate to the open resource (temporal).
The API returns no standing for a resource, so there is no standing overlay.

## Parent project

- Persistence: `@labkit/core-db` (`TenantGraph`, migrations, AGE session bootstrap).
- Node/edge vocabulary: `@labkit/core-db/domain`.
- Ingest copies stored edges even when current `EDGE_SCHEMA` would refuse them. The web app shows what was recorded.
- Shared CLI/MCP/web contracts live under GitHub issue 393 (`danbarua/labkit`). This package reads the graph. It does not wait on those children.
