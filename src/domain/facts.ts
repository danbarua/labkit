/**
 * Derived facts, as named nodes over Cypher clauses.
 */

import type { ColumnDecoder } from "../db/cypher";

/**
 * What a fact is computed **per** — its subject.
 */
export type Grain = (row: Row) => string | null;

/** A decoded row. Untyped by design — a fact's `fold` is where shape is asserted. */
export type Row = Record<string, unknown>;

/**
 * A fact read straight from rows.
 */
export interface Leaf<T> {
  name: string;
  grain: Grain;
  /**
   * Facts whose clauses must appear **before** this one, because this clause reads a variable
   * they bind.
   */
  needs?: SomeFact[];
  /** Cypher contributed to one composed query, never run on its own. */
  clause: string;
  /** What the clause returns, with a decoder each. */
  yields: Record<string, ColumnDecoder<unknown>>;
  empty: () => T;
  fold: (accumulator: T, row: Row) => T;
}

/** A fact computed from other facts, adding no clause of its own. */
export interface Derived<T> {
  name: string;
  grain: Grain;
  needs: SomeFact[];
  from: (needs: Record<string, unknown>) => T;
}

export type Fact<T = unknown> = Leaf<T> | Derived<T>;

/**
 * A fact whose result type is not known to the holder.
 */
export type SomeFact = Fact<any>;

function isLeaf<T>(f: Fact<T>): f is Leaf<T> {
  return "fold" in f;
}

/** Every clause-bearing fact reachable from `f`, deduplicated by name. */
export function leavesOf(f: SomeFact, seen = new Map<string, Leaf<unknown>>()): Leaf<unknown>[] {
  // Dependencies first, so a clause that reads another's variable comes after
  // the one that binds it. Insertion order is the emitted order.
  for (const n of f.needs ?? []) leavesOf(n, seen);
  if (isLeaf(f)) seen.set(f.name, f);
  return [...seen.values()];
}

/**
 * One query for every fact a report needs, and its decoders.
 */
export function compose(
  anchor: string,
  root: SomeFact,
  anchorYields: Record<string, ColumnDecoder<unknown>>,
): { cypher: string; decoders: Record<string, ColumnDecoder<unknown>> } {
  const leaves = leavesOf(root);
  const decoders = { ...anchorYields };
  for (const l of leaves) Object.assign(decoders, l.yields);
  const cypher = [
    anchor,
    ...leaves.map((l) => l.clause.trim()),
    `RETURN ${Object.keys(decoders).join(", ")}`,
  ].join("\n");
  return { cypher, decoders };
}

/**
 * Evaluate a fact, once per distinct subject, over the rows it applies to.
 */
export function per<T>(f: Fact<T>, rows: readonly Row[]): Map<string, T> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const key = f.grain(row);
    if (key === null) continue;
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }

  const out = new Map<string, T>();
  for (const [key, group] of grouped) {
    if (isLeaf(f)) {
      out.set(key, group.reduce(f.fold, f.empty()) as T);
      continue;
    }
    const needs: Record<string, unknown> = {};
    for (const dep of f.needs) {
      const sub = per(dep, group);
      // Reference equality on a function, which holds only because every grain is a shared
      // exported constant. A fact written `grain: (r) => …` inline would be semantically
      // identical, compare unequal, and silently fan a same-grain dependency out into a Map
      // where the consumer expects one value.
      needs[dep.name] = dep.grain === f.grain ? [...sub.values()][0] : sub;
    }
    out.set(key, f.from(needs) as T);
  }
  return out;
}
