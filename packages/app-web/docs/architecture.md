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
| Centre | The graph, a card that folds: the resources opened in the workspace since its last reset and what they relate to, on a 3D canvas (`GraphView`). Clicking a node opens its resource. Below it, the open resource. Tabs: Overview (properties, then a card for each related resource, outbound then inbound), Debug (the response and the record's events). `?tab=` names the tab. |

Every resource is requested at `depth=2`, so its neighbours arrive with their properties. The page
keeps each response as it arrived and draws from them; a resource's own response is the only one
that lists all of its relations. The palette comes from `@labkit/design`.

An act records a change to a resource rather than being one, so the graph draws an opened act as
the act's subject and has no nodes for acts. When a node opens, the camera eases toward framing
it:

- The camera draws the node up and left of centre.
- The camera tilts to 20° above the plane of the force layout.
- The camera turns so that the node's neighbours are drawn spread out. The neighbours that arrive
  with a resource's response lie close together on the time axis, and a turn that looks along
  them would draw them in a line. Among the turns that draw them spread out, the camera considers
  those that put the rest of the graph behind them and nearly as far toward the bottom-right
  corner, behind the hover card, as the best one does. Of those, it takes the turn nearest its
  current one, so opening another node turns the camera no further than it must.
  The camera turns at most 45° a second, so a large turn sweeps over seconds rather than snaps.
- The camera zooms so the node's neighbours fill 30% of the canvas's shorter side.
- The camera swings 30° either side of that turn, about the vertical through the node, once every
  16 seconds, so depth shows by parallax. It holds still while the pointer is on the canvas and
  does not swing when the reader's system asks for reduced motion.

A drag or a scroll stops the framing until the next node opens; Reset starts it again. The graph colours nodes by record type or by how they relate to the open resource (temporal).

No two labels on the canvas overlap. In each frame, labels are placed in this order, and a label
that would overlap one already placed is not drawn:

1. The open and hovered nodes' labels and their edges' labels, drawn even where they overlap.
2. The open node's neighbours' labels.
3. Other nodes' labels.
4. Other edges' labels.

Within each step, a label drawn in the previous frame comes first, so labels do not flicker as the
camera moves; then the nearest. Hovering a node shows its card whether or not its label is drawn.
The API returns no standing for a resource, so there is no standing overlay.

The graph card's Play button steps through later acts, one at a time, in the order the acts were
recorded. Where it starts, and what each step opens, depend on what is open:

| Open | Starts | Each step opens |
|------|--------|-----------------|
| The acts collection | before the first act | the next act; the graph draws its subject |
| An act | after that act | the next act; the graph draws its subject |
| Any other resource | after the first act whose events name it | the next act's subject |

Each step adds a history entry. A resource that fails to load shows its error, and playback goes
on to the next act. While playback runs and the pointer is off the canvas, the card in the canvas's
corner shows the current act's subject. With the pointer on the canvas, the card shows only the
node under the pointer.

Playback stops at the last act, on Pause, and when the reader opens anything else. The code is
`src/ui/trace/playback.ts`.

## Parent project

- Persistence: `@labkit/core-db` (`TenantGraph`, migrations, AGE session bootstrap).
- Node/edge vocabulary: `@labkit/core-db/domain`.
- Ingest copies stored edges even when current `EDGE_SCHEMA` would refuse them. The web app shows what was recorded.
- Shared CLI/MCP/web contracts live under GitHub issue 393 (`danbarua/labkit`). This package reads the graph. It does not wait on those children.
