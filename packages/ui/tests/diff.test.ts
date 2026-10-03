import { describe, expect, test } from "bun:test";
import { type DiffLine, foldUnchanged, diffLines } from "../format";

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

const same = (n: number, from = 0): DiffLine[] =>
  Array.from({ length: n }, (_, i) => ({ kind: "same", text: `line ${from + i}` }));

describe("folding a diff's unchanged stretches", () => {
  test("keeps three lines of context each side of a change and folds the rest", () => {
    const lines = [...same(10), { kind: "add", text: "new" } as const, ...same(10, 10)];
    const rows = foldUnchanged(lines);
    expect(
      rows.map((r) => (r.kind === "fold" ? `fold ${r.from}+${r.lines.length}` : r.at)),
    ).toEqual(["fold 0+7", 7, 8, 9, 10, 11, 12, 13, "fold 14+7"]);
  });

  test("a short unchanged stretch stays in view", () => {
    const lines = [
      { kind: "remove", text: "a" } as const,
      ...same(8),
      { kind: "add", text: "b" } as const,
    ];
    expect(foldUnchanged(lines).every((r) => r.kind === "line")).toBe(true);
  });

  test("a diff with no changes is one fold", () => {
    expect(foldUnchanged(same(20)).map((r) => r.kind)).toEqual(["fold"]);
  });

  test("a fold keeps the lines it hides, in order", () => {
    const [first] = foldUnchanged([...same(10), { kind: "add", text: "x" } as const]);
    expect(first?.kind === "fold" && first.lines.map((l) => l.text)).toEqual(
      same(7).map((l) => l.text),
    );
  });
});
