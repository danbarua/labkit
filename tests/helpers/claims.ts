/**
 * Picking a claim out of what `recordAnalysis` returned.
 *
 * A test names a proposition because that is what a *person* has in mind. The
 * resolution happens here, over the claims the verb already handed back — no
 * query, no search, and nothing in `src/domain` is asked to guess which claim
 * was meant. That is the same shape the CLI needs at the human boundary: text
 * in, a handle out, and the domain only ever sees the handle.
 */

import type { ClaimRef, ConcludedClaim } from "../../src/domain";

/** The claim asserting this proposition, from one analysis's results. */
export function claimOf(claims: ConcludedClaim[], proposition: string): ClaimRef {
  const found = claims.filter((c) => c.asserts === proposition);
  if (found.length === 0)
    throw new Error(
      `this analysis concluded nothing about "${proposition}" — it concluded ${claims
        .map((c) => `"${c.asserts}"`)
        .join(", ")}`,
    );
  // One analysis asserting the same sentence twice would make this ambiguous,
  // and no verb allows it. Refuse rather than pick, the way the domain does.
  if (found.length > 1) throw new Error(`this analysis concluded "${proposition}" more than once`);
  return found[0]!.claim;
}

/**
 * The claim asserting a proposition, resolved through the read surface.
 *
 * The same seam the CLI uses: a person (or a test) names a sentence, the domain
 * only ever sees a handle. Refuses rather than picking when two lines of
 * enquiry assert the same sentence — which is exactly what a caller must be
 * made to notice.
 */
export async function claimNamed(
  read: { claimsAsserting(p: string): Promise<ConcludedClaim[]> },
  proposition: string,
): Promise<ClaimRef> {
  const found = await read.claimsAsserting(proposition);
  if (found.length === 0) throw new Error(`nothing claims "${proposition}"`);
  if (found.length > 1)
    throw new Error(`"${proposition}" is claimed ${found.length} times; name one`);
  return found[0]!.claim;
}

/** `whySupported`, given a proposition — resolves the handle first. */
export async function whyOf<T>(
  read: {
    claimsAsserting(p: string): Promise<ConcludedClaim[]>;
    whySupported(c: ClaimRef): Promise<T>;
  },
  proposition: string,
): Promise<T> {
  return read.whySupported(await claimNamed(read, proposition));
}
