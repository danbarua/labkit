# @labkit/core-agent

Internal, Bun-first package for durable agent sessions. The package exports TypeScript source;
Bun runs it directly and TypeScript consumes its types without a build step. It depends only on
Zod and LogTape. Attachment hashing uses Bun APIs, so Node/browser execution is not supported by
this package contract. `private: true` prevents accidental registry publication; local links and
packed tarballs still work.

## Choose your integration boundary

Start with the [session guide](session/README.md) if your application needs saved history and an
explanation after interruption. It distinguishes accepted input, displayed progress, and committed
outcomes; those are different promises. Use `/agent` only when process-local history is sufficient.

Supply [tools/completions](host/README.md), [model bindings](providers/README.md), and persistence;
core runs the loop. The [environment guide](environment/README.md) explains input/render lifetimes
and request capture. [Policy](policy/README.md) controls admission and what context reaches a model.
[Logging](logging/README.md) explains where to find the cause when execution stops.

## Use from another package

Packages in this repository depend on it with `"@labkit/core-agent": "workspace:*"`. Source edits
are available immediately; restart the consuming process to load them. Only the process-local
memory persistence adapter is exported under `/testing`; it is not durable storage.

## Usage

```ts
import { createSession } from "@labkit/core-agent";
import { createMemoryPersistence } from "@labkit/core-agent/testing";

const session = await createSession({
  persistence: createMemoryPersistence(),
  configuration: {
    agent: "assistant",
    agents: new Map([["assistant", { model: "test-model" }]]),
    steps: 4,
  },
  bindings: {
    complete: () => ({ kind: "answer", text: "Hello from core" }),
  },
});
const result = await session.input("Hello").settled;
console.log(result);
await session.close();
```

The root export is the session API. Explicit subpaths provide `/session`, `/agent` (nonjournaled
runtime), `/types`, `/content`, `/host`, `/providers`, `/policy`, `/environment`, `/logging`, `/fsm`,
and `/testing`. Internal deep imports are not exported. Consumers using TypeScript should use
`moduleResolution: "bundler"`, `noEmit: true`, and Bun types (`bun add --dev @types/bun`).
See each module's README for runtime, persistence, provider and permission contracts.
