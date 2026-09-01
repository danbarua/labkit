/**
 * Typed execution of Cypher against one AGE graph.
 *
 * The seam this closes: AGE returns every column as agtype *text*, and
 * `cypher()` needs its result columns declared at the SQL level because it
 * cannot infer them. Carried by hand that is two halves per call site — a
 * literal `"(e agtype, comp agtype)"` matching the RETURN arity, and a
 * `parseAgtype()` plus kind-narrowing dance. Here a column is declared once, as
 * a decoder, and both halves fall out of it.
 *
 * Decoding happens here, at the query boundary — deliberately not via `pg`'s
 * `types.setTypeParser()` global registry, which is what the Apache AGE
 * driver's `setAGETypes()` does. That registry is process-global and invisible
 * to any code path holding a raw PGlite instance, so it takes effect in
 * production and not in tests.
 */

import {
  parseAgtype,
  buildAsClause,
  cypherDollarQuote,
  validateGraphName,
  type AgtypeValue,
  type AgtypeVertex,
  type AgtypeEdge,
  type AgtypePath,
  type AgtypeJSON,
} from "./agtype";
import type { LabKitDB } from "./backend";

// ---------------------------------------------------------------------------
// Column decoders
// ---------------------------------------------------------------------------

/**
 * Turns one column's raw agtype text into a typed value. `null` is passed
 * through rather than parsed — an unmatched `OPTIONAL MATCH` column arrives
 * as a SQL NULL, so only `optional()` accepts it; every other decoder treats
 * it as a mismatch, which is what makes a missing row loud instead of silent.
 */
export type ColumnDecoder<T> = (raw: string | null, column: string) => T;

function decode(raw: string | null, column: string): AgtypeValue {
  if (raw === null)
    throw new Error(
      `column "${column}" was NULL; wrap its decoder in optional() if that's expected`,
    );
  return parseAgtype(raw);
}

function expectKind<K extends AgtypeValue["kind"]>(
  kind: K,
  raw: string | null,
  column: string,
): Extract<AgtypeValue, { kind: K }> {
  const value = decode(raw, column);
  if (value.kind !== kind)
    throw new Error(`expected a ${kind} in column "${column}", got ${value.kind}`);
  return value as Extract<AgtypeValue, { kind: K }>;
}

/** A vertex column, unwrapped to its properties — the common case. */
export function vertexProps<P>(): ColumnDecoder<P> {
  return (raw, column) => (expectKind("vertex", raw, column) as AgtypeVertex<P>).properties;
}

/** An edge column, unwrapped to its properties. */
export function edgeProps<P>(): ColumnDecoder<P> {
  return (raw, column) => (expectKind("edge", raw, column) as AgtypeEdge<P>).properties;
}

/** A vertex column with its AGE identity intact (`id`, `label`) — prefer `vertexProps()` unless you need those. */
export function vertex<P>(): ColumnDecoder<AgtypeVertex<P>> {
  return (raw, column) => expectKind("vertex", raw, column) as AgtypeVertex<P>;
}

/** An edge column with its AGE identity intact (`id`, `label`, `start_id`, `end_id`). */
export function edge<P>(): ColumnDecoder<AgtypeEdge<P>> {
  return (raw, column) => expectKind("edge", raw, column) as AgtypeEdge<P>;
}

/** A `MATCH p = (…)` path column. */
export function path(): ColumnDecoder<AgtypePath> {
  return (raw, column) => expectKind("path", raw, column) as AgtypePath;
}

/** A bare scalar column — `RETURN count(*)`, `RETURN n.name`, and the like. */
export function scalar<T extends AgtypeJSON = AgtypeJSON>(): ColumnDecoder<T> {
  return (raw, column) => (expectKind("scalar", raw, column) as { value: AgtypeJSON }).value as T;
}

/** The parsed value with its kind un-narrowed — for code asserting on what AGE actually returned. */
export function agtypeValue(): ColumnDecoder<AgtypeValue> {
  return (raw, column) => decode(raw, column);
}

/**
 * Makes a column nullable. Covers both shapes a missing value can arrive in:
 * a SQL NULL (what an unmatched `OPTIONAL MATCH` produces today) and an
 * agtype `null` scalar (what a `RETURN`ed absent *property* produces) — the
 * latter would otherwise reach the inner decoder and throw a kind mismatch.
 */
export function optional<T>(inner: ColumnDecoder<T>): ColumnDecoder<T | null> {
  return (raw, column) => {
    if (raw === null) return null;
    const parsed = parseAgtype(raw);
    if (parsed.kind === "scalar" && parsed.value === null) return null;
    return inner(raw, column);
  };
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

/** Result columns as `{ returnedName: decoder }` — the key must match the name in the query's RETURN. */
export type RowSpec = Record<string, ColumnDecoder<unknown>>;

/** The row type a `RowSpec` produces, with each column's decoder resolved to its output. */
export type DecodedRow<S extends RowSpec> = {
  [K in keyof S]: S[K] extends ColumnDecoder<infer T> ? T : never;
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Runs Cypher against one graph. Scoped to a single `graphName` for its
 * lifetime — validated once in the constructor rather than on every call,
 * since it's interpolated into the SQL of every query this instance issues.
 */
export class CypherRunner {
  constructor(
    private readonly db: LabKitDB,
    private readonly graphName: string,
  ) {
    validateGraphName(graphName);
  }

  /**
   * Runs a query and decodes each row. `params` are bound as agtype and
   * referenced as `$name` inside the query text, so caller-supplied values
   * are never interpolated into SQL.
   */
  async query<S extends RowSpec>(
    cypher: string,
    columns: S,
    params?: Record<string, unknown>,
  ): Promise<DecodedRow<S>[]> {
    const names = Object.keys(columns);
    const rows = await this.run<Record<string, string | null>>(
      cypher,
      buildAsClause(names.map((name) => ({ name }))),
      params,
    );

    return rows.map((row) => {
      const decoded: Record<string, unknown> = {};
      for (const name of names) {
        decoded[name] = (columns[name] as ColumnDecoder<unknown>)(row[name] ?? null, name);
      }
      return decoded as DecodedRow<S>;
    });
  }

  /**
   * Runs a statement with no `RETURN` (`CREATE`, `SET`, …). AGE requires an
   * `AS` clause on every `cypher()` call regardless of whether the query
   * produces rows, so one is supplied here and its (empty) result discarded —
   * that requirement is AGE's, and callers shouldn't have to know it.
   */
  async execute(cypher: string, params?: Record<string, unknown>): Promise<void> {
    await this.run(cypher, buildAsClause([{ name: "unused" }]), params);
  }

  private async run<T>(
    cypher: string,
    columnList: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const quoted = cypherDollarQuote(cypher);
    const sql = params
      ? `SELECT * FROM ag_catalog.cypher('${this.graphName}', ${quoted}, $1) AS (${columnList});`
      : `SELECT * FROM ag_catalog.cypher('${this.graphName}', ${quoted}) AS (${columnList});`;
    const res = await this.db.query<T>(sql, params ? [JSON.stringify(params)] : undefined);
    return res.rows;
  }
}
