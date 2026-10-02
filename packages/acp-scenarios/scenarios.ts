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

/** AUC by seed for COMP_5 and its control: the data a `plot` call carries. */
const aucBySeed = [0.71, 0.74, 0.73, 0.77, 0.79, 0.78, 0.81, 0.83].flatMap((auc, i) => [
  { seed: i + 1, auc, run: "COMP_5" },
  { seed: i + 1, auc: [0.62, 0.64, 0.61, 0.66, 0.63, 0.65, 0.64, 0.66][i], run: "control" },
]);

const plotInput = {
  title: "AUC by seed",
  data: aucBySeed,
  mark: "line",
  x: "seed",
  y: "auc",
  color: "run",
};

/** The Vega-Lite spec the plot tool makes of its input: the data inline, the layout settled. */
const plotSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v6.json",
  title: plotInput.title,
  width: "container",
  height: 220,
  data: { values: aucBySeed },
  mark: { type: "line", point: true },
  encoding: {
    x: { field: "seed", type: "ordinal", title: "Seed" },
    y: { field: "auc", type: "quantitative", title: "AUC", scale: { zero: false } },
    color: { field: "run", type: "nominal", title: null },
  },
};

export const toolPlot: Scenario = {
  id: "tool-plot",
  title: "A plot: the model supplies data, the client draws the chart",
  prompt: "Plot AUC by seed for COMP_5 against its control.",
  stopReason: "end_turn",
  steps: [
    update({
      sessionUpdate: "tool_call",
      toolCallId: "call_vl",
      title: "plot AUC by seed",
      name: "plot",
      kind: "other",
      status: "pending",
      rawInput: plotInput,
    }),
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_vl",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "resource",
            resource: {
              uri: "plot://COMP_5/auc-by-seed",
              mimeType: "application/vnd.vegalite.v6+json",
              text: JSON.stringify(plotSpec),
            },
          },
        },
      ],
      rawOutput: { points: aucBySeed.length },
    }),
    say("COMP_5 is above the control at every seed, and the gap widens from seed 4 on.", "m1"),
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

const NEW_FILE = [
  '"""Score each class against the rewired control."""',
  "",
  "import json",
  "from pathlib import Path",
  "",
  "SEEDS = 25",
  "",
  "",
  "def auc(scores: list[float], control: list[float]) -> float:",
  "    # The share of pairs in which the run beats the control.",
  "    wins = sum(s > c for s in scores for c in control)",
  "    return wins / (len(scores) * len(control))",
  "",
  "",
  'if __name__ == "__main__":',
  '    runs = json.loads(Path("runs/scores.json").read_text())',
  "    for name, run in runs.items():",
  "        print(f\"{name}: {auc(run['scores'], run['control']):.3f}\")",
  "",
].join("\n");

export const newFile: Scenario = {
  id: "new-file",
  title: "A new file",
  prompt: "Write the script that scores each class against the control.",
  stopReason: "end_turn",
  steps: [
    update({
      sessionUpdate: "tool_call",
      toolCallId: "call_write",
      title: "write analysis/score.py",
      name: "write_file",
      kind: "edit",
      status: "completed",
      locations: [{ path: "/workspace/analysis/score.py" }],
      rawInput: { path: "analysis/score.py", text: NEW_FILE },
      rawOutput: JSON.stringify({
        path: "/workspace/analysis/score.py",
        bytes: NEW_FILE.length,
        before: { kind: "absent", source: "filesystem" },
        newText: NEW_FILE,
      }),
      content: [
        { type: "diff", path: "/workspace/analysis/score.py", oldText: null, newText: NEW_FILE },
      ],
    }),
    say("Wrote `analysis/score.py`. It prints one AUC per class.", "m1"),
  ],
};

export const turnFails: Scenario = {
  id: "turn-fails",
  title: "A turn the provider fails",
  prompt: "Summarise the seed runs.",
  stopReason: "end_turn",
  steps: [
    think("Read the per-seed scores first.", "t1"),
    ...openRead("call_seeds", "read runs/seeds.json", "read_file", { path: "runs/seeds.json" }),
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_seeds",
      status: "completed",
      content: [asText('{"seeds": 25, "complete": 25}')],
    }),
    say("All 25 seeds finished. Comparing them", "m1"),
  ],
  fails: { code: -32603, message: "Provider request failed: 529 Overloaded" },
};

export const answerCutShort: Scenario = {
  id: "answer-cut-short",
  title: "An answer cut short by the token limit",
  prompt: "Write up the seed comparison in full.",
  stopReason: "max_tokens",
  stopDetail: "The model stopped at its output limit of 4096 tokens.",
  steps: [
    say("## Seed comparison\n\nAcross the 25 seeds, the control run scored", "m1"),
    say(" a mean AUC of 0.61 against 0.74 for the", "m1"),
  ],
};

export const turnCancelled: Scenario = {
  id: "turn-cancelled",
  title: "A turn the person cancelled",
  prompt: "Re-run every seed.",
  stopReason: "cancelled",
  steps: [
    ...openRead("call_rerun", "list runs", "list_dir", { path: "runs" }),
    update({ sessionUpdate: "tool_call_update", toolCallId: "call_rerun", status: "completed" }),
    say("Starting with seed 1", "m1"),
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
  toolPlot,
  planAndDiff,
  newFile,
  turnFails,
  answerCutShort,
  turnCancelled,
  sessionReplay,
  noticesAndUsage,
];
