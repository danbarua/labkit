import { REDUCED_MOTION, useMediaQuery } from "@labkit/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import "./graph.css";

/** What a node's colour shows: its record type, or how it stands to the selected node. */
export type Overlay = "structural" | "temporal";

export interface GraphNodeSeed {
  id: string;
  /** The text drawn beside the node. */
  label: string;
  type: string;
}

export interface GraphEdgeSeed {
  from: string;
  to: string;
  label: string;
}

export interface GraphViewProps {
  nodes: GraphNodeSeed[];
  edges: GraphEdgeSeed[];
  /** The open resource, drawn with a ring. New nodes are placed beside it. */
  selectedId: string | null;
  overlay: Overlay;
  /** False while the canvas is hidden: the simulation and the drawing stop until it is shown. */
  active: boolean;
  /** What the popover shows for the node under the pointer. */
  summary: (id: string) => ReactNode;
  /**
   * The node whose card the popover shows while the pointer is off the canvas, or null for none.
   * With the pointer on the canvas, the popover shows only the node under it.
   */
  pinnedId: string | null;
  onNavigate: (id: string) => void;
}

type SimNode = GraphNodeSeed & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  createdStep: number;
};

type Projected = { sx: number; sy: number; scale: number; depth: number };

/** An edge on the canvas. `born` is the label frame in which it was added. */
type SimEdge = GraphEdgeSeed & { born: number };

type Camera = { yaw: number; pitch: number; distance: number };

/** A point in the graph's space: the plane of the force layout, and depth by order first seen. */
type Point3 = { x: number; y: number; z: number };

type Drag = { x: number; y: number; yaw: number; pitch: number };

type Sim = {
  nodes: Map<string, SimNode>;
  edges: SimEdge[];
  edgeKeys: Set<string>;
  nextStep: number;
  overlay: Overlay;
  selectedId: string | null;
  hoverId: string | null;
  screenPos: Map<string, Projected>;
  labels: LabelMemory;
  camera: Camera;
  /** The point the camera orbits and faces: it follows the open resource's node. */
  pivot: Point3 | null;
  /** Scales every force, and falls each tick; below HEAT_MIN the layout is not computed. */
  heat: number;
  /** Whether the camera frames the open node by itself: set when a node opens, cleared by a drag or a scroll. */
  follow: boolean;
  /** The yaw the framing chose, which the sway swings about; null until it chooses after following starts. */
  aim: number | null;
  /** Where the sway is in its cycle, in radians. */
  swayPhase: number;
  /** Whether the pointer is over the canvas. The sway holds still while it is. */
  pointerOn: boolean;
  /** Whether the reader's system asks for reduced motion. The camera does not sway when it does. */
  reducedMotion: boolean;
  drag: Drag | null;
  dragged: boolean;
};

/** Colours for record types the page's stylesheet gives none (`--c-<type>`), handed out as types appear. */
const KIND_COLOR: Record<string, string> = {};
const TEMPORAL_CREATED = "hsl(178deg 60% 62%)";
const TEMPORAL_TOUCHED = "hsl(38deg 65% 62%)";
/**
 * Slate-400: the light theme's faint text and the dark theme's dim text. It is light on a light
 * background and stands out from a dark one, so near and far nodes differ only by the depth fade.
 */
const TEMPORAL_HISTORICAL = "#94a3b8";

/**
 * The layout cools: the forces are scaled by the simulation's heat, which falls from 1 to HEAT_MIN
 * in 300 ticks, about 5s at 60 frames a second. Below HEAT_MIN the layout is not computed, since
 * every tick costs a pass over every pair of nodes. New nodes or edges heat it to REHEAT.
 */
const HEAT_DECAY = 1 - 0.001 ** (1 / 300);
const HEAT_MIN = 0.001;
const REHEAT = 0.6;
const REPEL = 2600;
const SPRING_LEN = 90;
const SPRING_K = 0.02;
const DAMPING = 0.86;
const CENTER_K = 0.002;
const TOTAL_DEPTH = 46 * 14;
const FOCAL = 640;
/**
 * Where the open resource's node is drawn, as fractions of the canvas's width and height from its
 * top-left corner: up and left of centre, in the middle of the area the corner card leaves clear.
 */
const ANCHOR = { x: 0.35, y: 0.45 };

/**
 * The colours the canvas draws in, read from the page's stylesheet on each frame so a theme change
 * shows. `kinds` holds each record type's colour once the frame has looked it up.
 */
type Palette = {
  css: CSSStyleDeclaration;
  text: string;
  dim: string;
  accent: string;
  kinds: Map<string, string>;
};

function paletteOf(canvas: HTMLCanvasElement): Palette {
  const css = getComputedStyle(canvas);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    css,
    text: read("--text", "#ffffff"),
    dim: read("--text-dim", "#c8cedb"),
    accent: read("--accent", "#5ad1c9"),
    kinds: new Map(),
  };
}

/** The colour KIND_COLOR hands a record type the stylesheet gives none. */
function assignedColor(kind: string): string {
  const existing = KIND_COLOR[kind];
  if (existing) return existing;
  const n = Object.keys(KIND_COLOR).length;
  const hue = (n * 137.508) % 360;
  const color = `hsl(${hue.toFixed(0)}deg 70% 68%)`;
  KIND_COLOR[kind] = color;
  return color;
}

function colorFor(kind: string, palette: Palette): string {
  const known = palette.kinds.get(kind);
  if (known !== undefined) return known;
  const styled = palette.css.getPropertyValue(`--c-${kind.toLowerCase()}`).trim();
  const color = styled || assignedColor(kind);
  palette.kinds.set(kind, color);
  return color;
}

function colorForNode(
  sim: Sim,
  node: SimNode,
  palette: Palette,
  neighbours: ReadonlySet<string>,
): string {
  if (sim.overlay === "temporal") {
    if (node.id === sim.selectedId) return TEMPORAL_CREATED;
    return neighbours.has(node.id) ? TEMPORAL_TOUCHED : TEMPORAL_HISTORICAL;
  }
  return colorFor(node.type, palette);
}

/** The ids of the nodes an edge joins to the node `id`; none when `id` is null. */
function neighboursOf(edges: readonly GraphEdgeSeed[], id: string | null): Set<string> {
  const near = new Set<string>();
  if (id === null) return near;
  for (const edge of edges) {
    if (edge.from === id) near.add(edge.to);
    else if (edge.to === id) near.add(edge.from);
  }
  return near;
}

/** An edge's identity on the canvas: its two ends and its label. */
function edgeKey(edge: GraphEdgeSeed): string {
  return `${edge.from}\0${edge.label}\0${edge.to}`;
}

function springiness(n: number): number {
  return 1 / Math.log(Math.max(n, 3));
}

function centroid(sim: Sim): [number, number] {
  if (sim.nodes.size === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const n of sim.nodes.values()) {
    sx += n.x;
    sy += n.y;
  }
  return [sx / sim.nodes.size, sy / sim.nodes.size];
}

/** Adds the nodes and edges the canvas does not have yet, and heats the layout when there are any. */
export function mergeSeeds(
  sim: Sim,
  seeds: GraphNodeSeed[],
  edges: GraphEdgeSeed[],
  selectedId: string | null,
): void {
  const before = sim.nodes.size + sim.edges.length;
  const ordered =
    selectedId === null
      ? seeds
      : [...seeds.filter((s) => s.id === selectedId), ...seeds.filter((s) => s.id !== selectedId)];

  const [cx, cy] = centroid(sim);

  for (const seed of ordered) {
    const existing = sim.nodes.get(seed.id);
    if (existing) {
      existing.type = seed.type;
      continue;
    }
    // Beside the open resource's node, which `ordered` adds first; else at the centroid before.
    const near = (selectedId === null ? undefined : sim.nodes.get(selectedId)) ?? { x: cx, y: cy };
    sim.nodes.set(seed.id, {
      ...seed,
      x: near.x + (Math.random() - 0.5) * 40,
      y: near.y + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      alpha: 1,
      createdStep: sim.nextStep,
    });
    sim.nextStep += 1;
  }

  for (const edge of edges) {
    const key = edgeKey(edge);
    if (sim.edgeKeys.has(key)) continue;
    sim.edgeKeys.add(key);
    sim.edges.push({ ...edge, born: sim.labels.frame });
  }
  if (sim.nodes.size + sim.edges.length > before) sim.heat = Math.max(sim.heat, REHEAT);
}

/** Moves the nodes one step, unless the layout has cooled. Returns whether it moved them. */
export function tickPhysics(sim: Sim): boolean {
  const nodes = [...sim.nodes.values()];
  if (nodes.length === 0 || sim.heat < HEAT_MIN) return false;
  const heat = sim.heat;
  const repel = REPEL * springiness(nodes.length) * heat;
  const centre = CENTER_K * heat;
  const spring = SPRING_K * heat;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (!a) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (!b) continue;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) d2 = 1;
      const f = repel / d2;
      const d = Math.sqrt(d2);
      dx /= d;
      dy /= d;
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    }
    a.vx += -a.x * centre;
    a.vy += -a.y * centre;
  }
  for (const edge of sim.edges) {
    const a = sim.nodes.get(edge.from);
    const b = sim.nodes.get(edge.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const f = (d - SPRING_LEN) * spring;
    const ux = dx / d;
    const uy = dy / d;
    a.vx += ux * f;
    a.vy += uy * f;
    b.vx -= ux * f;
    b.vy -= uy * f;
  }
  for (const n of nodes) {
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x += n.vx;
    n.y += n.vy;
  }
  sim.heat -= sim.heat * HEAT_DECAY;
  return true;
}

/** The depth of the node created at `step`: the first node at 0, the newest at TOTAL_DEPTH. */
function depthAt(sim: Sim, step: number): number {
  return (step / Math.max(1, sim.nextStep - 1)) * TOTAL_DEPTH;
}

function zOf(sim: Sim, node: SimNode): number {
  return depthAt(sim, node.createdStep);
}

/**
 * Where the camera faces before it has faced any node: the middle of the graph's depth at the
 * plane's origin, which the layout is pulled towards. The canvas never removes a node, so the
 * newest node, created at step `nextStep - 1`, is the deepest.
 */
function startingPivot(sim: Sim): Point3 {
  return { x: 0, y: 0, z: depthAt(sim, Math.max(0, sim.nextStep - 1)) / 2 };
}

/**
 * Eases the pivot toward the open resource's node, so opening another resource turns the view
 * rather than jumping it. While the canvas has no node for the open resource, such as an act whose
 * subject is not known yet, the pivot stays where it is.
 */
export function followPivot(sim: Sim): void {
  const open = sim.selectedId === null ? undefined : sim.nodes.get(sim.selectedId);
  if (sim.pivot === null) {
    sim.pivot = open ? { x: open.x, y: open.y, z: zOf(sim, open) } : startingPivot(sim);
    return;
  }
  if (!open) return;
  const target = { x: open.x, y: open.y, z: zOf(sim, open) };
  sim.pivot.x += (target.x - sim.pivot.x) * FRAME_EASE;
  sim.pivot.y += (target.y - sim.pivot.y) * FRAME_EASE;
  sim.pivot.z += (target.z - sim.pivot.z) * FRAME_EASE;
}

/** How much of the canvas's shorter side the open node's neighbourhood is zoomed to fill. */
const FIT = 0.3;
/**
 * How far the camera moves toward its framing on each frame: its pan, turn, tilt and zoom. At 60
 * frames a second it covers 98% of the way in 1.2s, one playback step.
 */
const FRAME_EASE = 0.05;
/**
 * The least spread, as a share of the best turn's, at which a turn draws the open node's
 * neighbours. The neighbours that arrive with a resource's response lie close together on the
 * time axis, a flat cluster; for one, this admits turns up to about 45° from facing it.
 */
const SPREAD_KEEP = 0.87;
/**
 * While the camera follows, it swings about the vertical through the pivot, SWAY either side of
 * the yaw the framing chose, over a cycle of 16s at 60 frames a second, so depth shows by parallax.
 */
const SWAY = Math.PI / 6;
const SWAY_STEP = (2 * Math.PI) / (16 * 60);
/**
 * The most the camera turns in one frame: 0.75°, 45° a second at 60 frames a second. A large turn,
 * such as one that brings a cluster from edge-on into view, sweeps over seconds rather than snaps.
 */
const TURN_MAX = (0.75 * Math.PI) / 180;
/**
 * The nearest and farthest the camera frames from. A small graph spaces its few nodes far apart
 * along the time axis, and fitting them all would draw every node a pixel or two across.
 */
const FRAME_DISTANCE = { min: 300, max: 900 };

/** A camera's turn and tilt as the cosines and sines of its yaw and pitch. */
type Rotation = { cosY: number; sinY: number; cosX: number; sinX: number };

function rotationOf(camera: Pick<Camera, "yaw" | "pitch">): Rotation {
  return {
    cosY: Math.cos(camera.yaw),
    sinY: Math.sin(camera.yaw),
    cosX: Math.cos(camera.pitch),
    sinX: Math.sin(camera.pitch),
  };
}

/**
 * Where `v`, a point relative to the pivot, is drawn relative to the pivot, ignoring perspective:
 * `x1` right, `y1` down, and `z2` its depth away from the viewer.
 */
function onScreen(v: Point3, r: Rotation) {
  const x1 = v.x * r.cosY - v.z * r.sinY;
  const z1 = v.x * r.sinY + v.z * r.cosY;
  const y1 = v.y * r.cosX - z1 * r.sinX;
  const z2 = v.y * r.sinX + z1 * r.cosX;
  return { x1, y1, z2 };
}

/** The signed turn, between -π and π, from angle `from` to angle `to`. */
function turnBetween(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * How far from the pivot the camera draws `points`, relative to the pivot, as the mean over the
 * points of each one's drawn distance divided by its distance in the graph's space. 1 when every
 * point is drawn at its full distance; lower when the camera looks along their directions.
 */
function spreadOf(points: Point3[], rotation: Rotation): number {
  let sum = 0;
  let count = 0;
  for (const v of points) {
    const length = Math.hypot(v.x, v.y, v.z);
    if (length === 0) continue;
    const { x1, y1 } = onScreen(v, rotation);
    sum += Math.hypot(x1, y1) / length;
    count++;
  }
  return count === 0 ? 1 : sum / count;
}

/**
 * The yaw at which the camera frames the open node, among `yaw` and 72 evenly spaced. Points are
 * relative to the pivot. The yaw draws `near`, the open node's neighbours, at SPREAD_KEEP of the
 * best spread, and `rest`, the centroid of the other nodes, at or behind the pivot's depth; the
 * depth condition is dropped when no such yaw meets it. Among those yaws, the ones that draw `rest`
 * within a tenth of its length of furthest toward the bottom-right corner qualify, and the one
 * nearest `yaw` is chosen, so opening another node turns the camera no further than it must.
 */
export function yawToward(view: { rest: Point3; near: Point3[]; pitch: number; yaw: number }) {
  const { rest, near, pitch, yaw } = view;
  const yaws = [yaw, ...Array.from({ length: 72 }, (_, i) => -Math.PI + (i * Math.PI) / 36)];
  const candidates = yaws.map((c) => {
    const rotation = rotationOf({ yaw: c, pitch });
    const drawn = onScreen(rest, rotation);
    return {
      yaw: c,
      spread: spreadOf(near, rotation),
      behind: drawn.z2 >= 0,
      // How far toward the canvas's bottom-right corner `rest` is drawn.
      corner: (drawn.x1 + drawn.y1) / Math.SQRT2,
      turn: Math.abs(turnBetween(yaw, c)),
    };
  });
  const most = Math.max(...candidates.map((c) => c.spread));
  const shows = candidates.filter((c) => c.spread >= SPREAD_KEEP * most);
  const behind = shows.filter((c) => c.behind);
  // `shows` always holds the yaw with the best spread, so the pool is never empty.
  const pool = behind.length > 0 ? behind : shows;
  const best = Math.max(...pool.map((c) => c.corner));
  const margin = 0.1 * Math.hypot(rest.x, rest.y, rest.z);
  const qualify = pool.filter((c) => c.corner >= best - margin);
  return qualify.reduce((a, c) => (c.turn < a.turn ? c : a)).yaw;
}

/**
 * The camera distance at which the farthest of `points`, relative to the pivot, is drawn `radius`
 * pixels from the pivot. Undefined when there are no points away from the pivot.
 */
export function distanceToFit(
  points: Point3[],
  camera: Pick<Camera, "yaw" | "pitch">,
  radius: number,
): number | undefined {
  const rotation = rotationOf(camera);
  let distance: number | undefined;
  for (const point of points) {
    const { x1, y1, z2 } = onScreen(point, rotation);
    const offset = Math.hypot(x1, y1);
    if (offset === 0) continue;
    const needed = (offset * FOCAL) / radius - z2;
    distance = distance === undefined ? needed : Math.max(distance, needed);
  }
  return distance;
}

/**
 * While the camera follows, eases it toward framing the open node: tilted to the initial camera's
 * pitch, turned as `yawToward` chooses, so the open node's neighbours are seen spread out and the
 * rest of the graph lies behind them toward the bottom-right corner, and zoomed so the
 * neighbours fill FIT of the canvas's shorter side. The turn sways by SWAY either side, except
 * while the pointer is on the canvas or the reader asks for reduced motion.
 */
export function frameCamera(sim: Sim, width: number, height: number): void {
  const open = sim.selectedId === null ? undefined : sim.nodes.get(sim.selectedId);
  if (!sim.follow || !open || width === 0 || height === 0) return;
  const camera = sim.camera;
  const pitch = INITIAL_CAMERA.pitch;
  camera.pitch += turnBetween(camera.pitch, pitch) * FRAME_EASE;
  const at = zOf(sim, open);
  const rel = (n: SimNode): Point3 => ({ x: n.x - open.x, y: n.y - open.y, z: zOf(sim, n) - at });
  const near = neighboursOf(sim.edges, open.id);
  const rest = { x: 0, y: 0, z: 0 };
  let count = 0;
  for (const n of sim.nodes.values()) {
    if (n.id === open.id || near.has(n.id)) continue;
    const r = rel(n);
    rest.x += r.x;
    rest.y += r.y;
    rest.z += r.z;
    count++;
  }
  const points = [...near].flatMap((id) => {
    const n = sim.nodes.get(id);
    return n === undefined ? [] : [rel(n)];
  });
  const centroid =
    count > 0 ? { x: rest.x / count, y: rest.y / count, z: rest.z / count } : { x: 0, y: 0, z: 0 };
  if (sim.aim === null) {
    sim.aim = camera.yaw;
    sim.swayPhase = 0;
  }
  sim.aim = yawToward({ rest: centroid, near: points, pitch, yaw: sim.aim });
  if (!sim.pointerOn && !sim.reducedMotion)
    sim.swayPhase = (sim.swayPhase + SWAY_STEP) % (2 * Math.PI);
  const goal = sim.aim + SWAY * Math.sin(sim.swayPhase);
  const step = turnBetween(camera.yaw, goal) * FRAME_EASE;
  camera.yaw += Math.max(-TURN_MAX, Math.min(TURN_MAX, step));
  const fit = distanceToFit(points, camera, FIT * Math.min(width, height));
  if (fit !== undefined) {
    const target = Math.min(FRAME_DISTANCE.max, Math.max(FRAME_DISTANCE.min, fit));
    camera.distance += (target - camera.distance) * FRAME_EASE;
  }
}

/**
 * Where each node is drawn on a canvas `width` by `height` pixels, in perspective from the camera.
 * A node at or behind the camera has scale 0 and is drawn nowhere.
 */
function projectNodes(sim: Sim, width: number, height: number): Map<string, Projected> {
  const rotation = rotationOf(sim.camera);
  const pivot = sim.pivot ?? startingPivot(sim);
  const projected = new Map<string, Projected>();
  for (const node of sim.nodes.values()) {
    const v = { x: node.x - pivot.x, y: node.y - pivot.y, z: zOf(sim, node) - pivot.z };
    const { x1, y1, z2 } = onScreen(v, rotation);
    const depth = z2 + sim.camera.distance;
    if (depth <= 1) {
      projected.set(node.id, { sx: -9999, sy: -9999, scale: 0, depth });
      continue;
    }
    const scale = FOCAL / depth;
    projected.set(node.id, {
      sx: width * ANCHOR.x + x1 * scale,
      sy: height * ANCHOR.y + y1 * scale,
      scale,
      depth,
    });
  }
  return projected;
}

/** The compass's arms: the graph's unit axes. The third is the time axis. */
const AXES: { unit: Point3; color: string; label: string | null }[] = [
  { unit: { x: 1, y: 0, z: 0 }, color: "#e0687a", label: null },
  { unit: { x: 0, y: 1, z: 0 }, color: "#5ad1c9", label: null },
  { unit: { x: 0, y: 0, z: 1 }, color: "#e0b25a", label: "time" },
];

/**
 * The graph's three axes as the camera sees them: each unit axis's screen direction (`x1` right,
 * `y1` down) and its depth away from the viewer (`z2`). A node seen later lies further along the
 * time axis.
 */
export function screenAxes(camera: Pick<Camera, "yaw" | "pitch">) {
  const rotation = rotationOf(camera);
  return AXES.map(({ unit, color, label }) => ({ ...onScreen(unit, rotation), color, label }));
}

// Seen from here, the time axis points up, to the right and away from the viewer.
export const INITIAL_CAMERA: Camera = { yaw: -0.5, pitch: 0.35, distance: 620 };

function drawCompass(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  _width: number,
  height: number,
): void {
  const margin = 34;
  const cx = margin;
  const cy = height - margin;
  if (cy < margin) return;
  const len = 26;
  const axes = screenAxes(sim.camera);
  axes.sort((a, b) => a.z2 - b.z2);
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = "10px ui-monospace, monospace";
  for (const axis of axes) {
    const ex = cx + axis.x1 * len;
    const ey = cy + axis.y1 * len;
    const depthAlpha = 0.55 + 0.45 * ((axis.z2 + 1) / 2);
    ctx.globalAlpha = depthAlpha;
    ctx.strokeStyle = axis.color;
    ctx.fillStyle = axis.color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const armLen = Math.hypot(ex - cx, ey - cy);
    if (armLen < 3) {
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.stroke();
    } else if (axis.label) {
      const ang = Math.atan2(ey - cy, ex - cx);
      const headLen = 6;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - headLen * Math.cos(ang - 0.4), ey - headLen * Math.sin(ang - 0.4));
      ctx.lineTo(ex - headLen * Math.cos(ang + 0.4), ey - headLen * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();
      ctx.fillText(axis.label, ex + 5, ey + 3);
    }
  }
  ctx.restore();
}

/**
 * A label's rectangle on the canvas, in pixels: its centre, half its width and height, and its
 * rotation about the centre in radians.
 */
export type LabelBox = {
  key: string;
  /** Labels are placed by rank, lowest first. Rank 0 is drawn even where it overlaps another. */
  rank: number;
  /** The distance from the camera of what the label names: nearer labels are placed first. */
  depth: number;
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  angle: number;
};

/** The side of the square cells in which `placeLabels` records the canvas a label covers, in pixels. */
const LABEL_CELL = 4;
/**
 * The clear space, in pixels, a label not drawn in the last frame needs on every side before it is
 * drawn. Without it, two labels a few pixels apart that slide past each other take turns being
 * drawn, as the cells they cover change.
 */
const LABEL_CLEAR = 6;
/**
 * How many frames, 0.5s at 60 frames a second, a hidden label stays hidden. Without it, an edge
 * label that a turning neighbour sweeps across is hidden and drawn again several times a second.
 */
const LABEL_HOLD = 30;
/**
 * How many frames, about 0.17s at 60 frames a second, a label takes to fade in once placed, and to
 * fade out once not. A label fading out takes no room, so another may fade in where it was.
 */
const LABEL_FADE = 10;
/**
 * How many frames, 0.5s at 60 frames a second, a new edge is drawn before its label may be: the
 * relation appears first, then what it means.
 */
const EDGE_LABEL_DELAY = 30;

/** What label placement keeps from one frame to the next. */
export type LabelMemory = {
  /** How many frames have been placed. */
  frame: number;
  /** The keys of the labels placed in the last frame. Each is drawn, fading in until it is opaque. */
  shown: Set<string>;
  /** For each label hidden within the last LABEL_HOLD frames, the frame in which it was hidden. */
  hiddenAt: Map<string, number>;
  /**
   * For each label to draw, placed or fading out, how far it has faded in: from 1 to LABEL_FADE
   * steps, drawn at that share of LABEL_FADE of its opacity. A label that is no longer a
   * candidate, such as one whose node is now too small, is not drawn.
   */
  faded: Map<string, number>;
};

/** The indices of the cells, in a grid `cols` wide and `rows` high, whose centres lie in `box`. */
function cellsOf(box: LabelBox, cols: number, rows: number): number[] {
  const cos = Math.cos(box.angle);
  const sin = Math.sin(box.angle);
  const ex = Math.abs(box.halfW * cos) + Math.abs(box.halfH * sin);
  const ey = Math.abs(box.halfW * sin) + Math.abs(box.halfH * cos);
  const cells: number[] = [];
  const c0 = Math.max(0, Math.floor((box.cx - ex) / LABEL_CELL));
  const c1 = Math.min(cols - 1, Math.floor((box.cx + ex) / LABEL_CELL));
  const r0 = Math.max(0, Math.floor((box.cy - ey) / LABEL_CELL));
  const r1 = Math.min(rows - 1, Math.floor((box.cy + ey) / LABEL_CELL));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const dx = (c + 0.5) * LABEL_CELL - box.cx;
      const dy = (r + 0.5) * LABEL_CELL - box.cy;
      const along = dx * cos + dy * sin;
      const across = -dx * sin + dy * cos;
      if (Math.abs(along) <= box.halfW && Math.abs(across) <= box.halfH) cells.push(r * cols + c);
    }
  }
  return cells;
}

/**
 * Which labels to draw on a canvas `width` by `height` pixels in the frame after `memory`, so
 * that no two overlap except where one has rank 0. Labels are placed by rank; within a rank,
 * those drawn in the last frame come first, then the nearest. A label that would overlap one
 * already placed is not drawn. One not drawn in the last frame also needs LABEL_CLEAR of space
 * around it, and, from rank 2, is not drawn within LABEL_HOLD frames of being hidden. Labels
 * fade in and out over LABEL_FADE frames.
 */
export function placeLabels(
  boxes: LabelBox[],
  memory: LabelMemory,
  width: number,
  height: number,
): LabelMemory {
  const { shown, hiddenAt } = memory;
  const frame = memory.frame + 1;
  const cols = Math.max(1, Math.ceil(width / LABEL_CELL));
  const rows = Math.max(1, Math.ceil(height / LABEL_CELL));
  const taken = new Uint8Array(cols * rows);
  const order = [...boxes].sort(
    (a, b) =>
      a.rank - b.rank || Number(shown.has(b.key)) - Number(shown.has(a.key)) || a.depth - b.depth,
  );
  const placed = new Set<string>();
  for (const box of order) {
    const cells = cellsOf(box, cols, rows);
    if (box.rank > 0 && !shown.has(box.key)) {
      const held = frame - (hiddenAt.get(box.key) ?? Number.NEGATIVE_INFINITY) < LABEL_HOLD;
      if (box.rank > 1 && held) continue;
      const clear = { ...box, halfW: box.halfW + LABEL_CLEAR, halfH: box.halfH + LABEL_CLEAR };
      if (cellsOf(clear, cols, rows).some((i) => taken[i] === 1)) continue;
    } else if (box.rank > 0 && cells.some((i) => taken[i] === 1)) continue;
    for (const i of cells) taken[i] = 1;
    placed.add(box.key);
  }
  const hidden = new Map([...hiddenAt].filter(([, at]) => frame - at < LABEL_HOLD));
  for (const key of shown) if (!placed.has(key)) hidden.set(key, frame);
  const faded = new Map<string, number>();
  for (const { key } of boxes) {
    const was = memory.faded.get(key) ?? 0;
    const now = placed.has(key) ? Math.min(LABEL_FADE, was + 1) : was - 1;
    if (now > 0) faded.set(key, now);
  }
  return { frame, shown: placed, hiddenAt: hidden, faded };
}

/** How much of its opacity the farthest node loses: depth is shown by fading, nearest to farthest. */
const DEPTH_FADE = 0.7;

/**
 * The opacity for something `depth` from the camera, when the nearest node is `near` and the
 * farthest `far`: 1 at the nearest, falling linearly to 1 - DEPTH_FADE at the farthest.
 */
export function depthOpacity(depth: number, near: number, far: number): number {
  if (far <= near) return 1;
  const t = Math.min(1, Math.max(0, (depth - near) / (far - near)));
  return 1 - DEPTH_FADE * t;
}

/** An edge label the canvas may draw: its edge's ends, its font, and its width with its marker. */
type EdgeLabel = {
  key: string;
  a: Projected;
  b: Projected;
  text: string;
  /** Whether the edge is the open or hovered node's, drawn in the accent colour. */
  hot: boolean;
  font: string;
  width: number;
} & ReturnType<typeof labelAngle>;

/** An edge whose two nodes are both in front of the camera, and where its nodes are drawn. */
type SceneEdge = {
  edge: SimEdge;
  a: Projected;
  b: Projected;
  /** Whether the edge joins the open node or the node under the pointer. */
  hot: boolean;
};

/**
 * What one frame draws: where each node is drawn, the open node's neighbours, and the edges whose
 * two nodes are both in front of the camera.
 */
export type Scene = {
  projected: Map<string, Projected>;
  neighbours: Set<string>;
  edges: SceneEdge[];
};

export function sceneOf(sim: Sim, projected: Map<string, Projected>): Scene {
  const focus = [sim.selectedId, sim.hoverId].filter((id) => id !== null);
  const edges: SceneEdge[] = [];
  for (const edge of sim.edges) {
    const a = projected.get(edge.from);
    const b = projected.get(edge.to);
    if (!a || !b || a.scale === 0 || b.scale === 0) continue;
    edges.push({ edge, a, b, hot: focus.some((id) => edge.from === id || edge.to === id) });
  }
  return { projected, neighbours: neighboursOf(sim.edges, sim.selectedId), edges };
}

/**
 * The labels the canvas may draw in this frame, before overlaps are resolved, and their boxes.
 * `measure` returns a text's width in pixels in a font. An edge's label is not a candidate until
 * EDGE_LABEL_DELAY frames after the edge was added. Ranks: the open and hovered nodes' labels
 * and their edges' labels 0, the open node's neighbours' 1, other nodes' 2, other edges' 3.
 */
export function labelCandidates(
  sim: Sim,
  scene: Scene,
  measure: (text: string, font: string) => number,
): { boxes: LabelBox[]; edgeLabels: EdgeLabel[] } {
  const boxes: LabelBox[] = [];
  const edgeLabels: EdgeLabel[] = [];
  const { projected, neighbours } = scene;
  // A label drawn in the last frame stays a candidate a little past the size at which it appears,
  // so one at that size does not flicker as the camera moves.
  const big = (scale: number, key: string) => scale > (sim.labels.shown.has(key) ? 0.5 : 0.55);
  for (const [id, p] of projected) {
    const node = sim.nodes.get(id);
    if (!node || !big(p.scale, `n\0${id}`)) continue;
    const half = measure(node.label, NODE_FONT) / 2;
    const focus = id === sim.selectedId || id === sim.hoverId;
    boxes.push({
      key: `n\0${id}`,
      rank: focus ? 0 : neighbours.has(id) ? 1 : 2,
      depth: p.depth,
      cx: p.sx + nodeRadius(p) + 3 + half,
      cy: p.sy,
      halfW: half,
      halfH: 5,
      angle: 0,
    });
  }
  for (const { edge, a, b, hot } of scene.edges) {
    if (sim.labels.frame - edge.born < EDGE_LABEL_DELAY) continue;
    const key = `e\0${edgeKey(edge)}`;
    if (!hot && !big(Math.min(a.scale, b.scale), key)) continue;
    const font = hot ? "600 10px ui-monospace, monospace" : "9px ui-monospace, monospace";
    const width = measure(edge.label, font) + LABEL_MARKER;
    // A label longer than its edge on screen would run over the nodes, so only a hot one is drawn;
    // one drawn in the last frame may run 20% past its edge before it is not.
    const room = Math.hypot(b.sx - a.sx, b.sy - a.sy) * (sim.labels.shown.has(key) ? 1.2 : 1);
    if (!hot && width > room) continue;
    const label: EdgeLabel = {
      key,
      a,
      b,
      text: edge.label,
      hot,
      font,
      width,
      ...labelAngle(a.sx, a.sy, b.sx, b.sy),
    };
    edgeLabels.push(label);
    // The label is drawn 6 pixels above its edge, as the label reads.
    boxes.push({
      key: label.key,
      rank: hot ? 0 : 3,
      depth: (a.depth + b.depth) / 2,
      cx: (a.sx + b.sx) / 2 + 6 * Math.sin(label.angle),
      cy: (a.sy + b.sy) / 2 - 6 * Math.cos(label.angle),
      halfW: width / 2,
      halfH: 5,
      angle: label.angle,
    });
  }
  return { boxes, edgeLabels };
}

function renderFrame(ctx: CanvasRenderingContext2D, sim: Sim, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  const palette = paletteOf(ctx.canvas);
  const projected = projectNodes(sim, width, height);
  sim.screenPos = projected;
  const scene = sceneOf(sim, projected);

  // The nodes in front of the camera, farthest first, so nearer nodes are drawn over them.
  const order = [...sim.nodes.values()]
    .flatMap((node) => {
      const p = projected.get(node.id);
      return p === undefined || p.scale === 0 ? [] : [{ node, p }];
    })
    .sort((m, n) => n.p.depth - m.p.depth);
  const visible = order.map(({ p }) => p.depth);
  const near = Math.min(...visible);
  const far = Math.max(...visible);
  const opacity = (depth: number) => depthOpacity(depth, near, far);

  ctx.lineWidth = 1;
  // The edges of the open node and of the node under the pointer are drawn last, in the accent
  // colour and twice as wide, unfaded, so they stand out from the rest. Each edge is drawn from
  // the rim of one node to the rim of the other, so a node drawn see-through has no line inside it.
  const hotEdges: Segment[] = [];
  for (const { a, b, hot } of scene.edges) {
    const segment = rimToRim(a, nodeRadius(a), b, nodeRadius(b));
    if (segment === undefined) continue;
    if (hot) hotEdges.push(segment);
    else {
      ctx.globalAlpha = opacity((a.depth + b.depth) / 2);
      ctx.strokeStyle = "rgba(128, 138, 156, 0.35)";
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 2;
  for (const segment of hotEdges) {
    ctx.beginPath();
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(segment.x2, segment.y2);
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  const { boxes, edgeLabels } = labelCandidates(sim, scene, (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  });
  sim.labels = placeLabels(boxes, sim.labels, width, height);
  // The share of its opacity a label is drawn at as it fades in or out; 0 for one not drawn.
  const fade = (key: string) => (sim.labels.faded.get(key) ?? 0) / LABEL_FADE;

  for (const { node, p } of order) {
    const id = node.id;
    const r = nodeRadius(p);
    const isHover = id === sim.hoverId;
    const isSelected = id === sim.selectedId;
    const alpha = node.alpha * (isHover || isSelected ? 1 : opacity(p.depth));

    ctx.globalAlpha = alpha;
    ctx.fillStyle = colorForNode(sim, node, palette, scene.neighbours);
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fill();
    if (isHover || isSelected) {
      ctx.strokeStyle = isSelected ? palette.text : palette.dim;
      ctx.lineWidth = isSelected ? 1.5 : 1;
      ctx.stroke();
    }

    const labelOpacity = fade(`n\0${id}`);
    if (labelOpacity > 0) {
      ctx.globalAlpha = alpha * 0.9 * labelOpacity;
      ctx.fillStyle = palette.dim;
      ctx.font = NODE_FONT;
      ctx.fillText(node.label, p.sx + r + 3, p.sy + 3);
    }
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // The hot edges' labels are drawn last, larger and bold, so no other label covers them.
  const drawn = edgeLabels.filter((l) => fade(l.key) > 0);
  for (const lab of [...drawn.filter((l) => !l.hot), ...drawn.filter((l) => l.hot)]) {
    const { angle, flipped, width } = lab;
    const labelOpacity = fade(lab.key);
    ctx.font = lab.font;
    ctx.save();
    ctx.translate((lab.a.sx + lab.b.sx) / 2, (lab.a.sy + lab.b.sy) / 2);
    ctx.rotate(angle);
    ctx.globalAlpha =
      labelOpacity * (lab.hot ? 0.95 : 0.75 * opacity((lab.a.depth + lab.b.depth) / 2));
    ctx.fillStyle = lab.hot ? palette.accent : palette.dim;
    const y = -6;
    ctx.fillText(lab.text, flipped ? LABEL_MARKER / 2 : -LABEL_MARKER / 2, y);
    // A triangle at the end the relation points to: after the text, or before it when flipped.
    const tip = (flipped ? -1 : 1) * (width / 2);
    const back = tip - (flipped ? -1 : 1) * 5;
    ctx.beginPath();
    ctx.moveTo(tip, y);
    ctx.lineTo(back, y - 3);
    ctx.lineTo(back, y + 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  drawCompass(ctx, sim, width, height);
}

/** The room an edge label leaves for its direction marker, in pixels. */
const LABEL_MARKER = 9;
const NODE_FONT = "10px ui-monospace, monospace";

/** A node's radius on the canvas, in pixels. */
function nodeRadius(p: Projected): number {
  return Math.max(2, 7 * p.scale);
}

/** A line on the canvas, from (x1, y1) to (x2, y2). */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The part of the line between the centres of two circles that lies outside both: from the rim of
 * the circle at `a`, of radius `ra`, to the rim of the one at `b`, of radius `rb`. Undefined when
 * the circles touch or overlap, so no part of the line is outside both.
 */
export function rimToRim(
  a: { sx: number; sy: number },
  ra: number,
  b: { sx: number; sy: number },
  rb: number,
): Segment | undefined {
  const dx = b.sx - a.sx;
  const dy = b.sy - a.sy;
  const length = Math.hypot(dx, dy);
  if (length <= ra + rb) return undefined;
  const ux = dx / length;
  const uy = dy / length;
  return { x1: a.sx + ux * ra, y1: a.sy + uy * ra, x2: b.sx - ux * rb, y2: b.sy - uy * rb };
}

/**
 * The rotation for the label of an edge drawn from (ax, ay) to (bx, by): along the edge, turned at
 * most a quarter circle either way so the text never reads upside down. `flipped` is set when the
 * edge points leftward, so the label is turned half a circle from the edge's own direction.
 */
export function labelAngle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { angle: number; flipped: boolean } {
  const along = Math.atan2(by - ay, bx - ax);
  if (along > Math.PI / 2) return { angle: along - Math.PI, flipped: true };
  if (along < -Math.PI / 2) return { angle: along + Math.PI, flipped: true };
  return { angle: along, flipped: false };
}

function hitTest(sim: Sim, mx: number, my: number): string | null {
  let found: string | null = null;
  let bestD = 18;
  for (const [id, p] of sim.screenPos.entries()) {
    if (p.scale === 0) continue;
    const d = Math.hypot(p.sx - mx, p.sy - my);
    if (d < bestD) {
      bestD = d;
      found = id;
    }
  }
  return found;
}

export function createSim(): Sim {
  return {
    nodes: new Map(),
    edges: [],
    edgeKeys: new Set(),
    nextStep: 0,
    overlay: "structural",
    selectedId: null,
    hoverId: null,
    screenPos: new Map(),
    labels: { frame: 0, shown: new Set(), hiddenAt: new Map(), faded: new Map() },
    camera: { ...INITIAL_CAMERA },
    pivot: null,
    heat: 1,
    follow: true,
    aim: null,
    swayPhase: 0,
    pointerOn: false,
    reducedMotion: false,
    drag: null,
    dragged: false,
  };
}

function resizeCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): { width: number; height: number } {
  const parent = canvas.parentElement;
  if (!parent) return { width: canvas.clientWidth, height: canvas.clientHeight };
  const rect = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

/**
 * The resources a reader has explored and their relations, laid out by a force simulation in the
 * plane and by the order they were first seen in depth, and drawn in perspective. The camera
 * orbits and faces the open resource's node.
 */
export function GraphView({
  nodes,
  edges,
  selectedId,
  overlay,
  active,
  summary,
  pinnedId,
  onNavigate,
}: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const simRef = useRef<Sim>(createSim());
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const sizeRef = useRef({ width: 0, height: 0 });
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pointerOn, setPointerOn] = useState(false);
  const pinned = pinnedId !== null && nodes.some((n) => n.id === pinnedId) ? pinnedId : null;
  const carded = pointerOn ? hoverId : pinned;

  const sim = simRef.current;
  sim.overlay = overlay;
  sim.reducedMotion = reducedMotion;
  // Opening a node hands the camera back to the framing, after a drag or a scroll took it.
  if (sim.selectedId !== selectedId) sim.follow = true;
  sim.selectedId = selectedId;

  useEffect(() => {
    mergeSeeds(simRef.current, nodes, edges, selectedId);
  }, [nodes, edges, selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;

    sizeRef.current = resizeCanvas(canvas, ctx);
    const ro = new ResizeObserver(() => {
      sizeRef.current = resizeCanvas(canvas, ctx);
    });
    const wrap = canvas.parentElement;
    if (wrap) ro.observe(wrap);

    const onPointerDown = (event: PointerEvent) => {
      const s = simRef.current;
      s.dragged = false;
      s.drag = { x: event.clientX, y: event.clientY, yaw: s.camera.yaw, pitch: s.camera.pitch };
      canvas.classList.add("dragging");
    };
    const onPointerMove = (event: PointerEvent) => {
      const s = simRef.current;
      const rect = canvas.getBoundingClientRect();
      if (s.drag) {
        const dx = event.clientX - s.drag.x;
        const dy = event.clientY - s.drag.y;
        if (Math.hypot(dx, dy) > 4) {
          s.dragged = true;
          s.follow = false;
          s.aim = null;
        }
        s.camera.yaw = s.drag.yaw + dx * 0.006;
        s.camera.pitch = s.drag.pitch - dy * 0.006;
        return;
      }
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const inside = mx >= 0 && my >= 0 && mx <= rect.width && my <= rect.height;
      const hit = inside ? hitTest(s, mx, my) : null;
      s.hoverId = hit !== null && s.nodes.has(hit) ? hit : null;
      s.pointerOn = inside;
      setHoverId(s.hoverId);
      setPointerOn(inside);
    };
    const onPointerUp = () => {
      const s = simRef.current;
      s.drag = null;
      canvas.classList.remove("dragging");
    };
    const onClick = (event: MouseEvent) => {
      const s = simRef.current;
      if (s.dragged) return;
      const rect = canvas.getBoundingClientRect();
      const id = hitTest(s, event.clientX - rect.left, event.clientY - rect.top);
      if (!id) return;
      if (s.nodes.has(id)) navigateRef.current(id);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      simRef.current.follow = false;
      simRef.current.aim = null;
      const cam = simRef.current.camera;
      cam.distance = Math.max(120, Math.min(2200, cam.distance + event.deltaY * 0.6));
    };
    const onLeave = () => {
      simRef.current.hoverId = null;
      simRef.current.pointerOn = false;
      setHoverId(null);
      setPointerOn(false);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!active || !ctx) return;
    let raf = 0;
    const loop = () => {
      const s = simRef.current;
      tickPhysics(s);
      followPivot(s);
      frameCamera(s, sizeRef.current.width, sizeRef.current.height);
      renderFrame(ctx, s, sizeRef.current.width, sizeRef.current.height);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <div id="stage-wrap">
      <canvas id="stage" ref={canvasRef} className="orbit" />
      <div className="hint">drag to orbit · scroll to zoom</div>
      <div id="popover" className={carded === null ? "popover hidden" : "popover"}>
        {carded === null ? null : summary(carded)}
      </div>
    </div>
  );
}
