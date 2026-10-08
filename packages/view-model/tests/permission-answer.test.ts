/** The permission answer that labkit's agent records with a call, read from the call's `_meta`. */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { ToolCall } from "@agentclientprotocol/sdk";
import { PERMISSION_ANSWER_KEY, recordedAnswer } from "../index";

const call = (meta?: Record<string, unknown>): ToolCall => ({
  toolCallId: "call-1",
  title: "write_file",
  ...(meta === undefined ? {} : { _meta: meta }),
});

const warn = spyOn(console, "warn").mockImplementation(() => {});
afterEach(() => warn.mockClear());

describe("a call's recorded permission answer", () => {
  test("is the option the answer picked, by its id, name and kind", () => {
    const answer = { optionId: "allow-once", name: "Allow once", kind: "allow_once" } as const;
    expect(recordedAnswer(call({ [PERMISSION_ANSWER_KEY]: answer }))).toEqual(answer);
  });

  test("is undefined when the call carries no _meta, or no answer in its _meta", () => {
    expect(recordedAnswer(call())).toBeUndefined();
    expect(recordedAnswer(call({ "labkit.dev/baseline": "abc" }))).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  test("of a kind ACP does not define is not used, and is logged as a warning with its value once per _meta", () => {
    const value = { optionId: "maybe", name: "Maybe", kind: "allow_sometimes" };
    const malformed = call({ [PERMISSION_ANSWER_KEY]: value });
    expect(recordedAnswer(malformed)).toBeUndefined();
    expect(recordedAnswer(malformed)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toEqual({ toolCallId: "call-1", value });
  });

  test("that is not an object, or lacks its name, is not used, and is logged as a warning", () => {
    expect(recordedAnswer(call({ [PERMISSION_ANSWER_KEY]: "allow_once" }))).toBeUndefined();
    expect(
      recordedAnswer(call({ [PERMISSION_ANSWER_KEY]: { optionId: "a", kind: "allow_once" } })),
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
