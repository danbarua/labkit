/** The outcome of a call's permission request that labkit's agent records in the call's `_meta`. */

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

describe("a call's recorded permission outcome", () => {
  test("is the selected option, by its id, name and kind", () => {
    const outcome = {
      outcome: "selected",
      optionId: "allow-once",
      name: "Allow once",
      kind: "allow_once",
    } as const;
    expect(recordedAnswer(call({ [PERMISSION_ANSWER_KEY]: outcome }))).toEqual(outcome);
  });

  test("is the selected option by its id alone when the question did not offer it", () => {
    const outcome = { outcome: "selected", optionId: "maybe" } as const;
    expect(recordedAnswer(call({ [PERMISSION_ANSWER_KEY]: outcome }))).toEqual(outcome);
  });

  test("is cancelled when the request's turn was cancelled", () => {
    expect(recordedAnswer(call({ [PERMISSION_ANSWER_KEY]: { outcome: "cancelled" } }))).toEqual({
      outcome: "cancelled",
    });
  });

  test("is undefined when the call carries no _meta, or no outcome in its _meta", () => {
    expect(recordedAnswer(call())).toBeUndefined();
    expect(recordedAnswer(call({ "labkit.dev/baseline": "abc" }))).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  test("with a kind ACP does not define is not used, and is logged as a warning with its value once per _meta", () => {
    const value = {
      outcome: "selected",
      optionId: "maybe",
      name: "Maybe",
      kind: "allow_sometimes",
    };
    const malformed = call({ [PERMISSION_ANSWER_KEY]: value });
    expect(recordedAnswer(malformed)).toBeUndefined();
    expect(recordedAnswer(malformed)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toEqual({ toolCallId: "call-1", value });
  });

  test("that names no outcome, or is not an object, is not used, and is logged as a warning", () => {
    const option = { optionId: "allow-once", name: "Allow once", kind: "allow_once" };
    expect(recordedAnswer(call({ [PERMISSION_ANSWER_KEY]: option }))).toBeUndefined();
    expect(recordedAnswer(call({ [PERMISSION_ANSWER_KEY]: "cancelled" }))).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
