import { useEffect, useRef } from "react";

export type ViewMode = "2d" | "3d";
export type Overlay = "structural" | "standing" | "temporal";

export interface GraphNodeSeed {
  id: string;
  type: string;
  href: string;
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
  view: ViewMode;
  overlay: Overlay;
  onNavigate: (href: string) => void;
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
  view: ViewMode;
  overlay: Overlay;
  selectedId: string | null;
  hoverId: string | null;
  screenPos: Map<string, Projected>;
  camera: Camera;
  drag: Drag | null;
  dragged: boolean;
  zoom: number;
};

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

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

function colorFor(kind: string): string {
  const existing = KIND_COLOR[kind];
  if (existing) return existing;
  const n = Object.keys(KIND_COLOR).length;
  const hue = (n * 137.508) % 360;
  const color = `hsl(${hue.toFixed(0)}deg 70% 68%)`;
  KIND_COLOR[kind] = color;
  return color;
}

function colorForNode(sim: Sim, node: SimNode): string {
  // Standing is derived server-side in the old explorer; ResourceDocument
  // does not carry it, so the overlay falls back to kind.
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
  return colorFor(node.type);
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
      existing.href = seed.href;
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
  if (sim.view === "2d") {
    const z = 1 / sim.zoom;
    return {
      sx: width / 2 + node.x * z,
      sy: height / 2 + node.y * z,
      scale: z,
      depth: 0,
    };
  }
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

function autofit(sim: Sim, width: number, height: number): void {
  if (sim.view !== "2d" || sim.nodes.size === 0) return;
  const margin = 0.9;
  const halfW = (width / 2) * margin;
  const halfH = (height / 2) * margin;
  let needed = 1;
  for (const n of sim.nodes.values()) {
    if (halfW > 0) needed = Math.max(needed, Math.abs(n.x) / halfW);
    if (halfH > 0) needed = Math.max(needed, Math.abs(n.y) / halfH);
  }
  if (needed > sim.zoom) sim.zoom += (needed - sim.zoom) * 0.08;
}

function renderFrame(ctx: CanvasRenderingContext2D, sim: Sim, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  const nodes = [...sim.nodes.values()];
  const projected = new Map<string, Projected>();
  for (const n of nodes) projected.set(n.id, project(sim, n, width, height));
  sim.screenPos = projected;

  const order = [...projected.entries()].sort((a, b) => b[1].depth - a[1].depth);

  ctx.lineWidth = 1;
  for (const edge of sim.edges) {
    const a = projected.get(edge.from);
    const b = projected.get(edge.to);
    if (!a || !b || a.scale === 0 || b.scale === 0) continue;
    ctx.strokeStyle = "rgba(128, 138, 156, 0.35)";
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }

  for (const [id] of order) {
    const node = sim.nodes.get(id);
    const p = projected.get(id);
    if (!node || !p || p.scale === 0) continue;
    const r = Math.max(2, 7 * p.scale);
    const isHover = id === sim.hoverId;
    const isSelected = id === sim.selectedId;

    ctx.globalAlpha = node.alpha;
    ctx.fillStyle = colorForNode(sim, node);
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fill();
    if (isHover || isSelected) {
      ctx.strokeStyle = isSelected ? "#fff" : "#c8cedb";
      ctx.lineWidth = isSelected ? 1.5 : 1;
      ctx.stroke();
    }

    if (p.scale > 0.55) {
      ctx.globalAlpha = node.alpha * 0.9;
      ctx.fillStyle = "#c8cedb";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(node.id, p.sx + r + 3, p.sy + 3);
    }
    ctx.globalAlpha = 1;
  }

  if (sim.view === "3d") drawCompass(ctx, sim, width, height);
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

function placePopover(
  popover: HTMLDivElement,
  sim: Sim,
  id: string | null,
  clientX: number,
  clientY: number,
  rect: DOMRect,
): void {
  if (!id) {
    popover.classList.add("hidden");
    return;
  }
  const node = sim.nodes.get(id);
  if (!node) {
    popover.classList.add("hidden");
    return;
  }
  popover.innerHTML = `<div><span class="kind">${esc(node.type)}</span> <span class="handle">${esc(node.id)}</span></div>`;
  const left = Math.min(clientX - rect.left + 16, rect.width - 220);
  const top = Math.min(clientY - rect.top + 16, rect.height - 60);
  popover.style.left = `${Math.max(0, left)}px`;
  popover.style.top = `${Math.max(0, top)}px`;
  popover.classList.remove("hidden");
}

function createSim(): Sim {
  return {
    nodes: new Map(),
    edges: [],
    edgeKeys: new Set(),
    nextStep: 0,
    view: "2d",
    overlay: "structural",
    selectedId: null,
    hoverId: null,
    screenPos: new Map(),
    camera: { yaw: 0.5, pitch: -0.35, distance: 620 },
    drag: null,
    dragged: false,
    zoom: 1,
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

export function GraphView({ nodes, edges, selectedId, view, overlay, onNavigate }: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim>(createSim());
  const sizeRef = useRef({ width: 0, height: 0 });
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  const sim = simRef.current;
  sim.view = view;
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
      autofit(s, sizeRef.current.width, sizeRef.current.height);
      renderFrame(ctx, s, sizeRef.current.width, sizeRef.current.height);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onPointerDown = (event: PointerEvent) => {
      const s = simRef.current;
      s.dragged = false;
      if (s.view !== "3d") return;
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
      s.hoverId = hitTest(s, mx, my);
      placePopover(popover, s, s.hoverId, event.clientX, event.clientY, rect);
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
      const node = s.nodes.get(id);
      if (node?.href) navigateRef.current(node.href);
    };
    const onWheel = (event: WheelEvent) => {
      if (simRef.current.view !== "3d") return;
      event.preventDefault();
      const cam = simRef.current.camera;
      cam.distance = Math.max(120, Math.min(2200, cam.distance + event.deltaY * 0.6));
    };
    const onLeave = () => {
      simRef.current.hoverId = null;
      popover.classList.add("hidden");
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
      <canvas id="stage" ref={canvasRef} className={view === "3d" ? "orbit" : undefined} />
      <div className="hint">{view === "3d" ? "drag to orbit · scroll to zoom" : ""}</div>
      <div id="popover" className="popover hidden" ref={popoverRef} />
    </div>
  );
}
