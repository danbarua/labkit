/**
 * Property values, JSON and event rows as the Trace Console draws them. Prose in a value goes
 * through `prose`, which the page supplies, so handles in it can become links.
 */

import { FileTextIcon, GitCommitIcon, type Icon } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";
import {
  abbreviation,
  fmtDate,
  type HalDocument,
  isDateKey,
  keyOf,
  linksOf,
  truncate,
  typeColour,
} from "./hal";

export type Prose = (text: string) => ReactNode;

/** A record type's chip: its abbreviation, or `text`, on the type's colour. */
/** The types a badge draws as an icon, the one the sidebar's explorers draw them with, not as letters. */
const TYPE_ICON: Readonly<Record<string, Icon>> = {
  File: FileTextIcon,
  Commit: GitCommitIcon,
};

export function Badge({ type, text }: { type: string | undefined; text?: string }) {
  const Glyph = text === undefined && type !== undefined ? TYPE_ICON[type] : undefined;
  return (
    <span
      className={Glyph === undefined ? "badge" : "badge icon"}
      style={{ background: typeColour(type) }}
      {...(Glyph === undefined ? {} : { title: type, "aria-label": type })}
    >
      {Glyph !== undefined ? (
        <Glyph aria-hidden="true" />
      ) : (
        (text ?? (type === undefined ? "?" : abbreviation(type)))
      )}
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

/** The members of an event shown in its own columns or as its chips, left out of its detail. */
const EVENT_COLUMNS = new Set(["seq", "index", "operation", "subject", "dir", "change", "_links"]);

/** The members of a change that name a record, each linked under its own name. */
const ENDS = ["id", "from", "to"] as const;

/**
 * A record a change names, as a chip on its type's colour that opens it. The open record,
 * `current`, is marked rather than linked; a handle the event links no record for is drawn dashed.
 */
function EndChip({
  event,
  field,
  current,
  onOpen,
}: {
  event: HalDocument;
  field: (typeof ENDS)[number];
  current: string | undefined;
  onOpen: (key: string) => void;
}) {
  const handle = String(event[field]);
  const link = linksOf(event, field)[0];
  if (link === undefined) return <span className="mention unknown">{handle}</span>;
  const key = keyOf(link.href);
  const style = { "--mention": typeColour(link.type) } as CSSProperties;
  return key === current ? (
    <span className="mention current" style={style} aria-current="true" title={link.type}>
      {handle}
    </span>
  ) : (
    <button
      type="button"
      className="mention"
      style={style}
      title={link.type}
      onClick={() => onOpen(key)}
    >
      {handle}
    </button>
  );
}

/**
 * One change in a record's history: its position in the log, which opens the act that made it,
 * the operation, and the change on one line. An edge is its two ends either side of its label; a
 * node, or a change to one, is the record it names, whose chip's colour and title give its type.
 * Each record is a chip that opens it, except `current`, the open one. The change's other members,
 * such as `props`, follow as JSON; a change that names no record is all JSON.
 */
export function EventRow({
  event,
  current,
  onOpen,
}: {
  event: HalDocument;
  current?: string;
  onOpen: (key: string) => void;
}) {
  const edge = typeof event.from === "string" && typeof event.to === "string";
  const node = !edge && typeof event.id === "string";
  // A node's label is its type, which its chip gives; an edge's is drawn between its ends.
  const shown = new Set<string>([...EVENT_COLUMNS, ...(edge || node ? [...ENDS, "label"] : [])]);
  const rest = Object.fromEntries(Object.entries(event).filter(([k]) => !shown.has(k)));
  const keys = Object.keys(rest);
  const detail =
    keys.length === 0 ? undefined : keys.length === 1 && "props" in rest ? rest.props : rest;
  const text = detail === undefined ? undefined : JSON.stringify(detail);
  const parentHref = linksOf(event, "parent")[0]?.href;
  const label = `#${String(event.seq)}.${String(event.index)}`;
  const operation = String(event.operation);
  const chip = (field: (typeof ENDS)[number]) => (
    <EndChip event={event} field={field} current={current} onOpen={onOpen} />
  );
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
          {edge ? (
            <>
              {chip("from")}
              <span className="ev-label">{String(event.label)}</span>
              {chip("to")}
            </>
          ) : node ? (
            chip("id")
          ) : null}
        </span>
        {text === undefined ? null : <span title={text}>{truncate(text, 220)}</span>}
      </span>
    </div>
  );
}
