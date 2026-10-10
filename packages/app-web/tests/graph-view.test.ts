import { describe, expect, test } from "bun:test";
import {
  createSim,
  depthOpacity,
  INITIAL_CAMERA,
  labelAngle,
  mergeSeeds,
  screenAxes,
  tickPhysics,
} from "../src/ui/GraphView";

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

describe("the graph's initial view", () => {
  test("the time axis points up, to the right and away, so later nodes are drawn there, smaller", () => {
    const time = screenAxes(INITIAL_CAMERA).find((axis) => axis.label === "time");
    expect(time?.x1).toBeGreaterThan(0);
    expect(time?.y1).toBeLessThan(0);
    expect(time?.z2).toBeGreaterThan(0);
  });
});

describe("the graph's layout", () => {
  const seed = (id: string) => ({ id, label: id, type: "Question" });
  const positions = (sim: ReturnType<typeof createSim>) =>
    [...sim.nodes.values()].map((n) => [n.x, n.y]);

  test("cools, and once cold leaves every node where it is", () => {
    const sim = createSim();
    mergeSeeds(sim, [seed("a"), seed("b"), seed("c")], [{ from: "a", to: "b", label: "X" }], "a");
    let ticks = 0;
    while (tickPhysics(sim)) ticks++;
    expect(ticks).toBeGreaterThan(250);
    expect(ticks).toBeLessThan(350);
    const still = positions(sim);
    expect(tickPhysics(sim)).toBe(false);
    expect(positions(sim)).toEqual(still);
  });

  test("heats again when a node or an edge is added, and not when nothing is", () => {
    const sim = createSim();
    mergeSeeds(sim, [seed("a"), seed("b")], [], "a");
    while (tickPhysics(sim));
    mergeSeeds(sim, [seed("a"), seed("b")], [], "a");
    expect(tickPhysics(sim)).toBe(false);
    mergeSeeds(sim, [seed("a"), seed("b")], [{ from: "a", to: "b", label: "X" }], "a");
    expect(tickPhysics(sim)).toBe(true);
    while (tickPhysics(sim));
    mergeSeeds(sim, [seed("c")], [], "a");
    expect(tickPhysics(sim)).toBe(true);
  });
});

describe("an edge label's rotation", () => {
  test("follows an edge that points rightward, unflipped", () => {
    expect(labelAngle(0, 0, 10, 0)).toEqual({ angle: 0, flipped: false });
    expect(labelAngle(0, 0, 10, 10).angle).toBeCloseTo(Math.PI / 4);
    expect(labelAngle(0, 0, 0, 10)).toEqual({ angle: Math.PI / 2, flipped: false });
  });

  test("turns an edge that points leftward half a circle, so the text is upright", () => {
    const left = labelAngle(10, 0, 0, 0);
    expect(left.flipped).toBe(true);
    expect(left.angle).toBeCloseTo(0);
    const upLeft = labelAngle(10, 10, 0, 0);
    expect(upLeft.flipped).toBe(true);
    expect(upLeft.angle).toBeCloseTo(Math.PI / 4);
    for (const [ax, ay, bx, by] of [
      [0, 0, -3, 7],
      [0, 0, -3, -7],
      [0, 0, 5, -9],
    ] as const) {
      expect(Math.abs(labelAngle(ax, ay, bx, by).angle)).toBeLessThanOrEqual(Math.PI / 2);
    }
  });
});
