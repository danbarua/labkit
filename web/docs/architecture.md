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

Unlabelled Cypher `MATCH (...)->(m)` skips per-label RLS. Neighbor queries therefore include `n.retracted IS NULL AND m.retracted IS NULL`. Otherwise GET follows a handle that 404s.

HAL root (`Accept: application/hal+json` on `/`, or `/api` through Vite):

```
{ id: "labkit", _links: { self: { href: "/" }, start: { href: "/questions/1", name: "Q_1" }, questions: { href: "/questions" }, ... } }
```

The explorer loads `/api`, then `_links.start`.

## Explorer

Colour and chrome come from the deleted `explorer/` tree (removed in `207a96e2`, 2026-09-08). Tokens in `src/styles.css` match that file:

`--bg #0b0e14`, `--panel #12151d`, `--panel-border #232838`, `--text #d7dce4`, `--text-dim #808a9c`, `--accent #5ad1c9`, `--amber #e0b25a`, `--danger #e0687a`.

Keep `#bar` (title, 2D/3D, colour overlay kind/standing/temporal, current handle) and the resource pane. GraphView is the 2D/3D canvas. Do not replace this with a generic admin theme.

## Walk

Playwright (`tests/walk.spec.ts`) boots the UI and clicks:

`Q_1` → `LOE_7` → `NOTE_68`

That is the first `labkit pose` question on overlap_bench, then the enquiry it motivates, then the last minted note (event 215, `NOTE_68 -[:CONCERNS]-> LOE_7`).

## Parent project

- Persistence: `../src/db` (`TenantGraph`, migrations, AGE session bootstrap).
- Node/edge vocabulary: `../src/db/domain.ts`.
- Ingest copies stored edges even when current `EDGE_SCHEMA` would refuse them. The web app shows what was recorded.
- Shared CLI/MCP/web contracts live under GitHub issue 393 (`danbarua/labkit`). This package reads the graph. It does not wait on those children.
