---
name: mcp-in-context
description: This skill should be used when asked to "debug the MCP server", "see what an agent sees", "what does an agent get back from labkit", "drive the MCP tools", "check a tool over MCP", "run the MCP inspector", or when a report about LabKit's agent surface needs checking against what the server actually returns rather than against what the CLI prints.
---

# Debugging the MCP server, in context

The CLI and the MCP server are two adapters over one domain, and they do not
answer alike: the CLI renders a page for a person, the server returns a
document for an agent. A finding about the agent surface is not established by
running `labkit gate GATE_3` — that shows what a **person** gets.

Drive the server itself:

```sh
npx -y @modelcontextprotocol/inspector --cli <binary> mcp \
  --method tools/call --tool-name now | jq .
```

## The four things that go wrong

**Name the binary absolutely.** `npx` spawns it, and a bare `labkit` resolves
against whatever `PATH` that subprocess inherits — which is not necessarily
the shell's. A wrong or missing name fails as
`{"error":{"code":"error","message":"spawn labkit ENOENT"}}`, which reads like
a server fault and is not one. `scripts/mcp-call.sh` resolves the binary and
refuses if it cannot.

**The working directory chooses the record.** The server resolves its database
the same way every LabKit process does — `--db`, then `LABKIT_HOME`, then the
project root of the directory it started in. Running the inspector inside a
project answers about that project. Running it in the wrong place answers about
a different record, or silently creates an empty one.

**Writes are unreachable this way, by construction.** Every invocation opens a
connection, runs one method and exits, so `register_session` cannot persist
into a second call — and every write tool refuses until a session is
registered. A write attempt returns the refusal, not a write. That makes the
inspector a **read-only** instrument here, which is why it is safe against a
live record. Do not try to defeat it.

**A refusal is not a crash.** An erroring tool returns `isError: true` with the
message in `content[0].text`, and the CLI exits non-zero with
`tool_is_error`. Interleaved on **stderr** is LabKit's own request log — one
JSON line naming the tool and the arguments as the client sent them. That line
is the operator's half of the diagnosis and does not reach the agent.

## Working with it

List the surface, when the question is what exists:

```sh
npx -y @modelcontextprotocol/inspector --cli <binary> mcp --method tools/list \
  | jq -r '.tools[].name'
```

Call one tool, with arguments:

```sh
npx -y @modelcontextprotocol/inspector --cli <binary> mcp \
  --method tools/call --tool-name gate_status --tool-arg gate=GATE_3
```

Read the **document**, not the rendering — `.structuredContent` is the object
an agent's schema-aware client consumes:

```sh
… --tool-name now | jq '.structuredContent'
```

Measure what a call costs, which is the question a size complaint turns on:

```sh
… --tool-name gate_status --tool-arg gate=GATE_3 \
  | jq '{text: (.content[0].text|length), structured: (.structuredContent|tostring|length)}'
```

## What to look for in a response

**Every result ships twice**, deliberately — as `content[0].text` (a JSON
string) and as `structuredContent` (the object). Both are the same answer.
So the bytes an agent's transport carries are roughly **double** what the
report itself weighs, and a payload measured from `--json` on the CLI is about
half the real cost. Measured 2026-09-03 on `gate_status GATE_3`: 63,505 +
51,185 = 135,022 bytes for a 63KB report.

**An empty list is an answer.** `"unresolved": []` means nothing is
unresolved, not that the tool failed to look. Read a report's own wording for
whether it claims more than it examined.

**Compare against the CLI when a difference is suspected**, and expect the
shapes to differ legitimately: a view may render a distinction the document
carries as a field, or drop one a person does not need. A distinction present
in one and absent in the other is worth a second look — that is how a rendered
distinction with no renderer was found on 2026-09-03.

## Rules against a live record

Read-only, always, and prefer a scratch database when a write is genuinely
needed: `--db` into a temporary directory, driven through the CLI rather than
through the inspector. Never point a write at a record someone is working in;
never `rm -rf` a `.labkit` directory that is not yours.

## Additional resources

- **`scripts/mcp-call.sh`** — resolves the binary, runs one method against a
  named record, pipes through `jq`. Use it rather than retyping the invocation.
- **`references/response-anatomy.md`** — the full shape of a success, a
  refusal and the stderr request log, with real payloads; read it when a
  response looks wrong rather than merely unexpected.
