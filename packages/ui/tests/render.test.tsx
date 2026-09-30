/**
 * The conversation drawn as markup for each state in the shared corpus. Static markup shows what
 * is on the page and what a reader could click; behaviour in a browser is checked where there is
 * one.
 */

import { describe, expect, test } from "bun:test";
import { FIXTURES } from "@labkit/acp-scenarios";
import { stateOfFixture } from "@labkit/view-model/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { commandsMatching } from "../composer";
import type { PickItem } from "../overlay/list";
import { pickedSetting, settingItems } from "../session-controls";
import { Conversation, type RecordsConfig } from "../index";

async function draw(id: string, handlers = false): Promise<string> {
  const fixture = FIXTURES.find((f) => f.id === id);
  if (fixture === undefined) throw new Error(`no fixture ${id}`);
  const state = await stateOfFixture(fixture);
  return renderToStaticMarkup(
    handlers ? (
      <Conversation state={state} onSend={() => {}} onCancel={() => {}} onAnswer={() => {}} />
    ) : (
      <Conversation state={state} />
    ),
  );
}

describe("the transcript", () => {
  test("a plain answer shows the prompt, a collapsed thought and the markdown answer", async () => {
    const html = await draw("plain-answer");
    expect(html).toContain("Does EV_4 support CLM_3?");
    expect(html).toContain("<summary>Thought</summary>");
    expect(html).toContain("<strong>Partly.</strong>");
    expect(html).toContain("<li>the AUC is above the control in 7 of 10 classes</li>");
    expect(html).toContain("Idle");
  });

  test("a tool card shows its title, status, and what went in and came out", async () => {
    const html = await draw("tool-succeeds");
    expect(html).toContain("why CLM_3");
    expect(html).toContain("labkit_why");
    expect(html).toContain("lk-status completed");
    // A one-field input is its value on one line, not a collapsed JSON block.
    expect(html).toContain(
      '<div class="lk-args"><span><code class="lk-args-value">CLM_3</code></span></div>',
    );
    expect(html).not.toContain("<summary>Input</summary>");
  });

  test("a failed tool says so", async () => {
    const html = await draw("tool-fails");
    expect(html).toContain("lk-status failed");
    expect(html).toContain("No record CLM_99 in this workspace.");
  });

  test("an image result is drawn from its data and names its blob", async () => {
    const html = await draw("tool-image-result");
    expect(html).toContain('src="data:image/svg+xml;base64,');
    expect(html).toContain("blob://3f2a9c1e");
  });

  test("a plan shows each step's state, and a diff marks what changed", async () => {
    const html = await draw("plan-and-diff");
    expect(html).toContain('class="completed"><span>Read the current config</span>');
    expect(html).toContain('class="in_progress"><span>Add the control run</span>');
    expect(html).toContain("lk-diff-line add");
    expect(html).toContain("+ control_seed = 7");
    expect(html).toContain("- seeds = 20");
    expect(html).toContain("/workspace/runs/control.toml");
  });

  test("notices, usage and a compaction are drawn", async () => {
    const html = await draw("notices-and-usage");
    expect(html).toContain("Closing the seed-count question");
    expect(html).toContain("lk-notice warning");
    expect(html).toContain("80%");
    expect(html).toContain("$0.42");
    expect(html).toContain("Conversation compacted");
    expect(html).toContain("Q_5 closed at 25 seeds; Q_2 open.");
  });
});

describe("permission", () => {
  test("a request waiting for the person shows every option the agent offered, and a way out", async () => {
    const html = await draw("permission-pending", true);
    expect(html).toContain("Waiting for you");
    for (const name of [
      "Allow once",
      "Allow for this session",
      "Reject",
      "Reject for this session",
    ]) {
      expect(html).toContain(`>${name}</button>`);
    }
    expect(html).toContain(">Cancel turn</button>");
    expect(html).toContain("conclude CLM_3 from COMP_5");
    // The card of the call being asked about starts open; an answered one starts closed.
    expect(html).toMatch(/<details class="lk-tool" data-status="[a-z_]+" open="">/);
  });

  test("with no handler the options are there but cannot be pressed", async () => {
    const html = await draw("permission-pending");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Allow once<\/button>/);
  });

  test("once answered the prompt is gone and the card records the choice", async () => {
    const html = await draw("permission-granted", true);
    expect(html).not.toContain("Permission needed");
    // A receipt in the past tense, from the kind of option; the agent's name for it on hover.
    expect(html).toContain('lk-decision allow" title="Allow once">Allowed once</span>');
    expect(html).not.toMatch(/<details class="lk-tool"[^>]* open="">/);
    const refused = await draw("permission-refused", true);
    expect(refused).toContain('lk-decision reject" title="Reject">Denied</span>');
    expect(refused).toContain('class="lk-status refused" role="img" aria-label="Refused"');
  });

  test("a request cancelled before an answer is recorded as that, not as a denial", async () => {
    const html = await draw("permission-cancelled", true);
    expect(html).toContain('lk-decision cancelled">Cancelled before a decision</span>');
    expect(html).toContain('class="lk-status cancelled" role="img" aria-label="Cancelled"');
    expect(html).not.toContain("Denied");
  });
});

describe("what an agent writes cannot run", () => {
  test("HTML in a message is not rendered", async () => {
    const { reduce, initialState } = await import("@labkit/view-model");
    const state = reduce(initialState, {
      type: "update",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "<img src=x onerror=alert(1)> and <script>alert(2)</script>",
        },
      },
    });
    const html = renderToStaticMarkup(<Conversation state={state} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    // The text is there, escaped, as text; no element carries the handler.
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toMatch(/<[^>]*onerror/);
  });

  test("a link opens in a new tab without giving the page to the opener", async () => {
    const { reduce, initialState } = await import("@labkit/view-model");
    const state = reduce(initialState, {
      type: "update",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "[a paper](https://example.org/p)" },
      },
    });
    const html = renderToStaticMarkup(<Conversation state={state} />);
    expect(html).toContain('href="https://example.org/p"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });
});

describe("the empty and read-only states", () => {
  test("a session with nothing in it says so, and has no composer without a send handler", () => {
    const html = renderToStaticMarkup(
      <Conversation
        state={{
          blocks: [],
          toolCalls: {},
          plans: {},
          permissions: [],
          running: false,
          commands: [],
        }}
      />,
    );
    expect(html).toContain("Nothing here yet.");
    expect(html).not.toContain("<textarea");
  });
});

describe("records in prose", () => {
  const TYPES = { CLM: "Claim", EV: "Evidence", NOTE: "Note", Q: "Question" };

  const said = async (text: string, records?: RecordsConfig) => {
    const { reduce, initialState } = await import("@labkit/view-model");
    const state = reduce(initialState, {
      type: "update",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
    });
    return renderToStaticMarkup(
      records ? <Conversation state={state} records={records} /> : <Conversation state={state} />,
    );
  };

  test("a handle the host names is a chip carrying its type, and can be pressed when the host opens it", async () => {
    const html = await said("Reading EV_4 next to CLM_3.", { types: TYPES, onOpen: () => {} });
    expect(html).toContain(
      '<button type="button" class="lk-handle" data-type="Evidence" title="Evidence">EV_4</button>',
    );
    expect(html).toContain('data-type="Claim"');
  });

  test("without an open handler the chip is shown but is not a button", async () => {
    const html = await said("see CLM_3", { types: TYPES });
    expect(html).toContain('<span class="lk-handle" data-type="Claim" title="Claim">CLM_3</span>');
    expect(html).not.toMatch(/<button[^>]*lk-handle/);
  });

  test("with no records at all, handles stay plain text", async () => {
    const html = await said("see CLM_3");
    expect(html).not.toContain("lk-handle");
    expect(html).toContain("see CLM_3");
  });

  test("a handle-shaped word the domain does not name is left alone", async () => {
    const html = await said("layer K_1", { types: TYPES });
    expect(html).not.toContain("lk-handle");
  });

  test("maths is set apart, with or without records", async () => {
    const html = await said("where z_o = mean_{i in o} of x");
    expect(html).toContain('<span class="lk-math">z_o = mean_{i in o}</span>');
  });

  test("a handle in code or in a link is not turned into a chip", async () => {
    const html = await said("run `CLM_3` or [CLM_3](https://example.org/x)", { types: TYPES });
    expect(html).not.toContain("lk-handle");
    expect(html).toContain("<code>CLM_3</code>");
  });

  test("a handle in bold text is still found, and the markup around it survives", async () => {
    const html = await said("**Note NOTE_41 says so**", { types: TYPES });
    expect(html).toContain("<strong>Note ");
    expect(html).toContain('data-type="Note"');
  });

  test("the message with maths and a handle keeps both, each once", async () => {
    const html = await said("z_o = mean_{i in o} on Q_1", { types: TYPES });
    expect(html.match(/lk-math/g)).toHaveLength(1);
    expect(html.match(/lk-handle/g)).toHaveLength(1);
  });
});

describe("session configuration", () => {
  const model = {
    id: "model",
    name: "Model",
    type: "select" as const,
    currentValue: "b",
    options: [
      { value: "a", name: "First" },
      { value: "b", name: "Second" },
    ],
  };
  const thinking = {
    id: "thinking",
    name: "Thinking",
    type: "select" as const,
    currentValue: "low",
    options: [
      { group: "g", name: "Effort", options: [{ value: "low", name: "Low" }] },
      { group: "h", name: "Budget", options: [{ value: "1024", name: "1024 tokens" }] },
    ],
  };
  const stream = { id: "stream", name: "Stream", type: "boolean" as const, currentValue: true };

  const shown = async (configOptions: unknown[], props: Record<string, unknown> = {}) => {
    const { reduce, initialState } = await import("@labkit/view-model");
    const state = reduce(initialState, {
      type: "update",
      update: { sessionUpdate: "config_option_update", configOptions: configOptions as never },
    });
    return renderToStaticMarkup(<Conversation state={state} {...props} />);
  };

  const featured = { ...model, category: "model" };

  test("a featured setting is a small control showing its current value, that opens a picker", async () => {
    const html = await shown([featured], { onSend: () => {}, onSetConfig: () => {} });
    expect(html).toContain('aria-haspopup="dialog" aria-label="Model: Second"');
    expect(html).toContain('<span class="lk-chip-value">Second</span>');
  });

  test("the other settings sit behind one settings control, not a control each", async () => {
    const html = await shown([model, thinking], { onSend: () => {}, onSetConfig: () => {} });
    expect(html).toContain('aria-label="Session settings"');
    expect(html).not.toContain("lk-chip-value");
  });

  test("without a handler the values are shown and cannot be changed", async () => {
    const html = await shown([featured], { onSend: () => {} });
    expect(html).toContain('<span class="lk-chip-value">Second</span>');
    expect(html).not.toContain("aria-haspopup");
    // A read-only transcript, with no composer, still says what it ran on.
    const readOnly = await shown([featured]);
    expect(readOnly).toContain("lk-session-summary");
    expect(readOnly).toContain('<span class="lk-chip-value">Second</span>');
  });

  test("no options, no controls", async () => {
    const html = await shown([], { onSend: () => {}, onSetConfig: () => {} });
    expect(html).not.toContain("lk-chip");
    expect(html).not.toContain("Session settings");
  });

  test("a setting's choices keep the agent's groups and mark the current one", () => {
    const items = settingItems(thinking as SessionConfigOption, false);
    expect(items.map((i) => [i.group, i.label, i.current])).toEqual([
      ["Effort", "Low", true],
      ["Budget", "1024 tokens", false],
    ]);
    // Listed with other settings, each choice is headed by its setting as well.
    expect(settingItems(thinking as SessionConfigOption, true)[0]?.group).toBe("Thinking · Effort");
  });

  test("a picked choice names its setting and value, a boolean as a boolean", () => {
    const [on, off] = settingItems(stream as SessionConfigOption, false);
    expect(on?.current).toBe(true);
    expect(pickedSetting(off as PickItem)).toEqual(["stream", false]);
    const [first] = settingItems(model as SessionConfigOption, false);
    expect(pickedSetting(first as PickItem)).toEqual(["model", "a"]);
  });
});

describe("command suggestions", () => {
  const commands = [
    { name: "export", description: "Write the session as Markdown" },
    { name: "review", description: "Review files" },
  ];

  test("a slash offers every command", () => {
    expect(commandsMatching("/", commands).map((c) => c.name)).toEqual(["export", "review"]);
  });

  test("what follows the slash narrows the list", () => {
    expect(commandsMatching("/ex", commands).map((c) => c.name)).toEqual(["export"]);
    expect(commandsMatching("/x", commands)).toEqual([]);
  });

  test("nothing is offered once an argument is being typed, or for ordinary text", () => {
    expect(commandsMatching("/export now", commands)).toEqual([]);
    expect(commandsMatching("export", commands)).toEqual([]);
    expect(commandsMatching("", commands)).toEqual([]);
  });
});
