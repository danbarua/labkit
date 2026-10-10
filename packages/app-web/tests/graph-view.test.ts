import { describe, expect, test } from "bun:test";
import { depthOpacity } from "../src/ui/GraphView";

describe("the graph's depth fade", () => {
  test("the nearest node is opaque and the farthest keeps 30% of its opacity", () => {
    expect(depthOpacity(100, 100, 900)).toBe(1);
    expect(depthOpacity(900, 100, 900)).toBeCloseTo(0.3);
    expect(depthOpacity(500, 100, 900)).toBeCloseTo(0.65);
  });

  test("a depth outside the range is clamped, and a single depth is opaque", () => {
    expect(depthOpacity(50, 100, 900)).toBe(1);
    expect(depthOpacity(2000, 100, 900)).toBeCloseTo(0.3);
    expect(depthOpacity(400, 400, 400)).toBe(1);
  });
});
