import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  selectedId: string | null;
  overlay: Overlay;
  /** What the popover shows for the node under the pointer. */
  summary: (id: string) => ReactNode;
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
  drag: Drag | null;
  dragged: boolean;
};

/** Colours for record types the page's stylesheet gives none (`--c-<type>`), handed out as types appear. */
const KIND_COLOR: Record<string, string> = {};
const TEMPORAL_CREATED = "hsl(178deg 60% 62%)";
const TEMPORAL_TOUCHED = "hsl(38deg 65% 62%)";
const TEMPORAL_HISTORICAL = "hsl(220deg 10% 34%)";

const REPEL = 2600;
const SPRING_LEN = 90;
const SPRING_K = 0.02;
const DAMPING = 0.86;
const CENTER_K = 0.002;
const TOTAL_DEPTH = 46 * 14;
const FOCAL = 640;

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

function mergeSeeds(
  sim: Sim,
  seeds: GraphNodeSeed[],
  edges: GraphEdgeSeed[],
  selectedId: string | null,
): void {
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
}

function tickPhysics(sim: Sim): void {
  const nodes = [...sim.nodes.values()];
  if (nodes.length === 0) return;
  const repel = REPEL * springiness(nodes.length);
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
    a.vx += -a.x * CENTER_K;
    a.vy += -a.y * CENTER_K;
  }
  for (const edge of sim.edges) {
    const a = sim.nodes.get(edge.from);
    const b = sim.nodes.get(edge.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const f = (d - SPRING_LEN) * SPRING_K;
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

function project(sim: Sim, node: SimNode, width: number, height: number): Projected {
  const { yaw, pitch, distance } = sim.camera;
  const zc = zOf(sim, node) - maxCreatedZ(sim) / 2;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = node.x * cosY - zc * sinY;
  const z1 = node.x * sinY + zc * cosY;
  const cosX = Math.cos(pitch);
  const sinX = Math.sin(pitch);
  const y1 = node.y * cosX - z1 * sinX;
  const z2 = node.y * sinX + z1 * cosX;
  const viewZ = z2 + distance;
  if (viewZ <= 1) return { sx: -9999, sy: -9999, scale: 0, depth: viewZ };
  const scale = FOCAL / viewZ;
  return {
    sx: width / 2 + x1 * scale,
    sy: height / 2 + y1 * scale,
    scale,
    depth: viewZ,
  };
}

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
  const { yaw, pitch } = sim.camera;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosX = Math.cos(pitch);
  const sinX = Math.sin(pitch);
  const len = 26;
  const axes = [
    { x1: cosY, y1: -sinY * sinX, z2: sinY * cosX, color: "#e0687a", label: null as string | null },
    { x1: 0, y1: cosX, z2: sinX, color: "#5ad1c9", label: null as string | null },
    { x1: -sinY, y1: -cosY * sinX, z2: cosY * cosX, color: "#e0b25a", label: "seen" },
  ];
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
  const labels: { x: number; y: number; text: string; hot: boolean; opacity: number }[] = [];
  for (const edge of sim.edges) {
    const a = projected.get(edge.from);
    const b = projected.get(edge.to);
    if (!a || !b || a.scale === 0 || b.scale === 0) continue;
    const edgeOpacity = opacity((a.depth + b.depth) / 2);
    ctx.globalAlpha = edgeOpacity;
    ctx.strokeStyle = "rgba(128, 138, 156, 0.35)";
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();

    const hot =
      edge.from === sim.selectedId ||
      edge.to === sim.selectedId ||
      edge.from === sim.hoverId ||
      edge.to === sim.hoverId;
    const scale = Math.min(a.scale, b.scale);
    if (hot || scale > 0.55) {
      labels.push({
        x: (a.sx + b.sx) / 2,
        y: (a.sy + b.sy) / 2,
        text: edge.label,
        hot,
        opacity: hot ? 1 : edgeOpacity,
      });
    }
  }

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
  ctx.font = "9px ui-monospace, monospace";
  for (const lab of labels) {
    ctx.globalAlpha = (lab.hot ? 0.95 : 0.75) * lab.opacity;
    ctx.fillStyle = lab.hot ? palette.accent : palette.dim;
    ctx.fillText(lab.text, lab.x, lab.y - 7);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  drawCompass(ctx, sim, width, height);
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

/** Places the popover beside the pointer, inside the canvas. */
function placePopover(
  popover: HTMLDivElement,
  clientX: number,
  clientY: number,
  rect: DOMRect,
): void {
  const left = Math.min(clientX - rect.left + 16, rect.width - popover.offsetWidth - 4);
  const top = Math.min(clientY - rect.top + 16, rect.height - popover.offsetHeight - 4);
  popover.style.left = `${Math.max(0, left)}px`;
  popover.style.top = `${Math.max(0, top)}px`;
}

function createSim(): Sim {
  return {
    nodes: new Map(),
    edges: [],
    edgeKeys: new Set(),
    nextStep: 0,
    overlay: "structural",
    selectedId: null,
    hoverId: null,
    screenPos: new Map(),
    camera: { yaw: 0.5, pitch: -0.35, distance: 620 },
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
 * plane and by the order they were first seen in depth, and drawn in perspective.
 */
export function GraphView({
  nodes,
  edges,
  selectedId,
  overlay,
  summary,
  onNavigate,
}: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim>(createSim());
  const sizeRef = useRef({ width: 0, height: 0 });
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  // The popover is measured once its content is drawn, so a new node's summary is placed by its own size.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const popover = popoverRef.current;
    if (hoverId === null || !canvas || !popover) return;
    placePopover(
      popover,
      pointerRef.current.x,
      pointerRef.current.y,
      canvas.getBoundingClientRect(),
    );
  }, [hoverId]);

  const sim = simRef.current;
  sim.overlay = overlay;
  sim.selectedId = selectedId;

  useEffect(() => {
    mergeSeeds(simRef.current, nodes, edges, selectedId);
  }, [nodes, edges, selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const popover = popoverRef.current;
    if (!canvas || !popover) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    sizeRef.current = resizeCanvas(canvas, ctx);
    const ro = new ResizeObserver(() => {
      sizeRef.current = resizeCanvas(canvas, ctx);
    });
    const wrap = canvas.parentElement;
    if (wrap) ro.observe(wrap);

    let raf = 0;
    const loop = () => {
      const s = simRef.current;
      tickPhysics(s);
      renderFrame(ctx, s, sizeRef.current.width, sizeRef.current.height);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

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
        if (Math.hypot(dx, dy) > 4) s.dragged = true;
        s.camera.yaw = s.drag.yaw + dx * 0.006;
        s.camera.pitch = s.drag.pitch - dy * 0.006;
        return;
      }
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const hit = hitTest(s, mx, my);
      s.hoverId = hit !== null && s.nodes.has(hit) ? hit : null;
      pointerRef.current = { x: event.clientX, y: event.clientY };
      setHoverId(s.hoverId);
      if (s.hoverId !== null) placePopover(popover, event.clientX, event.clientY, rect);
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
      const cam = simRef.current.camera;
      cam.distance = Math.max(120, Math.min(2200, cam.distance + event.deltaY * 0.6));
    };
    const onLeave = () => {
      simRef.current.hoverId = null;
      setHoverId(null);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div id="stage-wrap">
      <canvas id="stage" ref={canvasRef} className="orbit" />
      <div className="hint">drag to orbit · scroll to zoom</div>
      <div
        id="popover"
        className={hoverId === null ? "popover hidden" : "popover"}
        ref={popoverRef}
      >
        {hoverId === null ? null : summary(hoverId)}
      </div>
    </div>
  );
}
