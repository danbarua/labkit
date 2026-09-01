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
const derivedPanel = document.getElementById("derived-panel");
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
// production code path. window.__labkitExplorer.state (below) is the same
// object; this direct alias exists because it was the first thing built and
// nothing stops working if both stay reachable.
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
  // A 2D-only zoom-out factor (>=1). autofit() grows this when a node lands
  // outside the visible canvas; nothing shrinks it back -- the mouse wheel
  // already owns 3D's zoom via camera.distance, and a view that zoomed itself
  // both in and out under a still-settling physics sim would fight a viewer's
  // own scroll input constantly.
  zoom: 1,
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

const ORIGIN_TAG = { "labkit-rust": "[rust] ", "labkit-db": "[db] " };
const ORIGIN_LABEL = {
  "labkit-rust": "rust/grafeo model",
  "labkit-db": "real record",
  "labkit-ts": "TS domain model",
};

async function loadTraces() {
  const res = await fetch("/api/traces");
  state.traces = await res.json();
  scenarioSelect.innerHTML = "";
  for (const [i, trace] of state.traces.entries()) {
    const opt = document.createElement("option");
    opt.value = String(i);
    const badge = ORIGIN_TAG[trace.origin] ?? "";
    opt.textContent = `${badge}${trace.name}  (${trace.steps.length} steps)`;
    scenarioSelect.appendChild(opt);
  }
  selectTrace(0);
}

// Three kinds of trace can be in this list -- the TS domain, the Rust/Grafeo
// spike (labkit#119), and a real record read from a live .labkit/ (#124,
// #126) -- and none of them is a correction of another: the first two are
// independent implementations that don't always agree (edge direction), and
// the third isn't a composition at all, just something that actually
// happened. originBadge keeps which one is showing visible throughout the
// run, not just in the picker.
function originBadge() {
  return document.getElementById("origin-badge");
}

function selectTrace(index) {
  state.current = state.traces[index];
  scenarioSelect.value = String(index);
  const badge = originBadge();
  if (badge) {
    const origin = state.current?.origin ?? "labkit-ts";
    badge.textContent = ORIGIN_LABEL[origin] ?? origin;
    badge.classList.toggle("rust", origin === "labkit-rust");
    badge.classList.toggle("db", origin === "labkit-db");
  }
  // A `--db` trace whose replay diverged (fragments/replay.ts) still renders
  // -- every step's own created/edges are real either way -- but `derived`
  // and `fragment` go missing from the divergence onward, silently unless
  // this says so. See scripts/read-db-trace.ts's `derivedUnavailable`.
  const warning = document.getElementById("derived-warning");
  if (warning) {
    const reason = state.current?.derivedUnavailable;
    warning.hidden = !reason;
    if (reason) warning.title = reason;
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
  state.zoom = 1;
  playBtn.textContent = "▶";
  playBtn.classList.remove("playing");
  renderQueue();
  updateProgress();
  renderDerivedPanel();
}

// One step: mint nodes, record edges, and fade any node a closing act named.
//
// A new node spawns near whichever *existing* node this step's edges connect
// it to, not the graph's overall centroid -- an analysis minted this step
// that consumes an artefact from ten steps ago should land beside that
// artefact, not wherever the mass of everything happens to sit right now.
// Falls back to the centroid only when nothing this step connects to already
// exists (the very first node in a trace, or a step whose edges all run
// between nodes created in the same step). This is deliberately about
// spawn position only: tickPhysics()'s own spring/repulsion forces still
// decide where a node actually settles once it's live, so a bad initial
// guess here costs a few frames of drift, not a wrong final layout.
function applyStep(step) {
  const [cx, cy] = centroid();
  const newHandles = new Set(step.created.map((c) => c.handle));
  for (const created of step.created) {
    const parent = step.edges
      .map((e) => (e.from === created.handle ? e.to : e.to === created.handle ? e.from : null))
      .filter((h) => h && !newHandles.has(h))
      .map((h) => state.nodes.get(h))
      .find(Boolean);
    const [px, py] = parent ? [parent.x, parent.y] : [cx, cy];
    state.nodes.set(created.handle, {
      handle: created.handle,
      label: created.label,
      x: px + (Math.random() - 0.5) * 40,
      y: py + (Math.random() - 0.5) * 40,
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
    li.innerHTML = `<span class="n">${i + 1}</span>${formatCommand(step.command)}`;
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

// A handle looks like PREFIX_digits -- Q_1, LOE_12, CEVAL_3 -- across every
// label src/db/domain.ts declares. Not imported from there: the frontend has
// no build step to pull it through, and the shape is stable enough (a
// natural-id prefix is always uppercase letters, always followed by
// underscore-digits) that duplicating the pattern here costs less than wiring
// up a fetch for a list that only ever gets checked against, never rendered.
const HANDLE = /^[A-Z]+_\d+$/;
const isHandle = (s) => HANDLE.test(s);

// Splits `labkit <verb> --flag "value" --flag2 [...]` into a predictable,
// hand-drawable shape rather than one line per flag with no further
// structure -- Dan's own sketch, reproduced exactly because the alignment is
// the point:
//
//   labkit stateCriterion
//   --proposition
//     "no grade 3 events at the target dose"
//
//   labkit declareGate
//   --governed-by ["CRIT_1"]
//   --protecting ["TASK_1"]
//
// No indent before `labkit <verb>` (the queue's own numbering column, .n,
// carries that weight), two spaces before every `--flag`. A handle-shaped
// value (a bare handle or an array of them) stays on the flag's own line --
// it's short and it's an id, the same reason record-delta never wraps
// `Q_1 -[MOTIVATES]-> LOE_1` onto two lines. A prose value drops to its own
// line, indented by .cmd-prose (a block, not manual spaces in the string --
// see that rule for why), because prose is what varies in length and wants
// the browser's own word-wrap rather than being forced to share a line with
// the flag that names it. Untouched by a formatter change if a flag ever
// adds a value shape this hasn't seen: unrecognised tokens render as plain
// text rather than throwing.
function formatCommand(command) {
  const parts = command.split(/(?=--[a-z-]+ )/);
  const head = parts.shift() ?? command;
  const verbMatch = head.match(/^(labkit) (\S+)/);
  const headHtml = verbMatch
    ? `${esc(verbMatch[1])} <span class="cmd-verb">${esc(verbMatch[2])}</span>`
    : esc(head);

  // .cmd-prose is `display: block`, which already starts a new line for
  // whatever comes after it -- so the segment *following* a prose value must
  // not also open with "\n", or the two line breaks stack into a blank line.
  // This bit stacked twice, in both directions, before this fix: prose
  // followed by prose, and (found afterwards, looking at a real render) prose
  // followed by any other flag, handle-shaped or not.
  let previousWasProse = false;
  const flagHtml = (part) => {
    const m = part.match(/^(--[a-z-]+) (.*)$/s);
    const lead = previousWasProse ? "" : "\n";
    if (!m) {
      previousWasProse = false;
      return `${lead}  ${esc(part.trim())}`;
    }
    const [, flag, rawValue] = m;
    const value = formatValue(rawValue.trim());
    previousWasProse = value.isProse;
    return value.isProse
      ? `${lead}  ${esc(flag)}<span class="cmd-prose">${value.html}</span>`
      : `${lead}  ${esc(flag)} ${value.html}`;
  };

  return [headHtml, ...parts.map(flagHtml)].join("");
}

// A flag's value is one of: a bare handle in quotes ("CRIT_1"), a prose
// string in quotes, or a JSON array of either -- commandOf() never emits
// anything else. Handles are coloured and treated as short (stay on the
// flag's line); prose is escaped and treated as long (drops to its own
// line) even when it happens to be short, because a step's flags should not
// jump between the two layouts from one act to the next.
function formatValue(value) {
  const quoted = value.match(/^"(.*)"$/s);
  if (quoted) {
    const inner = quoted[1];
    return isHandle(inner)
      ? { isProse: false, html: `"${handleSpan(inner)}"` }
      : { isProse: true, html: `"${esc(inner)}"` };
  }
  const array = value.match(/^\[(.*)\]$/s);
  if (array) {
    // JSON.parse rather than a split: an array element can itself contain a
    // comma ("degree-preserving rewiring, matched-sparsity random, ..."),
    // and splitting on "," would cut it apart.
    try {
      const items = JSON.parse(value);
      // An array of handles ("--governed-by") stays on the flag's line, the
      // same as one; an array with any prose item ("--changed", "--affected")
      // is treated as prose, dropping the whole array to its own line rather
      // than splitting one array across two layouts by item.
      const allHandles = items.every(isHandle);
      const rendered = items.map((v) => `"${allHandles ? handleSpan(v) : esc(v)}"`);
      return { isProse: !allHandles, html: `[${rendered.join(", ")}]` };
    } catch {
      return { isProse: true, html: esc(value) };
    }
  }
  return isHandle(value)
    ? { isProse: false, html: handleSpan(value) }
    : { isProse: true, html: esc(value) };
}

const handleSpan = (h) => `<span class="cmd-handle">${esc(h)}</span>`;

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
    <div class="act-command">${formatCommand(step.command)}</div>
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
    // The full roster prints every step, changed or not -- Dan's own call:
    // dropping a row when it's stable would make the panel's contents
    // inconsistent from one step to the next, and consistency is what lets
    // the eye track one enquiry or gate down the list as playback advances.
    // What used to say the word "unchanged" on every stable row (misleading
    // mid-playback -- the panel is visibly changing even when this one row
    // isn't) is now carried by .changed/.unchanged's existing colour
    // distinction alone: a changed row states its transition, a stable one
    // just states where it stands, dimmed.
    const lines = step.derived
      .map((d) => {
        const label = d.kind === "gate" ? "Gate" : "Enquiry";
        if (d.changed) {
          const from = d.from ? `${esc(d.from)} <span class="arrow">→</span> ` : "";
          return `<div class="change-line changed"><span class="kind">${label}</span> ${esc(d.handle)}  ${from}${esc(d.state)}</div>`;
        }
        return `<div class="change-line unchanged"><span class="kind">${label}</span> ${esc(d.handle)}  ${esc(d.state)}</div>`;
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

// Repulsion scaled by 1/log(n): at REPEL's original strength, a large record
// (bonsai-2026's 221 nodes, against the 3-64 node range every composition
// covers) shoves a freshly-spawned node away from the parent applyStep() just
// placed it beside before the spring connecting them gets a chance to hold
// it there -- the "stack near the node it connects to" placement only reads
// as a stack in 3D if repulsion doesn't immediately undo it. log(n) rather
// than n or sqrt(n): repulsion is pairwise (the inner loop below is already
// O(n^2)), so the *total* outward force on one node already grows with n on
// its own; log(n) damps that growth without cancelling it outright the way
// dividing by n would. Floored at 3 nodes (ln(3) ~ 1.1) rather than letting
// a 1- or 2-node graph divide by something near zero and blow up.
function springiness(n) {
  return 1 / Math.log(Math.max(n, 3));
}

function tickPhysics() {
  const nodes = [...state.nodes.values()];
  const repel = REPEL * springiness(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
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
    const z = 1 / state.zoom;
    return {
      sx: rect.width / 2 + node.x * z,
      sy: rect.height / 2 + node.y * z,
      scale: z,
      depth: 0,
    };
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

  if (state.view === "3d") drawCompass();
}

// A small always-visible orientation gizmo, 3D only: three axis ticks and an
// arrowhead-plus-label on the time (z) axis, so a viewer who has rotated past
// the point of recognising which way is "forward in time" -- the report that
// prompted this -- can read it off the corner instead of re-deriving it from
// the graph's shape. Anchored to the visible canvas (above #derived-panel),
// live-measured the same way autofit() is rather than hardcoded, because
// style.css's own #hint already went stale against a panel-height change
// once.
//
// Orthographic, not run through project()'s perspective divide: this is a
// compass, not a scene object, and shrinking it as camera.distance changes
// would read as the compass drifting rather than the camera moving. The
// axis directions are project()'s own rotation (yaw then pitch) applied to
// the three unit vectors by hand, since project() only accepts a node.
function drawCompass() {
  const rect = canvas.getBoundingClientRect();
  const panelHeight = derivedPanel.getBoundingClientRect().height;
  const margin = 34;
  const cx = margin;
  const cy = rect.height - panelHeight - margin;
  if (cy < margin) return; // panel covers the whole canvas -- nothing to anchor to

  const { yaw, pitch } = state.camera;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosX = Math.cos(pitch);
  const sinX = Math.sin(pitch);
  const len = 26;

  const axes = [
    { x1: cosY, y1: -sinY * sinX, z2: sinY * cosX, color: "#e0687a", label: null },
    { x1: 0, y1: cosX, z2: sinX, color: "#5ad1c9", label: null },
    { x1: -sinY, y1: -cosY * sinX, z2: cosY * cosX, color: "#e0b25a", label: "time" },
  ];
  // Farthest-into-the-screen axis drawn first, so a nearer one overlaps it.
  axes.sort((a, b) => a.z2 - b.z2);

  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = "10px ui-monospace, monospace";
  for (const axis of axes) {
    const ex = cx + axis.x1 * len;
    const ey = cy + axis.y1 * len;
    const depthAlpha = 0.55 + 0.45 * ((axis.z2 + 1) / 2); // nearer = more opaque
    ctx.globalAlpha = depthAlpha;
    ctx.strokeStyle = axis.color;
    ctx.fillStyle = axis.color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    const armLen = Math.hypot(ex - cx, ey - cy);
    if (armLen < 3) {
      // Looking straight down this axis -- an arrow of ~zero length reads as
      // "missing", not "pointing at the camera". A ring says so instead.
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

// Grows state.zoom (2D only -- see its declaration) so a node the sim has
// pushed outside the visible canvas comes back into view, rather than
// leaving a viewer to notice the graph has quietly grown past the edge and
// go hunting for what fell off. "Visible" excludes #derived-panel's own
// height, which sits on top of the canvas at the bottom -- a node fitting
// the full canvas but hidden under that panel is not actually visible.
// Never shrinks zoom back in: the physics sim never stops nudging positions,
// so a fit tight enough to shrink on would flicker in and out as nodes drift
// by a pixel. Only 2D has a zoom concept; 3D's "zoom" is camera.distance,
// which the mouse wheel already owns and this must not fight.
function autofit() {
  if (state.view !== "2d" || state.nodes.size === 0) return;
  const rect = canvas.getBoundingClientRect();
  const visibleHeight = rect.height - derivedPanel.getBoundingClientRect().height;
  if (visibleHeight <= 0) return;
  const margin = 0.9; // 10% headroom inside the box a node must fit within
  const halfW = (rect.width / 2) * margin;
  const halfH = (visibleHeight / 2) * margin;
  let needed = 1;
  for (const n of state.nodes.values()) {
    if (halfW > 0) needed = Math.max(needed, Math.abs(n.x) / halfW);
    if (halfH > 0) needed = Math.max(needed, Math.abs(n.y) / halfH);
  }
  if (needed > state.zoom) state.zoom += (needed - state.zoom) * 0.08; // ease, not snap
}

function loop(ts) {
  tickPhysics();
  autofit();
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

function pause() {
  state.playing = false;
  playBtn.textContent = "▶";
  playBtn.classList.remove("playing");
}

function play() {
  state.playing = true;
  playBtn.textContent = "⏸";
  playBtn.classList.add("playing");
}

function stepForward() {
  pause();
  next();
}

function setSpeed(speed) {
  state.speed = speed;
  speedInput.value = String(speed);
}

scenarioSelect.addEventListener("change", () => selectTrace(Number(scenarioSelect.value)));

document.getElementById("next").addEventListener("click", stepForward);

document.getElementById("reset").addEventListener("click", resetRun);

playBtn.addEventListener("click", () => (state.playing ? pause() : play()));

speedInput.addEventListener("input", () => {
  state.speed = Number(speedInput.value);
});

function setView(view) {
  state.view = view;
  for (const b of document.querySelectorAll("#view-toggle button"))
    b.classList.toggle("active", b.dataset.view === view);
  hint.textContent = view === "3d" ? "drag to orbit · scroll to zoom · z = step sequence" : "";
}

function setOverlay(overlay) {
  state.overlay = overlay;
  for (const b of document.querySelectorAll("#overlay-toggle button"))
    b.classList.toggle("active", b.dataset.overlay === overlay);
}

for (const btn of document.querySelectorAll("#view-toggle button")) {
  btn.addEventListener("click", () => setView(btn.dataset.view));
}

for (const btn of document.querySelectorAll("#overlay-toggle button")) {
  btn.addEventListener("click", () => setOverlay(btn.dataset.overlay));
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
    // Neither axis is clamped. yaw never was -- project()'s sin/cos handle any
    // magnitude -- but pitch was capped to +-1.4 rad (~80 degrees), which is
    // why "rotate to look back down the stack from the far end" felt blocked:
    // physics-v2 (#163) put time on the z-axis and made that exact gesture the
    // point of the 3D view, and 80 degrees of tilt can't complete a look-back
    // flip. Both axes now wrap freely, the same way yaw already did.
    state.camera.yaw = state.drag.yaw + dx * 0.006;
    state.camera.pitch = state.drag.pitch - dy * 0.006;
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

// ---------------------------------------------------------------- debug API
//
// A console-driveable surface, for the same reason window.__labkitExplorerState
// is exposed: browser-automation sessions (Claude-in-Chrome) drive this page by
// clicking coordinates, and a batch of rapid clicks is unreliable in that
// environment -- several sessions' worth of debugging this Explorer have hit
// exactly that, needing 1s waits between clicks and still losing some. Every
// method here calls the same function a click handler calls; nothing is
// reimplemented, so this can never drift from what a real click does.
window.__labkitExplorer = {
  /** Every trace's index and name, so a session doesn't have to guess one. */
  listScenarios: () => state.traces.map((t, i) => ({ index: i, name: t.name, origin: t.origin })),
  /** Select by index (as the <select> does) or by a substring of the name. */
  selectScenario: (indexOrName) => {
    const index =
      typeof indexOrName === "number"
        ? indexOrName
        : state.traces.findIndex((t) => t.name.includes(indexOrName));
    if (index < 0 || index >= state.traces.length)
      throw new Error(`no scenario matching ${JSON.stringify(indexOrName)}`);
    selectTrace(index);
    return state.current.name;
  },
  reset: resetRun,
  next: stepForward,
  /** Steps forward from wherever the trace currently is -- never resets first,
   * so calling this twice with n=10 lands on step 20, not back on step 10. */
  goToStep: (n) => {
    if (!state.current) throw new Error("no scenario selected");
    const target = Math.max(0, Math.min(n, state.current.steps.length));
    while (state.step < target) stepForward();
    return state.step;
  },
  play,
  pause,
  setSpeed,
  setView,
  setOverlay,
  /** The full state object, for anything the methods above don't cover. */
  state,
  /** Advances the physics simulation by n frames without waiting on
   * requestAnimationFrame, which browser-automation sessions don't get:
   * a hidden/backgrounded tab (document.hidden) never fires it, so a
   * layout change would otherwise be unverifiable from outside a real,
   * focused browser window. */
  tick: (n = 1) => {
    for (let i = 0; i < n; i++) {
      tickPhysics();
      autofit();
    }
    render();
  },
};
