import { z } from "zod";

import { ChatMessageSchema, type ChatMessage } from "../agent/agent.ts";
import {
  parseSessionContext,
  projectConversationPrompt,
  projectMediaPointers,
  type PromptInput,
} from "../agent/prompt.ts";
import type { ToolRunResult } from "../agent/tool-batch.ts";
import {
  StepsSchema,
  ToolNameSchema,
  type AgentMessage,
  type Failure,
  type Result,
} from "../agent/types.ts";
import { freeze } from "../fsm/fsm.ts";
import {
  ProviderSettingsSchema,
  validateThinking,
  type ThinkingCapability,
} from "../providers/types.ts";

export const PolicyVersionSchema = z.number().int().nonnegative().brand<"PolicyVersion">();

const PolicyObjectSchema = z.strictObject({
  id: z.string().regex(/^.+@\d+$/),
  version: PolicyVersionSchema,
  ...ProviderSettingsSchema.unwrap().partial().shape,
  model: z.string().min(1).optional(),
  completionTimeoutMs: z.number().int().positive().max(2147483647).nullable().optional(),
  toolTimeoutMs: z.number().int().positive().max(2147483647).nullable().optional(),
  steps: StepsSchema,
  admission: z.enum(["reject-during-tools", "abort-tools-on-user", "queue-user"]),
  bargeIn: z.boolean(),
  permissions: z.enum(["off", "ask"]).optional(),
  toolFailure: z.enum(["fail-turn", "return-error-and-continue"]),
  project: z.string().regex(/^.+@\d+$/),
  handoff: z.string().regex(/^.+@\d+$/),
  tools: z.record(z.string().min(1), z.array(ToolNameSchema).readonly()).readonly(),
});

export const PolicySchema = PolicyObjectSchema.refine(
  (policy) => policy.admission !== "queue-user" || !policy.bargeIn,
  "queue-user requires bargeIn=false",
).readonly();

export type Policy = z.infer<typeof PolicySchema>;

export const PolicyPatchSchema = PolicyObjectSchema.omit({ version: true })
  .partial()
  .strict()
  .refine(
    (patch) => Object.values(patch).every((value) => value !== undefined),
    "Omit undefined policy fields",
  );

export type PolicyPatch = z.input<typeof PolicyPatchSchema>;

export type Capabilities = Readonly<{
  agents: readonly (readonly [string, Readonly<{ tools: readonly string[] }>])[];
}>;

export type Projection = (input: PromptInput) => readonly ChatMessage[];

export type HandoffProjection = (
  input: PromptInput & { from: string; to: string },
) => readonly AgentMessage[];

export type PolicyPack = Readonly<
  Pick<Policy, "admission" | "bargeIn" | "toolFailure" | "project" | "handoff"> &
    Partial<Pick<Policy, "thinking">>
>;

export type PolicyResolvers = Readonly<{
  permissionRequests?: boolean;
  validateSelection?: (
    provider: string,
    model: string | undefined,
    thinking: Policy["thinking"],
    stream?: boolean,
    thinkingBudgetTokens?: number | null,
    maxOutputTokens?: number,
  ) => void;
  providerStreams?: ReadonlyMap<string, boolean>;
  providerCapabilities?: ReadonlyMap<string, ThinkingCapability>;
  providerIds?: ReadonlySet<string>;
  packs?: ReadonlyMap<string, PolicyPack>;
  projections: ReadonlyMap<string, Projection>;
  handoffs: ReadonlyMap<string, HandoffProjection>;
}>;

const history: Projection = (input) =>
  projectConversationPrompt({ ...input, agent: { ...input.agent, systemPrompt: undefined } });

const defaultPack: PolicyPack = {
  admission: "reject-during-tools",
  bargeIn: true,
  toolFailure: "fail-turn",
  project: "history@1",
  handoff: "handoff-slim@1",
};

const packs = new Map<string, PolicyPack>([
  ["default@1", defaultPack],
  ["queued@1", { ...defaultPack, admission: "queue-user", bargeIn: false }],
  ["strict@1", { ...defaultPack, bargeIn: false }],
  ["tolerant@1", { ...defaultPack, toolFailure: "return-error-and-continue" }],
]);

export const builtinResolvers: PolicyResolvers = {
  packs,
  projections: new Map([
    ["history@1", history],
    [
      "context-only@1",
      (input) =>
        history({
          ...input,
          log: [],
          handoff: undefined,
          turn: { ...input.turn, view: { kind: "history" } },
        }),
    ],
  ]),
  handoffs: new Map([
    [
      "handoff-slim@1",
      (input) =>
        [
          input.turn.messages.findLast((message) => message.role === "user"),
          input.turn.messages.at(-1),
        ].filter((message): message is AgentMessage => message !== undefined),
    ],
    [
      "handoff-history@1",
      (input) => [
        ...(input.context ?? []),
        ...input.log.flatMap((record) => record.messages),
        ...input.turn.messages,
      ],
    ],
  ]),
};

export function copyResolvers(resolvers: PolicyResolvers = builtinResolvers): PolicyResolvers {
  return {
    permissionRequests: resolvers.permissionRequests,
    validateSelection: resolvers.validateSelection,
    providerStreams: resolvers.providerStreams ? new Map(resolvers.providerStreams) : undefined,
    providerCapabilities: resolvers.providerCapabilities
      ? new Map(
          [...resolvers.providerCapabilities].map(([id, value]) => [
            id,
            freeze(structuredClone(value)),
          ]),
        )
      : undefined,
    providerIds: resolvers.providerIds ? new Set(resolvers.providerIds) : undefined,
    projections: new Map(resolvers.projections),
    handoffs: new Map(resolvers.handoffs),
    packs: new Map(
      [...(resolvers.packs ?? packs)].map(([id, pack]) => [id, freeze(structuredClone(pack))]),
    ),
  };
}

export function defaultPolicy(capabilities: Capabilities, steps: number): Policy {
  return PolicySchema.parse({
    id: "default@1",
    version: 0,
    steps,
    admission: "reject-during-tools",
    bargeIn: true,
    toolFailure: "fail-turn",
    project: "history@1",
    handoff: "handoff-slim@1",
    tools: Object.fromEntries(capabilities.agents.map(([id, agent]) => [id, agent.tools])),
  });
}

/** Policy fields whose validity depends on live bindings rather than on the policy's structure. */
export const bindingPolicyFields = [
  "provider",
  "model",
  "thinking",
  "thinkingBudgetTokens",
  "stream",
  "maxOutputTokens",
  "permissions",
] as const satisfies readonly (keyof Policy)[];

/** Policy fields naming a versioned resolver the environment supplies: pack, projection, handoff. */
export const resolverPolicyFields = [
  "id",
  "project",
  "handoff",
] as const satisfies readonly (keyof Policy)[];

/** The resolver fields of `policy` whose pack, projection or handoff `resolvers` do not supply. */
export function unresolvedPolicyFields(policy: Policy, resolvers: PolicyResolvers) {
  const supplied = {
    id: (resolvers.packs ?? packs).has(policy.id),
    project: resolvers.projections.has(policy.project),
    handoff: resolvers.handoffs.has(policy.handoff),
  };
  return resolverPolicyFields.filter((field) => !supplied[field]);
}

/** Live-environment checks: the permission port, provider, model and profile settings are bound. */
function validateBindings(policy: Policy, resolvers: PolicyResolvers) {
  if (policy.permissions === "ask" && !resolvers.permissionRequests)
    throw new Error("Missing permission request binding");
  if (policy.provider && !resolvers.providerIds?.has(policy.provider))
    throw new Error(
      `Missing versioned provider binding: requested ${policy.provider}; available: ${[...(resolvers.providerIds ?? [])].sort().join(", ") || "none"}`,
    );
  if (policy.provider && resolvers.validateSelection)
    resolvers.validateSelection(
      policy.provider,
      policy.model,
      policy.thinking,
      policy.stream,
      policy.thinkingBudgetTokens,
      policy.maxOutputTokens,
    );
  if (policy.provider && !resolvers.validateSelection && resolvers.providerCapabilities) {
    const capability = resolvers.providerCapabilities.get(policy.provider);
    if (!capability) throw new Error("Missing provider capabilities");
    validateThinking(
      policy.thinking,
      capability,
      policy.thinkingBudgetTokens,
      policy.maxOutputTokens,
    );
  }
  if (
    !resolvers.validateSelection &&
    policy.stream &&
    (!policy.provider || !resolvers.providerStreams?.get(policy.provider))
  )
    throw new Error("Unsupported streaming setting");
}

export function validatePolicy(
  raw: unknown,
  capabilities: Capabilities,
  resolvers: PolicyResolvers = builtinResolvers,
): Policy {
  const policy = PolicySchema.parse(raw);
  if (
    !policy.provider &&
    [
      policy.model,
      policy.thinking,
      policy.stream,
      policy.maxOutputTokens,
      policy.thinkingBudgetTokens,
    ].some((value) => value !== undefined)
  )
    throw new Error("Provider settings require a provider id");
  if (
    policy.provider &&
    capabilities.agents.some(([, agent]) => agent.tools.includes("handoff_to"))
  )
    throw new Error("Reserved handoff tool name");
  validateBindings(policy, resolvers);
  const agents = new Map(capabilities.agents);
  if (
    Object.keys(policy.tools).length !== agents.size ||
    Object.entries(policy.tools).some(
      ([id, tools]) =>
        !agents.has(id) ||
        new Set(tools).size !== tools.length ||
        tools.some((name) => !agents.get(id)!.tools.includes(name)),
    )
  )
    throw new Error("Policy tool permissions exceed host capabilities");
  const unresolved = unresolvedPolicyFields(policy, resolvers);
  if (unresolved.includes("id")) throw new Error("Missing versioned policy pack");
  if (unresolved.length) throw new Error("Missing versioned policy resolver");
  return freeze(policy);
}

export function patchPolicy(
  current: Policy,
  raw: PolicyPatch,
  capabilities: Capabilities,
  resolvers: PolicyResolvers = builtinResolvers,
): Policy {
  const patch = PolicyPatchSchema.parse(raw);
  const pack =
    patch.id && patch.id !== current.id ? (resolvers.packs ?? packs).get(patch.id) : undefined;
  return validatePolicy(
    {
      ...current,
      ...pack,
      ...patch,
      tools: { ...current.tools, ...patch.tools },
      version: current.version + 1,
    },
    capabilities,
    resolvers,
  );
}

/**
 * The input the policy's projection pack renders. On a handoff step, the policy's handoff resolver
 * builds the packet from the messages up to `turn.view.at` (the predecessor's history, as it stood
 * at the handoff); the packet plus the messages the successor added since become
 * `input.handoff`, and the pack decides what to send. The packet is computed here, from turn state
 * and the resolver, and never journaled.
 */
function projectionInput(
  input: PromptInput,
  policy: Policy,
  resolvers: PolicyResolvers,
): PromptInput {
  const view = input.turn.view;
  if (view.kind !== "handoff") return input;
  const handoff = resolvers.handoffs.get(policy.handoff);
  if (!handoff) throw new Error("Missing versioned handoff projection");
  const packet = handoff({
    ...input,
    turn: {
      ...input.turn,
      messages: input.turn.messages.slice(0, view.at),
      view: { kind: "history" },
    },
    from: view.from,
    to: input.turn.agent,
  });
  return { ...input, handoff: [...packet, ...input.turn.messages.slice(view.at)] };
}

/** Settings of `next` that differ from `previous`, ignoring `version`; tool scopes compare per agent. */
export function changedPolicyFields(previous: Policy, next: Policy) {
  return PolicyObjectSchema.keyof().options.filter((field) =>
    field === "tools"
      ? [...new Set([...Object.keys(previous.tools), ...Object.keys(next.tools)])].some(
          (agent) => JSON.stringify(previous.tools[agent]) !== JSON.stringify(next.tools[agent]),
        )
      : field !== "version" && previous[field] !== next[field],
  );
}

export function projectPolicy(
  input: PromptInput,
  systemInputs: readonly string[],
  policy: Policy,
  resolvers: PolicyResolvers = builtinResolvers,
) {
  const project = resolvers.projections.get(policy.project);
  if (!project) throw new Error("Missing versioned projection");
  const projected = project(projectionInput(input, policy, resolvers));
  const { messages: pointered, pointers } = input.target
    ? projectMediaPointers(projected, input.target)
    : { messages: [...projected], pointers: [] };
  const messages = z
    .array(ChatMessageSchema)
    .parse([
      ...(input.agent.systemPrompt ? [{ role: "system", content: input.agent.systemPrompt }] : []),
      ...systemInputs.map((content) => ({ role: "system", content })),
      ...pointered,
    ]);
  parseSessionContext(
    messages.map((message) => {
      if (message.role === "tool")
        return {
          role: "tool",
          text: message.content,
          callId: message.tool_call_id,
          ...(message.parts ? { parts: message.parts } : {}),
        };
      if (message.role === "assistant" && message.tool_calls)
        return {
          role: "assistant",
          text: message.content,
          ...(message.parts ? { parts: message.parts } : {}),
          calls: message.tool_calls.map((call) => {
            let args: unknown;
            try {
              args = JSON.parse(call.function.arguments);
            } catch {
              throw new Error(`Invalid JSON arguments for projected tool call ${call.id}`);
            }
            return { id: call.id, name: call.function.name, args };
          }),
        };
      return {
        role: message.role,
        text: message.content,
        ...(message.parts ? { parts: message.parts } : {}),
      };
    }),
  );
  return { messages: freeze(messages), pointers: freeze(pointers) };
}
/**
 * Deterministic domain conversion. The raw failed result remains in the journal. A tool deadline
 * (classification `timeout`) is converted like any other tool failure. A permission refusal always
 * converts to a "permission refused" result, regardless of `toolFailure`: refusal is a user
 * decision, not a tool error the policy chooses to tolerate. The projected reason is fixed
 * guidance for the model, not the stored audit message.
 */
export function effectiveToolResult(
  result: Result<ToolRunResult>,
  policy?: Pick<Policy, "toolFailure">,
): Result<ToolRunResult> {
  if (result.kind !== "failed") return result;
  if (result.error.classification === "permission_refused")
    return {
      kind: "succeeded",
      value: {
        text: JSON.stringify({
          refused: true,
          reason:
            "The user refused permission for this call; it did not run. Do not retry it unchanged; ask the user how to proceed.",
        }),
      },
    };
  return policy?.toolFailure === "return-error-and-continue"
    ? {
        kind: "succeeded",
        value: { text: JSON.stringify(modelToolError(result.error)) },
      }
    : result;
}

/**
 * The failure as the model reads it: one message, each validation problem once as
 * `{ path, message }`, and for a thrown value that is not an Error its fields as `detail`. Ids,
 * phase, classification and the `cause` chain stay in the journal, and a deadline's message, which
 * names the operation id, is restated without it. Only an `invalid_input` or `invalid_output`
 * failure trades its message (the problems pretty-printed) for a summary: a tool that fails to
 * parse data it read was given valid arguments, so it keeps its own message.
 */
function modelToolError(error: Failure): {
  error: string;
  issues?: ToolIssue[];
  detail?: Record<string, unknown>;
} {
  if (error.classification === "timeout" && error.timeoutMs !== undefined)
    return { error: `The tool exceeded its ${error.timeoutMs} ms deadline and was stopped` };
  const cause = record(error.cause);
  const summary = validationSummary[error.classification ?? ""];
  const raw = cause?.issues;
  if (summary !== undefined && Array.isArray(raw) && raw.length > 0) {
    const issues = raw.map((value): ToolIssue => {
      const issue = record(value);
      return {
        path: Array.isArray(issue?.path)
          ? issue.path.filter((key) => typeof key === "string" || typeof key === "number")
          : [],
        message: typeof issue?.message === "string" ? issue.message : "Invalid value",
      };
    });
    return { error: error.message === cause?.message ? summary : error.message, issues };
  }
  if (cause === undefined || typeof cause.message === "string") return { error: error.message };
  const { cause: _chain, ...detail } = cause;
  return { error: error.message, detail };
}

const validationSummary: Readonly<Record<string, string>> = {
  invalid_input: "Invalid tool arguments",
  // An output check runs after the tool, so its effect may already have happened.
  invalid_output: "The tool ran, but its output was invalid",
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

type ToolIssue = { path: (string | number)[]; message: string };

export function initialPolicy(
  capabilities: Capabilities,
  steps: number,
  patch: PolicyPatch = {},
  resolvers: PolicyResolvers = builtinResolvers,
): Policy {
  return validatePolicy(
    {
      ...patchPolicy(defaultPolicy(capabilities, steps), patch, capabilities, resolvers),
      version: 0,
    },
    capabilities,
    resolvers,
  );
}
