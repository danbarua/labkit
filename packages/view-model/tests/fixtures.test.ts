/**
 * Each state of the shared fixture corpus, reduced. These are the views the fake agent, the
 * gallery and the interface all have to agree on, so they are asserted here once.
 */

import { describe, expect, test } from "bun:test";
import { FIXTURES } from "@labkit/acp-scenarios";
import {
  type Block,
  pendingPermissions,
  permissionFor,
  phase,
  replay,
  type TranscriptState,
  textOf,
  type ViewEvent,
} from "../index";
import { eventsOfFixture, stateOfFixture } from "../fixtures";

async function viewOf(id: string): Promise<TranscriptState> {
  const fixture = FIXTURES.find((f) => f.id === id);
  if (fixture === undefined) throw new Error(`no fixture ${id}`);
  return stateOfFixture(fixture);
}

const kinds = (state: TranscriptState): Block["kind"][] => state.blocks.map((b) => b.kind);

const messageText = (state: TranscriptState, at: number): string => {
  const block = state.blocks[at];
  if (block === undefined || !("content" in block)) throw new Error(`block ${at} has no content`);
  return textOf(block.content);
};

describe("the corpus", () => {
  test("every fixture has a distinct id", () => {
    const ids = FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("a turn is still running only in the fixtures that leave a request to the person open", async () => {
    for (const fixture of FIXTURES) {
      const state = await viewOf(fixture.id);
      expect(state.running).toBe(["permission-pending", "question-asked"].includes(fixture.id));
    }
  });
});

describe("a plain answer", () => {
  test("streams a thought and a message, each as one block", async () => {
    const state = await viewOf("plain-answer");
    expect(kinds(state)).toEqual(["user", "thought", "assistant"]);
    expect(messageText(state, 1)).toBe(
      "Compare the per-class AUC in EV_4 against the control before answering. Seven of ten classes clear it; three do not.",
    );
    expect(messageText(state, 2)).toContain("the other three classes (see NOTE_41)");
    expect(state.stopReason).toBe("end_turn");
    expect(phase(state)).toBe("idle");
  });
});

describe("tools", () => {
  test("a tool that succeeds is one settled card, before the answer", async () => {
    const state = await viewOf("tool-succeeds");
    expect(kinds(state)).toEqual(["user", "tool", "assistant"]);
    const call = state.toolCalls.call_why;
    expect(call?.status).toBe("completed");
    expect(call?.name).toBe("labkit_why");
    expect(call?.rawInput).toEqual({ handle: "CLM_3" });
    expect(call?.rawOutput).toMatchObject({ handle: "CLM_3" });
  });

  test("a tool that fails keeps its error, and the answer still follows", async () => {
    const state = await viewOf("tool-fails");
    expect(kinds(state)).toEqual(["user", "tool", "assistant"]);
    expect(state.toolCalls.call_why?.status).toBe("failed");
    expect(state.toolCalls.call_why?.rawOutput).toEqual({ error: "not_found", handle: "CLM_99" });
    expect(messageText(state, 2)).toContain("no CLM_99");
  });

  test("an image result arrives as an image block that names its blob", async () => {
    const state = await viewOf("tool-image-result");
    const first = state.toolCalls.call_plot?.content?.[0];
    expect(first?.type).toBe("content");
    const image = first?.type === "content" ? first.content : undefined;
    expect(image?.type === "image" && image.mimeType).toBe("image/svg+xml");
    expect(image?.type === "image" && image.uri).toStartWith("blob://");
    expect(image?.type === "image" && atob(image.data)).toStartWith("<svg");
  });

  test("a plan is one block that later updates replace, and a diff is kept whole", async () => {
    const state = await viewOf("plan-and-diff");
    expect(kinds(state)).toEqual(["user", "plan", "tool", "assistant"]);
    const plan = state.plans.plan_1;
    expect(plan?.kind === "items" && plan.entries.map((e) => e.status)).toEqual([
      "completed",
      "in_progress",
      "pending",
    ]);
    const diff = state.toolCalls.call_edit?.content?.[0];
    expect(diff?.type === "diff" && diff.newText).toContain("control_seed = 7");
  });
});

describe("permission", () => {
  test("a request the client has not answered holds the turn and needs attention", async () => {
    const state = await viewOf("permission-pending");
    expect(phase(state)).toBe("awaiting_permission");
    expect(pendingPermissions(state)).toHaveLength(1);
    expect(state.toolCalls.call_conclude?.status).toBe("pending");
    expect(state.stopReason).toBeUndefined();
  });

  test("allowing once runs the tool, and the record shows the decision", async () => {
    const state = await viewOf("permission-granted");
    expect(phase(state)).toBe("idle");
    expect(state.toolCalls.call_conclude?.status).toBe("completed");
    expect(permissionFor(state, "call_conclude")?.outcome).toEqual({
      outcome: "selected",
      optionId: "allow_once",
    });
    expect(state.stopReason).toBe("end_turn");
  });

  test("allowing for the session ends the same way, with its own decision", async () => {
    const state = await viewOf("permission-granted-for-session");
    expect(state.toolCalls.call_conclude?.status).toBe("completed");
    expect(permissionFor(state, "call_conclude")?.outcome).toMatchObject({
      optionId: "allow_always",
    });
  });

  test("a refusal fails the tool, and the agent says it did not act", async () => {
    const state = await viewOf("permission-refused");
    expect(state.toolCalls.call_conclude?.status).toBe("failed");
    expect(permissionFor(state, "call_conclude")?.outcome).toMatchObject({
      optionId: "reject_once",
    });
    expect(messageText(state, state.blocks.length - 1)).toContain("did not record");
    expect(pendingPermissions(state)).toHaveLength(0);
  });

  test("cancelling while it waits ends the turn as cancelled", async () => {
    const state = await viewOf("permission-cancelled");
    expect(permissionFor(state, "call_conclude")?.outcome).toEqual({ outcome: "cancelled" });
    expect(state.toolCalls.call_conclude?.status).toBe("failed");
    expect(state.stopReason).toBe("cancelled");
  });
});

describe("a reopened session", () => {
  test("replays as the same blocks a live session would have built", async () => {
    const state = await viewOf("session-replay");
    expect(kinds(state)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(messageText(state, 2)).toBe("Close Q_5 at 25 seeds.");
  });

  test("the same events always give the same view", async () => {
    const fixture = FIXTURES.find((f) => f.id === "plain-answer");
    if (fixture === undefined) throw new Error("no plain-answer fixture");
    const events = await eventsOfFixture(fixture);
    expect(replay(events)).toEqual(replay(events));
  });
});

describe("side state", () => {
  test("a title, usage with cost, a notice and a finished compaction are kept", async () => {
    const state = await viewOf("notices-and-usage");
    expect(state.title).toBe("Closing the seed-count question");
    expect(state.usage).toEqual({
      used: 160_000,
      size: 200_000,
      cost: { amount: 0.42, currency: "USD" },
    });
    const notice = state.blocks.find((b) => b.kind === "notice");
    expect(notice).toMatchObject({ severity: "warning", title: "Context is 80% full" });
    const compaction = state.blocks.find((b) => b.kind === "compaction");
    expect(compaction).toMatchObject({ status: "completed" });
    expect(compaction?.kind === "compaction" && textOf(compaction.summary)).toBe(
      "Q_5 closed at 25 seeds; Q_2 open.",
    );
  });
});
