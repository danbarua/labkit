/**
 * agtype parsing + identifier validation. Replaces the vendored
 * src/db/pg-age.ts (Apache AGE's official Node.js driver) and the
 * `pg-age`/`antlr4ts` npm packages that came with it — reviewed as
 * reference implementations, not dependencies (see
 * `.claude/skills/postgres-age/SKILL.md` for that review).
 *
 * `parseAgtype` is a real recursive-descent parser, not a strip-and-
 * delegate-to-`JSON.parse` shortcut: agtype's `::tag` extended-type
 * annotations (`numeric`/`vertex`/`edge`/`path` — the complete set, per
 * `age/src/backend/utils/adt/agtype.c`'s output serializer) nest at any
 * depth, and AGE's internal graphid can exceed
 * `Number.MAX_SAFE_INTEGER` on graphs LabKit already creates today, not
 * hypothetically. See tests/agtype.test.ts for what's actually verified —
 * both the specific bugs this design avoids and the live-DB proof of the
 * precision issue — rather than re-narrating it here.
 */

// ---------------------------------------------------------------------------
// agtype value types
// ---------------------------------------------------------------------------

/** A Postgres arbitrary-precision `numeric` (AGTV_NUMERIC), kept as its exact decimal text — neither `number` nor `bigint` can represent it without risking precision loss. */
export interface AgtypeNumeric {
  kind: "numeric";
  raw: string;
}

/** A `::tag` this parser doesn't specifically recognize — see the file-level comment. `value` is still fully parsed. */
export interface AgtypeUnknown {
  kind: "unknown";
  tag: string;
  value: AgtypeJSON;
}

/** Any agtype value with no special extended-type meaning: AGTV_NULL/STRING/BOOL, an AGTV_INTEGER that fits safely in `Number`, AGTV_FLOAT, or a plain (untagged) object/array. */
export type AgtypeJSON =
  | null
  | boolean
  | string
  | number
  | bigint
  | AgtypeNumeric
  | AgtypeUnknown
  | AgtypeJSON[]
  | { [key: string]: AgtypeJSON };

export interface AgtypeVertex<T = Record<string, AgtypeJSON>> {
  kind: "vertex";
  id: number | bigint;
  label: string;
  properties: T;
}

export interface AgtypeEdge<T = Record<string, AgtypeJSON>> {
  kind: "edge";
  id: number | bigint;
  label: string;
  start_id: number | bigint;
  end_id: number | bigint;
  properties: T;
}

export interface AgtypePath {
  kind: "path";
  elements: Array<AgtypeVertex | AgtypeEdge>;
}

export interface AgtypeScalar<T = AgtypeJSON> {
  kind: "scalar";
  value: T;
}

/** What `parseAgtype` returns for a top-level `RETURN` result. */
export type AgtypeValue<T = Record<string, AgtypeJSON>> = AgtypeVertex<T> | AgtypeEdge<T> | AgtypePath | AgtypeScalar;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const IDENT_RE = /[A-Za-z0-9_]/;

export class AgtypeParseError extends Error {}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Recursive-descent scanner. `parseTagged()` is the single entry point used
 * everywhere — top-level `RETURN` result, an object's property value, an
 * array's element — so a `::tag` is resolved identically no matter how
 * deep it's nested; there is deliberately no separate "top-level only"
 * tag-handling path.
 */
class Scanner {
  private i = 0;
  constructor(private readonly s: string) {}

  private peek(): string | undefined {
    return this.s[this.i];
  }

  private fail(message: string): never {
    throw new AgtypeParseError(`${message} at position ${this.i} in: ${this.s}`);
  }

  private skipWhitespace(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
  }

  private expect(literal: string): void {
    if (this.s.startsWith(literal, this.i)) {
      this.i += literal.length;
    } else {
      this.fail(`expected "${literal}"`);
    }
  }

  /** Parses one value and resolves whatever `::tag` immediately follows it, if any. */
  parseTagged(): AgtypeJSON {
    this.skipWhitespace();
    // Numbers are handled as their own case (not via parseValue()) because
    // resolving a `::numeric` tag needs the exact source digits — by the
    // time a value has come back as a JS `number`, a non-integral numeric
    // may already have lost precision, so there's nothing left to recover
    // the exact text from. Capturing raw text alongside the parse, not
    // after it, is what actually fixes that rather than documenting it.
    if (this.looksLikeNumberStart()) return this.parseNumberTagged();

    const value = this.parseValue();
    const tag = this.tryParseTagSuffix();
    return tag === undefined ? value : this.applyTag(tag, value);
  }

  private looksLikeNumberStart(): boolean {
    const c = this.peek();
    if (c === undefined) return false;
    if (c === "-" || (c >= "0" && c <= "9")) return true;
    return this.s.startsWith("Infinity", this.i) || this.s.startsWith("NaN", this.i);
  }

  private tryParseTagSuffix(): string | undefined {
    if (this.s[this.i] === ":" && this.s[this.i + 1] === ":") {
      this.i += 2;
      const start = this.i;
      while (this.i < this.s.length && IDENT_RE.test(this.s[this.i]!)) this.i++;
      if (this.i === start) this.fail("expected identifier after ::");
      return this.s.slice(start, this.i);
    }
    return undefined;
  }

  private parseValue(): AgtypeJSON {
    this.skipWhitespace();
    const c = this.peek();
    if (c === undefined) this.fail("unexpected end of input");
    if (c === '"') return this.parseString();
    if (c === "{") return this.parseObject();
    if (c === "[") return this.parseArray();
    if (c === "t") return this.parseLiteral("true", true);
    if (c === "f") return this.parseLiteral("false", false);
    if (c === "n") return this.parseLiteral("null", null);
    this.fail(`unexpected character "${c}"`);
  }

  private parseLiteral<T>(literal: string, value: T): T {
    this.expect(literal);
    return value;
  }

  /** Delegates the decoded text to JSON.parse on just this token — correct escape/unicode handling without reimplementing it, safe because the boundaries are found by hand. */
  private parseString(): string {
    const start = this.i;
    this.expect('"');
    while (this.i < this.s.length) {
      const c = this.s[this.i]!;
      if (c === "\\") {
        this.i += 2; // skip the escaped character too, whatever it is
        continue;
      }
      if (c === '"') {
        this.i++;
        return JSON.parse(this.s.slice(start, this.i)) as string;
      }
      this.i++;
    }
    this.fail("unterminated string");
  }

  /**
   * Scans the full numeric token as text — `float8out` emits bare
   * `Infinity`/`-Infinity`/`NaN` (not valid JSON tokens) alongside ordinary
   * numbers, and a `.`/`e`/`E` in an ordinary token means AGTV_FLOAT
   * (always safe as a JS `number`, since `float8out` is IEEE double either
   * way). Captures the exact digit text *before* any conversion, so a
   * following `::numeric` tag can use it directly with zero precision lost
   * in between.
   */
  private parseNumberTagged(): AgtypeJSON {
    if (this.s.startsWith("Infinity", this.i)) return this.afterNumber(this.consume("Infinity", Infinity));
    if (this.s.startsWith("-Infinity", this.i)) return this.afterNumber(this.consume("-Infinity", -Infinity));
    if (this.s.startsWith("NaN", this.i)) return this.afterNumber(this.consume("NaN", NaN));

    const start = this.i;
    if (this.s[this.i] === "-") this.i++;
    while (this.i < this.s.length && this.s[this.i]! >= "0" && this.s[this.i]! <= "9") this.i++;
    let isFloat = false;
    if (this.s[this.i] === ".") {
      isFloat = true;
      this.i++;
      while (this.i < this.s.length && this.s[this.i]! >= "0" && this.s[this.i]! <= "9") this.i++;
    }
    if (this.s[this.i] === "e" || this.s[this.i] === "E") {
      isFloat = true;
      this.i++;
      if (this.s[this.i] === "+" || this.s[this.i] === "-") this.i++;
      while (this.i < this.s.length && this.s[this.i]! >= "0" && this.s[this.i]! <= "9") this.i++;
    }
    const text = this.s.slice(start, this.i);
    if (text === "" || text === "-") this.fail("invalid number");

    const tag = this.tryParseTagSuffix();
    if (tag === "numeric") return { kind: "numeric", raw: text };
    const value = isFloat ? Number(text) : this.toSafeInt(BigInt(text));
    return tag === undefined ? value : this.applyTag(tag, value);
  }

  private consume<T>(literal: string, value: T): T {
    this.i += literal.length;
    return value;
  }

  private afterNumber(value: number): AgtypeJSON {
    const tag = this.tryParseTagSuffix();
    return tag === undefined ? value : this.applyTag(tag, value);
  }

  private toSafeInt(big: bigint): number | bigint {
    return big >= MIN_SAFE_BIGINT && big <= MAX_SAFE_BIGINT ? Number(big) : big;
  }

  private parseObject(): AgtypeJSON {
    this.expect("{");
    const obj: Record<string, AgtypeJSON> = {};
    this.skipWhitespace();
    if (this.peek() === "}") {
      this.i++;
      return obj;
    }
    for (;;) {
      this.skipWhitespace();
      const key = this.parseString();
      this.skipWhitespace();
      this.expect(":");
      obj[key] = this.parseTagged();
      this.skipWhitespace();
      const next = this.peek();
      if (next === ",") {
        this.i++;
        continue;
      }
      if (next === "}") {
        this.i++;
        return obj;
      }
      this.fail('expected "," or "}"');
    }
  }

  private parseArray(): AgtypeJSON {
    this.expect("[");
    const arr: AgtypeJSON[] = [];
    this.skipWhitespace();
    if (this.peek() === "]") {
      this.i++;
      return arr;
    }
    for (;;) {
      // Each element's own tag (e.g. every vertex/edge in a path) is
      // resolved per-element here — a `::vertex`/`::edge` tag can only
      // ever belong to that one element, never the array as a whole.
      arr.push(this.parseTagged());
      this.skipWhitespace();
      const next = this.peek();
      if (next === ",") {
        this.i++;
        continue;
      }
      if (next === "]") {
        this.i++;
        return arr;
      }
      this.fail('expected "," or "]"');
    }
  }

  /**
   * Resolves a `::tag` against the value it followed — the one place tag
   * semantics live, used identically for the top-level `RETURN` result and
   * any nested property value or path element. A tag outside the closed
   * set AGE's serializer actually emits (confirmed via
   * `age/src/backend/utils/adt/agtype.c`'s `agtype_put_escaped_value`:
   * exactly `numeric`/`vertex`/`edge`/`path`, nothing else) degrades to a
   * visible `{ kind: "unknown", ... }` node rather than throwing — the set
   * is closed for the pinned AGE version, not a permanent constant.
   */
  private applyTag(tag: string, value: AgtypeJSON): AgtypeJSON {
    if (tag === "vertex" || tag === "edge") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) this.fail(`::${tag} on a non-object value`);
      return { kind: tag, ...(value as Record<string, AgtypeJSON>) } as unknown as AgtypeJSON;
    }
    if (tag === "path") {
      if (!Array.isArray(value)) this.fail("::path on a non-array value");
      // AGE only ever applies ::path to an array that already satisfies
      // this alternating shape (age.c's is_array_path) — a mismatch here
      // means a real invariant violation, not an unmodeled feature, so
      // this throws rather than degrading like an unrecognized tag would.
      if (value.length === 0 || value.length % 2 !== 1) this.fail("::path array must have an odd length");
      for (let i = 0; i < value.length; i++) {
        const expectKind = i % 2 === 0 ? "vertex" : "edge";
        const el = value[i] as { kind?: string };
        if (el.kind !== expectKind) this.fail(`::path element ${i} expected ${expectKind}, got ${el.kind ?? typeof el}`);
      }
      return { kind: "path", elements: value } as unknown as AgtypeJSON;
    }
    return { kind: "unknown", tag, value };
  }
}

/**
 * Parses one agtype `RETURN` result — a vertex, an edge, a path, or a bare
 * scalar (including one carrying a `::numeric`/unrecognized tag, wrapped in
 * `AgtypeScalar.value`).
 */
export function parseAgtype<T = Record<string, AgtypeJSON>>(raw: string): AgtypeValue<T> {
  const value = new Scanner(raw).parseTagged();
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const kind = (value as { kind?: string }).kind;
    if (kind === "vertex" || kind === "edge" || kind === "path") return value as unknown as AgtypeValue<T>;
  }
  return { kind: "scalar", value } as AgtypeValue<T>;
}

// ---------------------------------------------------------------------------
// Identifier validation
//
// Ported from Apache AGE's driver (VALID_GRAPH_NAME / VALID_LABEL_NAME /
// VALID_SQL_IDENTIFIER, index.ts:31-63) as understood, in-house logic — not
// imported. Reused here for the gap that review actually surfaced for
// LabKit: property KEYS, not just graph/label names — LabKit's primary use
// case is a per-project MCP server where an external agent supplies props.
//
// The two things this paragraph used to name are gone: `propPattern` in
// graph.ts, and `createNode<T extends Record<string, unknown>>()` accepting
// arbitrary keys at runtime. `createNode` is `<L extends NodeLabel>(label: L,
// props: NodePropsByLabel[L])` now, and the key validation happens in
// `buildPropertyClause()` below.
// ---------------------------------------------------------------------------

/** AGE graph names: dots/hyphens allowed in the middle, not at the ends. */
const VALID_GRAPH_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*[A-Za-z0-9_]$/;

/**
 * Everything else this file validates follows plain Postgres bare-identifier
 * rules: no dots or hyphens anywhere. One regex rather than upstream's three
 * near-duplicate ones, since (unlike graph names) none of these has a reason to
 * differ from the others for LabKit.
 *
 * What it actually guards, checked rather than listed from memory: property
 * keys, `cypher()` column names and column types, and edge property keys in
 * `graph.ts`. **Not** vertex or edge labels, which an earlier version of this
 * comment advertised — those are interpolated raw, and are safe because
 * `createNode`/`createEdge` dereference a label-keyed map (`NODE_TYPES`,
 * `EDGE_SCHEMA`) before the label reaches query text, so an unknown label
 * throws on the lookup. Incidental, not designed; worth knowing before anyone
 * adds a path that interpolates a label without that deref.
 */
const VALID_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateGraphName(name: string): void {
  if (name.length < 3 || name.length > 63 || !VALID_GRAPH_NAME.test(name)) {
    throw new Error(`invalid graph name: "${name}"`);
  }
}

/** Used for property keys and cypher() column names — see `VALID_IDENTIFIER`. */
export function validateIdentifier(name: string, context: string): void {
  if (name.length > 63 || !VALID_IDENTIFIER.test(name)) {
    throw new Error(`invalid ${context}: "${name}"`);
  }
}

// ---------------------------------------------------------------------------
// Cypher clause construction — typed replacements for the raw-string property
// patterns and hand-written AS clauses that used to interpolate unvalidated
// strings into query text. Those are gone; this is what replaced them.
// ---------------------------------------------------------------------------

export interface CypherColumn {
  name: string;
  /** Defaults to "agtype" — AGE's actual column type in a cypher() AS clause. */
  type?: string;
}

/** e.g. [{name: "n"}, {name: "comp"}] -> "n agtype, comp agtype" */
export function buildAsClause(columns: CypherColumn[]): string {
  if (columns.length === 0) throw new Error("cypher() requires at least one result column");
  return columns
    .map((col) => {
      validateIdentifier(col.name, "cypher() column name");
      // Rejected here rather than left to fail at runtime, because it does not
      // fail loudly: this clause is unquoted SQL, so Postgres folds `basisOut`
      // to `basisout`, while AGE keys the returned row by the name the Cypher
      // RETURN used. The column comes back present and NULL for every row --
      // no error, no warning, and a decoder reads it as "nothing matched".
      // That cost a wrong diagnosis once (S-3c); a name that cannot be written
      // costs nothing. Labels and property keys are unaffected: they are
      // quoted, and `Criterion` / `natural_id` stay exactly as they are.
      if (col.name !== col.name.toLowerCase()) {
        throw new Error(
          `cypher() column name must be lower-case: "${col.name}" would silently decode as null; ` +
            `alias it in the query instead (RETURN ${col.name} AS ${col.name.toLowerCase()})`,
        );
      }
      if (col.type) validateIdentifier(col.type, "cypher() column type");
      return `${col.name} ${col.type ?? "agtype"}`;
    })
    .join(", ");
}

/**
 * Validates every key before it reaches query text — the actual gap this file
 * exists to close — and returns a `{k: $k, ...}` clause.
 *
 * **`createNode()` uses this; `createEdge()` deliberately does not**, and says
 * why at its call site: it binds its parameters under a `p_` prefix, because an
 * edge property called `from` would otherwise rebind the source node's natural
 * id. This docstring used to name both as callers.
 */
export function buildPropertyClause(props: Record<string, unknown>): string {
  return Object.keys(props)
    .map((k) => {
      validateIdentifier(k, "property key");
      return `${k}: $${k}`;
    })
    .join(", ");
}

/**
 * Wraps a Cypher query in a dollar-quoted string literal for embedding in
 * the SQL `cypher(graph, $$ … $$, params)` call, choosing a delimiter that
 * can't collide with the query text.
 *
 * Ported from the Apache AGE driver's `cypherDollarQuote` (index.ts), with
 * one gap closed: upstream uses bare `$$` whenever the query doesn't
 * *contain* `$$`, but a query *ending* in `$` also breaks it —
 * `$$` + `RETURN n.a$` + `$$` lexes as body `RETURN n.a` followed by a
 * stray `$`. Both cases fall through to a tagged delimiter here.
 */
export function cypherDollarQuote(cypher: string): string {
  if (!cypher.includes("$$") && !cypher.endsWith("$")) return `$$${cypher}$$`;

  let tag = "cypher";
  let counter = 0;
  while (cypher.includes(`$${tag}$`)) tag = `cypher${counter++}`;
  return `$${tag}$${cypher}$${tag}$`;
}
