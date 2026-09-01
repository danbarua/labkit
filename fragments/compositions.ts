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

import type { ResearchWrites } from "../src/domain";
import {
  acceptUnresolved,
  amendLockedDesign,
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
  reviewAndReplace,
  rerunCheck,
  reverifyEarlier,
  sharpenQuestion,
} from "./tagged";

export interface Composition {
  /** The scenario whose arc this borrows, for a reader who wants the real one. */
  ref: string;
  name: string;
  run: (w: ResearchWrites) => Promise<void>;
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
    await reviewAndReplace(w, {
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


/** S-1: a hunch narrowed by what the first look found. */
const aHunchNotYetAnExperiment: Composition = {
  ref: "S-1",
  name: "A hunch, not yet an experiment",
  run: async (w) => {
    const { question, enquiries } = await multiPursuit(w, {
      question: "is the assay drifting?",
      approaches: ["control chart, 6 months", "plate-level breakdown"],
    });
    const { claims } = await observeAndAnalyse(w, {
      enquiry: enquiries[0]!,
      name: "control-chart-6m",
      finding: "plate 3 only, others flat",
      method: "control chart",
      concludes: [{ proposition: "drift is confined to plate 3", finding: "plate 3 only" }],
    });
    await sharpenQuestion(w, {
      from: question,
      into: "is plate 3 miscalibrated?",
      because: claims[0]!.claim,
    });
  },
};

/** S-3: the primary test holds; its own robustness checks split. */
const significantAndUntrustworthy: Composition = {
  ref: "S-3",
  name: "Significant, and untrustworthy",
  run: async (w) => {
    const { enquiry } = await askAndPursue(w, { question: "does the intervention raise yield?" });
    const a = await prespecify(w, { proposition: "holds under leave-one-site-out" });
    const b = await prespecify(w, { proposition: "holds with the outlier site removed" });
    const { claims } = await observeAndAnalyse(w, {
      enquiry,
      name: "yield-trial",
      finding: "+6%, p=0.03",
      method: "mixed model",
      concludes: [{ proposition: "yield rises by 6%", finding: "+6%, p=0.03" }],
      heldTo: [a.criterion, b.criterion],
    });
    await rerunCheck(w, { criterion: a.criterion, value: "held", citing: claims[0]!.claim });
    await failedCheck(w, { criterion: b.criterion, value: "did not hold", citing: claims[0]!.claim });
  },
};

/** S-7: feasibility finds a mechanical defect after the design is locked. */
const amendingALockedDesign: Composition = {
  ref: "S-7",
  name: "Amending a locked design",
  run: async (w) => {
    const { enquiry } = await askAndPursue(w, { question: "does arm B beat arm A at 12 weeks?" });
    const { criterion } = await prespecify(w, {
      proposition: "primary comparison: arm A vs arm B at 12 weeks",
    });
    await gatedWork(w, {
      criterion,
      consequence: "the analysis may not deviate",
      objective: "run the 12-week comparison",
      acceptance: "the comparison is the prespecified one",
    });
    const { claims } = await observeAndAnalyse(w, {
      enquiry,
      name: "feasibility-assay",
      finding: "saturation at week 9",
      method: "assay range check",
      concludes: [
        { proposition: "arm B assay saturates before week 12", finding: "saturation at week 9" },
      ],
    });
    await amendLockedDesign(w, {
      criterion,
      nowRequires: "primary comparison: arm A vs arm B at 9 weeks",
      because: "the assay cannot measure what was specified",
      citing: claims[0]!.claim,
    });
  },
};

/** S-8: a criterion that gates work and qualifies no finding. */
const dontSpendTheWholeBudget: Composition = {
  ref: "S-8",
  name: "Don't spend the whole budget",
  run: async (w) => {
    const { criterion } = await prespecify(w, {
      proposition: "pilot recovers >90% of spiked control",
    });
    const { gate } = await gatedWork(w, {
      criterion,
      consequence: "the full run may not start",
      objective: "the full 400-sample run",
      acceptance: "the pilot recovered",
      mayRead: ["pilot-output"],
    });
    await rerunCheck(w, { criterion, gate, value: "0.94" });
  },
};

/** S-17: a gate nobody evaluated is not a gate that passed. */
const doesTheGuardGuard: Composition = {
  ref: "S-17",
  name: "Does the guard actually guard?",
  run: async (w) => {
    const { criterion } = await prespecify(w, { proposition: "contamination below threshold" });
    await gatedWork(w, {
      criterion,
      consequence: "results may not be released",
      objective: "release the results",
      acceptance: "contamination is below threshold",
    });
  },
};

/** S-18: scratch that turned out to matter, promoted before it was cited. */
const scratchThatMattered: Composition = {
  ref: "S-18",
  name: "Scratch that mattered",
  run: async (w) => {
    const { enquiry } = await askAndPursue(w, {
      question: "does the batch effect explain the drift?",
    });
    const { claims } = await observeAndAnalyse(w, {
      enquiry,
      name: "lunchtime-sweep",
      finding: "R-squared 0.81",
      method: "batch regression",
      concludes: [{ proposition: "batch explains the drift", finding: "R-squared 0.81" }],
    });
    await promoteFinding(w, {
      claim: claims[0]!.claim,
      because: "re-run against the full batch series",
    });
  },
};

/** S-10: the protocol runs again; that is not a reproduction. */
const rerunningIsNotReproducing: Composition = {
  ref: "S-10",
  name: "Rerunning is not reproducing",
  run: async (w) => {
    const { enquiry } = await askAndPursue(w, { question: "what is the coefficient?" });
    const original = await observeAndAnalyse(w, {
      enquiry,
      name: "historical-run-1998",
      finding: "0.63, initial conditions not recorded",
      method: "original fit",
      concludes: [{ proposition: "the coefficient is stable", finding: "0.63" }],
    });
    // **The same proposition, a different finding.** `reverify` re-checks the
    // claim that was made, so the propositions must match — the domain refused
    // a re-verification of "the coefficient is 0.61" against an analysis that
    // concluded 0.63, naming both. Which is the scenario's own point: the
    // re-run answers the same question and gets a different number, and that
    // is not a reproduction.
    await reverifyEarlier(w, {
      historical: original.analysis,
      enquiry,
      method: "re-run under 2026 conditions",
      under: [original.observations],
      concludes: { proposition: "the coefficient is stable", finding: "0.61" },
    });
  },
};


/**
 * An eighteen-month programme, and the reason a long one is worth building.
 *
 * The other twelve borrow a single scenario's arc, which is the right size for
 * showing one mechanic and the wrong size for showing what a record *is*. Real
 * work is several threads that interact: a question that gets sharpened
 * halfway through, work that is gated and then released, an analysis that is
 * replaced after a review, a claim narrowed once somebody reads it properly,
 * and one question nobody could settle.
 *
 * Nothing here is a new capability — it is the same sixteen moves, more of
 * them, threaded. That is the claim being tested: **length costs handles, not
 * machinery.** If a long arc needed something a short one did not, the
 * decomposition would be wrong.
 *
 * `implementing` appears here and nowhere else: it links the analysis to the
 * gated work it carries out, which only exists once an arc is long enough to
 * have planned work *and* an analysis that discharges it.
 */
const aProgramme: Composition = {
  // **Not a scenario's ref, because it is not one scenario.** It borrows from
  // S-19, S-4, S-5, S-11, S-12, S-14 and S-1 at once, which is the point — the
  // interaction between them is what a single-scenario arc cannot show. The
  // skill says to leave `ref` as the closest match rather than invent a number;
  // there is no closest match here, so it says what it is.
  ref: "PROGRAMME",
  name: "An eighteen-month programme",
  run: async (w) => {
    // --- phase I: is it safe enough to continue? ------------------------
    const { question, enquiries } = await multiPursuit(w, {
      question: "should this compound go forward?",
      approaches: ["phase I safety", "phase II efficacy"],
    });
    const safety = enquiries[0]!;
    const efficacy = enquiries[1]!;

    const safeEnough = await prespecify(w, {
      proposition: "no grade 3 events at the target dose",
    });
    const phaseII = await gatedWork(w, {
      criterion: safeEnough.criterion,
      consequence: "phase II may not start until safety holds",
      objective: "run the phase II efficacy study",
      acceptance: "safety held at the target dose",
    });

    const doseFinding = await observeAndAnalyse(w, {
      enquiry: safety,
      name: "dose-escalation",
      finding: "no grade 3 events in 36 subjects",
      method: "3+3 escalation",
      concludes: [
        { proposition: "the target dose is tolerated", finding: "no grade 3 events in 36" },
      ],
      heldTo: [safeEnough.criterion],
    });
    await rerunCheck(w, {
      criterion: safeEnough.criterion,
      gate: phaseII.gate,
      value: "0 events",
      citing: doseFinding.claims[0]!.claim,
    });

    // --- phase II: the efficacy check fails, then does not ---------------
    const worksAtAll = await prespecify(w, {
      proposition: "response rate above 30% at 12 weeks",
    });
    const firstRead = await observeAndAnalyse(w, {
      enquiry: efficacy,
      name: "phase-ii-primary",
      finding: "response rate 24%",
      method: "intention to treat",
      concludes: [{ proposition: "the compound is effective", finding: "24% response" }],
      heldTo: [worksAtAll.criterion],
      // The work this analysis carries out. Only expressible once an arc has
      // both planned work and an analysis that discharges it.
      implementing: phaseII.work,
    });
    await failedCheck(w, {
      criterion: worksAtAll.criterion,
      value: "0.24",
      citing: firstRead.claims[0]!.claim,
    });

    // A review finds the analysis wrong, not the data.
    const corrected = await reviewAndReplace(w, {
      supersedes: firstRead.analysis,
      verdict: "non-responders at week 4 were carried forward, inflating the denominator",
      enquiry: efficacy,
      method: "intention to treat, corrected denominator",
      from: [firstRead.observations],
      concludes: [{ proposition: "the compound is effective", finding: "34% response" }],
    });
    await rerunCheck(w, {
      criterion: worksAtAll.criterion,
      value: "0.34",
      citing: corrected.claims[0]!.claim,
    });

    // --- the question narrows in light of what was found -----------------
    const { sharper } = await sharpenQuestion(w, {
      from: question,
      into: "should this compound go forward in the biomarker-positive subgroup?",
      because: corrected.claims[0]!.claim,
    });
    const subgroup = await multiPursuit(w, {
      question: "does the effect concentrate in the biomarker-positive subgroup?",
      approaches: ["prespecified subgroup analysis", "exploratory secondary endpoints"],
    });
    const confirmatory = subgroup.enquiries[0]!;
    const exploratory = subgroup.enquiries[1]!;

    const subgroupRead = await observeAndAnalyse(w, {
      enquiry: confirmatory,
      name: "biomarker-stratified",
      finding: "51% vs 12%",
      method: "stratified analysis",
      concludes: [
        { proposition: "the compound works in the biomarker-positive subgroup", finding: "51% vs 12%" },
      ],
    });

    // The numbers are right; the sentence was too strong.
    await reinterpretClaim(w, {
      of: subgroupRead.claims[0]!.claim,
      as: "response is higher in the biomarker-positive subgroup",
      because: "the design cannot separate the biomarker from the confounders it tracks",
    });

    // --- a secondary endpoint that does not hold ------------------------
    const secondary = await negativeResult(w, {
      enquiry: exploratory,
      name: "quality-of-life",
      finding: "difference 1.1 points [-2.4, 4.6]",
      method: "EORTC QLQ-C30",
      proposition: "the compound improves quality of life",
    });
    await acceptUnresolved(w, {
      enquiry: exploratory,
      because: "the study was never powered for this endpoint",
      until: "a trial powered for quality of life is run",
      inLightOf: secondary.claims[0]!.claim,
    });

    // --- and the programme closes on what it can support -----------------
    await promoteFinding(w, {
      claim: corrected.claims[0]!.claim,
      because: "held at the prespecified bar after the denominator was corrected",
    });
    // **One close, not two, and the domain is what taught this.** Closing
    // `efficacy` and then `safety` was refused:
    //
    //   enquiry LOE_1 is already closed by decision DEC_5 (answered on "the
    //   compound is effective"); closing it again would leave two decisions
    //   resolving one question
    //
    // Both pursuits address the *same* question, and closure attaches to the
    // question rather than to the line of enquiry — which is S-4's finding,
    // met here from the other side. The safety result is not lost: it is on
    // the record, supports its own claim, and released the gate. It simply
    // does not get a second closing act.
    //
    // No short arc could have found this. It needs one question carrying two
    // pursuits *and* both of them reaching an answer.
    await closeOnEvidence(w, { enquiry: efficacy, answeredBy: corrected.claims[0]!.claim });

    // A year later, under fresh inputs.
    await reverifyEarlier(w, {
      // `replacement`, not `analysis`. `observeAndAnalyse` returns the latter
      // and `replaceAnalysis` the former, and both are an `AnalysisRef` — the
      // first thing a long arc found, because nothing shorter threads one into
      // the other. Left as it is: `replacement` says *which* analysis, and a
      // uniform `analysis` everywhere would lose that at the call site.
      historical: corrected.replacement,
      enquiry: confirmatory,
      method: "re-run on the registry cohort",
      under: [firstRead.observations],
      concludes: { proposition: "the compound is effective", finding: "31% response, registry" },
    });

    // The sharpened question is left standing, unpursued and undecided --
    // which is a real state and not an oversight.
    void sharper;
  },
};

/**
 * Every composition, in the order a reader would meet them.
 *
 * Not sorted by scenario number: the first is the fullest arc and is the one
 * worth landing on, and the rest run shortest-first from there.
 */
export const COMPOSITIONS: readonly Composition[] = [
  aProgramme,
  gatedAdvance,
  aHunchNotYetAnExperiment,
  significantAndUntrustworthy,
  negativeClosure,
  contradictionOrDissociation,
  amendingALockedDesign,
  dontSpendTheWholeBudget,
  rerunningIsNotReproducing,
  theAnalysisWasWrong,
  theSentenceIsWrong,
  deliberatelyUnresolved,
  doesTheGuardGuard,
  scratchThatMattered,
];
