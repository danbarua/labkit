import type { AvailableCommand, SessionConfigOption } from "@agentclientprotocol/sdk";
import {
  CommandPalette,
  Composer,
  Modal,
  PalettePanel,
  type PickItem,
  Surface,
  useToasts,
} from "@labkit/ui";
import { type CSSProperties, type ReactNode, useState } from "react";

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
          Type <code>/</code> or <code>@</code>, or use the controls under the box. Sending shows
          what would be sent; the stop button then ends the pretend turn.
        </p>
      </div>
      <Composer
        running={running}
        commands={COMMANDS}
        configOptions={config}
        mentions={MENTIONS}
        onSetConfig={(id, value) => setConfig((c) => withSetting(c, id, value))}
        onSend={(text) => {
          setRunning(true);
          toasts.show(`Would send: ${text}`, { tone: "success" });
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
