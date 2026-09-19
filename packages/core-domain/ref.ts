/**
 * Handle identity — kinds, prefixes, and `ref()`. A leaf: nothing here imports
 * events, commands, or reports, so those layers can brand a handle without a cycle.
 */

import { labelForNaturalId, type NodeLabel } from "@labkit/core-db/domain";

declare const KIND: unique symbol;

/**
 * A handle a caller passes back in — LabKit's short natural id, and nothing else. Never AGE's
 * internal graphid.
 */
export type Ref<K extends string> = string & { readonly [KIND]: K };

/**
 * Which node label each handle kind names.
 */
export const LABEL_BY_KIND = {
  question: "Question",
  enquiry: "LineOfEnquiry",
  unit: "EvidenceUnit",
  evidence: "Evidence",
  claim: "Claim",
  decision: "Decision",
  criterion: "Criterion",
  evaluation: "CriterionEvaluation",
  gate: "Gate",
  review: "Review",
  observations: "Artefact",
  analysis: "Computation",
  work: "Task",
  note: "Note",
} satisfies Record<string, NodeLabel>;

/**
 * Every kind a handle can name — the closed union `why` dispatches on.
 */
export type Kind = keyof typeof LABEL_BY_KIND;

/**
 * A handle of any kind — every {@link Ref} this record can mint, in one type.
 */
export type AnyRef = Ref<Kind>;

/**
 * Builds a handle, and **refuses one whose id does not match its kind**.
 */
export function isRefOfKind(kind: string, id: string): boolean {
  // Widened, not narrowed: `LABEL_BY_KIND`'s literal keys (needed so `Kind` is
  // closed, see above) would otherwise refuse to be indexed by the caller's
  // plain `string`. This assignment is sound in a way a cast to `Kind` would
  // not be -- it is not claiming `kind` IS one of the closed keys, only asking
  // an object typed for arbitrary string keys, same runtime lookup either way.
  const table: Record<string, NodeLabel> = LABEL_BY_KIND;
  const expected = table[kind];
  if (!expected) return true;
  try {
    return labelForNaturalId(id) === expected;
  } catch {
    // An unrecognised prefix is not this kind either, and at the MCP boundary
    // that has to be a `false` rather than a throw -- zod turns a `false` into
    // a message naming the field, and a throw into a crash.
    return false;
  }
}

export const ref = <K extends string>(kind: K, id: string): Ref<K> => {
  if (!isRefOfKind(kind, id)) {
    const table: Record<string, NodeLabel> = LABEL_BY_KIND;
    throw new Error(`${kind} handle expected a ${table[kind]} id, got "${id}"`);
  }
  return id as Ref<K>;
};

/**
 * The inverse of {@link LABEL_BY_KIND} — a label's research-concept kind, where one exists. Not
 * every label has one (`EvidenceUnit` and `Computation` do not name a kind a caller would type
 * a verb argument as), so this is partial, not total.
 */
export const KIND_BY_LABEL: { readonly [L in NodeLabel]?: Kind } = Object.fromEntries(
  Object.entries(LABEL_BY_KIND).map(([kind, label]) => [label, kind]),
);

/**
 * The kind a handle's own prefix names, or `null` for text that is not shaped like one of this
 * record's mintable ids at all.
 */
export function kindOf(id: string): Kind | null {
  try {
    return KIND_BY_LABEL[labelForNaturalId(id)] ?? null;
  } catch {
    return null;
  }
}
