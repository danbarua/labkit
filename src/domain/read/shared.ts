/** Every node carries a natural id; this is how a projection asks for it. */
export type Identified = { natural_id: string };

/**
 * Deduplicate by identity, never by wording.
 *
 * A `Set` of strings will not do: two records can say the same sentence and be
 * different records, so collapsing on text reports one where there are two.
 */
export function dedupeById<T>(items: T[], id: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [id(item), item])).values()];
}
