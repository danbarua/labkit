/**
 * The explorer's rendering: JSON in, HTML out. Nothing here reads the page, the network or the
 * page's state, so a test can call it. Every value that reaches markup goes through `esc`.
 */

export function stripQuery(href) {
  return String(href).split("?")[0];
}

export const TYPE_ABBR = {
  Question: "Q",
  LineOfEnquiry: "LoE",
  Decision: "D",
  Evidence: "Ev",
  EvidenceUnit: "EU",
  Claim: "Cl",
  Computation: "Cp",
  Artefact: "Ar",
  Criterion: "Cr",
  CriterionEvaluation: "CE",
  Gate: "Ga",
  Task: "Tk",
  Review: "Rv",
  Note: "No",
  Workspace: "Ws",
};

export function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

export function typeClass(t) {
  return `c-${String(t).toLowerCase()}`;
}

export function humanRel(rel) {
  return rel.replace(/_/g, " ");
}

export function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  /** @type {Intl.DateTimeFormatOptions} */
  const opts = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  };
  return `${d.toLocaleString("en-GB", opts)} UTC`;
}

export function isDateKey(k) {
  return /_at$/.test(k);
}

export function labelFor(res) {
  const a = res.attrs;
  const main = [
    "name",
    "statement",
    "text",
    "reason",
    "verdict",
    "value",
    "proposition",
    "method",
    "logical_name",
    "objective",
    "consequence",
  ];
  for (let i = 0; i < main.length; i++) {
    if (typeof a[main[i]] === "string" && a[main[i]]) return res.summary || a[main[i]];
  }
  return res.summary || "";
}

export function truncate(s, n) {
  s = String(s);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// The chip for a type, with its abbreviation unless `text` says otherwise.
export function badge(type, text) {
  const abbr = text !== undefined ? text : TYPE_ABBR[type] || type.slice(0, 2);
  return `<span class="badge" style="background:var(--${typeClass(type)})">${esc(abbr)}</span>`;
}

export function shortId(key) {
  return String(key).split("/").pop();
}

// One row per collection item. An item with an `id` is a resource; any other
// is a link to another collection. A `type`, when present, picks the colour.
// How a resource item is drawn, by its `type`. Most are graph entities: the type's chip, the
// handle, and its main text. An act is not an entity but a record of something done to one, so it
// shows its position in the colour of what it was done to, then what was done and when.
export const ITEM_VIEWS = {
  Act: (it) => ({
    chipType: it.data.subject_type || "Act",
    chipText: String(it.id),
    title: `${it.data.operation} ${it.data.subject}`,
    sub: String(it.data.at || "").slice(0, 10),
  }),
};

export function itemView(it, r) {
  const custom = ITEM_VIEWS[it.data.type];
  if (custom) return custom(it);
  return {
    chipType: it.data.type || "?",
    chipText: undefined,
    title: it.id,
    sub: truncate(it.data.name || it.data.value || (r ? labelFor(r) : "") || "—", 160),
  };
}

// Handles written in prose (Q_1, CLM_23) become chips. A candidate counts only if its
// prefix starts the id of some resource the page holds, which leaves K_1 or A_2 in
// mathematical prose alone. One that names a resource held in one of `bases` loads it when
// clicked; any other is a dashed chip.
/**
 * @param {string} text
 * @param {Record<string, { type?: string }>} resources every resource the page holds, by key
 * @param {string[]} bases the directories, as key prefixes, a handle in the text may sit in
 */
export function mentionHtml(text, resources, bases) {
  const prefixes = Object.create(null);
  Object.keys(resources).forEach((k) => {
    prefixes[shortId(k).split("_")[0]] = true;
  });
  let out = "";
  let last = 0;
  for (const m of text.matchAll(/\b[A-Z]{1,6}_\d+\b/g)) {
    out += esc(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (!prefixes[m[0].split("_")[0]]) {
      out += esc(m[0]);
      continue;
    }
    const found = bases.map((b) => b + m[0]).filter((k) => resources[k])[0];
    const r = found && resources[found];
    out += r
      ? '<button class="mention" data-nav="' +
        esc(found) +
        '" style="--mention:' +
        (r.type ? `var(--${typeClass(r.type)})` : "var(--line)") +
        '" title="' +
        esc(r.type || "") +
        '">' +
        m[0] +
        "</button>"
      : `<span class="mention unknown">${m[0]}</span>`;
  }
  return out + esc(text.slice(last));
}

export function isScalar(v) {
  return v === null || typeof v !== "object";
}

// A property value as HTML. A scalar is text: prose gets mention chips and `_at` keys a date. A
// list of scalars is a run of chips, a list of objects a table with a column per key, and an
// object a table of its own keys. Past three levels it is compact JSON, since a table of tables
// is no easier to read; the Debug tab has the response itself.
/**
 * @param {unknown} v
 * @param {string} key the property the value belongs to
 * @param {number} depth how far down the tables this value is
 * @param {(text: string) => string} mention turns prose into HTML with its handles as chips
 */
export function valueHtml(v, key, depth, mention) {
  depth = depth || 0;
  if (v === null || v === undefined) return '<span class="faint">—</span>';
  if (Array.isArray(v)) {
    if (!v.length) return '<span class="faint">none</span>';
    if (v.every(isScalar))
      return (
        '<span class="chips">' +
        v
          .map((x) => `<span class="chip">${valueHtml(x, key, depth + 1, mention)}</span>`)
          .join("") +
        "</span>"
      );
    return depth >= 3 ? compactJson(v) : arrayTable(v, depth, mention);
  }
  if (typeof v === "object") return depth >= 3 ? compactJson(v) : objectTable(v, depth, mention);
  if (typeof v === "string") return isDateKey(key) ? esc(fmtDate(v)) : mention(v);
  return esc(String(v));
}

export function compactJson(v) {
  return (
    '<span class="mono faint" title="' +
    esc(JSON.stringify(v)) +
    '">' +
    esc(truncate(JSON.stringify(v), 200)) +
    "</span>"
  );
}

export function isPlain(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function arrayTable(rows, depth, mention) {
  if (!rows.every(isPlain))
    return (
      '<div class="nest">' +
      rows.map((x) => `<div>${valueHtml(x, "", depth + 1, mention)}</div>`).join("") +
      "</div>"
    );
  let cols = [];
  rows.forEach((r) => {
    Object.keys(r).forEach((k) => {
      if (cols.indexOf(k) === -1) cols.push(k);
    });
  });
  // Columns that hold nested values go last, so the plain ones stay narrow and side by side.
  const nested = {};
  rows.forEach((r) => {
    cols.forEach((c) => {
      if (c in r && !isScalar(r[c])) nested[c] = true;
    });
  });
  cols = cols.filter((c) => !nested[c]).concat(cols.filter((c) => nested[c]));
  return (
    '<div class="tscroll"><table class="ntable"><thead><tr><th>#</th>' +
    cols.map((c) => `<th>${esc(c)}</th>`).join("") +
    "</tr></thead><tbody>" +
    rows
      .map(
        (r, i) =>
          '<tr><td class="idx">' +
          (i + 1) +
          "</td>" +
          cols
            .map((c) => `<td>${c in r ? valueHtml(r[c], c, depth + 1, mention) : ""}</td>`)
            .join("") +
          "</tr>",
      )
      .join("") +
    "</tbody></table></div>"
  );
}

export function objectTable(o, depth, mention) {
  const keys = Object.keys(o);
  if (!keys.length) return '<span class="faint">empty</span>';
  return (
    '<div class="tscroll"><table class="ntable"><tbody>' +
    keys
      .map((k) => `<tr><th>${esc(k)}</th><td>${valueHtml(o[k], k, depth + 1, mention)}</td></tr>`)
      .join("") +
    "</tbody></table></div>"
  );
}

export function propRows(a, mention) {
  const keys = Object.keys(a).sort();
  if (!keys.length) return '<div class="empty-panel">No additional properties.</div>';
  return keys
    .map((k) => {
      const isMono = /^(logical_name|content_hash|method)$/.test(k);
      return (
        '<div class="kv"><div class="k">' +
        esc(k) +
        '</div><div class="v' +
        (isMono ? " mono" : "") +
        '">' +
        valueHtml(a[k], k, 0, mention) +
        "</div></div>"
      );
    })
    .join("");
}

export function jsonHighlight(obj) {
  let s = esc(JSON.stringify(obj, null, 2));
  s = s.replace(/"([^"]+)":/g, '<span class="k">"$1"</span>:');
  s = s.replace(/: "([^"]*)"/g, ': <span class="s">"$1"</span>');
  s = s.replace(/: (-?\d+(\.\d+)?)/g, ': <span class="n">$1</span>');
  return s;
}

export function eventRow(e) {
  const detail = {};
  Object.keys(e).forEach((k) => {
    if (!/^(seq|index|operation|subject|dir|change|_links)$/.test(k)) detail[k] = e[k];
  });
  const text = JSON.stringify(detail);
  const parent = e._links?.parent?.href;
  const label = `#${e.seq}.${e.index}`;
  return (
    '<div class="ev">' +
    (parent
      ? '<button class="ev-seq" data-nav="' +
        esc(stripQuery(parent)) +
        '" title="Open the act">' +
        label +
        "</button>"
      : `<span class="ev-seq">${label}</span>`) +
    '<span class="ev-op" title="' +
    esc(e.operation) +
    '">' +
    esc(e.operation) +
    "</span>" +
    '<span class="ev-what"><span class="ev-kind"><b>' +
    esc(e.change) +
    '</b><span class="pill">' +
    esc(e.dir) +
    "</span></span>" +
    '<span title="' +
    esc(text) +
    '">' +
    esc(truncate(text, 220)) +
    "</span></span>" +
    "</div>"
  );
}
