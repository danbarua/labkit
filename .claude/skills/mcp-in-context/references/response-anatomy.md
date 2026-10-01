# What comes back, in full

Real payloads, captured 2026-10-01 against a scratch record with the binary
built from this repository. Read this when a response looks *wrong* rather than
merely unexpected.

## A success

Every result is shipped twice — `packages/app-mcp/server.ts`'s `respond()`
returns the same object as an indented JSON string under `content` and as an
object under `structuredContent`, so a client reading either gets a whole
answer. `work_list` on a record with no planned work:

```json
{
  "content": [
    { "type": "text", "text": "{\n  \"work\": []\n}" }
  ],
  "structuredContent": {
    "work": []
  }
}
```

A write answers with what it minted and the events it recorded. `note`,
trimmed:

```json
{
  "structuredContent": {
    "note": "NOTE_1",
    "events": [
      {
        "at": "2026-09-30T23:51:57.109Z",
        "attribution": {
          "attribution_label": "mock-session",
          "attribution_id": "mock-session-0",
          "attribution_how": "claimed",
          "git_hash": null
        },
        "operation": "note",
        "subject": "NOTE_1",
        "command": { "text": "written over stdio by the probe" },
        "changes": [
          { "id": "NOTE_1", "label": "Note", "props": { "text": "written over stdio by the probe" },
            "change": "NodeCreated" }
        ],
        "reconstructedFrom": null,
        "seq": 1
      }
    ]
  }
}
```

`mock-session` is what every write over stdio is attributed to: nothing on the
connection names the caller.

**The cost of shipping it twice, measured** on one `note` write:

| field | characters |
| --- | --- |
| `content[0].text` | 666 |
| `structuredContent`, compact | 418 |

The two differ because the text copy is indented and the structured one is
measured compact. Both carry the same answer. So a payload figure taken from
`labkit --json …` is less than half what the transport carries, which matters
whenever a size limit is the subject.

## A refusal

An erroring tool does not crash the server. It returns the message with
`isError: true`, and the inspector CLI additionally exits non-zero:

```json
{
  "content": [
    { "type": "text", "text": "CLM_999 not found" }
  ],
  "isError": true
}
```

A call to a tool the server did not register is not a refusal from LabKit but
from the inspector:

```json
{"error":{"code":"tool_not_found","message":"Tool 'note' not found on server."}}
```

## The stderr line

Interleaved with the above, on **stderr**, LabKit writes one line per failed
request (`packages/core-domain/request-log.ts`):

```json
{"labkit":"request-failed","at":"2026-09-30T23:51:58.725Z",
 "request":{"adapter":"mcp-stdio","tool":"why","args":{"subject":"CLM_999"}},
 "error":{"name":"DomainRefusal","message":"CLM_999 not found"}}
```

`args` is the request **as the client sent it**, before any schema took it
apart, which is the case it is most useful for: a parse failure never produces
parsed options. It goes to the operator's stderr and never to the agent, so
`2>/dev/null` hides the half of the diagnosis that says what the server was
given. Keep it when debugging.

## Reading a report honestly

- **An empty array is an answer.** `"work": []` means no planned work is on the
  record. Distinguish that from a tool that examined nothing — the report's
  own wording is what to check, and a sentence claiming more than was examined
  is a defect in its own right.
- **A handle is a pointer, not a loss.** A report carrying `CRIT_91` rather
  than its evaluation prose is answering *what state is everything in*; the
  sentences are a different question, reachable with `why`.
- **The document and the page differ legitimately.** A CLI view may render a
  distinction the document carries as a field, or omit one a person does not
  need. A distinction present in one and absent from the other is worth
  chasing.
