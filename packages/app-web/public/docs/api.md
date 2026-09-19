# labkit API

A read-only view of the LabKit research graph. Every response is JSON. Errors are `application/problem+json`.

Machine-readable description: [/docs/openapi.json](/docs/openapi.json). Discovery: [/.well-known/api-catalog](/.well-known/api-catalog), [/sitemap.xml](/sitemap.xml).

## Workspaces

Everything below is scoped to a workspace, one research project's graph. Bare `/graph` and `/collections` are the default workspace. To read another, address it as `/workspace/{slug}`:

```
GET /workspace/{slug}                a workspace's collections, one per node type
GET /workspace/{slug}/{type}         one collection
GET /workspace/{slug}/graph/{id}     one entity
```

- A workspace is a collection. `/collections/workspace` lists them, and each item's address is the workspace itself, with a link to its `graph`. That collection is offered from the default workspace only, since workspaces are not nested.
- A slug that does not exist is a 404. A workspace never falls back to another one's data.
- Links in a response keep you in the workspace you arrived by. `/workspace/{slug}/graph/{id}` links to `/workspace/{slug}/graph/…`, and the bare form links to the bare form.
- `graph` is not a collection name, so it cannot clash with a node type.
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
- `_links.expand` is a URI template, `/graph/{id}{?depth}`, for asking for a different depth.

## Collections: `/collections`

`application/vnd.collection+json`. Entities listed by type.

```
GET /collections            one collection per node type
GET /collections/{type}     the live nodes of that type
    ?limit=50               1 to 200
    ?offset=0
```

- `next`, `prev` and `index` links do the paging and navigation.
- Retracted nodes are not listed.
- Each item's `href` is its `/graph/{id}` address. A collection lists things and does not define them.

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
