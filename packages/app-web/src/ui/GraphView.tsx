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

type Camera = { yaw: number; pitch: number; distance: number };

/** A point in the graph's space: the plane of the force layout, and depth by order first seen. */
type Point3 = { x: number; y: number; z: number };

type Drag = { x: number; y: number; yaw: number; pitch: number };

type Sim = {
  nodes: Map<string, SimNode>;
  edges: GraphEdgeSeed[];
  edgeKeys: Set<string>;
  nextStep: number;
  overlay: Overlay;
  selectedId: string | null;
  hoverId: string | null;
  screenPos: Map<string, Projected>;
  camera: Camera;
  /** The point the camera orbits and faces: it follows the open resource's node. */
  pivot: Point3 | null;
  /** Scales every force, and falls each tick; below HEAT_MIN the layout is not computed. */
  heat: number;
  /** Whether the camera frames the open node by itself: set when a node opens, cleared by a drag or a scroll. */
  follow: boolean;
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

/** The colours the canvas draws in, read from the page's stylesheet on each frame so a theme change shows. */
type Palette = { css: CSSStyleDeclaration; text: string; dim: string; accent: string };

function paletteOf(canvas: HTMLCanvasElement): Palette {
  const css = getComputedStyle(canvas);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    css,
    text: read("--text", "#ffffff"),
    dim: read("--text-dim", "#c8cedb"),
    accent: read("--accent", "#5ad1c9"),
  };
}

function colorFor(kind: string, palette: Palette): string {
  const styled = palette.css.getPropertyValue(`--c-${kind.toLowerCase()}`).trim();
  if (styled) return styled;
  const existing = KIND_COLOR[kind];
  if (existing) return existing;
  const n = Object.keys(KIND_COLOR).length;
  const hue = (n * 137.508) % 360;
  const color = `hsl(${hue.toFixed(0)}deg 70% 68%)`;
  KIND_COLOR[kind] = color;
  return color;
}

function colorForNode(sim: Sim, node: SimNode, palette: Palette): string {
  if (sim.overlay === "temporal") {
    if (node.id === sim.selectedId) return TEMPORAL_CREATED;
    for (const edge of sim.edges) {
      if (
        (edge.from === sim.selectedId && edge.to === node.id) ||
        (edge.to === sim.selectedId && edge.from === node.id)
      ) {
        return TEMPORAL_TOUCHED;
      }
    }
    return TEMPORAL_HISTORICAL;
  }
  return colorFor(node.type, palette);
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

  const parent = selectedId ? sim.nodes.get(selectedId) : undefined;
  const [cx, cy] = centroid(sim);

  for (const seed of ordered) {
    const existing = sim.nodes.get(seed.id);
    if (existing) {
      existing.type = seed.type;
      continue;
    }
    const near =
      parent ??
      (sim.nodes.size === 0
        ? { x: cx, y: cy }
        : (sim.nodes.get(selectedId ?? "") ?? { x: cx, y: cy }));
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
    const key = `${edge.from}\0${edge.label}\0${edge.to}`;
    if (sim.edgeKeys.has(key)) continue;
    sim.edgeKeys.add(key);
    sim.edges.push(edge);
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

function zOf(sim: Sim, node: SimNode): number {
  const total = Math.max(1, sim.nextStep - 1);
  return (node.createdStep / total) * TOTAL_DEPTH;
}

function maxCreatedZ(sim: Sim): number {
  let max = 0;
  for (const n of sim.nodes.values()) max = Math.max(max, zOf(sim, n));
  return max;
}

/**
 * Where the camera faces before it has faced any node: the middle of the graph's depth at the
 * plane's origin, which the layout is pulled towards.
 */
function startingPivot(sim: Sim): Point3 {
  return { x: 0, y: 0, z: maxCreatedZ(sim) / 2 };
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
  const k = 0.12;
  sim.pivot.x += (target.x - sim.pivot.x) * k;
  sim.pivot.y += (target.y - sim.pivot.y) * k;
  sim.pivot.z += (target.z - sim.pivot.z) * k;
}

/** How much of the canvas's shorter side the open node's neighbourhood is zoomed to fill. */
const FIT = 0.3;
/** How far the camera moves toward its framing on each frame. */
const FRAME_EASE = 0.05;
/**
 * The nearest and farthest the camera frames from. A small graph spaces its few nodes far apart
 * along the time axis, and fitting them all would draw every node a pixel or two across.
 */
const FRAME_DISTANCE = { min: 300, max: 900 };

/** Where `v`, a point relative to the pivot, is drawn relative to the pivot, ignoring perspective. */
function onScreen(v: Point3, camera: Pick<Camera, "yaw" | "pitch">) {
  const x1 = v.x * Math.cos(camera.yaw) - v.z * Math.sin(camera.yaw);
  const z1 = v.x * Math.sin(camera.yaw) + v.z * Math.cos(camera.yaw);
  const y1 = v.y * Math.cos(camera.pitch) - z1 * Math.sin(camera.pitch);
  const z2 = v.y * Math.sin(camera.pitch) + z1 * Math.cos(camera.pitch);
  return { x1, y1, z2 };
}

/** How far toward the canvas's bottom-right corner `v` is drawn, at the given yaw. */
function towardCorner(v: Point3, yaw: number, pitch: number): number {
  const { x1, y1 } = onScreen(v, { yaw, pitch });
  return (x1 + y1) / Math.SQRT2;
}

/**
 * The yaw, among 72 evenly spaced, that draws `v` furthest toward the canvas's bottom-right
 * corner, where the card is. It keeps `yaw` unless another draws `v` at least a tenth of its
 * length further, so a graph spread evenly around the pivot does not swing from side to side.
 */
export function yawToward(v: Point3, pitch: number, yaw: number): number {
  let best = yaw;
  let bestScore = towardCorner(v, yaw, pitch);
  const keep = bestScore;
  for (let i = 0; i < 72; i++) {
    const candidate = -Math.PI + (i * Math.PI) / 36;
    const score = towardCorner(v, candidate, pitch);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore - keep < 0.1 * Math.hypot(v.x, v.y, v.z) ? yaw : best;
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
  let distance: number | undefined;
  for (const point of points) {
    const { x1, y1, z2 } = onScreen(point, camera);
    const offset = Math.hypot(x1, y1);
    if (offset === 0) continue;
    const needed = (offset * FOCAL) / radius - z2;
    distance = distance === undefined ? needed : Math.max(distance, needed);
  }
  return distance;
}

/**
 * While the camera follows, eases it toward framing the open node: turned so the rest of the
 * graph lies toward the bottom-right corner, behind the card, and zoomed so the open node's
 * neighbours fill FIT of the canvas's shorter side.
 */
function frameCamera(sim: Sim, width: number, height: number): void {
  const open = sim.selectedId === null ? undefined : sim.nodes.get(sim.selectedId);
  if (!sim.follow || !open || width === 0 || height === 0) return;
  const at = zOf(sim, open);
  const rel = (n: SimNode): Point3 => ({ x: n.x - open.x, y: n.y - open.y, z: zOf(sim, n) - at });
  const near = new Set<string>();
  for (const edge of sim.edges) {
    if (edge.from === open.id) near.add(edge.to);
    else if (edge.to === open.id) near.add(edge.from);
  }
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
  const camera = sim.camera;
  if (count > 0) {
    const centroid = { x: rest.x / count, y: rest.y / count, z: rest.z / count };
    const target = yawToward(centroid, camera.pitch, camera.yaw);
    const turn = Math.atan2(Math.sin(target - camera.yaw), Math.cos(target - camera.yaw));
    camera.yaw += turn * FRAME_EASE;
  }
  const points = [...near].flatMap((id) => {
    const n = sim.nodes.get(id);
    return n === undefined ? [] : [rel(n)];
  });
  const fit = distanceToFit(points, camera, FIT * Math.min(width, height));
  if (fit !== undefined) {
    const target = Math.min(FRAME_DISTANCE.max, Math.max(FRAME_DISTANCE.min, fit));
    camera.distance += (target - camera.distance) * FRAME_EASE;
  }
}

function project(sim: Sim, node: SimNode, width: number, height: number): Projected {
  const { yaw, pitch, distance } = sim.camera;
  const pivot = sim.pivot ?? startingPivot(sim);
  const x0 = node.x - pivot.x;
  const y0 = node.y - pivot.y;
  const zc = zOf(sim, node) - pivot.z;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = x0 * cosY - zc * sinY;
  const z1 = x0 * sinY + zc * cosY;
  const cosX = Math.cos(pitch);
  const sinX = Math.sin(pitch);
  const y1 = y0 * cosX - z1 * sinX;
  const z2 = y0 * sinX + z1 * cosX;
  const viewZ = z2 + distance;
  if (viewZ <= 1) return { sx: -9999, sy: -9999, scale: 0, depth: viewZ };
  const scale = FOCAL / viewZ;
  return {
    sx: width * ANCHOR.x + x1 * scale,
    sy: height * ANCHOR.y + y1 * scale,
    scale,
    depth: viewZ,
  };
}

/**
 * The graph's three axes as the camera sees them: each unit axis's screen direction (`x1` right,
 * `y1` down) and its depth away from the viewer (`z2`). The third is the time axis: a node seen
 * later lies further along it.
 */
export function screenAxes(camera: Pick<Camera, "yaw" | "pitch">) {
  const cosY = Math.cos(camera.yaw);
  const sinY = Math.sin(camera.yaw);
  const cosX = Math.cos(camera.pitch);
  const sinX = Math.sin(camera.pitch);
  return [
    { x1: cosY, y1: -sinY * sinX, z2: sinY * cosX, color: "#e0687a", label: null as string | null },
    { x1: 0, y1: cosX, z2: sinX, color: "#5ad1c9", label: null as string | null },
    { x1: -sinY, y1: -cosY * sinX, z2: cosY * cosX, color: "#e0b25a", label: "time" },
  ];
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

function renderFrame(ctx: CanvasRenderingContext2D, sim: Sim, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  const palette = paletteOf(ctx.canvas);
  const nodes = [...sim.nodes.values()];
  const projected = new Map<string, Projected>();
  for (const n of nodes) projected.set(n.id, project(sim, n, width, height));
  sim.screenPos = projected;

  const order = [...projected.entries()].sort((a, b) => b[1].depth - a[1].depth);
  const visible = order.filter(([, p]) => p.scale > 0).map(([, p]) => p.depth);
  const near = Math.min(...visible);
  const far = Math.max(...visible);
  const opacity = (depth: number) => depthOpacity(depth, near, far);

  ctx.lineWidth = 1;
  const labels: { a: Projected; b: Projected; text: string; hot: boolean; opacity: number }[] = [];
  // The edges of the open node and of the node under the pointer are drawn last, in the accent
  // colour and twice as wide, unfaded, so they stand out from the rest.
  const hotEdges: [Projected, Projected][] = [];
  for (const edge of sim.edges) {
    const a = projected.get(edge.from);
    const b = projected.get(edge.to);
    if (!a || !b || a.scale === 0 || b.scale === 0) continue;
    const edgeOpacity = opacity((a.depth + b.depth) / 2);
    const hot = [sim.selectedId, sim.hoverId].some(
      (id) => id !== null && (edge.from === id || edge.to === id),
    );
    if (hot) hotEdges.push([a, b]);
    else {
      ctx.globalAlpha = edgeOpacity;
      ctx.strokeStyle = "rgba(128, 138, 156, 0.35)";
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }

    const scale = Math.min(a.scale, b.scale);
    if (hot || scale > 0.55) {
      labels.push({
        a,
        b,
        text: edge.label,
        hot,
        opacity: hot ? 1 : edgeOpacity,
      });
    }
  }
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 2;
  for (const [a, b] of hotEdges) {
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  for (const [id] of order) {
    const node = sim.nodes.get(id);
    const p = projected.get(id);
    if (!node || !p || p.scale === 0) continue;
    const r = Math.max(2, 7 * p.scale);
    const isHover = id === sim.hoverId;
    const isSelected = id === sim.selectedId;
    const alpha = node.alpha * (isHover || isSelected ? 1 : opacity(p.depth));

    ctx.globalAlpha = alpha;
    ctx.fillStyle = colorForNode(sim, node, palette);
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fill();
    if (isHover || isSelected) {
      ctx.strokeStyle = isSelected ? palette.text : palette.dim;
      ctx.lineWidth = isSelected ? 1.5 : 1;
      ctx.stroke();
    }

    if (p.scale > 0.55) {
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = palette.dim;
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(node.label, p.sx + r + 3, p.sy + 3);
    }
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // The hot edges' labels are drawn last, larger and bold, so no other label covers them.
  for (const lab of [...labels.filter((l) => !l.hot), ...labels.filter((l) => l.hot)]) {
    ctx.font = lab.hot ? "600 10px ui-monospace, monospace" : "9px ui-monospace, monospace";
    const width = ctx.measureText(lab.text).width + LABEL_MARKER;
    const length = Math.hypot(lab.b.sx - lab.a.sx, lab.b.sy - lab.a.sy);
    // A label longer than its edge on screen would run over the nodes, so only a hot one is drawn.
    if (!lab.hot && width > length) continue;
    const { angle, flipped } = labelAngle(lab.a.sx, lab.a.sy, lab.b.sx, lab.b.sy);
    ctx.save();
    ctx.translate((lab.a.sx + lab.b.sx) / 2, (lab.a.sy + lab.b.sy) / 2);
    ctx.rotate(angle);
    ctx.globalAlpha = (lab.hot ? 0.95 : 0.75) * lab.opacity;
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
    camera: { ...INITIAL_CAMERA },
    pivot: null,
    heat: 1,
    follow: true,
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
  const sizeRef = useRef({ width: 0, height: 0 });
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pointerOn, setPointerOn] = useState(false);
  const pinned = pinnedId !== null && nodes.some((n) => n.id === pinnedId) ? pinnedId : null;
  const carded = pointerOn ? hoverId : pinned;

  const sim = simRef.current;
  sim.overlay = overlay;
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
      const cam = simRef.current.camera;
      cam.distance = Math.max(120, Math.min(2200, cam.distance + event.deltaY * 0.6));
    };
    const onLeave = () => {
      simRef.current.hoverId = null;
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
