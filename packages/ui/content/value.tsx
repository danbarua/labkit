/**
 * What a tool was given or returned, drawn as its structure rather than as JSON: text as text, a
 * record as its fields, a list of flat records as a table.
 */

type Scalar = string | number | boolean | null;
type Json = Scalar | readonly Json[] | { readonly [key: string]: Json };

const isScalar = (value: unknown): value is Scalar =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `value`, or what it encodes when it is a string holding a JSON object or array. Tools commonly
 * return their result serialised; drawn as-is it reads as one escaped, quoted string. Only the
 * outermost layer is decoded: a string inside the result (a file's text, say) is content, even
 * when that content happens to be JSON.
 */
export function decode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed) as Json;
  } catch {
    return value;
  }
}

/** Whether two values say the same thing once each is decoded. */
export function sameValue(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(decode(a)) === JSON.stringify(decode(b));
  } catch {
    return false;
  }
}

const SHORT = 80;
const isShort = (value: unknown): boolean =>
  typeof value === "string" ? value.length <= SHORT && !value.includes("\n") : isScalar(value);

/**
 * The fields of a tool's input when every one is short enough to read on one line, else
 * `undefined`. A single field is its value alone: the tool's name already says what it is.
 */
export function inlineArguments(
  input: unknown,
): readonly [string | undefined, Scalar][] | undefined {
  const value = decode(input);
  if (isShort(value)) return [[undefined, value as Scalar]];
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 4 || !entries.every(([, v]) => isShort(v))) {
    return undefined;
  }
  if (entries.length === 1) return [[undefined, entries[0]?.[1] as Scalar]];
  return entries as [string, Scalar][];
}

/**
 * One line that says what a call was given, for its collapsed row: its short fields joined, or
 * failing that the first line of its first text field. `undefined` when nothing reads as a line.
 */
export function inputPreview(input: unknown): string | undefined {
  const args = inlineArguments(input);
  if (args !== undefined) {
    return args
      .map(([key, v]) => (key === undefined ? String(v) : `${key} ${String(v)}`))
      .join(" · ");
  }
  const value = decode(input);
  if (!isRecord(value)) return undefined;
  const text = Object.values(value).find((v): v is string => typeof v === "string" && v !== "");
  return text?.split("\n")[0];
}

function ScalarView({ value }: { value: Scalar }) {
  if (typeof value !== "string") return <code className="lk-scalar">{String(value)}</code>;
  if (value.includes("\n") || value.length > 200) return <pre className="lk-pre">{value}</pre>;
  return <span className="lk-text">{value}</span>;
}

/** The columns of a list whose every item is a record of scalars, else `undefined`. */
function tableColumns(items: readonly unknown[]): string[] | undefined {
  if (items.length === 0) return undefined;
  const columns = new Set<string>();
  for (const item of items) {
    if (!isRecord(item)) return undefined;
    for (const [key, v] of Object.entries(item)) {
      if (!isScalar(v)) return undefined;
      columns.add(key);
    }
  }
  return [...columns];
}

function ListView({ items }: { items: readonly unknown[] }) {
  if (items.length === 0) return <span className="lk-text lk-muted">none</span>;
  const columns = tableColumns(items);
  if (columns !== undefined) {
    return (
      <div className="lk-table-wrap">
        <table className="lk-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
              <tr key={i}>
                {columns.map((c) => {
                  const cell = (item as Record<string, unknown>)[c];
                  return <td key={c}>{cell === undefined ? "" : String(cell)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <ul className="lk-list">
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: items are positional
        <li key={i}>
          <Structure value={item} />
        </li>
      ))}
    </ul>
  );
}

function Structure({ value }: { value: unknown }) {
  if (isScalar(value)) return <ScalarView value={value} />;
  if (Array.isArray(value)) return <ListView items={value} />;
  if (!isRecord(value)) return <ScalarView value={String(value)} />;
  const entries = Object.entries(value);
  if (entries.length === 0) return <span className="lk-text lk-muted">empty</span>;
  if (entries.length === 1) return <Structure value={entries[0]?.[1]} />;
  return (
    <dl className="lk-fields">
      {entries.map(([key, v]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>
            <Structure value={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Any value a tool was given or returned, decoded once and drawn by its shape. */
export function ValueView({ value }: { value: unknown }) {
  return (
    <div className="lk-value">
      <Structure value={decode(value)} />
    </div>
  );
}

/** A tool's short input on one line: `path .`, or `path package.json · line 1 · limit 10`. */
export function ArgumentsLine({ args }: { args: readonly [string | undefined, Scalar][] }) {
  return (
    <div className="lk-args">
      {args.map(([key, v], i) => (
        <span key={key ?? i}>
          {key === undefined ? null : <span className="lk-args-key">{key}</span>}
          <code className="lk-args-value">{String(v)}</code>
        </span>
      ))}
    </div>
  );
}
