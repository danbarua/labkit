/**
 * The conversation drawn as markup for each state in the shared corpus. Static markup shows what
 * is on the page and what a reader could click; behaviour in a browser is checked where there is
 * one.
 */

import { describe, expect, test } from "bun:test";
import { FIXTURES } from "@labkit/acp-scenarios";
import { stateOfFixture } from "@labkit/view-model/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { Conversation } from "../index";

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
    expect(html).toContain("<summary>Input</summary>");
    expect(html).toContain("&quot;handle&quot;: &quot;CLM_3&quot;");
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
