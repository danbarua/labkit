/**
 * Derived facts, as named nodes over Cypher clauses.
 *
 * **The read side classifies things** — is this question established, is this
 * check passed, does this claim stand — and every classification is a fold over
 * rows from a graph query. Written by hand, each one is a query string, a
 * grouping loop and a chain of `if`s, and the parts have no names. Three things
 * follow from that, all of them observed rather than predicted:
 *
 * - **The same fact gets written twice and drifts.** `whatIsKnown` and
 *   `whatWasKnown` both decide "is this answer promoted"; only one of them was
 *   corrected when the rule changed.
 * - **A constraint gets absorbed once and forgotten.** AGE has no edge
 *   alternation, so "the claim this evidence bears on" needs two clauses and a
 *   coalesce (`SUPPORTS`, then `CHALLENGES`). Miss the second and nothing
 *   fails — the row is simply not there. That is the negative-result hole, and
 *   it was reintroduced *by the author of the fix for it*, twenty minutes
 *   later, in a spike written to demonstrate the problem.
 * - **Two readers select differently and disagree.** `whySupported` selected
 *   claims by proposition wording within an enquiry; the survey selected by
 *   handle. Two analyses in one enquiry concluding the same sentence are two
 *   `Claim` nodes, so the two verbs gave contradictory answers about one
 *   claim's standing — demonstrated, not argued.
 *
 * A fact names all three: the clause, the fold, and the grain. Every reader of
 * a fact is right or wrong **together**, which is the property the hand-written
 * version cannot have.
 *
 * See `spikes/fact-graph/` for the experiment this came from and what it cost.
 */

import type { ColumnDecoder } from "../db/cypher";

/**
 * What a fact is computed **per** — its subject.
 *
 * A survey answers per question; a check answers per criterion; withdrawal
 * answers per evaluation. Returning `null` means the row does not contribute,
 * which is how an `OPTIONAL MATCH` that found nothing stays out of the fold.
 */
export type Grain = (row: Row) => string | null;

/** A decoded row. Untyped by design — a fact's `fold` is where shape is asserted. */
export type Row = Record<string, unknown>;

/**
 * A fact read straight from rows.
 *
 * `empty` is a **factory, not a value**, and that is load-bearing: a shared
 * mutable accumulator lets one subject's rows leak into the next subject's
 * answer. Invisible with one subject, wrong with two, and it happened.
 */
export interface Leaf<T> {
  name: string;
  grain: Grain;
  /**
   * Facts whose clauses must appear **before** this one, because this clause
   * reads a variable they bind.
   *
   * Not consumed by {@link per} — a leaf folds rows, it does not read other
   * facts' values. This exists only so {@link compose} includes and orders the
   * clauses, and it is the difference between a dependency a reader can see and
   * one carried by a variable name matching across two string literals. The
   * first version of this module had no such field, and the composed query
   * silently omitted a clause whose variable another clause referenced: no
   * error, just a column that was never returned and a fact that folded to
   * `null` for every subject.
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
 *
 * `Fact<unknown>` will not do: `fold` takes its accumulator, so a fact is
 * **contravariant** in `T` and `Leaf<{cited, standing}>` is not assignable to
 * `Leaf<unknown>`. What is wanted is an existential — *some* `T` — which
 * TypeScript has no syntax for. `any` is the standard encoding of that gap and
 * is confined to this alias, so every use of it is one declaration a reader can
 * check rather than a habit spread across the file.
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
 *
 * `anchor` is what the report is about — `MATCH (q:Question)` for a survey,
 * `MATCH (cl:Claim {natural_id: $id})` for one claim. Everything after it is
 * contributed by the facts, so a clause is written once and reused by every
 * report that needs the fact.
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
 *
 * **The grain rule**, found by getting it wrong: a dependency at the *same*
 * grain is one value; only a *finer* grain fans out into a map. In hand-written
 * code that relationship is carried by which loop you happen to be inside,
 * which is invisible — and is how one reader came to group by criterion alone
 * and merge two claims' verdicts.
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
      // Reference equality on a function, which holds only because every grain
      // is a shared exported constant. A fact written `grain: (r) => …` inline
      // would be semantically identical, compare unequal, and silently fan a
      // same-grain dependency out into a Map where the consumer expects one
      // value. The type system cannot carry this; the convention is that grains
      // are named and shared, never written at the use site.
      needs[dep.name] = dep.grain === f.grain ? [...sub.values()][0] : sub;
    }
    out.set(key, f.from(needs) as T);
  }
  return out;
}
