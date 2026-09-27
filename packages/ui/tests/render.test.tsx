/**
 * The conversation drawn as markup for each state in the shared corpus. Static markup shows what
 * is on the page and what a reader could click; behaviour in a browser is checked where there is
 * one.
 */

import { describe, expect, test } from "bun:test";
import { FIXTURES } from "@labkit/acp-scenarios";
import { stateOfFixture } from "@labkit/view-model/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { commandsMatching } from "../composer";
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
    expect(html).toContain("<summary>Thinking</summary>");
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
  });

  test("with no handler the options are there but cannot be pressed", async () => {
    const html = await draw("permission-pending");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Allow once<\/button>/);
  });

  test("once answered the prompt is gone and the card records the choice", async () => {
    const html = await draw("permission-granted", true);
    expect(html).not.toContain("Permission needed");
    expect(html).toContain('lk-decision allow">Allow once</span>');
    const refused = await draw("permission-refused", true);
    expect(refused).toContain('lk-decision reject">Reject</span>');
    expect(refused).toContain("lk-status failed");
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
    expect(html).not.toContain("<button");
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

  test("a select shows every choice with the current one selected", async () => {
    const html = await shown([model]);
    expect(html).toContain("Model");
    expect(html).toContain('<option value="b" selected="">Second</option>');
    expect(html).toContain('<option value="a">First</option>');
  });

  test("grouped choices sit in labelled groups", async () => {
    const html = await shown([thinking]);
    expect(html).toContain('<optgroup label="Effort">');
    expect(html).toContain('<optgroup label="Budget">');
  });

  test("a boolean option is a checkbox that is checked when the option is on", async () => {
    const html = await shown([stream]);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
  });

  test("without a handler the controls are disabled, and with one they are not", async () => {
    expect(await shown([model])).toContain("disabled");
    expect(await shown([model], { onSetConfig: () => {} })).not.toContain("disabled");
  });

  test("no options, no bar", async () => {
    expect(await shown([])).not.toContain("lk-config-bar");
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

describe("restored tool cards", () => {
  const card = async (meta: Record<string, unknown> | undefined) => {
    const { reduce, initialState } = await import("@labkit/view-model");
    const state = reduce(initialState, {
      type: "update",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "c1",
        title: "write_file",
        status: "completed",
        ...(meta === undefined ? {} : { _meta: meta }),
      },
    });
    return renderToStaticMarkup(<Conversation state={state} />);
  };

  test("a card the agent rebuilt when the session was reopened says so", async () => {
    expect(await card({ "labkit.dev/reconstructed": true })).toContain("restored");
  });

  test("a live card does not", async () => {
    expect(await card(undefined)).not.toContain("restored");
    expect(await card({ "labkit.dev/reconstructed": false })).not.toContain("restored");
  });
});
