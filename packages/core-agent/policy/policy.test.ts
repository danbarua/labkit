import { expect, test } from "@logtape/testing-bun/autoload";
import { z } from "zod";

import { BlobRefSchema, hashBlob, MediaKindSchema } from "../agent/content.ts";
import { ActorIdSchema, AgentIdSchema, failure, StepsSchema } from "../agent/types.ts";
import {
  builtinResolvers,
  copyResolvers,
  defaultPolicy,
  effectiveToolResult,
  initialPolicy,
  patchPolicy,
  projectPolicy,
} from "./policy.ts";

const capabilities = { agents: [["a", { tools: ["echo"] }]] as const };
test("named pack selection resolves defaults and validates contradictory data", () => {
  const initial = defaultPolicy(capabilities, 4);
  expect(patchPolicy(initial, { id: "queued@1" }, capabilities)).toMatchObject({
    admission: "queue-user",
    bargeIn: false,
    version: 1,
  });
  expect(() => patchPolicy(initial, { admission: "queue-user" }, capabilities)).toThrow("bargeIn");
  expect(() => patchPolicy(initial, { id: "missing@1" }, capabilities)).toThrow("pack");
  expect(() => patchPolicy(initial, { tools: { a: ["other"] } }, capabilities)).toThrow(
    "capabilities",
  );
});
test("invalid custom projections cannot bypass provider tool correlation", () => {
  const resolvers = copyResolvers({
    ...builtinResolvers,
    projections: new Map([
      ["bad@1", () => [{ role: "tool", content: "orphan", tool_call_id: "missing" }]],
    ]),
  });
  const policy = initialPolicy(capabilities, 1, { project: "bad@1" }, resolvers);
  expect(() =>
    projectPolicy(
      {
        agent: { model: "m", tools: [] },
        log: [],
        turn: {
          id: ActorIdSchema.parse("turn"),
          agent: AgentIdSchema.parse("a"),
          steps: StepsSchema.parse(1),
          generation: 1,
          messages: [],
          view: { kind: "history" },
        },
      },
      [],
      policy,
      resolvers,
    ),
  ).toThrow("orphan");
});

test("a custom projection pack still gets target-aware pointer rewriting", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const ref = BlobRefSchema.parse({ id: hashBlob(bytes), media: "image/png", bytes: bytes.length });
  const resolvers = copyResolvers({
    ...builtinResolvers,
    projections: new Map([
      [
        "custom@1",
        () => [{ role: "user" as const, content: "", parts: [{ type: "blob" as const, ref }] }],
      ],
    ]),
  });
  const policy = initialPolicy(capabilities, 1, { project: "custom@1" }, resolvers);
  const media = Object.fromEntries(
    MediaKindSchema.options.map((kind) => [kind, "unsupported" as const]),
  ) as Record<(typeof MediaKindSchema.options)[number], "unsupported">;
  const result = projectPolicy(
    {
      agent: { model: "m", tools: [] },
      log: [],
      turn: {
        id: ActorIdSchema.parse("turn"),
        agent: AgentIdSchema.parse("a"),
        steps: StepsSchema.parse(1),
        generation: 1,
        messages: [],
        view: { kind: "history" },
      },
      target: { provider: "p", model: "m", media },
    },
    [],
    policy,
    resolvers,
  );
  expect(result.pointers).toEqual([
    { media: "image/png", bytes: 3, blobId: ref.id, support: "unsupported" },
  ]);
  const [message] = result.messages;
  if (message?.role !== "user") throw new Error("Expected a user message");
  expect(message.content).toContain(`blob://${ref.id}.png`);
  expect(message.parts).toEqual([
    { type: "text", text: expect.stringContaining(`blob://${ref.id}.png`) },
  ]);
});

test("a continued tool failure reaches the model as one message and each validation problem once", () => {
  const continuing = { toolFailure: "return-error-and-continue" } as const;
  const parsed = z.object({ entries: z.array(z.string()) }).safeParse({ entries: "x" });
  const invalid = failure(parsed.error, {
    classification: "invalid_input",
    phase: "validate_input",
    operation: { id: "s/turn/1/call", kind: "tool", sessionId: "s", toolName: "update_plan" },
  });
  const result = effectiveToolResult({ kind: "failed", error: invalid }, continuing);
  expect(result).toEqual({
    kind: "succeeded",
    value: {
      text: JSON.stringify({
        error: "Invalid tool arguments",
        issues: [{ path: ["entries"], message: "Invalid input: expected array, received string" }],
      }),
    },
  });
  expect(invalid.cause).toMatchObject({ name: "ZodError", issues: [{ path: ["entries"] }] });
  const broken = failure(new Error("broken", { cause: new Error("inner") }), {
    operation: { id: "s/turn/1/echo", kind: "tool", sessionId: "s", toolName: "echo" },
  });
  expect(effectiveToolResult({ kind: "failed", error: broken }, continuing)).toEqual({
    kind: "succeeded",
    value: { text: '{"error":"broken"}' },
  });
  expect(effectiveToolResult({ kind: "failed", error: broken })).toEqual({
    kind: "failed",
    error: broken,
  });
});
