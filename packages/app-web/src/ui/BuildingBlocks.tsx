import type {
  AvailableCommand,
  CreateElicitationRequest,
  CreateElicitationResponse,
  SessionConfigOption,
} from "@agentclientprotocol/sdk";
import {
  type Activity,
  CommandPalette,
  Composer,
  ElicitationForm,
  Modal,
  PalettePanel,
  type StepFigures,
  StepStats,
  type PickItem,
  Surface,
  useLingering,
  useToasts,
  WorkingIndicator,
} from "@labkit/ui";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

type Theme = "light" | "dark" | undefined;

// Shaped like what the agent sends: the same categories, groups and kinds of value.
const COMMANDS: AvailableCommand[] = [
  {
    name: "review",
    description: "Review workspace files or supplied attachments",
    input: { hint: "files or review focus" },
  },
  {
    name: "explain",
    description: "Explain code using workspace evidence",
    input: { hint: "file, symbol, or question" },
  },
  {
    name: "plan",
    description: "Plan a workspace task without implementing it",
    input: { hint: "task to plan" },
  },
  { name: "export", description: "Write this session's history to a Markdown file" },
];

const CONFIG: SessionConfigOption[] = [
  {
    id: "mode",
    name: "File access",
    category: "mode",
    type: "select",
    currentValue: "read-only",
    options: [
      { value: "read-only", name: "Read only", description: "Read and list workspace files" },
      { value: "edit", name: "Edit", description: "Read, list, and write files with approval" },
    ],
  },
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "anthropic/claude-opus-5-5",
    options: [
      {
        group: "anthropic",
        name: "Anthropic",
        options: [
          { value: "anthropic/claude-opus-5-5", name: "Claude Opus 5.5" },
          { value: "anthropic/claude-fable-5-1", name: "Claude Fable 5.1" },
          { value: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5" },
          { value: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5" },
        ],
      },
      {
        group: "localhost",
        name: "Localhost",
        options: [
          {
            value: "localhost/mlx-community/Qwen3.5-9B-8bit",
            name: "mlx-community/Qwen3.5-9B-8bit",
          },
        ],
      },
    ],
  },
  {
    id: "thinking",
    name: "Thinking",
    category: "thought_level",
    type: "select",
    currentValue: "high",
    options: [
      { value: "off", name: "Off" },
      { value: "low", name: "Low" },
      { value: "medium", name: "Medium" },
      { value: "high", name: "High" },
    ],
  },
  {
    id: "permissions",
    name: "Tool approvals",
    type: "select",
    currentValue: "ask",
    options: [
      { value: "ask", name: "Ask / clear remembered approvals" },
      { value: "off", name: "Allow all enabled tools without asking" },
    ],
  },
  {
    id: "tool_failure",
    name: "Tool failure handling",
    type: "select",
    currentValue: "return-error-and-continue",
    options: [
      { value: "return-error-and-continue", name: "Report failure to the model and continue" },
      { value: "fail-turn", name: "Stop the turn on tool failure" },
    ],
  },
];

// No host offers mentions yet; these stand in for files and records a host would list.
const MENTIONS: PickItem[] = [
  { id: "f1", label: "README.md", group: "Files" },
  { id: "f2", label: "DESIGN.md", group: "Files" },
  { id: "f3", label: "instruments/02plus04.md", group: "Files" },
  { id: "r1", label: "CLM_3", detail: "AUC above control in 7 of 10 classes", group: "Records" },
  { id: "r2", label: "EV_4", detail: "Per-seed AUC, 10 classes", group: "Records" },
  { id: "r3", label: "NOTE_41", detail: "The three inconclusive classes", group: "Records" },
];

/** `options` with `configId` set to `value`, as the agent would report it back. */
function withSetting(options: SessionConfigOption[], configId: string, value: string | boolean) {
  return options.map((o) =>
    o.id === configId ? ({ ...o, currentValue: value } as SessionConfigOption) : o,
  );
}

const pad: CSSProperties = { padding: 16, display: "flex", flexDirection: "column", gap: 12 };
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const note: CSSProperties = { margin: 0, color: "var(--lk-muted)", fontSize: 13 };

function Tile({
  id,
  title,
  theme,
  children,
}: {
  id: string;
  title: string;
  theme: Theme;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>
        {title} <code style={{ color: "var(--text-dim)" }}>{id}</code>
      </h3>
      <div style={{ height: 480, border: "1px solid var(--panel-border)" }}>
        <Surface theme={theme}>{children}</Surface>
      </div>
    </section>
  );
}

/** A composer at the foot of the tile, as it sits under a conversation, with room above for its lists. */
function ComposerDemo({ initialText }: { initialText?: string }) {
  const toasts = useToasts();
  const [config, setConfig] = useState(CONFIG);
  const [running, setRunning] = useState(false);
  return (
    <>
      <div style={{ ...pad, flex: 1 }}>
        <p style={note}>
          Type <code>/</code> or <code>@</code>, or use the controls under the box. Paste, drop or
          attach files (images, PDF, CSV; up to 4, 5 MB each). Sending shows what would be sent; the
          stop button then ends the pretend turn.
        </p>
      </div>
      <Composer
        running={running}
        commands={COMMANDS}
        configOptions={config}
        mentions={MENTIONS}
        onSetConfig={(id, value) => setConfig((c) => withSetting(c, id, value))}
        onSend={(text, files) => {
          setRunning(true);
          const attached = files.length === 0 ? "" : ` with ${files.map((f) => f.name).join(", ")}`;
          toasts.show(`Would send: ${text}${attached}`, { tone: "success" });
        }}
        attach={{
          accept: ["image/*", "application/pdf", ".csv"],
          maxFiles: 4,
          maxBytes: 5 * 1024 * 1024,
        }}
        onCancel={() => setRunning(false)}
        {...(initialText === undefined ? {} : { initialText })}
      />
    </>
  );
}

function ToastDemo() {
  const toasts = useToasts();
  return (
    <div style={pad}>
      <p style={note}>
        Hover or focus a toast to hold it. Errors stay until dismissed and are announced at once;
        the rest wait their turn.
      </p>
      <div style={row}>
        <button
          type="button"
          className="lk-btn"
          onClick={() => toasts.show("Model set to Claude Opus 5.5")}
        >
          Info
        </button>
        <button
          type="button"
          className="lk-btn"
          onClick={() => toasts.show("Exported to .labkit/exports/session.md", { tone: "success" })}
        >
          Success
        </button>
        <button
          type="button"
          className="lk-btn"
          onClick={() => toasts.show("The agent stopped responding", { tone: "error" })}
        >
          Error
        </button>
        <button
          type="button"
          className="lk-btn"
          onClick={() =>
            toasts.show("Remembered approvals cleared", {
              action: {
                label: "Undo",
                onPress: () => toasts.show("Approvals restored", { tone: "success" }),
              },
            })
          }
        >
          With an action
        </button>
      </div>
    </div>
  );
}

function ModalDemo() {
  const toasts = useToasts();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Tool harness permutations");
  return (
    <div style={pad}>
      <p style={note}>
        Tab stays inside the dialog; Escape or the backdrop closes it; focus returns to the button.
      </p>
      <div style={row}>
        <button type="button" className="lk-btn" onClick={() => setOpen(true)}>
          Rename session…
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Rename session">
        <form
          style={{ ...pad, paddingTop: 12 }}
          onSubmit={(event) => {
            event.preventDefault();
            setOpen(false);
            toasts.show(`Renamed to “${name}”`, { tone: "success" });
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            Name
            <input
              data-autofocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={{
                font: "inherit",
                padding: "6px 8px",
                border: "1px solid var(--lk-line)",
                borderRadius: 6,
                background: "var(--lk-surface)",
                color: "var(--lk-text)",
              }}
            />
          </label>
          <div style={{ ...row, justifyContent: "flex-end" }}>
            <button type="button" className="lk-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="lk-btn primary">
              Rename
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const PALETTE_ITEMS: PickItem[] = [
  ...COMMANDS.map((c) => ({
    id: `c:${c.name}`,
    label: `/${c.name}`,
    detail: c.description,
    group: "Commands",
  })),
  { id: "a:new", label: "New session", group: "Session" },
  { id: "a:rename", label: "Rename session…", group: "Session" },
  {
    id: "a:export",
    label: "Export history",
    detail: "Markdown, under .labkit/exports",
    group: "Session",
  },
];

function PaletteDemo() {
  const toasts = useToasts();
  const [open, setOpen] = useState(false);
  const pick = (item: PickItem) => toasts.show(`Picked ${item.label}`);
  return (
    <div style={{ ...pad, flex: 1, minHeight: 0 }}>
      <div style={row}>
        <button type="button" className="lk-btn" onClick={() => setOpen(true)}>
          Open as a dialog
        </button>
      </div>
      <div
        style={{
          border: "1px solid var(--lk-line)",
          borderRadius: 12,
          background: "var(--lk-panel)",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <PalettePanel
          title="Command palette"
          items={PALETTE_ITEMS}
          onPick={pick}
          placeholder="Search commands and actions"
        />
      </div>
      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        title="Command palette"
        items={PALETTE_ITEMS}
        onPick={pick}
        placeholder="Search commands and actions"
      />
    </div>
  );
}

// One field of every kind the protocol allows, as an agent would ask before a run.
const RUN_QUESTION: CreateElicitationRequest = {
  sessionId: "demo",
  mode: "form",
  message: "Before I start the sweep, a few settings.",
  requestedSchema: {
    type: "object",
    required: ["name", "seeds", "optimiser"],
    properties: {
      name: {
        type: "string",
        title: "Run name",
        description: "Letters, digits and dashes.",
        minLength: 3,
        maxLength: 40,
        pattern: "^[a-z0-9-]+$",
      },
      contact: { type: "string", title: "Email me the result", format: "email" },
      deadline: { type: "string", title: "Finish by", format: "date-time" },
      optimiser: {
        type: "string",
        title: "Optimiser",
        oneOf: [
          { const: "adamw", title: "AdamW" },
          { const: "sgd", title: "SGD with momentum" },
          { const: "lion", title: "Lion" },
        ],
      },
      seeds: { type: "integer", title: "Seeds", minimum: 1, maximum: 10, default: 3 },
      lr: { type: "number", title: "Learning rate", minimum: 0, maximum: 1 },
      datasets: {
        type: "array",
        title: "Datasets",
        minItems: 1,
        maxItems: 2,
        items: { type: "string", enum: ["cifar10", "cifar100", "svhn"] },
      },
      dryRun: { type: "boolean", title: "Dry run first", default: true },
    },
  },
};

const SIGN_IN: CreateElicitationRequest = {
  sessionId: "demo",
  mode: "url",
  elicitationId: "demo-sign-in",
  message: "Sign in to Weights & Biases so I can read the sweep.",
  url: "https://wandb.ai/authorize?request=demo",
};

/** Two questions from the agent, and what answering each would send back. */
function ElicitationDemo() {
  const [sent, setSent] = useState<CreateElicitationResponse | undefined>(undefined);
  const [signedIn, setSignedIn] = useState(false);
  return (
    <div style={{ ...pad, overflow: "auto" }}>
      <ElicitationForm request={RUN_QUESTION} onRespond={setSent} />
      <ElicitationForm request={SIGN_IN} onRespond={setSent} completed={signedIn} />
      <div style={row}>
        <button type="button" className="lk-btn" onClick={() => setSignedIn(true)}>
          Pretend the agent reports the sign-in finished
        </button>
      </div>
      <p style={note}>
        {sent === undefined ? "Nothing sent yet." : `Would send: ${JSON.stringify(sent)}`}
      </p>
    </div>
  );
}

const ACTIVITIES: readonly { label: string; activity: Activity | undefined }[] = [
  { label: "Waiting", activity: { kind: "waiting" } },
  { label: "Thinking", activity: { kind: "thinking" } },
  { label: "Tool", activity: { kind: "tool", label: "read_file DESIGN.md" } },
  { label: "Speaking", activity: { kind: "speaking" } },
  { label: "Failed", activity: { kind: "failed" } },
  { label: "Stop", activity: undefined },
];

/** A turn as it unfolds, as [what the agent is doing, for how many milliseconds]. */
const TURN: readonly [Activity | undefined, number][] = [
  [{ kind: "waiting" }, 4000],
  [{ kind: "thinking" }, 3000],
  [{ kind: "tool", label: "read_file DESIGN.md" }, 2000],
  [{ kind: "speaking" }, 4000],
  [undefined, 0],
];

function LoaderDemo() {
  const [activity, setActivity] = useState<Activity | undefined>({ kind: "waiting" });
  const [step, setStep] = useState<number | undefined>(undefined);
  const indicator = useLingering(activity);
  useEffect(() => {
    if (step === undefined) return;
    const [shown, ms] = TURN[step] ?? [undefined, 0];
    setActivity(shown);
    if (step === TURN.length - 1) return;
    const timer = setTimeout(() => setStep(step + 1), ms);
    return () => clearTimeout(timer);
  }, [step]);
  return (
    <div style={pad}>
      <div style={{ minHeight: 24 }}>
        <WorkingIndicator {...indicator} />
      </div>
      <div style={row}>
        {ACTIVITIES.map((choice) => (
          <button
            key={choice.label}
            type="button"
            className="lk-btn"
            onClick={() => {
              setStep(undefined);
              setActivity(choice.activity);
            }}
          >
            {choice.label}
          </button>
        ))}
        <button type="button" className="lk-btn primary" onClick={() => setStep(0)}>
          Play a turn
        </button>
      </div>
      <p style={note}>
        Waiting starts slow and quickens; thinking and tools are fast; speaking is steady; Stop
        shows the done spread before the indicator goes.
      </p>
    </div>
  );
}

/** Sample figures: the agent does not send these yet (#620). */
const STEPS: readonly { label: string; figures: StepFigures }[] = [
  {
    label: "A step that read a file",
    figures: {
      startedAt: "2026-10-01T20:59:14+01:00",
      durationMs: 6_000,
      inputTokens: 289,
      outputTokens: 103,
      cacheReadTokens: 487_000,
      firstTokenMs: 2_700,
    },
  },
  {
    label: "A long answer",
    figures: {
      startedAt: "2026-10-01T21:02:40+01:00",
      durationMs: 58_200,
      inputTokens: 2_200,
      outputTokens: 2_810,
      cacheReadTokens: 485_000,
      firstTokenMs: 1_700,
    },
  },
  {
    label: "A provider that reports only tokens",
    figures: {
      startedAt: "2026-10-01T21:05:03+01:00",
      durationMs: 4_400,
      inputTokens: 11_200_000,
      outputTokens: 95,
    },
  },
];

function StepStatsDemo() {
  return (
    <div style={pad}>
      {STEPS.map(({ label, figures }) => (
        <div key={label}>
          <p style={note}>{label}</p>
          <StepStats figures={figures} />
        </div>
      ))}
      <p style={note}>Sample figures. The agent does not send these yet: see #620.</p>
    </div>
  );
}

/** The shared overlay pieces and the composer, each in a tile of its own. */
export function BuildingBlocks({ theme }: { theme: Theme }) {
  return (
    <>
      <Tile id="composer" title="Composer" theme={theme}>
        <ComposerDemo />
      </Tile>
      <Tile id="composer-commands" title="Composer, typing a command" theme={theme}>
        <ComposerDemo initialText="/" />
      </Tile>
      <Tile id="composer-mention" title="Composer, typing a mention" theme={theme}>
        <ComposerDemo initialText="Does @" />
      </Tile>
      <Tile id="loader" title="What the agent is doing" theme={theme}>
        <LoaderDemo />
      </Tile>
      <Tile id="step-stats" title="What a step cost" theme={theme}>
        <StepStatsDemo />
      </Tile>
      <Tile id="elicitation" title="A question from the agent" theme={theme}>
        <ElicitationDemo />
      </Tile>
      <Tile id="command-palette" title="Command palette" theme={theme}>
        <PaletteDemo />
      </Tile>
      <Tile id="modal" title="Modal" theme={theme}>
        <ModalDemo />
      </Tile>
      <Tile id="toasts" title="Toasts" theme={theme}>
        <ToastDemo />
      </Tile>
    </>
  );
}
