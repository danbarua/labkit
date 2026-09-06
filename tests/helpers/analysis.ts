/**
 * A run and every conclusion drawn from it, or a replacement and the findings
 * it supersedes, in one call — for a test that wants a run with its findings
 * already on it rather than typing the constituent verb calls out by hand.
 *
 * Each takes the surface and an input object and returns the handles it
 * minted, the same shape every fragment used.
 */

import type {
  AnalysisRef,
  ConcludedClaim,
  Conclusion,
  CriterionRef,
  EnquiryRef,
  InputRef,
  WorkRef,
  ReviewRef,
  ReplacementReport,
} from "../../src/domain/report";
import type { ResearchWrites, ReplacementConclusion } from "../../src/domain";

/** Every fragment writes through the public surface and nothing else. */
type W = ResearchWrites;

/**
 * A run and every conclusion drawn from it, in one call.
 *
 * **This is where the array lives.** `recordAnalysis` on the surface records
 * the run and takes no conclusions, because a conclusion is its own act. A
 * caller that wants a run with its findings already on it wants a move rather
 * than a primitive, which is what a fragment is.
 *
 * Named for the verb and taking the surface first, so a call site reads
 * `recordAnalysis(session, x)`.
 *
 * The event stream is the same either way: one `recordAnalysis` and one
 * `conclude` per conclusion, exactly what a person typing the two commands
 * produces. See `TenantGraph.inMintScope`.
 */
export async function recordAnalysis(
  w: W,
  input: {
    enquiry: EnquiryRef;
    method: string;
    from: InputRef[];
    concludes: readonly Conclusion[];
    heldTo?: CriterionRef[];
    implementing?: WorkRef;
  },
): Promise<{ analysis: AnalysisRef; claims: ConcludedClaim[] }> {
  const { analysis } = await w.recordAnalysis({
    enquiry: input.enquiry,
    method: input.method,
    from: input.from,
    ...(input.heldTo === undefined ? {} : { heldTo: input.heldTo }),
    ...(input.implementing === undefined ? {} : { implementing: input.implementing }),
  });
  const claims: ConcludedClaim[] = [];
  for (const c of input.concludes) {
    const drawn = await w.conclude({ analysis, ...c });
    claims.push(...drawn.claims);
  }
  return { analysis, claims };
}

/**
 * A replacement and the findings it supersedes — the signature
 * `WriteSurface.replaceAnalysis` had before its conclusions became acts of
 * their own.
 *
 * `replacing` on each conclusion names the finding it stands in for; one the
 * caller does not name is not superseded. Omitting it falls back to matching by
 * proposition, which refuses an ambiguous match rather than picking.
 *
 * Distinct from `reviewAndReplace`, which mints the review as well — this
 * takes one already on the record, as the verb does.
 */
export async function replaceAnalysis(
  w: W,
  input: {
    supersedes: AnalysisRef;
    because: ReviewRef;
    enquiry: EnquiryRef;
    method: string;
    from: InputRef[];
    concludes: readonly ReplacementConclusion[];
  },
): Promise<ReplacementReport & { claims: ConcludedClaim[] }> {
  const report = await w.replaceAnalysis({
    supersedes: input.supersedes,
    because: input.because,
    method: input.method,
    from: input.from,
  });
  // Each conclusion names the finding it supersedes. One the caller does not
  // name is not superseded, which is what lets a re-analysis address some of a
  // run's conclusions and leave the rest standing.
  const claims: ConcludedClaim[] = [];
  for (const c of input.concludes) {
    const drawn = await w.conclude({ analysis: report.replacement, ...c });
    claims.push(...drawn.claims);
  }
  return { ...report, claims };
}
