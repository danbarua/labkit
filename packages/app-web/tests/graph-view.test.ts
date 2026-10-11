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
  labelCandidates,
  placeLabels,
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

    test("turns at most 45° a second toward its framing", () => {
      const sim = settled();
      sim.reducedMotion = true;
      const aim = sim.aim!;
      sim.camera.yaw = aim + Math.PI / 2;
      frameCamera(sim, 800, 400);
      expect(degrees(Math.abs(sim.camera.yaw - aim - Math.PI / 2))).toBeCloseTo(0.75);
      for (let i = 1; i < 60; i++) frameCamera(sim, 800, 400);
      expect(degrees(aim + Math.PI / 2 - sim.camera.yaw)).toBeCloseTo(45);
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

describe("label placement", () => {
  const box = (
    key: string,
    at: { rank?: number; depth?: number; cx: number; cy: number; angle?: number },
  ) => ({ key, rank: 2, depth: 500, halfW: 20, halfH: 5, angle: 0, ...at });
  // What placement kept from frame 100: the labels drawn in it, and when others were hidden.
  const memory = (shown: string[] = [], hiddenAt: [string, number][] = []) => ({
    frame: 100,
    shown: new Set(shown),
    hiddenAt: new Map(hiddenAt),
    faded: new Map(shown.map((key) => [key, 10])),
  });
  const place = (boxes: ReturnType<typeof box>[], before = memory()) =>
    [...placeLabels(boxes, before, 400, 300).shown].sort();

  test("of two labels that overlap, the nearer is drawn and the other is not", () => {
    const far = box("far", { depth: 600, cx: 100, cy: 100 });
    const near = box("near", { depth: 400, cx: 110, cy: 104 });
    expect(place([far, near])).toEqual(["near"]);
  });

  test("labels that do not overlap are all drawn", () => {
    const a = box("a", { cx: 100, cy: 100 });
    const b = box("b", { cx: 100, cy: 122 });
    const c = box("c", { cx: 160, cy: 100 });
    expect(place([a, b, c])).toEqual(["a", "b", "c"]);
  });

  test("a label drawn in the last frame keeps its place over a nearer label of its rank", () => {
    const shown = box("shown", { depth: 600, cx: 100, cy: 100 });
    const near = box("near", { depth: 400, cx: 110, cy: 104 });
    expect(place([shown, near], memory(["shown"]))).toEqual(["shown"]);
  });

  test("a label not drawn in the last frame needs clear space around it; one that was drawn does not", () => {
    const a = box("a", { depth: 400, cx: 100, cy: 100 });
    // 2 pixels below `a`, and 12 pixels below it.
    const close = box("close", { depth: 600, cx: 100, cy: 112 });
    const clear = box("clear", { depth: 600, cx: 100, cy: 122 });
    expect(place([a, close], memory(["a"]))).toEqual(["a"]);
    expect(place([a, close], memory(["a", "close"]))).toEqual(["a", "close"]);
    expect(place([a, clear], memory(["a"]))).toEqual(["a", "clear"]);
  });

  test("a label hidden within the last 30 frames is not drawn, even where it fits", () => {
    const held = box("held", { cx: 100, cy: 100 });
    expect(place([held], memory([], [["held", 72]]))).toEqual([]);
    expect(place([held], memory([], [["held", 71]]))).toEqual(["held"]);
  });

  test("the open node's, its edges' and its neighbours' labels are drawn as soon as they fit", () => {
    const open = box("open", { rank: 0, cx: 100, cy: 100 });
    const neighbour = box("neighbour", { rank: 1, cx: 100, cy: 200 });
    const hidden = memory(
      [],
      [
        ["open", 99],
        ["neighbour", 99],
      ],
    );
    expect(place([open, neighbour], hidden)).toEqual(["neighbour", "open"]);
  });

  test("a label drawn in the last frame and not in this one is recorded as hidden in this frame", () => {
    const neighbour = box("neighbour", { rank: 1, cx: 100, cy: 100 });
    const other = box("other", { cx: 110, cy: 104 });
    const after = placeLabels([neighbour, other], memory(["other"]), 400, 300);
    expect(after.frame).toBe(101);
    expect(after.hiddenAt.get("other")).toBe(101);
  });

  test("a placed label fades in over 10 frames; one no longer placed fades out over 10 and is dropped", () => {
    const a = box("a", { cx: 100, cy: 100 });
    const near = box("near", { rank: 1, cx: 110, cy: 104 });
    let state = memory();
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      state = placeLabels([a], state, 400, 300);
      seen.push(state.faded.get("a") ?? 0);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10]);
    // A neighbour's label takes the place: `a` fades out, still drawn but taking no room.
    state = placeLabels([a, near], state, 400, 300);
    expect([...state.shown]).toEqual(["near"]);
    expect(state.faded.get("a")).toBe(9);
    for (let i = 0; i < 8; i++) state = placeLabels([a, near], state, 400, 300);
    expect(state.faded.get("a")).toBe(1);
    state = placeLabels([a, near], state, 400, 300);
    expect(state.faded.has("a")).toBe(false);
  });

  test("a label that is no longer a candidate is dropped at once", () => {
    const after = placeLabels([], memory(["a"]), 400, 300);
    expect(after.faded.size).toBe(0);
  });

  test("a lower rank is placed first, whatever its depth or the last frame", () => {
    const neighbour = box("neighbour", { rank: 1, depth: 900, cx: 100, cy: 100 });
    const other = box("other", { rank: 2, depth: 100, cx: 110, cy: 104 });
    expect(place([other, neighbour], memory(["other"]))).toEqual(["neighbour"]);
  });

  test("rank 0 is drawn even where it overlaps another label", () => {
    const open = box("open", { rank: 0, cx: 100, cy: 100 });
    const hot = box("hot", { rank: 0, cx: 105, cy: 102 });
    const other = box("other", { rank: 1, depth: 100, cx: 110, cy: 104 });
    expect(place([open, hot, other])).toEqual(["hot", "open"]);
  });

  test("rotated labels that cross overlap; parallel diagonal labels side by side do not", () => {
    const up = box("up", { cx: 200, cy: 150, angle: Math.PI / 4 });
    const down = box("down", { cx: 200, cy: 150, angle: -Math.PI / 4 });
    expect(place([up, down])).toHaveLength(1);
    // 24 pixels apart, across their direction: 14 pixels clear of each other.
    const beside = box("beside", {
      cx: 200 + 24 * Math.cos((3 * Math.PI) / 4),
      cy: 150 + 24 * Math.sin((3 * Math.PI) / 4),
      angle: Math.PI / 4,
    });
    expect(place([up, beside])).toEqual(["beside", "up"]);
  });

  describe("which labels are candidates", () => {
    const seed = (id: string) => ({ id, label: id, type: "Question" });
    const measure = (text: string) => 6 * text.length;
    const at = (sx: number, scale: number) => ({ sx, sy: 100, scale, depth: 500 });
    const keys = (
      sim: ReturnType<typeof createSim>,
      projected: Map<string, ReturnType<typeof at>>,
    ) =>
      labelCandidates(sim, projected, measure)
        .boxes.map((b) => b.key.replace(/\0/g, " "))
        .sort();

    test("a node's label drawn in the last frame stays a candidate down to scale 0.5; a new one needs 0.55", () => {
      const sim = createSim();
      mergeSeeds(sim, [seed("a")], [], null);
      const projected = new Map([["a", at(100, 0.53)]]);
      expect(keys(sim, projected)).toEqual([]);
      sim.labels.shown.add("n\0a");
      expect(keys(sim, projected)).toEqual(["n a"]);
    });

    test("an edge's label drawn in the last frame may run 20% past its edge; a new one may not", () => {
      const sim = createSim();
      const edges = [{ from: "a", to: "b", label: "R" }];
      mergeSeeds(sim, [seed("a"), seed("b")], edges, null);
      // The label is 6 pixels wide and its direction marker 9; the edge is 14 pixels long.
      const projected = new Map([
        ["a", at(100, 0.8)],
        ["b", at(114, 0.8)],
      ]);
      expect(keys(sim, projected)).toEqual(["n a", "n b"]);
      sim.labels.shown.add("e\0a\0R\0b");
      expect(keys(sim, projected)).toEqual(["e a R b", "n a", "n b"]);
    });
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
