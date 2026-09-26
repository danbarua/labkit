import type {
  ContentBlock,
  PermissionOption,
  SessionUpdate,
  ToolCallContent,
} from "@agentclientprotocol/sdk";
import type { Branch, Scenario, Step } from "./scenario";

const text = (value: string): ContentBlock => ({ type: "text", text: value });

const update = (u: SessionUpdate): Step => ({ kind: "update", update: u });

const say = (value: string, messageId: string): Step =>
  update({ sessionUpdate: "agent_message_chunk", content: text(value), messageId });

const think = (value: string, messageId: string): Step =>
  update({ sessionUpdate: "agent_thought_chunk", content: text(value), messageId });

const asText = (value: string): ToolCallContent => ({ type: "content", content: text(value) });

/** A record-reading tool call as the agent reports it: announced, running, then settled. */
const openRead = (toolCallId: string, title: string, name: string, rawInput: unknown): Step[] => [
  update({
    sessionUpdate: "tool_call",
    toolCallId,
    title,
    name,
    kind: "read",
    status: "pending",
    rawInput,
  }),
  update({ sessionUpdate: "tool_call_update", toolCallId, status: "in_progress" }),
];

const conclusionOptions: readonly PermissionOption[] = [
  { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
  { optionId: "allow_always", name: "Allow for this session", kind: "allow_always" },
  { optionId: "reject_once", name: "Reject", kind: "reject_once" },
  { optionId: "reject_always", name: "Reject for this session", kind: "reject_always" },
];

const concludeInput = { claim: "CLM_3", because: "COMP_5", bearing: "supports" };

const concludeCall = {
  toolCallId: "call_conclude",
  title: "conclude CLM_3 from COMP_5",
  name: "labkit_conclude",
  kind: "edit" as const,
  rawInput: concludeInput,
};

const ran: Branch = {
  steps: [
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_conclude",
      status: "in_progress",
    }),
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_conclude",
      status: "completed",
      content: [asText("Recorded act 41: CLM_3 is supported by COMP_5.")],
      rawOutput: { act: 41, changes: [{ change: "EdgeCreated", from: "COMP_5", to: "CLM_3" }] },
    }),
    say("CLM_3 is now recorded as supported by COMP_5.", "m_after"),
  ],
};

const refused = (mention: string): Branch => ({
  steps: [
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_conclude",
      status: "failed",
      content: [asText("Permission was refused, so nothing was recorded.")],
      rawOutput: { refused: true },
    }),
    say(`${mention} I did not record the conclusion. CLM_3 is unchanged.`, "m_after"),
  ],
});

/** A one-series line chart as an SVG, standing in for a plot a run produced. */
const plotSvg = (): string =>
  [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" font-family="sans-serif" font-size="8">',
    '<rect width="240" height="120" fill="#ffffff"/>',
    '<path d="M24 10V96H228" fill="none" stroke="#94a3b8"/>',
    '<polyline fill="none" stroke="#14b8a6" stroke-width="2" points="24,80 50,72 76,60 102,64 128,44 154,38 180,30 206,26"/>',
    '<text x="24" y="110" fill="#5c6b82">seed</text><text x="4" y="12" fill="#5c6b82">AUC</text>',
    "</svg>",
  ].join("");

export const plainAnswer: Scenario = {
  id: "plain-answer",
  title: "A plain answer",
  prompt: "Does EV_4 support CLM_3?",
  stopReason: "end_turn",
  steps: [
    think("Compare the per-class AUC in EV_4 against the control before answering.", "t1"),
    think(" Seven of ten classes clear it; three do not.", "t1"),
    say("**Partly.** Reading EV_4 next to CLM_3:\n\n", "m1"),
    say("- the AUC is above the control in 7 of 10 classes\n", "m1"),
    say("- the quantity to compare is z_o = mean_{i in o} of the per-seed scores\n", "m1"),
    say("- the other three classes (see NOTE_41) are inconclusive", "m1"),
  ],
};

export const toolSucceeds: Scenario = {
  id: "tool-succeeds",
  title: "A tool that succeeds",
  prompt: "Why do we believe CLM_3?",
  stopReason: "end_turn",
  steps: [
    ...openRead("call_why", "why CLM_3", "labkit_why", { handle: "CLM_3" }),
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_why",
      status: "completed",
      content: [asText("CLM_3 rests on EV_4 (supports) and EV_6 (bears against).")],
      rawOutput: {
        handle: "CLM_3",
        causes: [
          { handle: "EV_4", relation: "supports" },
          { handle: "EV_6", relation: "bears_on", bearing: "against" },
        ],
      },
    }),
    say("CLM_3 rests on one supporting and one opposing piece of evidence.", "m1"),
  ],
};

export const toolFails: Scenario = {
  id: "tool-fails",
  title: "A tool that fails",
  prompt: "Why do we believe CLM_99?",
  stopReason: "end_turn",
  steps: [
    ...openRead("call_why", "why CLM_99", "labkit_why", { handle: "CLM_99" }),
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_why",
      status: "failed",
      content: [asText("No record CLM_99 in this workspace.")],
      rawOutput: { error: "not_found", handle: "CLM_99" },
    }),
    say("There is no CLM_99 here, so I cannot say. Did you mean CLM_9?", "m1"),
  ],
};

export const permissionRequired: Scenario = {
  id: "permission-required",
  title: "A tool that asks first",
  prompt: "Record that COMP_5 supports CLM_3.",
  stopReason: "end_turn",
  steps: [
    say("Recording that needs your approval.", "m0"),
    update({ sessionUpdate: "tool_call", ...concludeCall, status: "pending" }),
    {
      kind: "permission",
      request: {
        toolCall: { ...concludeCall, status: "pending" },
        options: [...conclusionOptions],
      },
      branches: {
        allow_once: ran,
        allow_always: ran,
        reject_once: refused("Understood."),
        reject_always: refused("Understood, and I will not ask again."),
      },
      cancelled: {
        steps: [
          update({
            sessionUpdate: "tool_call_update",
            toolCallId: "call_conclude",
            status: "failed",
            content: [asText("Cancelled before it ran.")],
          }),
        ],
        stopReason: "cancelled",
      },
    },
  ],
};

export const toolImageResult: Scenario = {
  id: "tool-image-result",
  title: "A tool that returns an image",
  prompt: "Plot AUC by seed for COMP_5.",
  stopReason: "end_turn",
  steps: [
    ...openRead("call_plot", "plot AUC for COMP_5", "labkit_plot", { computation: "COMP_5" }),
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_plot",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "image",
            mimeType: "image/svg+xml",
            data: btoa(plotSvg()),
            uri: "blob://3f2a9c1e7d4b0a8e5c6d1f2b9a7e4c3d0b8a6f5e2d1c9b7a4e3f0d8c6b5a2e19.svg",
          },
        },
      ],
      rawOutput: { computation: "COMP_5", points: 8 },
    }),
    say("AUC rises steadily across the eight seeds.", "m1"),
  ],
};

export const planAndDiff: Scenario = {
  id: "plan-and-diff",
  title: "A plan and a file edit",
  prompt: "Add the control run to the config.",
  stopReason: "end_turn",
  steps: [
    update({
      sessionUpdate: "plan_update",
      plan: {
        type: "items",
        planId: "plan_1",
        entries: [
          { content: "Read the current config", priority: "high", status: "in_progress" },
          { content: "Add the control run", priority: "high", status: "pending" },
          { content: "Re-run the check", priority: "medium", status: "pending" },
        ],
      },
    }),
    update({
      sessionUpdate: "plan_update",
      plan: {
        type: "items",
        planId: "plan_1",
        entries: [
          { content: "Read the current config", priority: "high", status: "completed" },
          { content: "Add the control run", priority: "high", status: "in_progress" },
          { content: "Re-run the check", priority: "medium", status: "pending" },
        ],
      },
    }),
    update({
      sessionUpdate: "tool_call",
      toolCallId: "call_edit",
      title: "edit runs/control.toml",
      kind: "edit",
      status: "completed",
      locations: [{ path: "/workspace/runs/control.toml" }],
      content: [
        {
          type: "diff",
          path: "/workspace/runs/control.toml",
          oldText: 'seeds = 20\ncontrol = "rewired"\n',
          newText: 'seeds = 25\ncontrol = "rewired"\ncontrol_seed = 7\n',
        },
      ],
    }),
    say("Added the control seed and raised the seed count to 25.", "m1"),
  ],
};

export const sessionReplay: Scenario = {
  id: "session-replay",
  title: "A reopened session",
  prompt: "",
  stopReason: "end_turn",
  steps: [
    update({
      sessionUpdate: "user_message_chunk",
      content: text("Summarise the open questions."),
      messageId: "u1",
    }),
    say("Two are open: Q_2 (which control to use) and Q_5 (seed count).", "m1"),
    update({
      sessionUpdate: "user_message_chunk",
      content: text("Close Q_5 at 25 seeds."),
      messageId: "u2",
    }),
    say("Noted. Q_5 is closed at 25 seeds.", "m2"),
  ],
};

export const noticesAndUsage: Scenario = {
  id: "notices-and-usage",
  title: "Notices, usage and compaction",
  prompt: "Carry on.",
  stopReason: "end_turn",
  steps: [
    update({ sessionUpdate: "session_info_update", title: "Closing the seed-count question" }),
    update({
      sessionUpdate: "notice",
      severity: "warning",
      title: "Context is 80% full",
      description: "Older turns will be compacted on the next turn.",
    }),
    update({
      sessionUpdate: "usage_update",
      used: 160_000,
      size: 200_000,
      cost: { amount: 0.42, currency: "USD" },
    }),
    update({ sessionUpdate: "compaction_update", compactionId: "c1", status: "in_progress" }),
    update({
      sessionUpdate: "compaction_summary_chunk",
      compactionId: "c1",
      content: text("Q_5 closed at 25 seeds; Q_2 open."),
    }),
    update({ sessionUpdate: "compaction_update", compactionId: "c1", status: "completed" }),
    say("Compacted. Carrying on with Q_2.", "m1"),
  ],
};

export const SCENARIOS: readonly Scenario[] = [
  plainAnswer,
  toolSucceeds,
  toolFails,
  permissionRequired,
  toolImageResult,
  planAndDiff,
  sessionReplay,
  noticesAndUsage,
];
