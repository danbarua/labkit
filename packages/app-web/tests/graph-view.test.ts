import { describe, expect, test } from "bun:test";
import {
  createSim,
  depthOpacity,
  distanceToFit,
  followPivot,
  INITIAL_CAMERA,
  labelAngle,
  mergeSeeds,
  screenAxes,
  tickPhysics,
  yawToward,
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

describe("the camera's framing", () => {
  // Where a point relative to the pivot is drawn, ignoring perspective, as the canvas does.
  const drawn = (v: { x: number; y: number; z: number }, yaw: number, pitch: number) => {
    const x1 = v.x * Math.cos(yaw) - v.z * Math.sin(yaw);
    const z1 = v.x * Math.sin(yaw) + v.z * Math.cos(yaw);
    return { x: x1, y: v.y * Math.cos(pitch) - z1 * Math.sin(pitch) };
  };

  test("turns the rest of the graph toward the bottom-right corner", () => {
    for (const v of [
      { x: 0, y: 0, z: 100 },
      { x: -80, y: -40, z: 20 },
      { x: 30, y: 10, z: -90 },
    ]) {
      const yaw = yawToward(v, 0.35, 0);
      const at = drawn(v, yaw, 0.35);
      expect(at.x).toBeGreaterThan(0);
      expect(at.x + at.y).toBeGreaterThan(0);
    }
  });

  test("keeps its yaw when no other turns the graph a tenth of its length further", () => {
    const v = { x: 100, y: 100, z: 0 };
    expect(yawToward(v, 0, 0)).toBe(0);
  });

  test("zooms so the farthest neighbour is drawn at the given radius", () => {
    const d = distanceToFit([{ x: 100, y: 0, z: 0 }], { yaw: 0, pitch: 0 }, 160);
    expect(d).toBeCloseTo(400);
    const nearer = distanceToFit(
      [
        { x: 50, y: 0, z: 0 },
        { x: 100, y: 0, z: 0 },
      ],
      { yaw: 0, pitch: 0 },
      160,
    );
    expect(nearer).toBeCloseTo(400);
    expect(distanceToFit([], { yaw: 0, pitch: 0 }, 160)).toBeUndefined();
  });
});

describe("the camera's pivot", () => {
  test("eases toward the open node, and stays put while the open resource has no node", () => {
    const sim = createSim();
    mergeSeeds(sim, [{ id: "a", label: "a", type: "Question" }], [], "a");
    const a = sim.nodes.get("a")!;
    a.x = 100;
    a.y = 50;
    sim.selectedId = "a";
    for (let i = 0; i < 200; i++) followPivot(sim);
    expect(sim.pivot?.x).toBeCloseTo(100);
    expect(sim.pivot?.y).toBeCloseTo(50);

    // An act opened before its subject is known: the canvas has no node for it.
    sim.selectedId = "/w/x/act/7";
    const held = { ...sim.pivot! };
    followPivot(sim);
    expect(sim.pivot).toEqual(held);
  });
});
