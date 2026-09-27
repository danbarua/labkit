/** How prose is cut into text, maths and handles. */

import { describe, expect, test } from "bun:test";
import { findMathSpans, type Segment, segmentsOf } from "../index";

const TYPES = { Q: "Question", CLM: "Claim", NOTE: "Note", EV: "Evidence" };

const cut = (text: string): string[] =>
  segmentsOf(text, TYPES).map((s) => (s.kind === "text" ? s.text : `${s.kind}:${textOf(s)}`));

const textOf = (s: Segment): string =>
  s.kind === "handle" ? s.handle : s.kind === "math" ? s.text : s.text;

const found = (text: string): string[] => findMathSpans(text).map(([a, b]) => text.slice(a, b));

describe("handles", () => {
  test("a handle whose prefix the domain names is a handle, with its type", () => {
    expect(segmentsOf("see CLM_3 and EV_4.", TYPES)).toEqual([
      { kind: "text", text: "see " },
      { kind: "handle", handle: "CLM_3", type: "Claim" },
      { kind: "text", text: " and " },
      { kind: "handle", handle: "EV_4", type: "Evidence" },
      { kind: "text", text: "." },
    ]);
  });

  test("a handle-shaped word with a prefix the domain does not name stays text", () => {
    expect(cut("layer K_1 and A_2")).toEqual(["layer K_1 and A_2"]);
  });

  test("text with no handle is one segment, and empty text is none", () => {
    expect(cut("nothing here")).toEqual(["nothing here"]);
    expect(segmentsOf("", TYPES)).toEqual([]);
  });

  test("a handle at the start and at the end is found", () => {
    expect(cut("Q_1 then NOTE_9")).toEqual(["handle:Q_1", " then ", "handle:NOTE_9"]);
  });

  test("a longer token is not a handle: the number must end at a boundary", () => {
    expect(cut("Q_1a and Q_12")).toEqual(["Q_1a and ", "handle:Q_12"]);
  });
});

describe("maths", () => {
  test("notation joined by an operator is one span", () => {
    expect(found("where z_o = mean_{i in o} of x")).toEqual(["z_o = mean_{i in o}"]);
    expect(found("the slope d(loss)/d(K_2) is small")).toEqual(["d(loss)/d(K_2)"]);
  });

  test("a lone atom, a handle and a snake_case English word are not maths", () => {
    expect(found("the value z_o here")).toEqual([]);
    expect(found("Q_1 = NOTE_20")).toEqual([]);
    expect(found("window_size = manual_seed")).toEqual([]);
  });

  test("a minus is not glue, so the span stops short of it", () => {
    expect(found("cos(phase_o - phase_o')")).not.toContain("cos(phase_o - phase_o')");
  });

  test("a space between atoms joins them once", () => {
    expect(found("z_o conj(z_o') holds")).toEqual(["z_o conj(z_o')"]);
  });
});

describe("both together", () => {
  test("maths and a handle in one sentence are each set apart", () => {
    expect(cut("z_o = mean_{i in o} on Q_1")).toEqual([
      "math:z_o = mean_{i in o}",
      " on ",
      "handle:Q_1",
    ]);
  });

  test("a formula that contains a handle-shaped word stays whole", () => {
    expect(cut("the slope d(loss)/d(K_2) is small")).toEqual([
      "the slope ",
      "math:d(loss)/d(K_2)",
      " is small",
    ]);
  });

  test("a formula that contains a real handle is math, not a chip", () => {
    const parts = cut("d(loss)/d(CLM_2) ok");
    expect(parts.some((p) => p.startsWith("handle:"))).toBe(false);
    expect(parts.join("")).toContain("math:");
  });

  test("the segments always put the original text back together", () => {
    const text = "z_o = mean_{i in o}, CLM_3 vs K_1 and d(loss)/d(K_2); see NOTE_41 (Q_2).";
    const back = segmentsOf(text, TYPES)
      .map((s) => (s.kind === "handle" ? s.handle : s.text))
      .join("");
    expect(back).toBe(text);
  });
});
