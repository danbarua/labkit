# The language of ACP

This note covers what the words of the Agent Client Protocol (ACP) mean. It also covers what each message
obliges the other side to send back. It is written for whoever builds the bridge between ACP and an
agent runtime: when this message arrives, what goes out, and in what order.

It describes ACP itself, not labkit's implementation of it. For what `packages/app-acp` supports,
see [protocol-reference.md](../../packages/app-acp/protocol-reference.md). For how far that
implementation conforms, see [acp-conformance.md](acp-conformance.md).

**Sources.**
- The specification repository
  [agentclientprotocol/agent-client-protocol](https://github.com/agentclientprotocol/agent-client-protocol)
  at commit `90f44f4`. Stable pages are under `docs/protocol/v1/`, proposals ("RFDs") under `docs/rfds/`.
- `@agentclientprotocol/sdk` 1.5.0, the SDK the monorepo pins, which speaks protocol version 1.

**Conventions.**
- MUST, SHOULD and MAY are quoted from the specification.
- **Unstable** marks a rule that exists only in the SDK's UNSTABLE types, a draft page or an RFD.
- ACP v2 is a separate draft with a different turn model. Nothing here applies to it.
- "Agent" means the program that serves ACP; for labkit that is `packages/app-acp`. "Client" means
  the editor or web app that talks to it.

## The types are in the SDK

Every method has a typed request and response, and the SDK exports maps keyed by method name.
Types named `Agent…` describe what an agent receives; types named `Client…` describe what a client
receives.

| message                        | its params                          | what goes back                        |
| ------------------------------ | ----------------------------------- | ------------------------------------- |
| request, client to agent       | `AgentRequestParamsByMethod[M]`     | `AgentRequestResponsesByMethod[M]`    |
| notification, client to agent  | `AgentNotificationParamsByMethod[M]` | nothing                              |
| request, agent to client       | `ClientRequestParamsByMethod[M]`    | `ClientRequestResponsesByMethod[M]`   |
| notification, agent to client  | `ClientNotificationParamsByMethod[M]` | nothing                             |

The fluent API types a handler by its method name. For example, `onRequest("session/prompt", …)`
receives a `PromptRequest` and must return a `PromptResponse`. The method names are constants in
`AGENT_METHODS`, `CLIENT_METHODS` and `PROTOCOL_METHODS`.

The SDK's zod schemas are not in its package exports. The JSON Schema is, as
`@agentclientprotocol/sdk/schema/schema.json`.

The types describe the shape of a response, not what has to be sent before it. For example, they
do not say that `session/load` replays the whole conversation before it answers, or that a
cancelled prompt still answers with a stop reason. The rest of this note covers those rules.

## Methods

Only the stable methods are listed. The following are UNSTABLE in SDK 1.5.0 and not covered here:
- `providers/*`, `nes/*` and `document/*`;
- `mcp/*`, the transport for MCP servers served over ACP itself.

**Client to agent**

| method                      | request → response                                              | allowed when                                         |
| --------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| `initialize`                | `InitializeRequest` → `InitializeResponse`                      | always, and first                                    |
| `authenticate`              | `AuthenticateRequest` → `AuthenticateResponse`                  | for an `authMethods` entry of type `agent` only      |
| `logout`                    | `LogoutRequest` → `LogoutResponse`                              | `agentCapabilities.auth.logout`                      |
| `session/new`               | `NewSessionRequest` → `NewSessionResponse`                      | always                                               |
| `session/load`              | `LoadSessionRequest` → `LoadSessionResponse`                    | `agentCapabilities.loadSession`                      |
| `session/resume`            | `ResumeSessionRequest` → `ResumeSessionResponse`                | `sessionCapabilities.resume`                         |
| `session/list`              | `ListSessionsRequest` → `ListSessionsResponse`                  | `sessionCapabilities.list`                           |
| `session/close`             | `CloseSessionRequest` → `CloseSessionResponse`                  | `sessionCapabilities.close`                          |
| `session/delete`            | `DeleteSessionRequest` → `DeleteSessionResponse`                | `sessionCapabilities.delete`                         |
| `session/fork`              | `ForkSessionRequest` → `ForkSessionResponse`                    | `sessionCapabilities.fork` (unstable)                |
| `session/prompt`            | `PromptRequest` → `PromptResponse`                              | always, once a session is open                       |
| `session/set_config_option` | `SetSessionConfigOptionRequest` → `SetSessionConfigOptionResponse` | the session offered `configOptions`               |
| `session/set_mode`          | `SetSessionModeRequest` → `SetSessionModeResponse`              | the session offered `modes`                          |
| `session/cancel`            | `CancelNotification`, a notification                            | always                                               |

**Agent to client**

| method                   | request → response                                                    | allowed when                             |
| ------------------------ | --------------------------------------------------------------------- | ---------------------------------------- |
| `session/update`         | `SessionNotification`, a notification                                 | always                                   |
| `session/request_permission` | `RequestPermissionRequest` → `RequestPermissionResponse`          | always                                   |
| `fs/read_text_file`      | `ReadTextFileRequest` → `ReadTextFileResponse`                        | `clientCapabilities.fs.readTextFile`     |
| `fs/write_text_file`     | `WriteTextFileRequest` → `WriteTextFileResponse`                      | `clientCapabilities.fs.writeTextFile`    |
| `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release` | `CreateTerminalRequest` → `CreateTerminalResponse`, and so on | `clientCapabilities.terminal` |
| `elicitation/create`     | `CreateElicitationRequest` → `CreateElicitationResponse`              | `clientCapabilities.elicitation.form` or `.url`, non-null |
| `elicitation/complete`   | `CompleteElicitationNotification`, a notification                     | after a URL-mode elicitation             |

**Either direction:** `$/cancel_request` (`CancelRequestNotification`) cancels one request by its
JSON-RPC id. Supporting it is optional on both sides.

## Capabilities

- **Omitted means unsupported.** "Clients and Agents MUST treat all capabilities omitted in the
  `initialize` request as UNSUPPORTED." Beyond the baseline, the optional methods in the tables
  above are gated by a capability, except `session/set_config_option` and `session/set_mode`,
  which depend on what the session offered.
- **Baseline.** Every agent MUST support `session/new`, `session/prompt`, `session/cancel` and
  `session/update`, and MUST accept `text` and `resource_link` blocks in a prompt.
- **`null` and `{}`.** For an object-shaped capability, `null` is the same as omitted, and `{}`
  means supported.
- **Elicitation is the exception.** `elicitation: {}` advertises no mode. Only a non-null `form` or
  `url` field advertises that mode. MCP treats an empty elicitation capability as form support,
  and ACP deliberately does not.
- **Where `session/load` is gated.** It is gated by the top-level boolean
  `agentCapabilities.loadSession`, not by anything in `sessionCapabilities`.
- **Version negotiation.** The client sends the latest protocol version it supports. The agent
  answers with the same version if it supports it, and otherwise with its own latest. That is an
  answer, not an error. A client that cannot speak the returned version SHOULD close the
  connection and tell the user.

## Paths and positions

- **Every file path in the protocol MUST be absolute.** That includes `cwd`, `additionalDirectories`,
  a diff's `path`, a tool location's `path`, and the paths in `fs/*` and `terminal/create`. The
  short name a model used for a file appears only in the tool call's `rawInput`, if anywhere.
- **The session's `cwd` is the base for relative paths**, whatever directory the agent process was
  started in.
- **Line numbers are 1-based**, as stated globally and again for `fs/read_text_file`. A tool
  location's `line` is an exception in practice: the schema gives it minimum 0 and no page says
  which base it uses.

## Sessions

- **`session/new`.** The agent MUST return a unique `sessionId`, and MAY return `modes` and
  `configOptions`.
- **`session/load`** restores a session and replays it. The agent MUST replay the entire
  conversation as `session/update` notifications, using the same kinds a live turn produces, and
  MUST respond to the `session/load` request only after all of them are sent. As a result, a client
  receives updates for a session before it has the response that opened it, so it has to route
  updates by `sessionId`.
- **`session/resume`** restores a session without replay. The agent MUST NOT replay history, so the
  client keeps its own copy.
- **`session/close`** ends the live session. The agent MUST cancel any ongoing work "as if
  `session/cancel` had been called" and free its resources. Stored history is not deleted.
- **`session/delete`** removes a session from later `session/list` results. Deleting a session
  that is already gone SHOULD succeed.
- **`session/list`** is discovery only: it restores nothing.
  - The agent MUST return an empty array when nothing matches.
  - A missing `nextCursor` means the end of the results.
  - Cursors are opaque: the client MUST NOT parse, change or persist them.
- **`mcpServers`** is sent on new, load and resume.
  - Every agent MUST support stdio servers.
  - A client sends `http` or `sse` servers only if the agent advertised
    `mcpCapabilities.http` or `.sse`.
  - The agent SHOULD connect to every listed server before it answers.
  - Clients re-send the list on load and resume.
- **`additionalDirectories`** is sent only when the agent advertised it.
  - On load and resume the client resends the full list; stored roots are not restored for it.
  - The effective root set is `cwd` plus these directories.

## A prompt turn

- **A turn is one `session/prompt` request and its response.** Everything the agent reports in
  between is `session/update` notifications. The response carries a `StopReason` and is the last
  message of the turn: no update for that turn may follow it.
- **Stop reasons.** There are exactly five in v1:

  | reason              | meaning                                                              |
  | ------------------- | -------------------------------------------------------------------- |
  | `end_turn`          | The model finished without asking for more tools.                    |
  | `max_tokens`        | The token limit was reached.                                         |
  | `max_turn_requests` | The number of model requests allowed in one turn was exceeded.       |
  | `refusal`           | The agent refuses to continue.                                       |
  | `cancelled`         | The client cancelled the turn.                                       |

  Any other failure is a JSON-RPC error response, not a stop reason.
- **Cancellation.** `session/cancel` is a notification, not a request.
  - **Client:** it SHOULD immediately show unfinished tool calls as cancelled. That is a local
    display state: `cancelled` is not a tool call status on the wire. It MUST answer every pending
    `session/request_permission` with the outcome `cancelled`. It SHOULD still accept tool call
    updates that arrive after the cancel.
  - **Agent:** it SHOULD stop model requests and tool calls as soon as possible. It MAY send more
    updates, but before the response. It MUST then answer the `session/prompt` with
    `stopReason: "cancelled"`.
  - **An abort is not an error.** The agent MUST catch the abort exceptions that client libraries
    throw and return `cancelled`, not an error.
- **`$/cancel_request`** cancels a single request by its JSON-RPC id, in either direction.
  - A receiver that supports it answers the original request exactly once: with a normal result,
    or with error `-32800`.
  - The cancellation page's example has the agent cancel its own pending permission and terminal
    requests this way after a `session/cancel`. So an agent should accept either answer to a
    pending permission request: the outcome `cancelled`, or error `-32800`.
- **Prompt content.**
  - `text` and `resource_link` are always allowed.
  - `image`, `audio` and embedded `resource` need `promptCapabilities.image`, `.audio` and
    `.embeddedContext`.
  - An embedded `resource` is the preferred way to attach referenced context such as an @-mention.
  - `ContentBlock` has the same structure as MCP's, so MCP tool output can be passed through
    unchanged.
- **Slash commands.** The agent advertises them in `available_commands_update`, with names that
  have no leading slash. A client runs one by sending an ordinary prompt whose text starts with
  `/name`. No dedicated method exists, and the turn rules apply unchanged.
- **Not covered by v1.** The specification does not say what happens to a second `session/prompt`
  sent while a turn is still running.

## `session/update` kinds

The discriminator is `sessionUpdate`. The stable specification lists eleven kinds:

| kind                         | what it means                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `user_message_chunk`         | Part of a user message. This is how a replay carries what the user said. v1 does not require a live echo of the prompt. |
| `agent_message_chunk`        | Part of the agent's reply.                                                     |
| `agent_thought_chunk`        | Part of the agent's reasoning.                                                 |
| `tool_call`                  | A tool call was created. See [Tool calls](#tool-calls).                        |
| `tool_call_update`           | Some fields of a tool call changed.                                            |
| `plan`                       | The whole plan. The agent MUST send every entry each time, and the client MUST replace the plan it holds. |
| `available_commands_update`  | The complete list of slash commands.                                           |
| `current_mode_update`        | The agent changed its own mode.                                                |
| `config_option_update`       | The complete configuration state, sent when the agent changes it.              |
| `session_info_update`        | Only the fields that changed. `title: null` clears the title.                   |
| `usage_update`               | `used` and `size`: the tokens now in context and the context window. `cost`: the session's cumulative cost. This is session state, not one turn's usage. |

- **`messageId`.** Chunks that carry the same optional `messageId` belong to one message, and a new
  `messageId` starts a new one. The id is opaque.
- **`usage_update` needs a real size.** An agent that has no meaningful context size does not send
  `usage_update` at all.
- **Five more kinds are unstable.** SDK 1.5.0 also types `plan_update`, `plan_removed`, `notice`,
  `compaction_update` and `compaction_summary_chunk`. Each is unstable, and an agent MUST NOT send
  one unless the client advertised the matching capability.

## Tool calls

- **Identity and label.**
  - `toolCallId` is unique within the session.
  - `title` is required and is a human-readable description of what the tool is doing.
  - `name` is the optional programmatic tool name, such as `read_file`. It is metadata, not a
    capability or a grant.
- **`kind`** is a display hint for choosing an icon, not an authorization. Its values:
  - `read`, `edit` and `delete` for reading, changing or removing files or data;
  - `move` for moving or renaming;
  - `search` for searching for information;
  - `execute` for running commands or code;
  - `think` for internal reasoning or planning;
  - `fetch` for retrieving external data;
  - `switch_mode` for switching the session's mode;
  - `other`, the default, for anything else.
- **`status`** is one of `pending`, `in_progress`, `completed` or `failed`.
  - `pending` is the default. It means the call has not started, because its input is still
    streaming or it is awaiting approval.
  - The specification gives no transition table, and no status for a call whose permission was
    refused.
- **What an update changes.** An update names `toolCallId` and only the fields that changed; an
  omitted field keeps its value.
  - `content` and `locations` **replace** the whole array. To add one item, send them all again.
  - `rawInput` and `rawOutput` take any JSON value. `null` leaves the old value, and v1 has no way
    to clear them.
- **Content** is a list of `content` (one `ContentBlock`), `diff` or `terminal` items.
- **A diff** is `{ path, oldText, newText }`.
  - `path` is absolute.
  - A null or absent `oldText` means a new file.
  - `newText` is required, so a deletion looks like emptying the file (`newText: ""`).
  - v1 has no way to show a move.
- **A terminal item** embeds a terminal created with `terminal/create`. The agent adds it before it
  releases the terminal, and the client keeps showing its output after release.
- **`locations`** are `{ path, line? }` with an absolute path. They let a client follow which files
  the agent is reading or changing, and are the only structured statement of the files a call
  touches.

## Permission

- **The request.** `session/request_permission` carries `toolCall`, a `ToolCallUpdate` in which only
  `toolCallId` is required, and a list of `options`.
- **The option kinds are hints for the UI.**
  - `allow_once`: allow this operation this time only.
  - `allow_always`: allow it and remember the choice.
  - `reject_once`: reject it this time only.
  - `reject_always`: reject it and remember the choice.

  The reply carries nothing but the chosen `optionId`. The specification does not say which side
  remembers an `allow_always` or `reject_always` choice.
- **The outcome** is either `{ outcome: "selected", optionId }` or `{ outcome: "cancelled" }`.
  There is no "rejected" outcome: a refusal is a selected `reject_*` option. `cancelled` means the
  turn was cancelled.
- **Automatic answers.** Clients MAY answer a permission request automatically according to the
  user's settings.
- **Not specified.** The specification does not require the `tool_call` to have been sent first. It
  also does not say what becomes of the call after a refusal.

## Client file system

- The agent MUST NOT call either method unless the client advertised the matching `fs` capability.
- `fs/read_text_file` reads the client's view of the file, "including unsaved changes in the
  editor". `line` (1-based) and `limit` (a number of lines) select part of it.
- `fs/write_text_file`: "The Client MUST create the file if it doesn't exist."

## Terminals

- **`terminal/create`** returns a terminal id at once, and the command runs in the background. The
  specification does not say the command goes through a shell.
- **`outputByteLimit`.** Past the limit, the client drops output from the beginning, cutting at a
  character boundary. It reports this with `truncated: true`.
- **`terminal/output`** returns a snapshot. `exitStatus` is present only once the command has
  exited.
- **`terminal/wait_for_exit`** blocks until the command exits. `exitCode` is null when the command
  was killed by a signal.
- **`terminal/kill`** stops the command, but the terminal stays valid for `output` and
  `wait_for_exit`.
- **`terminal/release`** kills the command if it is still running and frees the terminal. After
  that, the id is invalid for every `terminal/*` method.
- **The agent MUST release** every terminal it creates, including after a kill and after the
  command has exited on its own.

## Elicitation

Elicitation lets the agent ask the user something through the client.

- **Modes.** There are two, `form` and `url`. A request in a mode the client did not advertise gets
  JSON-RPC error `-32602`.
- **The answer** is `accept`, `decline` or `cancel`. The agent MUST handle `decline`, `cancel` and
  failure.
- **URL mode.**
  - `accept` means the user agreed to open the link, not that the flow behind it finished.
  - The agent MAY report completion later with the notification `elicitation/complete` and the
    request's `elicitationId`.
  - The client MUST ignore an unknown or already-completed id. It SHOULD offer to retry or cancel
    by hand if completion never arrives.
- **URL safety.** The client MUST show the full URL before the user agrees, MUST NOT prefetch it,
  and MUST open it where neither the client nor the model can inspect it.
- **Secrets.** Form mode MUST NOT ask for secrets: passwords, API keys, tokens, payment
  credentials. Those go through URL mode. If the client lacks URL mode, the agent MUST NOT fall
  back to a form.
- **Patterns.** An agent-supplied `pattern` MUST be evaluated with bounded time and resources.
- **Unknown values.** An unknown `mode`, property `type` or multi-select `items.type` MUST NOT be
  rendered as a known control.
- **`date-time`.**
  - The v1 schema text says ISO 8601; the v2 schema says RFC 3339.
  - JSON Schema's own `date-time` format is RFC 3339.
  - A value with seconds and a UTC offset satisfies all three. An HTML `datetime-local` input
    produces neither.

## Configuration options and modes

- **Configuration options replace modes.** "If an Agent provides `configOptions`, Clients SHOULD
  use them instead of the `modes` field." Modes are marked for removal in a future version.
  Until then, an agent with mode-like settings SHOULD send both and keep them in sync.
- **Complete state every time.** The response to `session/set_config_option` MUST carry the complete
  list of options with their current values, not only the one that changed. A later
  `config_option_update` also carries the complete state, so one change can alter other options,
  such as a new model changing the reasoning choices.
- **Values.**
  - A `select` option takes one of its listed value ids as a string.
  - A `boolean` option is set with `{ type: "boolean", value }`.
  - The agent MUST NOT send boolean options unless the client advertised
    `session.configOptions.boolean`.
- **Defaults.** Every option MUST have a default, and a turn has to work without the client
  showing any option.
- **Categories** are `mode`, `model`, `model_config` and `thought_level`. They affect display only:
  clients MUST handle a missing or unknown category, and names starting with `_` are custom.
- **When.** Options can change at any time, whether a turn is running or not.

## Authentication

- **Method types.** `authMethods` in the `initialize` response lists the ways to log in. A method
  with no `type` is an `agent` method; the client calls `authenticate` with its id.
- **Terminal methods.** For a `terminal` method, the client MUST NOT call `authenticate`. Instead it
  runs the agent's program interactively, in a separate process. Exit status 0 means success, and
  the client then reconnects and sends `initialize` again.
- **Authentication required.** The error is `-32000`. `session/new` may return it; some agents
  first notice the missing credentials at the first model call.
- **Logout.** After `logout`, sessions already running are not guaranteed to keep working.

## Transports

- **stdio** is the only transport the stable pages define.
  - The client starts the agent as a subprocess.
  - Messages are JSON-RPC separated by newlines. A message MUST NOT contain a newline, so no
    pretty-printing.
  - The agent MUST NOT write anything but ACP messages to stdout. Logs go to stderr.
- **Streamable HTTP** is an RFD (status Active), and the SDK ships it under `experimental/`.
  - Every request goes to `/acp`. `initialize` is a POST that returns its result in the body,
    with an `Acp-Connection-Id` header.
  - Every other POST returns 202. Its response arrives later on a server-sent-events stream opened
    with GET: a connection stream, or a session stream selected with `Acp-Session-Id`.
  - `DELETE` ends the connection.
  - Nothing sent while a client was disconnected is replayed. A client that reconnects reopens its
    session with `session/load`.

## Extensibility and errors

- **Custom data.** It goes in `_meta`, under a namespaced key. Implementations MUST NOT add custom
  fields at the root of a specified type, because every root name is reserved.
- **Reserved `_meta` keys.** `traceparent`, `tracestate` and `baggage` are reserved for W3C trace
  context.
- **Method names.** A method name that starts with `_` is an extension. Method names without it
  are reserved for the protocol. `$/` prefixes protocol-level methods such as `$/cancel_request`.
- **Unknown methods and notifications.** An unknown request gets `-32601`. Notifications SHOULD be
  ignored if unknown, and never receive a response, not even an error.
- **Error codes.**

  | code     | meaning                                   |
  | -------- | ----------------------------------------- |
  | `-32700` | the message is not valid JSON             |
  | `-32600` | not a valid request                       |
  | `-32601` | method not found or not available         |
  | `-32602` | invalid params                            |
  | `-32603` | internal error                            |
  | `-32800` | request cancelled                         |
  | `-32000` | authentication required                   |
  | `-32002` | resource not found, such as a file        |

## Where the sources disagree or say nothing

- **The answer to a pending permission on cancel.** The prompt-turn page requires the outcome
  `cancelled`. The cancellation page's example answers with error `-32800` after a
  `$/cancel_request`. Accept both.
- **How many `session/update` kinds there are.** The stable page calls its eleven "the complete
  set". SDK 1.5.0 has sixteen; the other five are unstable and gated by client capabilities.
- **The `session/load` response.** The stable page shows `{}`. The SDK's `LoadSessionResponse` can
  carry `modes` and `configOptions`, and the draft page says it MAY.
- **Which `mcpServers` fields are required.** The SDK requires `mcpServers` on new and load but not
  on resume or fork. The page calls a stdio server's `env` optional, but the SDK requires it. Send
  `mcpServers: []` and `env: []`.
- **The shape of a `set_config_option` value.** The select form has no `type` key and the boolean
  form does. Tell them apart by `type: "boolean"`.
- **What `$/cancel_request` obliges.** The stable page says a receiver MAY cancel the work; the
  completed RFD says MUST.
- **What the specification does not settle.**
  - the base of a tool location's `line`;
  - what happens to a `session/prompt` sent while a turn is running;
  - the status of a tool call after a refused permission;
  - how to clear a plan (sending one with no entries is the only way available);
  - the error code for an unknown config option or value.
