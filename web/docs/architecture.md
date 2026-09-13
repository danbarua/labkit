# Overseer architecture

Audience: a developer or coding agent opening this package on GitHub with no chat history.

The overseer is a read-only HTTP module in front of one LabKit AGE graph. It is not the CLI. It is not MCP. LabKit domain writes stay in `../src/domain`.

## Surfaces

| Surface | Bind | Process |
|---------|------|---------|
| Hypermedia API | `127.0.0.1:$LABKIT_PORT_WEB` (8899 on main) | `bun run server` → `src/server/main.ts` |
| Explorer UI | `127.0.0.1:$LABKIT_PORT_EXPLORER` (8850 on main) | `bun run dev` → Vite, proxies collections to the API |
| Graph store | host `$LABKIT_PORT_DB` → container 5432 | `bash ../scripts/compose.sh up -d db` |

`GET /healthz` returns `{ ok, worktree, tenant }`. Use `worktree` to see which checkout answered. Two agents on one machine must not share 5432/8899/8850. See [infra.md](infra.md).

## Hypermedia

Graph identity is a handle (`Q_1`, `GATE_4`, `NOTE_68`). The URL is `/{collection}/{n}` where `n` is the numeric suffix.

```
GET /notes/68  →  { id: "NOTE_68", type: "Note", href: "/notes/68", properties, links }
```

`links.out` / `links.in` group existing edges by type. No edge means no link. Do not add a link to make a test green.

Unlabelled Cypher `MATCH (...)->(m)` skips per-label RLS. Neighbor queries therefore include `n.retracted IS NULL AND m.retracted IS NULL`. Otherwise GET follows a handle that 404s.

JSON root (`Accept: application/json` on `/`, or `/api` through Vite):

```
{ id: "labkit", href: "/", links: { start: { id: "Q_1", href: "/questions/1" }, collections: { ... } } }
```

The explorer loads `/api`, then `links.start`.

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
- Ingest copies stored edges even when current `EDGE_SCHEMA` would refuse them. The overseer shows what was recorded.
- Shared CLI/MCP/web contracts live under GitHub issue 393 (`danbarua/labkit`). This package reads the graph. It does not wait on those children.

## Out of scope

- Write verbs, `known` → `learned` as a first-class view, criterion → evaluation as a dashboard.
- Batch-generated datamodels.
- Architecture from `~/Code/AI/labkit-notebook` (Grok Build prototype).
- Restoring compose `spike` / `pooler` profiles or `docker/webapp`. Those served an HTTP MCP spike on 8899, not this explorer.
