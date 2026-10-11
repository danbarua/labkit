import { describe, expect, test } from "bun:test";
import {
  createSim,
  depthOpacity,
  distanceToFit,
  followPivot,
  frameCamera,
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
  const seed = (id: string) => ({ id, label: id, type: "Question" });
  type Point = { x: number; y: number; z: number };
  // Where a point relative to the pivot is drawn, ignoring perspective, as the canvas does, and
  // its depth: positive is further from the viewer than the pivot.
  const drawn = (v: Point, yaw: number, pitch: number) => {
    const x1 = v.x * Math.cos(yaw) - v.z * Math.sin(yaw);
    const z1 = v.x * Math.sin(yaw) + v.z * Math.cos(yaw);
    return {
      x: x1,
      y: v.y * Math.cos(pitch) - z1 * Math.sin(pitch),
      depth: v.y * Math.sin(pitch) + z1 * Math.cos(pitch),
    };
  };
  // The mean share of each point's distance from the pivot that the camera draws.
  const spread = (points: Point[], yaw: number, pitch: number) =>
    points.reduce((sum, v) => {
      const at = drawn(v, yaw, pitch);
      return sum + Math.hypot(at.x, at.y) / Math.hypot(v.x, v.y, v.z);
    }, 0) / points.length;

  test("turns the rest of the graph toward the bottom-right corner", () => {
    for (const rest of [
      { x: 0, y: 0, z: 100 },
      { x: -80, y: -40, z: 20 },
      { x: 30, y: 10, z: -90 },
    ]) {
      const yaw = yawToward({ rest, near: [], pitch: 0.35, yaw: 0 });
      const at = drawn(rest, yaw, 0.35);
      expect(at.x).toBeGreaterThan(0);
      expect(at.x + at.y).toBeGreaterThan(0);
    }
  });

  test("keeps its yaw when no other turns the graph a tenth of its length further", () => {
    const rest = { x: 100, y: 100, z: 0 };
    expect(yawToward({ rest, near: [], pitch: 0, yaw: 0 })).toBe(0);
  });

  test("turns no further than it must: to the nearest yaw within a tenth of the best", () => {
    // Looking along the layout's plane, `rest` is drawn furthest right at yaw 0, and within a
    // tenth of its length of that up to about 31°. From 57°, the nearest such candidate is 30°.
    const rest = { x: 100, y: 0, z: 0 };
    expect(yawToward({ rest, near: [], pitch: 0, yaw: 1 })).toBeCloseTo(Math.PI / 6);
  });

  test("sees a cluster that shares the open node's time spread out, not edge-on, with the earlier graph behind it", () => {
    // Eight neighbours that arrived with the open node's response: around it in the layout's
    // plane, a few units later on the time axis. The rest of the graph is earlier.
    const near = Array.from({ length: 8 }, (_, i) => ({
      x: 90 * Math.cos((i * Math.PI) / 4),
      y: 90 * Math.sin((i * Math.PI) / 4),
      z: 2 * (i + 1),
    }));
    const rest = { x: 40, y: -30, z: -320 };
    const edgeOn = Math.PI / 2;
    expect(spread(near, edgeOn, 0.35)).toBeLessThan(0.7);
    const yaw = yawToward({ rest, near, pitch: 0.35, yaw: edgeOn });
    expect(spread(near, yaw, 0.35)).toBeGreaterThan(0.8);
    const at = drawn(rest, yaw, 0.35);
    expect(at.x).toBeGreaterThan(0);
    expect(at.depth).toBeGreaterThanOrEqual(0);
  });

  test("while it follows, tilts back to the initial camera's pitch; after a drag it does not", () => {
    const sim = createSim();
    mergeSeeds(sim, [seed("a"), seed("b")], [{ from: "a", to: "b", label: "R" }], "a");
    sim.selectedId = "a";
    sim.camera.pitch = Math.PI / 2;
    sim.follow = false;
    frameCamera(sim, 800, 400);
    expect(sim.camera.pitch).toBe(Math.PI / 2);
    sim.follow = true;
    for (let i = 0; i < 300; i++) frameCamera(sim, 800, 400);
    expect(sim.camera.pitch).toBeCloseTo(INITIAL_CAMERA.pitch, 3);
  });

  describe("the sway", () => {
    const degrees = (r: number) => (r * 180) / Math.PI;
    // A followed camera on two linked nodes, settled on its framing with the sway held still.
    const settled = () => {
      const sim = createSim();
      mergeSeeds(sim, [seed("a"), seed("b")], [{ from: "a", to: "b", label: "R" }], "a");
      sim.selectedId = "a";
      sim.nodes.get("b")!.x = sim.nodes.get("a")!.x + 90;
      sim.pointerOn = true;
      for (let i = 0; i < 600; i++) frameCamera(sim, 800, 400);
      sim.pointerOn = false;
      return sim;
    };
    // The spread of yaws the camera passes through in `frames` frames.
    const swing = (sim: ReturnType<typeof createSim>, frames: number) => {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < frames; i++) {
        frameCamera(sim, 800, 400);
        min = Math.min(min, sim.camera.yaw);
        max = Math.max(max, sim.camera.yaw);
      }
      return degrees(max - min);
    };

    test("swings the camera about 30° either side of its framing over 16s", () => {
      const sim = settled();
      const aim = sim.aim;
      const range = swing(sim, 2 * 16 * 60);
      expect(range).toBeGreaterThan(55);
      expect(range).toBeLessThan(61);
      expect(sim.aim).toBe(aim);
    });

    test("holds still while the pointer is on the canvas", () => {
      const sim = settled();
      swing(sim, 200);
      sim.pointerOn = true;
      swing(sim, 400);
      expect(swing(sim, 400)).toBeLessThan(0.01);
    });

    test("does not sway when the reader asks for reduced motion", () => {
      const sim = settled();
      sim.reducedMotion = true;
      expect(swing(sim, 16 * 60)).toBeLessThan(0.01);
    });
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
