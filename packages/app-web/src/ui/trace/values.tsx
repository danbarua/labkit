/**
 * Property values, JSON and event rows as the Trace Console draws them. Prose in a value goes
 * through `prose`, which the page supplies, so handles in it can become links.
 */

import type { ReactNode } from "react";
import {
  abbreviation,
  fmtDate,
  type HalDocument,
  isDateKey,
  keyOf,
  truncate,
  typeColour,
} from "./hal";

export type Prose = (text: string) => ReactNode;

/** A record type's chip: its abbreviation, or `text`, on the type's colour. */
export function Badge({ type, text }: { type: string | undefined; text?: string }) {
  return (
    <span className="badge" style={{ background: typeColour(type) }}>
      {text ?? (type === undefined ? "?" : abbreviation(type))}
    </span>
  );
}

const isScalar = (v: unknown) => v === null || typeof v !== "object";
const isPlain = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Deeper than this, a value is compact JSON: a table of tables of tables is no easier to read. */
const MAX_TABLE_DEPTH = 3;

function CompactJson({ v }: { v: unknown }) {
  const text = JSON.stringify(v);
  return (
    <span className="mono faint" title={text}>
      {truncate(text, 200)}
    </span>
  );
}

/**
 * A property value. A string is prose, or a date under a key ending `_at`. A list of scalars is a
 * run of chips, a list of objects a table with a column per key, and an object a table of its keys.
 */
export function Value({
  v,
  k,
  depth,
  prose,
}: {
  v: unknown;
  k: string;
  depth: number;
  prose: Prose;
}) {
  if (v === null || v === undefined) return <span className="faint">—</span>;
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="faint">none</span>;
    if (v.every(isScalar))
      return (
        <span className="chips">
          {v.map((x, i) => (
            <span key={i} className="chip">
              <Value v={x} k={k} depth={depth + 1} prose={prose} />
            </span>
          ))}
        </span>
      );
    return depth >= MAX_TABLE_DEPTH ? (
      <CompactJson v={v} />
    ) : (
      <ArrayTable rows={v} depth={depth} prose={prose} />
    );
  }
  if (typeof v === "object")
    return depth >= MAX_TABLE_DEPTH ? (
      <CompactJson v={v} />
    ) : (
      <ObjectTable o={v as Record<string, unknown>} depth={depth} prose={prose} />
    );
  if (typeof v === "string") return <>{isDateKey(k) ? fmtDate(v) : prose(v)}</>;
  return <>{String(v)}</>;
}

function ArrayTable({ rows, depth, prose }: { rows: unknown[]; depth: number; prose: Prose }) {
  if (!rows.every(isPlain))
    return (
      <div className="nest">
        {rows.map((x, i) => (
          <div key={i}>
            <Value v={x} k="" depth={depth + 1} prose={prose} />
          </div>
        ))}
      </div>
    );
  const cols: string[] = [];
  for (const row of rows) for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);
  // Columns that hold nested values go last, so the plain ones stay narrow and side by side.
  const nested = new Set(cols.filter((c) => rows.some((r) => c in r && !isScalar(r[c]))));
  const ordered = [...cols.filter((c) => !nested.has(c)), ...cols.filter((c) => nested.has(c))];
  return (
    <div className="tscroll">
      <table className="ntable">
        <thead>
          <tr>
            <th>#</th>
            {ordered.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="idx">{i + 1}</td>
              {ordered.map((c) => (
                <td key={c}>
                  {c in r ? <Value v={r[c]} k={c} depth={depth + 1} prose={prose} /> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ObjectTable({
  o,
  depth,
  prose,
}: {
  o: Record<string, unknown>;
  depth: number;
  prose: Prose;
}) {
  const keys = Object.keys(o);
  if (keys.length === 0) return <span className="faint">empty</span>;
  return (
    <div className="tscroll">
      <table className="ntable">
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <th>{k}</th>
              <td>
                <Value v={o[k]} k={k} depth={depth + 1} prose={prose} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Properties shown in a monospace face: identifiers and code, not prose. */
const MONO_KEYS = new Set(["logical_name", "content_hash", "method"]);

/** A resource's properties, one row each, in name order. */
export function PropRows({ attrs, prose }: { attrs: Record<string, unknown>; prose: Prose }) {
  const keys = Object.keys(attrs).sort();
  if (keys.length === 0) return <div className="empty-panel">No additional properties.</div>;
  return (
    <>
      {keys.map((k) => (
        <div key={k} className="kv">
          <div className="k">{k}</div>
          <div className={MONO_KEYS.has(k) ? "v mono" : "v"}>
            <Value v={attrs[k]} k={k} depth={0} prose={prose} />
          </div>
        </div>
      ))}
    </>
  );
}

const JSON_TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** A document as indented JSON, with its keys, strings and numbers coloured. */
export function JsonView({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2) ?? "";
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(JSON_TOKEN)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [whole, string, colon, number] = m;
    if (string !== undefined && colon !== undefined)
      parts.push(
        <span key={m.index} className="k">
          {string}
        </span>,
        colon,
      );
    else
      parts.push(
        <span key={m.index} className={string !== undefined ? "s" : "n"}>
          {string ?? number}
        </span>,
      );
    last = m.index + whole.length;
  }
  parts.push(text.slice(last));
  return <pre className="jsonview">{parts}</pre>;
}

/** The members of an event shown in its own columns, left out of its detail. */
const EVENT_COLUMNS = new Set(["seq", "index", "operation", "subject", "dir", "change", "_links"]);

/**
 * One change in a record's history: its position in the log, which opens the act that made it,
 * the operation, the kind of change and its direction, and the rest as JSON.
 */
export function EventRow({ event, onOpen }: { event: HalDocument; onOpen: (key: string) => void }) {
  const detail: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) if (!EVENT_COLUMNS.has(k)) detail[k] = v;
  const text = JSON.stringify(detail);
  const parent = event._links?.parent;
  const parentHref = Array.isArray(parent) ? parent[0]?.href : parent?.href;
  const label = `#${String(event.seq)}.${String(event.index)}`;
  const operation = String(event.operation);
  return (
    <div className="ev">
      {parentHref === undefined ? (
        <span className="ev-seq">{label}</span>
      ) : (
        <button
          type="button"
          className="ev-seq"
          title="Open the act"
          onClick={() => onOpen(keyOf(parentHref))}
        >
          {label}
        </button>
      )}
      <span className="ev-op" title={operation}>
        {operation}
      </span>
      <span className="ev-what">
        <span className="ev-kind">
          <b>{String(event.change)}</b>
          <span className="pill">{String(event.dir)}</span>
        </span>
        <span title={text}>{truncate(text, 220)}</span>
      </span>
    </div>
  );
}
