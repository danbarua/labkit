---
name: mcp-in-context
description: This skill should be used when asked to "debug the MCP server", "see what an agent sees", "what does an agent get back from labkit", "drive the MCP tools", "check a tool over MCP", "run the MCP inspector", or when a report about LabKit's agent surface needs checking against what the server actually returns rather than against what the CLI prints.
---

# Debugging the MCP server, in context

The CLI and the MCP server are two adapters over one domain, and they do not
answer alike: the CLI renders a page for a person, the server returns a
document for an agent. A finding about the agent surface is not established by
running `labkit why GATE_3` — that shows what a **person** gets.

Drive the server itself, with `scripts/mcp-call.sh`:

```sh
LABKIT_RECORD=<project dir> scripts/mcp-call.sh tools/call work_list | jq .
```

## The four things that go wrong

**Name the binary absolutely.** `npx` spawns it, and a bare `labkit` resolves
against whatever `PATH` that subprocess inherits — which is not necessarily
the shell's. A wrong or missing name fails as
`{"error":{"code":"error","message":"spawn labkit ENOENT"}}`, which reads like
a server fault and is not one. `scripts/mcp-call.sh` resolves the binary and
refuses if it cannot.

**The inspector keeps the server's flags.** In
`npx @modelcontextprotocol/inspector --cli <binary> --db <dir> mcp …`, the
inspector takes `--db` for itself and labkit starts with no command, which
closes the connection. `scripts/mcp-call.sh` puts the flags in a wrapper
script and hands the inspector that.

**The record is `--db`, or else the working directory's.** The server resolves
its record the way every LabKit command does: `--db`, then `LABKIT_HOME`, then
the root of the git repository it started in, then the nearest `.labkit/`.
Pointed at the wrong place it answers about a different record, or creates an
empty one.

**Writes go through.** Every write tool is live over the inspector, and a
write lands in the record the server opened.

**A refusal is not a crash.** An erroring tool returns `isError: true` with the
message in `content[0].text`, and the CLI exits non-zero with
`tool_is_error`. Interleaved on **stderr** is LabKit's own request log — one
JSON line naming the tool and the arguments as the client sent them. That line
is the operator's half of the diagnosis and does not reach the agent.

## Working with it

List the surface, when the question is what exists:

```sh
scripts/mcp-call.sh tools/list | jq -r '.tools[].name'
```

Call one tool, with arguments:

```sh
scripts/mcp-call.sh tools/call why subject=GATE_3
```

Read the **document**, not the rendering — `.structuredContent` is the object
an agent's schema-aware client consumes:

```sh
scripts/mcp-call.sh tools/call why subject=GATE_3 | jq '.structuredContent'
```

Measure what a call costs, which is the question a size complaint turns on:

```sh
scripts/mcp-call.sh tools/call why subject=GATE_3 \
  | jq '{text: (.content[0].text|length), structured: (.structuredContent|tostring|length)}'
```

## What to look for in a response

**Every result ships twice**, deliberately — as `content[0].text` (a JSON
string, indented) and as `structuredContent` (the object). Both are the same
answer. So the bytes an agent's transport carries are more than **double** what
the compact report weighs, and a payload measured from `--json` on the CLI is
less than half the real cost. Measured 2026-10-01 on one `note` write: 666
characters of text and 418 of compact structured content.

**An empty list is an answer.** `"work": []` means no planned work is on the
record, not that the tool failed to look. Read a report's own wording for
whether it claims more than it examined.

**Compare against the CLI when a difference is suspected**, and expect the
shapes to differ legitimately: a view may render a distinction the document
carries as a field, or drop one a person does not need. A distinction present
in one and absent in the other is worth a second look — that is how a rendered
distinction with no renderer was found on 2026-09-03.

## Rules against a live record

Against a record someone is working in, call only the tools that read. A write
goes to a scratch record — `LABKIT_RECORD` set to a temporary directory. Never `rm -rf` a `.labkit` directory that is not yours.

## SDK traps (`@modelcontextprotocol/sdk` 1.30.0)

Each was found by debugging. Each is a behaviour, not a design rule.

| behaviour | consequence |
|---|---|
| the package's `exports` maps `"."` to a `dist/esm/index.js` that is not on disk | verified under Bun. `server/index.js` looks like the obvious alternative and exports the deprecated `Server`. Import from subpaths only |
| `normalizeObjectSchema` returns `undefined` for a plain union rather than throwing | a union `outputSchema` makes **every call to that tool fail validation** |
| a `z.discriminatedUnion` `outputSchema` | **crashes every call**. Write the arms out literally as `z.strictObject` |
| an unrecognised key on a tool definition is stripped | it is stripped from the tool object **and** from its `annotations`, where `readOnlyHint` lives |
| `structuredContent` must be an object | a tool answering with a bare array or a bare handle has to wrap it |
| a thrown error becomes `isError: true` carrying the message | the message travels verbatim to the calling agent, so nothing on that path may log bound parameters |
| `StdioServerTransport` subscribes to stdin's `data` and `error`, never `end` | `onclose` fires only on an explicit `close()`. A process whose only handle is that listener stays up indefinitely |
| zod emits `required` whenever any field is required | an absent `required` array means nothing is required — not "cannot tell" |

## Additional resources

- **`scripts/mcp-call.sh`** — resolves the binary and runs one method against a
  named record. Use it rather than retyping the invocation.
- **`references/response-anatomy.md`** — the full shape of a success, a
  refusal and the stderr request log, with real payloads; read it when a
  response looks wrong rather than merely unexpected.
