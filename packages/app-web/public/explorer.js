import {
  esc,
  typeClass,
  humanRel,
  labelFor,
  truncate,
  badge,
  stripQuery,
  shortId,
  itemView,
  mentionHtml,
  propRows,
  jsonHighlight,
  eventRow,
} from "./explorer-render.js";
/* ---------------- graph store (shared logic with the static console) ---------------- */
const resources = Object.create(null);
const SKIP_ATTR = { id: 1, type: 1, dir: 1, depth: 1, _links: 1, _embedded: 1 };

function ensureResource(key, type) {
  if (!resources[key])
    resources[key] = { id: key.split("/").pop(), type: type, attrs: {}, resolved: false };
  if (type && !resources[key].type) resources[key].type = type;
  return resources[key];
}
function mergeAttrs(res, node) {
  for (const k in node) {
    if (SKIP_ATTR[k]) continue;
    const v = node[k];
    if (v !== null && typeof v === "object") {
      if (res.attrs[k] === undefined) res.attrs[k] = v;
      continue;
    }
    const cur = res.attrs[k];
    if (
      cur === undefined ||
      (typeof v === "string" && typeof cur === "string" && v.length > cur.length)
    ) {
      res.attrs[k] = v;
    }
  }
}
// The relations a resource states about itself: its `_links` entries and its direct
// `_embedded` children, each with the `dir` the API gives it.
function collectRels(node) {
  const rels = [],
    seen = Object.create(null);
  function add(rawRel, href, type, dir) {
    const key = href && dir && stripQuery(href);
    if (!key || seen[`${rawRel}|${key}`]) return;
    seen[`${rawRel}|${key}`] = true;
    rels.push({ rel: rawRel, key: key, dir: dir });
    ensureResource(key, type);
  }
  const links = node._links || {};
  Object.keys(links).forEach((rawRel) => {
    if (rawRel === "self" || rawRel === "start") return;
    [].concat(links[rawRel]).forEach((entry) => {
      if (!entry.templated) add(rawRel, entry.href, entry.type, entry.dir);
    });
  });
  const embedded = node._embedded || {};
  Object.keys(embedded).forEach((rawRel) => {
    [].concat(embedded[rawRel]).forEach((child) => {
      add(rawRel, child._links?.self?.href, child.type, child.dir);
    });
  });
  return rels;
}
function walk(node) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) walk(node[i]);
    return;
  }
  if (typeof node !== "object") return;
  const isResource = node.type && node._links;
  if (isResource) {
    const selfHref = node._links.self?.href;
    const id = selfHref && stripQuery(selfHref);
    if (id) {
      const res = ensureResource(id, node.type);
      res.resolved = true;
      mergeAttrs(res, node);
      res.rels = collectRels(node);
      if (node._links.events) res.eventsHref = node._links.events.href;
      for (const rawErel in node._embedded || {}) {
        [].concat(node._embedded[rawErel]).forEach(walk);
      }
      return;
    }
  }
  for (const key in node) {
    if (key === "_links" || key === "_embedded") continue;
    const v2 = node[key];
    if (v2 && typeof v2 === "object") walk(v2);
  }
}

/* ---------------- state ---------------- */
const ENTRY = "/collections/workspace";
const ACCEPT = "application/vnd.collection+json, application/hal+json, application/json";
const state = {
  history: [],
  pointer: -1,
  currentId: null,
  search: "",
  rawOpen: false,
  responseOpen: false,
  loading: false,
  error: null,
  errorHref: null,
};
let fetchToken = 0,
  listToken = 0;
// Fixed, not user-adjustable: depth=1 (the graph API's own default when the
// param is omitted) only ever returns link stubs for this domain — the
// relationships that actually matter don't resolve until depth=2, even
// though the UI here only ever renders one hop of _embedded at a time.
const GRAPH_DEPTH = 2;

// Column 1 holds two collections. A collection with an `index` link is the
// lower one and the collection that link names is the upper one; a
// collection without one is the upper one alone. Columns 2 and 3 show the
// last resource returned. Resources are keyed by their href, so the same
// handle in two workspaces stays two resources.
let upper = null,
  lower = null; // { href, links, items, nextHref }
const colStatus = { loading: false, error: null };

function withDepth(href) {
  const u = new URL(href, location.href);
  u.searchParams.set("depth", String(GRAPH_DEPTH));
  return u.href;
}
function pathOf(href) {
  const u = new URL(href, location.href);
  return u.pathname + u.search;
}
function pathnameOf(href) {
  return new URL(href, location.href).pathname;
}
function errMsg(err) {
  return String(err?.message || err);
}

function parseCollection(json) {
  const c = json.collection || {};
  const links = {};
  (c.links || []).forEach((l) => {
    links[l.rel] = l.href;
  });
  const items = (c.items || []).map((it) => {
    const d = {};
    (it.data || []).forEach((kv) => {
      d[kv.name] = kv.value;
    });
    return { href: it.href, data: d, id: d.id || null };
  });
  items.forEach((it) => {
    if (!it.id) return;
    const r = ensureResource(stripQuery(it.href), it.data.type);
    r.summary = it.data.name || it.data.value || r.summary;
  });
  return { href: c.href, links: links, items: items, nextHref: links.next || null };
}

// Fetches href and reports which media type came back. What happens next is
// decided by that type, never by the shape of the URL.
function request(href) {
  return fetch(href, { headers: { Accept: ACCEPT } }).then((resp) => {
    if (!resp.ok) {
      return resp
        .json()
        .catch(() => null)
        .then((p) => {
          throw new Error(`HTTP ${resp.status} ${p?.detail || resp.statusText}`);
        });
    }
    const ct = resp.headers.get("content-type") || "";
    const kind = /collection\+json/.test(ct)
      ? "collection"
      : /hal\+json/.test(ct)
        ? "resource"
        : null;
    if (!kind) throw new Error(`Unhandled content-type: ${ct}`);
    return resp.json().then((json) => ({ kind: kind, json: json, href: resp.url }));
  });
}

function receive(r, opts) {
  if (r.kind === "resource") showResource(r.json, r.href);
  else showCollection(r.json, opts);
}

function showResource(json, href) {
  const self = json._links?.self?.href;
  const key = stripQuery(self || href);
  if (resources[key]) resources[key].full = false;
  walk(json);
  if (resources[key]) {
    resources[key].full = true;
    resources[key].selfHref = self || href;
    resources[key].events = undefined;
    resources[key].raw = json;
  }
  if (state.history[state.pointer] !== key) pushHistory(key);
  state.currentId = key;
  state.loading = false;
  state.error = null;
  colStatus.loading = false;
  render();
}

function showCollection(json, opts) {
  const next = parseCollection(json);
  const up = next.links.index;
  colStatus.loading = false;
  colStatus.error = null;
  if (opts.append && lower) {
    next.items = lower.items.concat(next.items);
    lower = next;
  } else if (opts.root || !up) {
    upper = next;
    lower = null;
  } else if (upper && stripQuery(up) === stripQuery(upper.href)) {
    lower = next;
  } else {
    lower = next;
    request(up)
      .then((r) => {
        if (r.kind === "collection") {
          upper = parseCollection(r.json);
          render();
        }
      })
      .catch((err) => {
        colStatus.error = errMsg(err);
        render();
      });
  }
  render();
}

// opts.node: the link is a graph resource, so the depth is requested and the
// detail column shows the wait. Otherwise column 1 does.
// opts.root: a starting point, shown as the upper collection whatever it links to.
// opts.append: a next page, added to the lower collection.
function follow(href, opts) {
  opts = opts || {};
  if (opts.node) {
    const url = withDepth(href);
    const token = ++fetchToken;
    state.loading = true;
    state.error = null;
    state.errorHref = url;
    render();
    request(url)
      .then((r) => {
        if (token !== fetchToken) return;
        state.loading = false;
        receive(r, opts);
      })
      .catch((err) => {
        if (token !== fetchToken) return;
        state.loading = false;
        state.error = errMsg(err);
        render();
      });
    return;
  }
  const ltoken = ++listToken;
  colStatus.loading = true;
  colStatus.error = null;
  renderTypeList();
  renderResList();
  request(href)
    .then((r) => {
      if (ltoken !== listToken) return;
      receive(r, opts);
    })
    .catch((err) => {
      if (ltoken !== listToken) return;
      colStatus.loading = false;
      colStatus.error = errMsg(err);
      renderTypeList();
      renderResList();
    });
}

function pushHistory(id) {
  state.history = state.history.slice(0, state.pointer + 1);
  state.history.push(id);
  state.pointer = state.history.length - 1;
}

function navigate(id, push) {
  if (push !== false) pushHistory(id);
  state.currentId = id;
  state.rawOpen = false;
  const res = resources[id];
  if (res?.full) {
    state.loading = false;
    state.error = null;
    render();
    return;
  }
  follow(id, { node: true });
}
function goBack() {
  if (state.pointer > 0) {
    state.pointer--;
    navigate(state.history[state.pointer], false);
  }
}
function goFwd() {
  if (state.pointer < state.history.length - 1) {
    state.pointer++;
    navigate(state.history[state.pointer], false);
  }
}

/* ---------------- sidebar ---------------- */
const typeListEl = document.getElementById("type-list");
const typeTotalEl = document.getElementById("type-total-count");
const indexPathEl = document.getElementById("index-path");
const itemsPathEl = document.getElementById("items-path");
const resListEl = document.getElementById("res-list");
const indexCountEl = document.getElementById("index-count");

function itemRows(items) {
  const term = state.search.trim().toLowerCase();
  let html = "";
  items.forEach((it) => {
    if (it.id) {
      const key = stripQuery(it.href);
      const r = resources[key];
      const lbl = String(it.data.name || it.data.value || "").toLowerCase();
      if (term && String(it.id).toLowerCase().indexOf(term) === -1 && lbl.indexOf(term) === -1)
        return;
      const view = itemView(it, r);
      html +=
        '<button class="res-item' +
        (key === state.currentId ? " active" : "") +
        (r?.resolved ? "" : " unresolved") +
        '" data-nav="' +
        esc(key) +
        '">' +
        badge(view.chipType, view.chipText) +
        '<span class="rtext"><span class="rid">' +
        esc(view.title) +
        "</span>" +
        '<span class="rlabel">' +
        esc(view.sub) +
        "</span></span>" +
        "</button>";
      return;
    }
    const label = it.data.type || it.data.name || it.data.slug || it.href;
    if (term && `${label} ${it.data.slug || ""}`.toLowerCase().indexOf(term) === -1) return;
    const open = lower && stripQuery(lower.href) === stripQuery(it.href);
    const swatch = it.data.type ? `var(--${typeClass(it.data.type)})` : "var(--text-faint)";
    html +=
      '<button class="type-row' +
      (open ? " active" : "") +
      '" data-list-href="' +
      esc(it.href) +
      '" title="' +
      esc(it.href) +
      '">' +
      '<span class="type-swatch" style="background:' +
      swatch +
      '"></span>' +
      '<span class="tname">' +
      esc(label) +
      "</span>" +
      "</button>";
  });
  return html;
}

function status(pane) {
  if (colStatus.error && pane === (upper ? "lower" : "upper"))
    return `<div class="empty-note">Fetch failed: ${esc(colStatus.error)}</div>`;
  if (colStatus.loading && pane === (upper ? "lower" : "upper"))
    return '<div class="fetchbar"><span class="spinner" aria-hidden="true"></span>loading…</div>';
  return "";
}

function renderPane(el, countEl, pathEl, c, pane) {
  countEl.textContent = c?.items.length ? c.items.length + (c.nextHref ? "+" : "") : "";
  pathEl.textContent = c ? pathnameOf(c.href) : "";
  if (!c) {
    el.innerHTML =
      status(pane) ||
      '<div class="empty-note">' +
        (pane === "upper"
          ? `Loading ${esc(ENTRY)}…`
          : "Pick a collection above to list its items.") +
        "</div>";
    return;
  }
  let html = itemRows(c.items);
  if (!html && !c.items.length) html = '<div class="empty-note">Nothing in this collection.</div>';
  else if (!html) html = '<div class="empty-note">No matching item.</div>';
  html += status(pane);
  if (pane === "lower" && c.nextHref && !colStatus.loading)
    html +=
      '<button class="tbtn" id="load-more-btn" style="margin-top:6px;width:100%;">Load more</button>';
  el.innerHTML = html;
}

function renderTypeList() {
  renderPane(typeListEl, typeTotalEl, indexPathEl, upper, "upper");
}
function renderResList() {
  renderPane(resListEl, indexCountEl, itemsPathEl, lower, "lower");
}

/* ---------------- breadcrumb ---------------- */
const breadcrumbEl = document.getElementById("breadcrumb");
function renderBreadcrumb() {
  let html = "";
  state.history.forEach((id, i) => {
    if (i > 0) html += '<span class="crumb-sep">›</span>';
    const cur = i === state.pointer ? " current" : "";
    html += `<button class="crumb${cur}" data-hist="${i}">${esc(shortId(id))}</button>`;
  });
  breadcrumbEl.innerHTML = html;
  breadcrumbEl.scrollLeft = breadcrumbEl.scrollWidth;
  /** @type {HTMLButtonElement} */ (document.getElementById("btn-back")).disabled =
    state.pointer <= 0;
  /** @type {HTMLButtonElement} */ (document.getElementById("btn-fwd")).disabled =
    state.pointer >= state.history.length - 1;
}

/* ---------------- detail ---------------- */
const detailEl = document.getElementById("detail");

// The directories a handle in the open resource's text may sit in: beside the resource itself, or
// beside anything it links to.
function mentionBases() {
  const open = resources[state.currentId];
  const bases = [];
  [state.currentId].concat(open?.rels ? open.rels.map((e) => e.key) : []).forEach((k) => {
    const dir = k ? k.slice(0, k.lastIndexOf("/") + 1) : "";
    if (dir && bases.indexOf(dir) === -1) bases.push(dir);
  });
  return bases;
}
const mention = (text) => mentionHtml(text, resources, mentionBases());

// A related resource as a row of the right column, drawn as the left column draws its items.
function relItem(key) {
  const r = resources[key];
  const resolved = r?.resolved;
  const sub = resolved ? truncate(labelFor(r) || r.type, 160) : "not yet fetched";
  return (
    '<button class="res-item' +
    (resolved ? "" : " unresolved") +
    (key === state.currentId ? " active" : "") +
    '" data-nav="' +
    esc(key) +
    '" title="' +
    esc(pathOf(withDepth(key))) +
    '">' +
    badge(r ? r.type : "?") +
    '<span class="rtext"><span class="rid">' +
    esc(shortId(key)) +
    '</span><span class="rlabel">' +
    esc(sub) +
    "</span></span></button>"
  );
}

function relChip(key) {
  const r = resources[key];
  const resolved = r?.resolved;
  const tail = resolved
    ? esc(truncate(labelFor(r) || r.type, 70))
    : `not yet fetched — GET ${esc(pathOf(withDepth(key)))}`;
  return (
    '<button class="rel-chip' +
    (resolved ? "" : " unresolved") +
    '" data-nav="' +
    esc(key) +
    '">' +
    badge(r ? r.type : "?") +
    '<span class="cid mono">' +
    esc(shortId(key)) +
    '</span><span class="clabel">' +
    tail +
    "</span></button>"
  );
}

// A related resource with its properties. The head loads it.
function relCard(key) {
  const r = resources[key];
  if (!r?.resolved) return relChip(key);
  return (
    '<div class="panel"><button class="card-head" data-nav="' +
    esc(key) +
    '">' +
    badge(r.type) +
    '<span class="cid mono">' +
    esc(shortId(key)) +
    '</span><span class="clabel">' +
    esc(r.type) +
    "</span></button>" +
    '<div class="panel-body">' +
    propRows(r.attrs, mention) +
    "</div></div>"
  );
}

// The relations of `res` in one direction, grouped by the rel name the API gave them.
function relGroups(res, dir) {
  const byRel = {};
  (res.rels || []).forEach((e) => {
    if (e.dir !== dir) return;
    byRel[e.rel] = byRel[e.rel] || [];
    byRel[e.rel].push(e.key);
  });
  return Object.keys(byRel)
    .sort()
    .map((rel) => ({ rel: rel, keys: byRel[rel] }));
}

// A record's events, read from its `events` link: one row per change, oldest first. They are
// fetched the first time the Debug tab opens on the record, and each row's act opens on click.
function loadEvents(res, href, append) {
  const prev = append && res.events ? res.events.items : [];
  res.events = { items: prev, next: null, loading: true, error: null };
  request(href)
    .then((r) => {
      const doc = r.json;
      res.events = {
        items: prev.concat(doc._embedded?.events || []),
        next: doc._links?.next?.href || null,
        loading: false,
        error: null,
      };
    })
    .catch((err) => {
      res.events = { items: prev, next: null, loading: false, error: errMsg(err) };
    })
    .then(() => {
      if (state.rawOpen && resources[state.currentId] === res) renderDetail();
    });
}

function eventsPanel(res) {
  if (!res.eventsHref) return "";
  if (!res.events) loadEvents(res, res.eventsHref, false);
  const ev = res.events;
  const head =
    '<div class="panel-head"><a href="' +
    esc(res.eventsHref) +
    '" target="_blank" rel="noopener" title="Open in a new tab">' +
    esc(pathOf(res.eventsHref)) +
    "</a><span>events" +
    (ev.items.length ? ` · ${ev.items.length}` : "") +
    "</span></div>";
  let body = ev.items.map(eventRow).join("");
  if (ev.error) body += `<div class="empty-panel">Fetch failed: ${esc(ev.error)}</div>`;
  else if (ev.loading)
    body +=
      '<div class="fetchbar"><span class="spinner" aria-hidden="true"></span>loading events…</div>';
  else if (!ev.items.length) body += '<div class="empty-panel">No event names this record.</div>';
  if (!ev.loading && ev.next)
    body +=
      '<button class="tbtn" id="events-more-btn" style="margin:8px 0;">Load more acts</button>';
  return `<div class="panel">${head}<div class="panel-body">${body}</div></div>`;
}

function renderDetail() {
  const id = state.currentId;

  if (!id) {
    detailEl.innerHTML =
      '<div class="empty-panel" style="padding-top:8px;">Pick a type on the left, then an item, to open it here.</div>';
    return;
  }

  if (state.error) {
    detailEl.innerHTML =
      '<div class="fetch-error"><div class="title">Fetch failed</div>' +
      "<div>" +
      esc(state.error) +
      "</div>" +
      '<div style="margin-top:8px;">Requested <span class="mono">' +
      esc(state.errorHref || shortId(id)) +
      "</span>. " +
      'A generic "Failed to fetch" here is almost always CORS — check that the response for this origin includes an <span class="mono">Access-Control-Allow-Origin</span> header covering wherever this file is being served from (including <span class="mono">null</span> if opened as a local file). Open devtools\u2019 Network tab for the actual reason; browsers don\u2019t expose it to script.</div></div>';
    return;
  }

  const res = resources[id];
  if (!res) {
    detailEl.innerHTML = '<div class="empty-panel">Nothing loaded yet.</div>';
    return;
  }

  if (!res.resolved) {
    if (state.loading) {
      detailEl.innerHTML =
        '<div class="detail-header"><div class="header-top">' +
        badge(res.type || "Question") +
        '<span class="header-id">' +
        esc(shortId(id)) +
        "</span></div></div>" +
        '<div class="panel"><div class="panel-head">GET ' +
        esc(pathOf(withDepth(id))) +
        '</div><div class="panel-body"><div class="fetchbar"><span class="spinner" aria-hidden="true"></span>fetching ' +
        esc(shortId(id)) +
        "…</div></div></div>";
    } else {
      detailEl.innerHTML = '<div class="empty-panel">Not fetched.</div>';
    }
    return;
  }

  const a = res.attrs;
  let pills = "";
  if (a.kind) pills += `<span class="pill kind-${esc(a.kind)}">${esc(a.kind)}</span>`;
  if (a.outcome) pills += `<span class="pill outcome-${esc(a.outcome)}">${esc(a.outcome)}</span>`;
  if (a.resolution_kind) pills += `<span class="pill">${esc(a.resolution_kind)}</span>`;
  if (a.status) pills += `<span class="pill">${esc(a.status)}</span>`;
  if (a.role) pills += `<span class="pill">${esc(a.role)}</span>`;

  const propKeys = Object.keys(a).sort();

  let html = "";
  html += '<div class="detail-header">';
  html +=
    '  <div class="header-top">' +
    badge(res.type) +
    '<span class="header-id">' +
    esc(shortId(id)) +
    '</span><span class="header-type">' +
    esc(res.type) +
    "</span></div>";
  if (pills) html += `  <div class="header-pills">${pills}</div>`;
  html += '  <div class="toolbar">';
  html +=
    '    <button class="tbtn' +
    (!state.rawOpen ? " on" : "") +
    '" id="tab-overview">Overview</button>';
  html += `    <button class="tbtn${state.rawOpen ? " on" : ""}" id="tab-raw">Debug</button>`;
  html +=
    '    <button class="tbtn" id="refetch-btn" title="Reload from the API" aria-label="Reload from the API">↻</button>';
  html += "  </div>";
  html += "</div>";

  if (state.rawOpen) {
    const selfLink = res.selfHref
      ? '<a href="' +
        esc(res.selfHref) +
        '" target="_blank" rel="noopener" title="Open in a new tab">' +
        esc(pathOf(res.selfHref)) +
        "</a>"
      : "";
    // Collapsed until asked for: the events below it are what Debug is usually opened for.
    html +=
      '<div class="panel"><div class="panel-head toggle" id="response-toggle" title="Show or hide the response">' +
      '<span><span class="caret">' +
      (state.responseOpen ? "▾" : "▸") +
      "</span> " +
      selfLink +
      "</span><span>response</span></div>" +
      (state.responseOpen
        ? `<pre class="jsonview">${res.raw ? jsonHighlight(res.raw) : "loading…"}</pre>`
        : "") +
      "</div>";
    html += eventsPanel(res);
  } else {
    html +=
      '<div class="panel"><div class="panel-head">Properties<span>' +
      propKeys.length +
      '</span></div><div class="panel-body">' +
      propRows(a, mention) +
      "</div></div>";
  }
  if (!state.rawOpen) {
    relGroups(res, "out").forEach((g) => {
      html +=
        '<div class="rel-heading">→ ' +
        esc(humanRel(g.rel)) +
        ' <span class="faint">' +
        g.keys.length +
        "</span></div>" +
        g.keys.map(relCard).join("");
    });
  }
  detailEl.innerHTML = html;
}

const inRelEl = document.getElementById("in-rel-body");
const inCountEl = document.getElementById("in-count");

function renderRelations() {
  const id = state.currentId;
  const res = id && resources[id];

  if (!res?.resolved) {
    inRelEl.innerHTML =
      '<div class="empty-note">' +
      (!id
        ? "Nothing open yet."
        : state.loading
          ? `Waiting on ${esc(shortId(id))}…`
          : `${esc(shortId(id))} hasn't loaded.`) +
      "</div>";
    inCountEl.textContent = "";
    return;
  }
  const groups = relGroups(res, "in");
  inCountEl.textContent = groups.reduce((n, g) => n + g.keys.length, 0);
  inRelEl.innerHTML =
    groups
      .map(
        (g) =>
          '<div class="rel-group"><div class="rel-key"><span class="rel-arrow">←</span>' +
          esc(humanRel(g.rel)) +
          '</div><div class="res-list">' +
          g.keys.map(relItem).join("") +
          "</div></div>",
      )
      .join("") || '<div class="empty-panel">None recorded.</div>';
}

// The open resource's path is kept in the URL hash, so a reload or a pasted link opens it.
function syncHash() {
  if (!state.currentId) return;
  const want = `#${pathnameOf(state.currentId)}`;
  if (location.hash !== want)
    history.replaceState(null, "", location.pathname + location.search + want);
}

function render() {
  renderTypeList();
  renderResList();
  renderBreadcrumb();
  renderDetail();
  renderRelations();
  syncHash();
}

/* ---------------- events ---------------- */
document.body.addEventListener("click", (e) => {
  const target = /** @type {HTMLElement} */ (e.target);
  const navBtn = target.closest("[data-nav]");
  if (navBtn) {
    navigate(navBtn.getAttribute("data-nav"));
    return;
  }

  const listBtn = target.closest("[data-list-href]");
  if (listBtn) {
    follow(listBtn.getAttribute("data-list-href"));
    return;
  }

  if (target.id === "load-more-btn") {
    if (lower?.nextHref) follow(lower.nextHref, { append: true });
    return;
  }

  if (target.id === "events-more-btn") {
    const open = resources[state.currentId];
    if (open?.events?.next) {
      loadEvents(open, open.events.next, true);
      renderDetail();
    }
    return;
  }

  const histBtn = target.closest("[data-hist]");
  if (histBtn) {
    const idx = parseInt(histBtn.getAttribute("data-hist"), 10);
    state.pointer = idx;
    navigate(state.history[idx], false);
    return;
  }

  if (target.closest("#response-toggle") && !target.closest("a")) {
    state.responseOpen = !state.responseOpen;
    renderDetail();
    return;
  }
  if (target.id === "tab-overview") {
    state.rawOpen = false;
    renderDetail();
    return;
  }
  if (target.id === "tab-raw") {
    state.rawOpen = true;
    renderDetail();
    return;
  }
  if (target.id === "refetch-btn") {
    if (state.currentId) follow(state.currentId, { node: true });
    return;
  }
});

document.getElementById("btn-home").addEventListener("click", () => {
  fetchToken++;
  state.history = [];
  state.pointer = -1;
  state.currentId = null;
  state.loading = false;
  state.error = null;
  state.rawOpen = false;
  history.replaceState(null, "", location.pathname + location.search);
  render();
  follow(ENTRY, { root: true });
});
document.getElementById("btn-back").addEventListener("click", goBack);
document.getElementById("btn-fwd").addEventListener("click", goFwd);
document.getElementById("search").addEventListener("input", (e) => {
  state.search = /** @type {HTMLInputElement} */ (e.target).value;
  renderTypeList();
  renderResList();
});

const themeBtn = document.getElementById("theme-toggle");
themeBtn.addEventListener("click", () => {
  const root = document.documentElement;
  const cur = root.getAttribute("data-theme");
  if (cur === "dark") {
    root.setAttribute("data-theme", "light");
    themeBtn.textContent = "Dark mode";
  } else if (cur === "light") {
    root.removeAttribute("data-theme");
    themeBtn.textContent = "Light mode";
  } else {
    root.setAttribute("data-theme", "dark");
    themeBtn.textContent = "Light mode";
  }
});

const sidebarEl = document.getElementById("sidebar");
const relationsEl = document.getElementById("relations-col");
const scrimEl = document.getElementById("scrim");
function closeDrawer() {
  sidebarEl.classList.remove("open");
  relationsEl.classList.remove("open");
  scrimEl.classList.remove("open");
}
document.getElementById("hamburger").addEventListener("click", () => {
  relationsEl.classList.remove("open");
  sidebarEl.classList.toggle("open");
  scrimEl.classList.toggle("open");
});
document.getElementById("hamburger-right").addEventListener("click", () => {
  sidebarEl.classList.remove("open");
  relationsEl.classList.toggle("open");
  scrimEl.classList.toggle("open");
});
scrimEl.addEventListener("click", closeDrawer);
document.body.addEventListener("click", (e) => {
  if (/** @type {HTMLElement} */ (e.target).closest("[data-nav]") && window.innerWidth <= 1180)
    closeDrawer();
});

/* ---------------- boot ----------------
   The API entrypoint is /collections, not any particular graph resource —
   so that's the only thing fetched on load. Center and right columns stay
   empty until an item is picked from the left column (or a relation chip
   is followed from whatever's already open). */
document.getElementById("brand-sub").textContent = `live · ${location.host}`;
// A path in the hash opens that resource; it is loaded as a link would be.
function openHash() {
  const path = location.hash.slice(1);
  if (path.charAt(0) === "/" && (!state.currentId || pathnameOf(state.currentId) !== path)) {
    state.rawOpen = false;
    follow(location.origin + path, { node: true });
  }
}
window.addEventListener("hashchange", openHash);

render();
follow(ENTRY, { root: true });
openHash();
