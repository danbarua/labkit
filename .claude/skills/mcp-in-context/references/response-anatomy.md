# What comes back, in full

Real payloads, captured 2026-09-03 against the Bonsai record with LabKit 0.3.0.
Read this when a response looks *wrong* rather than merely unexpected.

## A success

Every result is shipped twice — `src/mcp/server.ts`'s `respond()` returns the
same object as a JSON string under `content` and as an object under
`structuredContent`, so a client reading either gets a whole answer. Trimmed:

```json
{
  "content": [
    { "type": "text", "text": "{\n  \"blocked\": {\n    \"gates\": [ … ] },\n  \"seq\": 335\n}" }
  ],
  "structuredContent": {
    "blocked": {
      "gates": [
        { "gate": "GATE_3", "consequence": "Stage 2B's readiness signal stays red; …", "state": "blocked" }
      ],
      "work": [
        { "work": "TASK_3", "objective": "produce and maintain the reviewer-required gate inventory …",
          "state": "blocked", "gates": ["GATE_3"] }
      ]
    },
    "unevaluated": [ { "gate": "GATE_1", "state": "incomplete", "consequence": "…" } ],
    "untouched": [],
    "known": { "established": [ … ], "provisional": [ … ], "unresolved": [], "untested": [], "accepted": [] },
    "seq": 335
  }
}
```

**The cost of shipping it twice, measured.** `gate_status` for a gate governing
107 criteria:

| field | bytes |
| --- | --- |
| `content[0].text` | 63,505 |
| `structuredContent` | 51,185 |
| whole response | 135,022 |

The two differ because the text copy is pretty-printed with two-space indents
and the structured one is measured compact. Both carry the same answer. So a
payload figure taken from `labkit --json …` is roughly **half** what the
transport carries, which matters whenever a size limit is the subject — see
#241, where a client refused a 266,014-character result.

`seq` is the event cursor. It is what `now --since <seq>` takes, so a caller
watching for change keeps the last one it saw.

## A refusal

An erroring tool does not crash the server. It returns the message with
`isError: true`, and the inspector CLI additionally exits non-zero:

```json
{
  "content": [
    { "type": "text",
      "text": "pose expected a registered session and this connection has none: call register_session with the id your harness gives you, then retry. LabKit records what you tell it and checks nothing — the id is yours to state, and an unsigned entry is worse than none because it looks attributed." }
  ],
  "isError": true
}
{"error":{"code":"tool_is_error","message":"Tool 'pose' returned isError:true."}}
```

That last line is the CLI's own, on exit. It says a tool reported an error; it
does not say the server failed.

**This particular refusal is why the inspector is read-only here.** Every
invocation opens a connection, runs one method and exits, so a
`register_session` in one call cannot be in force for the next — and every
write tool refuses without one. There is no flag that defeats this and none
should be sought: it is what makes the instrument safe to point at a record
somebody is working in.

## The stderr line

Interleaved with the above, on **stderr**, LabKit writes one line per failed
request (`src/request-log.ts`):

```json
{"labkit":"request-failed","at":"2026-09-03T15:50:30.119Z",
 "request":{"adapter":"mcp-stdio","tool":"pose","args":{"question":"probe"}},
 "error":{"name":"Error","message":"pose expected a registered session …"}}
```

`args` is the request **as the client sent it**, before any schema took it
apart, which is the case it is most useful for: a parse failure never produces
parsed options. It goes to the operator's stderr and never to the agent, so
`2>/dev/null` hides the half of the diagnosis that says what the server was
given. Keep it when debugging.

## Reading a report honestly

- **An empty array is an answer.** `"unresolved": []` means nothing is
  unresolved. Distinguish that from a tool that examined nothing — the report's
  own wording is what to check, and a sentence claiming more than was examined
  is a defect in its own right (#236 was exactly that).
- **A handle is a pointer, not a loss.** A summary carrying `CRIT_91` rather
  than its evaluation prose is answering *what state is everything in*; the
  sentences are a different question, reachable with `why`.
- **The document and the page differ legitimately.** A CLI view may render a
  distinction the document carries as a field, or omit one a person does not
  need. A distinction present in one and absent from the other is worth
  chasing: on 2026-09-03 that found a branch with data behind it and no
  renderer at all.
