import { describe, expect, test } from "bun:test";
import { diffLines } from "../format";

describe("diffLines", () => {
  test("marks what stayed, what went and what was added", () => {
    expect(diffLines("a\nb\nc\n", "a\nc\nd\n")).toEqual([
      { kind: "same", text: "a" },
      { kind: "remove", text: "b" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });

  test("a new file is all additions, and an emptied one all removals", () => {
    expect(diffLines("", "x\ny")).toEqual([
      { kind: "add", text: "x" },
      { kind: "add", text: "y" },
    ]);
    expect(diffLines("x", "")).toEqual([{ kind: "remove", text: "x" }]);
  });

  test("identical text has no changes", () => {
    expect(diffLines("same\nlines", "same\nlines").every((l) => l.kind === "same")).toBe(true);
  });

  test("a very large pair is shown as one removal and one addition, without stalling", () => {
    const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join("\n");
    const other = Array.from({ length: 3000 }, (_, i) => `other ${i}`).join("\n");
    const started = Date.now();
    const lines = diffLines(big, other);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(lines.filter((l) => l.kind === "remove")).toHaveLength(3000);
    expect(lines.filter((l) => l.kind === "add")).toHaveLength(3000);
  });
});
