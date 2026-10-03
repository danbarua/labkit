/** Which items are drawn while one leaves, and where. */

import { describe, expect, test } from "bun:test";
import { type Shown, withLeaving } from "../leaving";

const items = (...keys: string[]) => keys.map((key) => ({ key }));
const drawn = (shown: readonly Shown<{ key: string }>[]) =>
  shown.map((item) => (item.leaving ? `(${item.key})` : item.key));
const step = (...frames: string[][]) =>
  frames.reduce<Shown<{ key: string }>[]>((shown, keys) => withLeaving(shown, items(...keys)), []);

describe("an item that has gone", () => {
  test("is drawn as leaving where it was, after the item that came before it", () => {
    expect(drawn(step(["a", "plan", "b"], ["a", "b"]))).toEqual(["a", "(plan)", "b"]);
  });

  test("is drawn first when nothing came before it", () => {
    expect(drawn(step(["plan", "a"], ["a"]))).toEqual(["(plan)", "a"]);
  });

  test("stays leaving, in order with others that went with it, while items are added", () => {
    expect(drawn(step(["a", "p", "q", "b"], ["a", "b"], ["a", "b", "c"]))).toEqual([
      "a",
      "(p)",
      "(q)",
      "b",
      "c",
    ]);
  });

  test("is present again, and drawn once, when it comes back", () => {
    expect(drawn(step(["a", "plan", "b"], ["a", "b"], ["a", "b", "plan"]))).toEqual([
      "a",
      "b",
      "plan",
    ]);
  });

  test("is not kept when every item went at once: the transcript was replaced", () => {
    expect(drawn(step(["a", "b", "c"], []))).toEqual([]);
    expect(drawn(step(["a", "b"], ["x"]))).toEqual(["x"]);
  });

  test("keeps the value it was last drawn with", () => {
    const a = { key: "a", entries: 0 };
    const before = [
      { key: "a", value: a, leaving: false },
      { key: "plan", value: { key: "plan", entries: 2 }, leaving: false },
    ];
    expect(withLeaving(before, [a])[1]).toEqual({
      key: "plan",
      value: { key: "plan", entries: 2 },
      leaving: true,
    });
  });
});
