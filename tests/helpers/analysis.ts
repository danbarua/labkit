/**
 * A run and every conclusion drawn from it in one call — for a test that wants a run with its
 * findings already on it rather than typing the constituent verb calls out by hand.
 */

import type {
  AnalysisRef,
  ConcludedClaim,
  Conclusion,
  CriterionRef,
  EnquiryRef,
  InputRef,
  WorkRef,
  ClaimRef,
  EvidenceRef,
} from "@labkit/core-domain/report";
import type { ResearchWrites } from "@labkit/core-domain";

/** Every fragment writes through the public surface and nothing else. */
type W = ResearchWrites;

/**
 * A run and every conclusion drawn from it, in one call.
 */
export async function recordAnalysis(
  w: W,
  input: {
    enquiry: EnquiryRef;
    method: string;
    from: InputRef[];
    concludes: readonly (Conclusion & { replacing?: ClaimRef | EvidenceRef })[];
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
 * A fresh run whose conclusions each name the finding they stand in place of, through
 * `conclude --replacing`. A conclusion that names none supersedes nothing.
 */
export async function reanalyse(
  w: W,
  input: {
    enquiry: EnquiryRef;
    method: string;
    from: InputRef[];
    concludes: readonly (Conclusion & { replacing?: ClaimRef | EvidenceRef })[];
  },
): Promise<{ replacement: AnalysisRef; claims: ConcludedClaim[] }> {
  const { analysis, claims } = await recordAnalysis(w, input);
  return { replacement: analysis, claims };
}
