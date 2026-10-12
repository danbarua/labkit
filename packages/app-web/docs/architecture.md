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

The web app starts at a list of the workspaces, read from `/workspace`. Everything after that is inside one workspace, so the app reads nothing from `/collections`.

### Files and history

A workspace serves its committed files and its git history when `workspaces.local.json` maps it to
a repository (`docs/environment.md`, `LABKIT_WORKSPACES_FILE`). The API reads them from the
repository with es-git on each request; they are not in the graph. Its index then lists two more
collections, `file` (type `File`) and `commit` (type `Commit`).

| Path | Serves |
| --- | --- |
| `/workspace/{slug}/commit` | The commits from HEAD, newest first, paged by `limit` and `offset`. It links the timeline and the branches. |
| `/workspace/{slug}/timeline` | Every commit reachable from a branch or HEAD, newest first and never a parent before its child, each with its parents' ids and the names of the branches that point to it, paged. |
| `/workspace/{slug}/branch` | The branches: local, then remote-tracking, HEAD's marked `current`. A remote's `HEAD` is a pointer to another branch, so it is left out. |
| `/workspace/{slug}/branch/{name}` | One branch, its name one encoded path segment (`origin%2Fmain`). |
| `/workspace/{slug}/commit/{id}` | One commit: message, author, time, line counts, and its relations; not its diff. |
| `/workspace/{slug}/commit/{id}/diff` | The commit's diff from its first parent, one `Diff` resource per changed file, paged. |
| `/workspace/{slug}/commit/{id}/diff/{path}` | One changed file's diff: its status and unified diff, cut at 20,000 characters (`patch_truncated`). |
| `/workspace/{slug}/file/{path}` | The tree at HEAD: a directory as a collection of its entries, a file as a resource with its text, cut at 100,000 characters (`content_truncated`). A listed file carries `media_type` only when the extension table names its extension; the file's own resource always carries it. |
| `/workspace/{slug}/commit/{id}/file/{path}` | The same, at that commit. |
| `/workspace/{slug}/paths` | Every file's path in the tree at HEAD, in name order, as a `paths` array: what the chat offers to mention. Directories and submodules are not listed. At most 5,000 paths; `total` counts them all and `truncated` says when some are left out. The top directory at HEAD links it as `paths`. |
| `/workspace/{slug}/raw/{path}` | A file's committed bytes at HEAD, as its media type. A file over 20 MiB gets a 413 that names its size. |
| `/workspace/{slug}/commit/{id}/raw/{path}` | The same, at that commit. |
| `/workspace/{slug}/commit/{id}/changes` | The files the commit changed, with their status, paged. |
| `/workspace/{slug}/commit/{id}/acts` | The acts that ran against the commit, oldest first, paged. |
| `/workspace/{slug}/commit/{id}/events` | Every change the acts that ran against the commit made, a page of acts at a time, as a record's `events` are. The commit links it only when an act ran against it. |
| `/workspace/{slug}/history/{path}` | The commits that changed the file, from HEAD back along first parents, newest first, paged. A rename is not followed. |
| `/workspace/{slug}/commit/{id}/history/{path}` | The same, from that commit. |

Only committed content is served. A path is looked up in the commit's tree, never on disk. A
binary file and text that is not UTF-8 are served without content.

A file's `media_type` comes from its extension, by the table in `src/server/media-types.ts`. A file
whose extension the table does not name is `text/plain` when git finds it is text, and
`application/octet-stream` when git finds it is binary. The file links its bytes as `raw`. The raw
response sets:

- `content-type` to the media type, with `charset=utf-8` only on text that is UTF-8;
- `x-content-type-options: nosniff`, so a browser never reads it as another type;
- `content-security-policy: sandbox`, so an HTML or SVG file opened on its own runs no script.

Commits, files and acts relate as the graph's records do, `<edge>:<type>` out and `<type>:<edge>`
in, each relation listing at most 25 resources, the page size of every collection; the collection
link beside it has the rest:

| On | Relation | To | The rest |
| --- | --- | --- | --- |
| A branch | `points_to:commit` | the commit at its tip | — |
| A commit | `parent:commit` | its parents | — |
| A commit | `changes:file`, with each file's status in the link's `props` | the files it changed | `changes` |
| A commit | `act:ran_against` | the acts whose `git_hash` is the commit | `acts` |
| A file | `commit:changes` | the commits that changed it | `history` |
| An act | `ran_against:commit` | its `git_hash`, when the workspace's repository holds it | — |

## Pages and their chrome

Every page of the app, the Trace Console and the development pages (the gallery, the sessions list,
session replays and the agent), shares one frame: `src/ui/chrome/Frame.tsx` and `chrome.css`. The
frame gives a page the palette, the top bar and the resizable border. The theme is one setting
(`useSavedTheme`) that every component reads, so the button in the top bar and the content agree.
The development pages have no link in the Trace Console, except `agent`, and are reached by their
addresses.

## Trace Console

The browser app's page for the graph, at `/app/<API path>`: `/app/workspace/overlap_bench/Q_1` opens
`/workspace/overlap_bench/Q_1`. The page fetches that path and shows a resource or a collection
according to what the API answers, never by the shape of the path. Its code is `src/ui/trace/`.

Content of unknown length is drawn with the views the chat uses, from `@labkit/ui`, whose styles
are `@labkit/ui/content.css`:

| View | Draws | In the Trace Console |
| --- | --- | --- |
| `ContentCard` | A card that folds under its header, with controls beside the title. | The graph, the Debug response, a file's text, a commit's message, changed files and each file's diff. |
| `CodeView` | Text numbered by line and highlighted by its language, showing its first lines until the rest is asked for. | A file's text, its first 40 lines. |
| `JsonView` | A JSON value through `CodeView`. | The Debug response, its first 40 lines. |
| `DiffView` | One file's diff, from two texts or from a unified patch, with the same cut. | Each changed file of a commit, its first 40 rows. |
| `MarkdownText` | Markdown, with raw HTML dropped. `resolveUrl` rewrites its images' and links' addresses. | A markdown file. |

The page shows a file by the `media_type` its resource names, never by its extension
(`viewerOf` in `git-views.tsx`):

| Media type | Shown as |
| --- | --- |
| `text/markdown` | Rendered, with a toggle to its source as code. A relative image address resolves to the repository's `raw` file, and a relative link opens that file on the page. An address starting with `/` resolves against the repository's root. |
| `text/*`, `application/json`, `application/yaml`, `application/toml` | Code. |
| `image/*` | The picture, from `raw`. When it does not load, a note links the raw response, which says why. |
| `application/pdf` | A link that opens it in a new tab. |
| Anything else | A note with a download link. |

Text that is not UTF-8, or a binary file of a text type, gets the note.

| Column | Shows |
|--------|-------|
| Left | The sidebar, in three sections that fold: File Explorer, Source Explorer, and Record Explorer. In a workspace, Record Explorer lists the workspace's collections and, below, the one picked (`?list=`), or the open collection and the collection it is listed in. Before a workspace is picked it is disabled and says so. Collections takes at most 40% of Record Explorer and scrolls beyond that; Items has the rest. |
| Centre | The graph, a card that folds: the resources opened in the workspace since its last reset and what they relate to, on a 3D canvas (`GraphView`). Clicking a node opens its resource. Below it, the open resource. Tabs: Overview (properties, then a card for each related resource, outbound then inbound), Debug, drawn as a wrench (the response; the events of the record, or of the acts that ran against the commit, each a line with chips for the records it names; and the commits those acts ran against). `?tab=` names the tab. The tabs and Reload sit at the right of the line with the resource's name. |
| Right | In development, in a workspace: the agent's chat. At full width it slides open and shut beside a rail that stays; the rail's button expands or minimises it. In a window 860 px wide or narrower it is a drawer over the page from the right, opened by a button in the top bar. Its sessions open in the workspace's folder, which the dev server reads from the workspaces mapping file (`/agent-workspace/<slug>`). A workspace's session connects the first time the chat is shown in that workspace, and stays connected while the chat is hidden; a workspace the chat was never shown in has no session. Each workspace keeps its session for the life of the page: leaving it and coming back reopens that session. `?session=` names the session of the workspace in scope, so a reload reopens it. A workspace the file does not map has no chat, and the button is disabled with the reason. `/new` starts a session in place, and `/sessions` lists the sessions the agent keeps for the workspace's folder (ACP `session/list` by `cwd`), newest first, in a palette; picking one reopens it. `@` offers the workspace's files at HEAD (`/paths`); each file a message mentions is sent with it as a `resource_link` to the file in the workspace's folder (`file://<folder>/<path>`), which the agent reads itself. The border at the chat's left edge moves by drag, by Left and Right (16 px), and by Home and End (to 320 px, and to 60% of the window); a double-click returns it to 400 px, and the browser keeps the width. |

The top bar holds the LabKit mark and name, which are one button that opens the list of workspaces,
and the theme button, which has no border or background. The browser's own Back and Forward buttons
step through the pages opened.

The rail is a 44 px column at the left edge that stays when the sidebar is hidden. Its first button
shows or hides the sidebar. Below it, one button for each section (File Explorer, Source Explorer,
Record Explorer) folds the section when it is showing, and otherwise opens it and shows the sidebar.
A button for a section that is unavailable is disabled, with the reason as its tooltip. The sidebar
toggle works like this:

- At full width, the sidebar is shown or hidden in place, and the browser keeps the choice for the
  next visit.
- In a window 860 px wide or narrower, the sidebar is a drawer over the page, closed until the
  button opens it. Opening a resource closes it.

The browser also keeps whether each section is folded. The sections list:

| Section | Lists | Opening an item shows |
| --- | --- | --- |
| File Explorer | The workspace's files at HEAD, as a tree. A directory's entries are fetched when it is first opened. Each file's icon and colour come from its listed `media_type` (`file-icons.tsx`); a file listed without one has the plain file icon. The box that marks the open file slides to the next file opened. A file opened from anywhere else, such as the graph or a link, opens the folders above it. Its filter lists the files whose paths hold every word typed, from `/paths`, so files in folders not yet opened are found. | The file, shown as its media type. |
| Source Explorer | Every branch's commits, newest first, with each branch's line drawn beside them as `git log --graph` draws it, and branch names on the commits they point to. A branch picker opens on HEAD's branch and scrolls to the picked branch's tip. The box that marks the open commit slides to the next commit opened. Its filter narrows the commits loaded so far, by id, message, author or branch, and says how many it searched. | The commit's properties, message, parents, changed files and diff. A changed file opens as it was at that commit. |
| Record Explorer | The workspace's collections of records and acts, and the items of the one picked. The `file` and `commit` collections are left out. | The record. |

Items, File Explorer and Source Explorer each have a filter, hidden until the search button at the right of the list's header shows it. Hiding a filter, by its button or by Escape in its box, empties it, so a hidden filter never narrows a list.

Open sections divide the sidebar's height in proportion to their shares. Record Explorer, which
holds two panes, starts with twice the share of the others, and its Collections pane scrolls when
it is short. Dragging the border between two open sections moves height from one section to the
other. While the border has focus, these keys move it, as the ARIA window splitter pattern
describes:

| Key | Moves the border |
| --- | --- |
| Up, Down | 16 px up or down |
| Home | Up, until the section above it is 72 px high |
| End | Down, until the section below it is 72 px high |

Each section keeps at least 72 px, and the browser keeps the shares for the next visit.
Double-clicking a border returns the two sections it divides to their initial proportion of the
height they share; no other border moves. The workspace the sections serve is the
open resource's, or else the one Record Explorer lists. File Explorer and Source Explorer are
enabled when that workspace's index lists a collection of type `File` or `Commit` ("Files and
history" above). Otherwise each is disabled, with the reason
under its header: no workspace is open, the open workspace's index did not load (with the error),
or the open workspace serves no files or history.

Every resource is requested at `depth=2`, so its neighbours arrive with their properties. The page
keeps each response as it arrived and draws from them; a resource's own response is the only one
that lists all of its relations. The palette comes from `@labkit/design`.

An act records a change to a resource rather than being one, so the graph draws an opened act as
the act's subject and has no nodes for acts. A relation to an act ends at the act's subject too:
a commit's acts are drawn as edges from the records they changed to the commit. Until an act's
own response arrives, its subject is the one the document that embeds it names.

Files and commits are drawn with their relations, as records are: a commit with its parents and
changed files, a file with the commits that changed it. A file's directory is not drawn: its path
names it. A commit's diff is fetched only by the commit's own page. When a node opens, the camera
eases toward framing it:

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

Within each step, a label drawn in the previous frame comes first, then the nearest. Hovering a
node shows its card whether or not its label is drawn.

So that labels do not flicker while the camera or the layout moves, a label drawn in the previous
frame is favoured over one that was not:

| Rule | Label drawn in the previous frame | Label not drawn in the previous frame |
| --- | --- | --- |
| Space it needs | Its own box | Its box and 6 px clear on every side |
| Smallest node size, as the perspective scale | 0.5 | 0.55 |
| Longest edge label, as a share of its edge's length on screen | 120% | 100% |
| After being hidden | — | Not drawn for 0.5 s, except steps 1 and 2 above |

A label fades in over 10 frames, about 0.17 s, once placed, and fades out over the same time once
not. A label fading out takes no room, so another may fade in where it was. A label whose node
becomes too small, or whose edge becomes too short, is not faded out.

A new edge is drawn for 0.5 s before its label may be placed, so the relation appears first and
what it means fades in after it. This holds for the open node's own edges too.
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
