# labkit API

A read-only view of the LabKit research graph. Every response is JSON. Errors are `application/problem+json`.

Machine-readable description: [/docs/openapi.json](/docs/openapi.json). Discovery: [/.well-known/api-catalog](/.well-known/api-catalog), [/sitemap.xml](/sitemap.xml).

## Workspaces

Everything below is scoped to a workspace, one research project's graph. Bare `/graph` and `/collections` are the default workspace. To read another, address it as `/workspace/{slug}`:

```
GET /workspace/{slug}                a workspace's collections, one per node type
GET /workspace/{slug}/{type}         one collection
GET /workspace/{slug}/{id}           one entity
```

- A workspace is a collection. `/collections/workspace` lists them, and each item's address is the workspace itself. That collection is offered from the default workspace only, since workspaces are not nested.
- A slug that does not exist is a 404. A workspace never falls back to another one's data.
- Links in a response keep you in the workspace you arrived by. `/workspace/{slug}/{id}` links to `/workspace/{slug}/…`, and the bare `/graph/{id}` links to the bare form.
- Inside a workspace a collection and an entity share a path level. A collection name is lower case and a handle is not, so a name is never both.
- `/sitemap.xml` and `/.well-known/api-catalog` describe the default workspace only.

## Entities: `/graph/{id}`

An entity is addressed by its handle, a type prefix and a number (`Q_1`, `CLM_3`). `application/hal+json`.

```
GET /graph/{id}?depth=1
```

- The entity's own properties sit beside `id` and `type`.
- `depth` is how many hops of neighbours to embed, 0 to 6. The default is 1. `0` returns the entity alone.
- Neighbours are under `_embedded`. The key says how they relate:
  - `relation:type` for an outbound edge (`produces:evidence`).
  - `type:relation` for an inbound edge (`decision:promotes`).
  - Each neighbour also has `dir` (`in` or `out`) and `depth`.
- At the deepest level an entity is not expanded. Its `_links` lists what lies beyond, so nothing is hidden, only not fetched.
- Every link repeats the `depth` that was applied. Following one gives the same view of the linked entity.
- `_links.index` is the collection this entity is listed in.
- `_links.expand` is a URI template, the entity's own address followed by `{?depth}`, for asking for a different depth.

## Acts: `/workspace/{slug}/act`

Every write to a workspace is recorded as an act: the command that was issued, and the changes it made. Acts are read from a workspace address only.

```
GET /workspace/{slug}/act                 the workspace's acts, oldest first (collection+json)
GET /workspace/{slug}/act/{seq}           one act (hal+json)
GET /workspace/{slug}/{id}/events         what happened to one entity, change by change (hal+json)
```

- The collection pages like any other, and also by position: `?since=40` returns the acts after number 40. A `since` link names the last act on the page. It is present on the last page too, and repeats the position it was given, so following it again asks for anything new.
- An act is served with type `Act`. In a collection its `id` is its position, and `subject_type` is the type of the entity it was about.
- An act's `operation` is what was done, and `command` is its parameters as issued. `changes` is every change it made, in order.
- An act links to the entities it affected. `subject` is what the command addressed or created, and `touched` is everything else a change of it named.
- `/{id}/events` is a document, not a resource, so it has no `self`. It rolls up the changes that name the entity, out of the acts that made them, so it lists changes and not acts. Each has the act it belongs to (`_links.parent`), its position in that act (`index`, from 1) and `dir`: `in` when an edge ends at the entity, `out` when one starts there, and `subject` when the change is to the entity itself. An act that was about the entity but changed nothing naming it is not listed; it is still in `/act`. The same events are also grouped as links, for navigating without reading the list: `acts:about` (the acts that changed the entity itself), `edgeCreated:in` and `edgeCreated:out` (the entity at the other end of each edge created). It pages by acts, so `limit` counts acts and not the changes they carry.

## Collections: `/collections`

`application/vnd.collection+json`. Entities listed by type.

```
GET /collections            one collection per node type
GET /collections/{type}     the live nodes of that type
    ?limit=50               1 to 200
    ?offset=0
```

- `next`, `prev` and `index` links do the paging and navigation.
- A query parameter the collection does not read, such as `depth`, is carried unchanged onto every link in the response, so `?depth=0` on a collection gives `?depth=0` on each item, on `next` and on `index`. `limit` and `offset` are the only ones it rewrites.
- Retracted nodes are not listed.
- Each item's `href` is that entity's address. A collection lists things and does not define them.

### What an item carries

Every item has `data` entries `id` and `type`. Beyond that, nothing about the domain is written into this API by hand. It reads the domain's own definitions, so a type added or reshaped there shows up here without a change:

| An item shows | Taken from |
|---|---|
| The collections, and their `{type}` slugs | The domain's list of node types, plus `workspace`. The slug is the type name in kebab case (`evidence-unit`). A few are shortened by hand (`enquiry`, `evaluation`). |
| `name` | The first of the type's searchable text properties in the domain. It is whatever that type considers its main text: a title, a statement, a reason. |
| The node's other scalar properties, when the type has no `name` | The node itself. A type with no text of its own is described by what it carries (`role`) and by what it links to. |
| `links` | The node's outbound relations. Each is `{rel, href, name}`, with `rel` the lower-cased edge label and `name` the target's handle. |

Inbound relations are not listed in a collection. Follow the item's `href` with `depth=1` to see them.

## Errors

| Status | When |
|---|---|
| 400 | `depth` is not an integer from 0 to 6. |
| 404 | The handle or collection does not exist, or the path is not handled at all. |

## Cross-origin use

Responses are readable from other origins when the request arrives by the public host name. Requests to the local server are not.
