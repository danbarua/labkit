// LabKit Explorer — a scenario is a command sequence; the graph falls out of
// running it. Traces come from /api/traces, derived at server boot by
// running fragments/compositions.ts through the real domain — nothing here
// invents a node or an edge.
//
// Layout: nodes carry one simulated (x, y) position, shared by both views.
// The 3D view doesn't re-simulate anything — it extrudes that same (x, y)
// along z = the step at which the node was created, so "time on the z-axis"
// falls out of data already on the node rather than a second layout engine.

const KIND_COLOR = {}; // filled in once NODE order is known from data
const CLOSING_OPS = new Set(["closeEnquiry", "acceptAsUnresolved"]);

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const queueList = document.getElementById("queue-list");
const popover = document.getElementById("popover");
const hint = document.getElementById("hint");
const scenarioSelect = document.getElementById("scenario");
const progressFill = document.getElementById("progress-fill");
const speedInput = document.getElementById("speed");
const playBtn = document.getElementById("play");
const derivedAct = document.getElementById("derived-act");
const derivedDelta = document.getElementById("derived-delta");
const derivedChanges = document.getElementById("derived-changes");

// Exposed on window for browser-console debugging only -- not read by any
// production code path, and safe to leave: nothing else on the page reads
// window.__labkitExplorerState.
const state = (window.__labkitExplorerState = {
  traces: [],
  current: null,
  step: 0, // number of steps already applied
  playing: false,
  speed: Number(speedInput.value),
  view: "2d",
  overlay: "structural", // "structural" | "standing" | "temporal"
  nodes: new Map(), // handle -> node
  edges: [], // {from, to, label}
  hoverHandle: null,
  screenPos: new Map(), // handle -> {x, y} last-projected screen position, for hit testing
  camera: { yaw: 0.5, pitch: -0.35, distance: 620 },
  drag: null,
  lastStepSeq: null, // seq of the most recently applied step, for the temporal overlay
  lastTouched: new Set(), // handles created, connected, or named as subject by the last step
});

const STANDING_COLOR = {
  open: "hsl(178deg 60% 60%)",
  answered: "hsl(140deg 55% 62%)",
  "accepted-as-unresolved": "hsl(38deg 65% 62%)",
  abandoned: "hsl(220deg 10% 55%)",
  "never-evaluated": "hsl(220deg 10% 45%)",
  incomplete: "hsl(38deg 65% 62%)",
  blocked: "hsl(350deg 60% 65%)",
  satisfied: "hsl(140deg 55% 62%)",
};
const STANDING_UNKNOWN = "hsl(220deg 12% 38%)"; // a kind derive.ts doesn't snapshot yet (only enquiry/gate today)
const TEMPORAL_CREATED = "hsl(178deg 60% 62%)";
const TEMPORAL_TOUCHED = "hsl(38deg 65% 62%)";
const TEMPORAL_HISTORICAL = "hsl(220deg 10% 34%)";

const ZSPACING = 46; // px of depth per step, in 3D
const FOCAL = 640;

function colorFor(kind) {
  if (!(kind in KIND_COLOR)) {
    const n = Object.keys(KIND_COLOR).length;
    const hue = (n * 137.508) % 360; // golden-angle spacing: stays distinct as kinds are added
    KIND_COLOR[kind] = `hsl(${hue.toFixed(0)}deg 70% 68%)`;
  }
  return KIND_COLOR[kind];
}

// Three orthogonal readings of the same node, per the ChatGPT review this
// session acted on: structural (what kind of thing), standing (what LabKit
// currently says about it — only known for enquiries and gates, the two
// kinds fragments/derive.ts snapshots), and temporal (when it last changed).
function colorForNode(node) {
  if (state.overlay === "standing") return STANDING_COLOR[node.standing] ?? STANDING_UNKNOWN;
  if (state.overlay === "temporal") {
    if (node.createdStep === state.lastStepSeq) return TEMPORAL_CREATED;
    if (state.lastTouched.has(node.handle)) return TEMPORAL_TOUCHED;
    return TEMPORAL_HISTORICAL;
  }
  return colorFor(node.label);
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);

// ---------------------------------------------------------------- data

async function loadTraces() {
  const res = await fetch("/api/traces");
  state.traces = await res.json();
  scenarioSelect.innerHTML = "";
  for (const [i, trace] of state.traces.entries()) {
    const opt = document.createElement("option");
    opt.value = String(i);
    const badge = trace.origin === "labkit-rust" ? "[rust] " : "";
    opt.textContent = `${badge}${trace.name}  (${trace.steps.length} steps)`;
    scenarioSelect.appendChild(opt);
  }
  selectTrace(0);
}

// Two independent models of the same domain can be in this list -- the TS
// domain and the Rust/Grafeo spike (labkit#119) -- and they don't always
// agree on things like edge direction. originBadge keeps that visible
// throughout the run, not just in the picker, so nobody mistakes one for a
// correction of the other mid-playback.
function originBadge() {
  return document.getElementById("origin-badge");
}

function selectTrace(index) {
  state.current = state.traces[index];
  scenarioSelect.value = String(index);
  const badge = originBadge();
  if (badge) {
    const isRust = state.current?.origin === "labkit-rust";
    badge.textContent = isRust ? "rust/grafeo model" : "TS domain model";
    badge.classList.toggle("rust", isRust);
  }
  resetRun();
}

function resetRun() {
  state.step = 0;
  state.nodes.clear();
  state.edges = [];
  state.playing = false;
  state.lastStepSeq = null;
  state.lastTouched = new Set();
  playBtn.textContent = "▶";
  playBtn.classList.remove("playing");
  renderQueue();
  updateProgress();
  renderDerivedPanel();
}

// One step: mint nodes at a random position near the graph's current
// centroid (so new nodes drift toward the mass rather than spawning at a
// fixed corner), record edges, and fade any node a closing act named.
function applyStep(step) {
  const [cx, cy] = centroid();
  for (const created of step.created) {
    state.nodes.set(created.handle, {
      handle: created.handle,
      label: created.label,
      x: cx + (Math.random() - 0.5) * 40,
      y: cy + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      createdStep: step.seq,
      alpha: 1,
      concluded: false,
    });
  }
  for (const edge of step.edges) {
    state.edges.push(edge);
  }
  if (CLOSING_OPS.has(step.operation)) {
    const node = state.nodes.get(step.subject);
    if (node) node.concluded = true;
  }
  for (const item of step.derived) {
    const node = state.nodes.get(item.handle);
    if (node) node.standing = item.state;
  }
  state.lastStepSeq = step.seq;
  state.lastTouched = new Set([
    step.subject,
    ...step.created.map((c) => c.handle),
    ...step.edges.flatMap((e) => [e.from, e.to]),
  ]);
}

function centroid() {
  if (state.nodes.size === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const n of state.nodes.values()) {
    sx += n.x;
    sy += n.y;
  }
  return [sx / state.nodes.size, sy / state.nodes.size];
}

function next() {
  if (!state.current || state.step >= state.current.steps.length) {
    state.playing = false;
    playBtn.textContent = "▶";
    playBtn.classList.remove("playing");
    return;
  }
  applyStep(state.current.steps[state.step]);
  state.step++;
  renderQueue();
  updateProgress();
  renderDerivedPanel();
}

// ---------------------------------------------------------------- queue panel

// Groups consecutive steps by which fragments/compositions.ts move produced
// them (fragments/tagged.ts stamps this at record time). A step with no
// fragment -- a composition run against ./index directly -- gets no header.
function renderQueue() {
  queueList.innerHTML = "";
  if (!state.current) return;
  let lastFragment;
  for (const [i, step] of state.current.steps.entries()) {
    if (step.fragment && step.fragment !== lastFragment) {
      const header = document.createElement("li");
      header.className = "queue-group";
      header.textContent = step.fragment;
      queueList.appendChild(header);
    }
    lastFragment = step.fragment;

    const li = document.createElement("li");
    li.className = i < state.step ? "done" : i === state.step ? "current" : "";
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = String(i + 1);
    li.appendChild(n);
    li.appendChild(document.createTextNode(` ${step.command}`));
    li.title = step.command;
    queueList.appendChild(li);
  }
  const activeStepLi = [...queueList.querySelectorAll("li:not(.queue-group)")][
    Math.min(state.step, state.current.steps.length - 1)
  ];
  activeStepLi?.scrollIntoView({ block: "nearest" });
}

function updateProgress() {
  const total = state.current?.steps.length ?? 0;
  const pct = total === 0 ? 0 : (100 * state.step) / total;
  progressFill.style.width = `${pct}%`;
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

// The Explorer's answer to the ChatGPT review's "two simultaneous views":
// the physical mutation an act made (RECORD DELTA, straight off the event)
// next to what LabKit now says about the research (DERIVED CHANGES, from
// fragments/derive.ts's per-step snapshots). They can and do disagree in
// count -- a step can write eight edges and change no enquiry's closure.
function renderDerivedPanel() {
  const step = state.current && state.step > 0 ? state.current.steps[state.step - 1] : null;
  if (!step) {
    derivedAct.innerHTML = "<h3>act</h3><div class=\"empty\">no steps applied yet</div>";
    derivedDelta.innerHTML = "<h3>record delta</h3>";
    derivedChanges.innerHTML = "<h3>derived changes</h3>";
    return;
  }

  derivedAct.innerHTML = `
    <h3>act</h3>
    <div><span class="act-op">${esc(step.operation)}</span> <span class="act-subject">${esc(step.subject)}</span></div>
    <div class="act-command">${esc(step.command)}</div>
  `;

  const createdLines = step.created
    .map((c) => `<div class="delta-line"><span class="plus">+</span> ${esc(c.label)} ${esc(c.handle)}</div>`)
    .join("");
  const edgeLines = step.edges
    .map(
      (e) =>
        `<div class="delta-line"><span class="plus">+</span> ${esc(e.from)} -[<span class="edge-label">${esc(e.label)}</span>]-&gt; ${esc(e.to)}</div>`,
    )
    .join("");
  derivedDelta.innerHTML =
    step.created.length || step.edges.length
      ? `<h3>record delta</h3>${createdLines}${edgeLines}`
      : `<h3>record delta</h3><div class="empty">nothing minted</div>`;

  if (!step.derived.length) {
    derivedChanges.innerHTML = `<h3>derived changes</h3><div class="empty">nothing derived tracks yet (only enquiries and gates)</div>`;
  } else {
    const lines = step.derived
      .map((d) => {
        const label = d.kind === "gate" ? "Gate" : "Enquiry";
        if (d.changed) {
          const from = d.from ? `${esc(d.from)} <span class="arrow">→</span> ` : "";
          return `<div class="change-line changed"><span class="kind">${label}</span> ${esc(d.handle)}  ${from}${esc(d.state)}</div>`;
        }
        return `<div class="change-line unchanged"><span class="kind">${label}</span> ${esc(d.handle)}  unchanged: ${esc(d.state)}</div>`;
      })
      .join("");
    derivedChanges.innerHTML = `<h3>derived changes</h3>${lines}`;
  }
}

// ---------------------------------------------------------------- physics

const REPEL = 2600;
const SPRING_LEN = 90;
const SPRING_K = 0.02;
const DAMPING = 0.86;
const CENTER_K = 0.002;

function tickPhysics() {
  const nodes = [...state.nodes.values()];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) d2 = 1;
      const f = REPEL / d2;
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
  for (const edge of state.edges) {
    const a = state.nodes.get(edge.from);
    const b = state.nodes.get(edge.to);
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
    n.alpha = n.concluded ? Math.max(0.28, n.alpha - 0.01) : n.alpha;
  }
}

// ---------------------------------------------------------------- rendering

function project(node) {
  if (state.view === "2d") {
    const rect = canvas.getBoundingClientRect();
    return { sx: rect.width / 2 + node.x, sy: rect.height / 2 + node.y, scale: 1, depth: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  const { yaw, pitch, distance } = state.camera;
  const z = node.createdStep * ZSPACING;
  const maxZ = maxCreatedZ();
  // Camera looks at the midpoint of the depth range so the whole run stays
  // roughly centred instead of drifting off as new, deeper steps arrive.
  const zc = z - maxZ / 2;

  // Rotate around Y (yaw) then X (pitch), camera pulled back along Z by `distance`.
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  let x1 = node.x * cosY - zc * sinY;
  let z1 = node.x * sinY + zc * cosY;
  const cosX = Math.cos(pitch);
  const sinX = Math.sin(pitch);
  let y1 = node.y * cosX - z1 * sinX;
  let z2 = node.y * sinX + z1 * cosX;

  const viewZ = z2 + distance;
  if (viewZ <= 1) return { sx: -9999, sy: -9999, scale: 0, depth: viewZ };
  const scale = FOCAL / viewZ;
  return {
    sx: rect.width / 2 + x1 * scale,
    sy: rect.height / 2 + y1 * scale,
    scale,
    depth: viewZ,
  };
}

function maxCreatedZ() {
  let max = 0;
  for (const n of state.nodes.values()) max = Math.max(max, n.createdStep * ZSPACING);
  return max;
}

function render() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  const nodes = [...state.nodes.values()];
  const projected = new Map();
  for (const n of nodes) projected.set(n.handle, project(n));
  state.screenPos = projected;

  // Depth-sort in 3D so nearer nodes/edges draw over farther ones.
  const order = [...projected.entries()].sort((a, b) => b[1].depth - a[1].depth);

  ctx.lineWidth = 1;
  for (const edge of state.edges) {
    const a = projected.get(edge.from);
    const b = projected.get(edge.to);
    if (!a || !b || a.scale === 0 || b.scale === 0) continue;
    ctx.strokeStyle = "rgba(128, 138, 156, 0.35)";
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }

  for (const [handle] of order) {
    const node = state.nodes.get(handle);
    const p = projected.get(handle);
    if (!node || !p || p.scale === 0) continue;
    const r = Math.max(2, 7 * p.scale);
    const isHover = handle === state.hoverHandle;

    ctx.globalAlpha = node.alpha;
    ctx.fillStyle = colorForNode(node);
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fill();
    if (isHover) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (p.scale > 0.55) {
      ctx.globalAlpha = node.alpha * 0.9;
      ctx.fillStyle = "#c8cedb";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(node.handle, p.sx + r + 3, p.sy + 3);
    }
    ctx.globalAlpha = 1;
  }
}

function loop(ts) {
  tickPhysics();
  handlePlayback(ts);
  render();
  requestAnimationFrame(loop);
}

let lastTs = 0;
let playAcc = 0;
function handlePlayback(ts) {
  const dt = lastTs ? (ts - lastTs) / 1000 : 0;
  lastTs = ts;
  if (!state.playing) return;
  playAcc += dt;
  const interval = 1 / state.speed;
  if (playAcc >= interval) {
    playAcc = 0;
    next();
  }
}

// ---------------------------------------------------------------- input

scenarioSelect.addEventListener("change", () => selectTrace(Number(scenarioSelect.value)));

document.getElementById("next").addEventListener("click", () => {
  state.playing = false;
  playBtn.textContent = "▶";
  playBtn.classList.remove("playing");
  next();
});

document.getElementById("reset").addEventListener("click", resetRun);

playBtn.addEventListener("click", () => {
  state.playing = !state.playing;
  playBtn.textContent = state.playing ? "⏸" : "▶";
  playBtn.classList.toggle("playing", state.playing);
});

speedInput.addEventListener("input", () => {
  state.speed = Number(speedInput.value);
});

for (const btn of document.querySelectorAll("#view-toggle button")) {
  btn.addEventListener("click", () => {
    state.view = btn.dataset.view;
    for (const b of document.querySelectorAll("#view-toggle button")) b.classList.toggle("active", b === btn);
    hint.textContent = state.view === "3d" ? "drag to orbit · scroll to zoom · z = step sequence" : "";
  });
}

for (const btn of document.querySelectorAll("#overlay-toggle button")) {
  btn.addEventListener("click", () => {
    state.overlay = btn.dataset.overlay;
    for (const b of document.querySelectorAll("#overlay-toggle button")) b.classList.toggle("active", b === btn);
  });
}

canvas.addEventListener("mousedown", (e) => {
  if (state.view !== "3d") return;
  state.drag = { x: e.clientX, y: e.clientY, yaw: state.camera.yaw, pitch: state.camera.pitch };
});
window.addEventListener("mouseup", () => {
  state.drag = null;
});
window.addEventListener("mousemove", (e) => {
  if (state.drag) {
    const dx = e.clientX - state.drag.x;
    const dy = e.clientY - state.drag.y;
    state.camera.yaw = state.drag.yaw + dx * 0.006;
    state.camera.pitch = Math.max(-1.4, Math.min(1.4, state.drag.pitch - dy * 0.006));
    return;
  }
  handleHover(e);
});
canvas.addEventListener(
  "wheel",
  (e) => {
    if (state.view !== "3d") return;
    e.preventDefault();
    state.camera.distance = Math.max(120, Math.min(2200, state.camera.distance + e.deltaY * 0.6));
  },
  { passive: false },
);

function handleHover(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  let found = null;
  let bestD = 18;
  for (const [handle, p] of state.screenPos.entries()) {
    if (p.scale === 0) continue;
    const d = Math.hypot(p.sx - mx, p.sy - my);
    if (d < bestD) {
      bestD = d;
      found = handle;
    }
  }
  state.hoverHandle = found;
  if (!found) {
    popover.classList.add("hidden");
    return;
  }
  showPopover(found, e.clientX, e.clientY, rect);
}

function showPopover(handle, clientX, clientY, rect) {
  const node = state.nodes.get(handle);
  const step = state.current?.steps.find((s) => s.created.some((c) => c.handle === handle));
  popover.innerHTML = `
    <div><span class="kind">${node.label}</span> <span class="handle">${handle}</span></div>
    <dl>
      <dt>created at</dt><dd>step ${node.createdStep}${step ? ` — ${step.operation}` : ""}</dd>
      ${node.concluded ? "<dt>status</dt><dd>concluded</dd>" : ""}
    </dl>
  `;
  const left = Math.min(clientX - rect.left + 16, rect.width - 336);
  const top = Math.min(clientY - rect.top + 16, rect.height - 100);
  popover.style.left = `${Math.max(0, left)}px`;
  popover.style.top = `${Math.max(0, top)}px`;
  popover.classList.remove("hidden");
}

// ---------------------------------------------------------------- boot

resizeCanvas();
requestAnimationFrame(loop);
loadTraces();
