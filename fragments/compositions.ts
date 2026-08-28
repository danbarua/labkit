/**
 * Named arcs, built from {@link ../fragments}.
 *
 * **A composition is a list of moves and nothing else.** It writes no verbs of
 * its own, names no node or edge label, and asserts nothing — which is PJ-008
 * §2's lint rule holding by construction rather than by review:
 *
 * > the Researcher and Agent lines must never name a node or edge label
 *
 * The LabKit Explorer mockup broke that rule everywhere, because it had to:
 * hand-drawing a graph means naming its labels. Nothing here can, because the
 * graph is not written here at all.
 *
 * **These are not the acceptance scenarios and must not become them.** They
 * borrow an arc from one — S-19's, S-5's — to have something real to draw.
 * `tests/scenarios/` is where a scenario is *asserted*, each from an empty
 * graph, deliberately not sharing a fixture with any other. See
 * `fragments/index.ts`'s header.
 */

import type { WriteSurface } from "../src/domain";
import {
  acceptUnresolved,
  askAndPursue,
  closeOnEvidence,
  failedCheck,
  gatedWork,
  multiPursuit,
  negativeResult,
  observeAndAnalyse,
  prespecify,
  promoteFinding,
  reinterpretClaim,
  replaceAnalysis,
  rerunCheck,
} from "./index";

export interface Composition {
  /** The scenario whose arc this borrows, for a reader who wants the real one. */
  ref: string;
  name: string;
  run: (w: WriteSurface) => Promise<void>;
}

/** S-19: gated, failed its prespecified check, re-run, promoted, closed. */
const gatedAdvance: Composition = {
  ref: "S-19",
  name: "A gated advance",
  run: async (w) => {
    const { enquiry } = await askAndPursue(w, { question: "does the effect hold at n>=20?" });
    const { criterion } = await prespecify(w, { proposition: "panel variance below 5%" });
    const { gate } = await gatedWork(w, {
      criterion,
      consequence: "the interim may not be written up until this holds",
      objective: "write up the interim",
      acceptance: "the gate holds",
    });
    const first = await observeAndAnalyse(w, {
      enquiry,
      name: "raw-panel-90d",
      finding: "90 days, 24 sites",
      method: "panel regression",
      concludes: [{ proposition: "the effect holds at n=24", finding: "variance 7.1%" }],
      heldTo: [criterion],
    });
    await failedCheck(w, { criterion, gate, value: "0.071", citing: first.claims[0]!.claim });
    const second = await observeAndAnalyse(w, {
      enquiry,
      name: "raw-panel-120d",
      finding: "120 days, 41 sites",
      method: "panel regression, widened",
      concludes: [{ proposition: "the effect holds, variance 4.2%", finding: "variance 4.2%" }],
      heldTo: [criterion],
    });
    await rerunCheck(w, { criterion, gate, value: "0.042", citing: second.claims[0]!.claim });
    await promoteFinding(w, {
      claim: second.claims[0]!.claim,
      because: "held at the prespecified bar",
    });
    await closeOnEvidence(w, { enquiry, answeredBy: second.claims[0]!.claim });
  },
};

/** S-5: two stages of one programme, concluding the same sentence. */
const contradictionOrDissociation: Composition = {
  ref: "S-5",
  name: "Contradiction or dissociation?",
  run: async (w) => {
    const { enquiries } = await multiPursuit(w, {
      question: "does the drug reduce mortality?",
      approaches: ["phase II, 30-day endpoint", "phase III, 1-year endpoint"],
    });
    const shared = "the drug reduces mortality";
    await observeAndAnalyse(w, {
      enquiry: enquiries[0]!,
      name: "phase-ii-30d",
      finding: "-18% at 30 days",
      method: "intention to treat",
      concludes: [{ proposition: shared, finding: "-18%, p=0.01" }],
    });
    await observeAndAnalyse(w, {
      enquiry: enquiries[1]!,
      name: "phase-iii-1y",
      finding: "-3% at one year, n.s.",
      method: "intention to treat",
      concludes: [{ proposition: shared, finding: "-3%, p=0.41" }],
    });
  },
};

/** S-4: a well-supported null that closes the question. */
const negativeClosure: Composition = {
  ref: "S-4",
  name: "A negative result that closes it",
  run: async (w) => {
    const { enquiry } = await askAndPursue(w, { question: "does the additive prevent spoilage?" });
    const { claims } = await negativeResult(w, {
      enquiry,
      name: "accelerated-12wk",
      finding: "effect 0.2% [-1.1, 1.5]",
      method: "12-week accelerated trial",
      proposition: "the additive prevents spoilage",
    });
    await closeOnEvidence(w, { enquiry, answeredBy: claims[0]!.claim });
  },
};

/** S-11: the analysis was wrong; the observations were fine. */
const theAnalysisWasWrong: Composition = {
  ref: "S-11",
  name: "The analysis was wrong",
  run: async (w) => {
    const { enquiry } = await askAndPursue(w, { question: "does treatment shorten recovery?" });
    const first = await observeAndAnalyse(w, {
      enquiry,
      name: "recovery-cohort-a",
      finding: "412 patients",
      method: "survival fit",
      concludes: [{ proposition: "recovery shortens by 2.1 days", finding: "-2.1 days" }],
    });
    await replaceAnalysis(w, {
      supersedes: first.analysis,
      verdict: "censoring handled wrongly",
      enquiry,
      method: "survival fit, censoring corrected",
      from: [first.observations],
      concludes: [{ proposition: "recovery shortens by 0.4 days", finding: "-0.4 days" }],
    });
  },
};

/** S-12: the numbers are right; the sentence about them is wrong. */
const theSentenceIsWrong: Composition = {
  ref: "S-12",
  name: "The sentence about them is wrong",
  run: async (w) => {
    const { enquiry } = await askAndPursue(w, { question: "why did the cohort improve?" });
    const { claims } = await observeAndAnalyse(w, {
      enquiry,
      name: "cohort-b",
      finding: "+11% vs control",
      method: "cohort fit",
      concludes: [{ proposition: "the drug causes the improvement", finding: "+11% vs control" }],
    });
    await reinterpretClaim(w, {
      of: claims[0]!.claim,
      as: "the drug is associated with the improvement",
      because: "the design cannot separate selection from effect",
    });
  },
};

/** S-14: a question nobody wants pursued and nobody wants closed. */
const deliberatelyUnresolved: Composition = {
  ref: "S-14",
  name: "Deliberately left unresolved",
  run: async (w) => {
    const { enquiry } = await askAndPursue(w, { question: "is the 30-day panel enough?" });
    const { claims } = await observeAndAnalyse(w, {
      enquiry,
      name: "confirmatory-reanalysis",
      finding: "CI spans zero",
      method: "re-analysis of the confirmatory set",
      concludes: [{ proposition: "inconclusive at this power", finding: "CI spans zero" }],
    });
    await acceptUnresolved(w, {
      enquiry,
      because: "the confirmatory dataset is spent",
      until: "a larger held-out sample exists",
      inLightOf: claims[0]!.claim,
    });
  },
};

/**
 * Every composition, in the order a reader would meet them.
 *
 * Not sorted by scenario number: the first is the fullest arc and is the one
 * worth landing on, and the rest run shortest-first from there.
 */
export const COMPOSITIONS: readonly Composition[] = [
  gatedAdvance,
  negativeClosure,
  deliberatelyUnresolved,
  theSentenceIsWrong,
  contradictionOrDissociation,
  theAnalysisWasWrong,
];
