/**
 * A small library of composable research moves.
 *
 * **The composable unit is a move, not a scenario.** Asked whether the 32
 * acceptance scenarios could be composed, the answer was no and deliberately
 * so: `openScenario().begin()` hands back an empty graph per `beforeEach`, and
 * `tests/scenarios/s9b_rebuild_or_fresh_work.test.ts:86` re-implements S-9's
 * opening *by hand* with the note "kept deliberately identical so that what
 * this scenario adds is visible against it". Sharing a fixture there would
 * couple independent probes.
 *
 * What does compose is what a researcher actually does. S-19 is
 * `askAndPursue → prespecify → gatedWork → observeAndAnalyse → failedCheck →
 * rerunCheck → promoteFinding → closeOnEvidence`, and the LabKit Explorer
 * mockup hand-wrote that sequence eight times over.
 *
 * ## Why this is not in `tests/`, and why a scenario may import it
 *
 * The fixture argument above is about shared **state**: two probes drawing on
 * one graph stop being independent, which is why `openScenario().begin()` hands
 * back an empty graph per `beforeEach`.
 *
 * Importing a fragment is shared **code**, and that is the opposite case — a
 * move used by twenty scenarios is the same shape as a fact used by two
 * readers, so mutating it once turns twenty red together. That is wanted.
 *
 * So a fragment lives outside `tests/` because it is for **building a
 * record**: a trace, a demo, a seeded database, and the acts a scenario
 * performs before it asserts anything. What a scenario must not share is its
 * graph.
 *
 * ## The shape, and why it is this dull
 *
 * Each fragment takes the surface and an input object, and returns the handles
 * it minted. Composition is then variable binding:
 *
 * ```ts
 * const { enquiry } = await askAndPursue(w, { question: "…", approach: "…" });
 * const { criterion } = await prespecify(w, { proposition: "…" });
 * const { gate, work } = await gatedWork(w, { criterion, consequence: "…", objective: "…" });
 * ```
 *
 * No registry, no builder, no framework. A fragment that needed one would be
 * hiding the handle flow, and the handle flow is the thing worth seeing.
 */

import type {
  AnalysisRef,
  ClaimRef,
  ConcludedClaim,
  Conclusion,
  CriterionRef,
  EnquiryRef,
  GateRef,
  InputRef,
  ObservationsRef,
  QuestionRef,
  WorkRef,
  ReviewRef,
  ReplacementReport,
} from "../src/domain/report";
import type { ResearchWrites, ReplacementConclusion } from "../src/domain";

/** Every fragment writes through the public surface and nothing else. */
type W = ResearchWrites;

/**
 * A question on the record, and a line of enquiry against it.
 *
 * `openEnquiry` rather than `pose` + `pursue`, because that is what the domain
 * says the researcher did — one act, one event. Composing the two verbs here
 * would put two events on the record for one move and misreport the arc.
 */
export async function askAndPursue(
  w: W,
  input: { question: string },
): Promise<{ enquiry: EnquiryRef; question: QuestionRef }> {
  return await w.openEnquiry(input.question);
}

/**
 * One question, two lines of enquiry — the S-5 shape.
 *
 * Separate from {@link askAndPursue} because the second `pursue` needs the
 * question handle, and `openEnquiry` does not hand one back. So this is the
 * fragment that has to use `pose` and `pursue` separately, and the difference
 * is the point rather than an inconsistency.
 */
export async function multiPursuit(
  w: W,
  input: { question: string; approaches: readonly [string, string, ...string[]] },
): Promise<{ question: QuestionRef; enquiries: EnquiryRef[] }> {
  const { question } = await w.pose({ question: input.question });
  const enquiries: EnquiryRef[] = [];
  for (const approach of input.approaches) {
    const { enquiry } = await w.pursue({ question, approach });
    enquiries.push(enquiry);
  }
  return { question, enquiries };
}

/** A condition stated before any result exists. That is what makes it prespecified. */
export async function prespecify(
  w: W,
  input: { proposition: string },
): Promise<{ criterion: CriterionRef }> {
  const { criterion } = await w.stateCriterion(input.proposition);
  return { criterion };
}

/**
 * Work, and a gate that holds it up until the criterion holds.
 *
 * The work is planned first because `declareGate` takes what it protects. A
 * gate protecting nothing is not a gate — the domain refuses it, so the order
 * here is the domain's and not a preference.
 */
export async function gatedWork(
  w: W,
  input: {
    criterion: CriterionRef;
    consequence: string;
    objective: string;
    acceptance: string;
    mayRead?: string[];
  },
): Promise<{ gate: GateRef; work: WorkRef }> {
  const { work } = await w.planWork({
    objective: input.objective,
    acceptance: input.acceptance,
    ...(input.mayRead === undefined ? {} : { mayRead: input.mayRead }),
  });
  const { gate } = await w.declareGate({
    governedBy: [input.criterion],
    consequence: input.consequence,
    protecting: [work],
  });
  return { gate, work };
}

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
 * Measurement, then a computation over it and what it concluded.
 *
 * The two together because that is one move for a researcher, and because an
 * analysis needs observations to read: splitting them would leave a fragment
 * whose only use is being followed by the other one.
 */
export async function observeAndAnalyse(
  w: W,
  input: {
    enquiry: EnquiryRef;
    name: string;
    finding: string;
    method: string;
    concludes: readonly { proposition: string; finding: string }[];
    heldTo?: CriterionRef[];
    implementing?: WorkRef;
  },
): Promise<{ observations: ObservationsRef; analysis: AnalysisRef; claims: ConcludedClaim[] }> {
  const { observations } = await w.recordObservations({
    enquiry: input.enquiry,
    name: input.name,
    finding: input.finding,
  });
  const { analysis } = await w.recordAnalysis({
    enquiry: input.enquiry,
    method: input.method,
    from: [observations],
    ...(input.heldTo === undefined ? {} : { heldTo: input.heldTo }),
    ...(input.implementing === undefined ? {} : { implementing: input.implementing }),
  });
  // Looped here rather than delegating to the `recordAnalysis` fragment:
  // **nothing in `fragments/` calls another fragment**, which is what lets
  // `fragments/provenance.ts` keep the running fragment in a single global
  // rather than a stack. See its header.
  const claims: ConcludedClaim[] = [];
  for (const c of input.concludes) claims.push(...(await w.conclude({ analysis, ...c })).claims);
  return { observations, analysis, claims };
}

/**
 * A well-supported null.
 *
 * Not an absence of evidence — a finding that bears *against* the proposition,
 * which is what `bearing: "challenges"` is for. Kept as its own fragment
 * because writing it as `observeAndAnalyse` with a hand-set bearing is exactly
 * the detail a caller forgets, and S-4 exists because the record must hold it.
 */
export async function negativeResult(
  w: W,
  input: {
    enquiry: EnquiryRef;
    name: string;
    finding: string;
    method: string;
    proposition: string;
  },
): Promise<{ observations: ObservationsRef; analysis: AnalysisRef; claims: ConcludedClaim[] }> {
  const { observations } = await w.recordObservations({
    enquiry: input.enquiry,
    name: input.name,
    finding: input.finding,
  });
  const { analysis } = await w.recordAnalysis({
    enquiry: input.enquiry,
    method: input.method,
    from: [observations],
  });
  const { claims } = await w.conclude({
    analysis,
    proposition: input.proposition,
    finding: input.finding,
    bearing: "challenges",
  });
  return { observations, analysis, claims };
}

/** A prespecified check, run and not held. */
export async function failedCheck(
  w: W,
  input: { criterion: CriterionRef; gate?: GateRef; value: string; citing?: ClaimRef },
): Promise<void> {
  await w.evaluateCriterion({
    criterion: input.criterion,
    ...(input.gate === undefined ? {} : { gate: input.gate }),
    value: input.value,
    outcome: "fail",
    ...(input.citing === undefined ? {} : { citing: input.citing }),
  });
}

/**
 * The same check, run again and held.
 *
 * A separate fragment rather than a boolean on {@link failedCheck}, because
 * the two are different moves in the story a trace tells: one is a setback and
 * one is the thing that clears it. A `passed: boolean` would render both as
 * the same step.
 */
export async function rerunCheck(
  w: W,
  input: { criterion: CriterionRef; gate?: GateRef; value: string; citing?: ClaimRef },
): Promise<void> {
  await w.evaluateCriterion({
    criterion: input.criterion,
    ...(input.gate === undefined ? {} : { gate: input.gate }),
    value: input.value,
    outcome: "pass",
    ...(input.citing === undefined ? {} : { citing: input.citing }),
  });
}

/** Somebody vouches for a finding. Until this, it is answered and not something to build on. */
export async function promoteFinding(
  w: W,
  input: { claim: ClaimRef; because: string },
): Promise<void> {
  await w.is({ claim: input.claim, state: "confirmed", because: input.because });
}

/** The question is answered on cited evidence, and leaves `unresolved`. */
export async function closeOnEvidence(
  w: W,
  input: { enquiry: EnquiryRef; answeredBy?: ClaimRef },
): Promise<void> {
  await w.closeEnquiry({
    enquiry: input.enquiry,
    ...(input.answeredBy === undefined ? {} : { answeredBy: input.answeredBy }),
  });
}

/**
 * Deliberately left open, with the condition that would reopen it.
 *
 * No `Task` is created anywhere in this fragment, and that is the point — a
 * model that could only express this as an open task has failed, which is the
 * trap S-14 exists to catch.
 */
export async function acceptUnresolved(
  w: W,
  // `inLightOf` is one claim, not a list: the decision freezes the finding it
  // was taken in light of, and a set of them would leave "which one" unanswered.
  input: { enquiry: EnquiryRef; because: string; until: string; inLightOf: ClaimRef },
): Promise<void> {
  await w.acceptAsUnresolved({
    enquiry: input.enquiry,
    because: input.because,
    until: input.until,
    inLightOf: input.inLightOf,
  });
}

/** A review finds the method wrong, and a corrected analysis supersedes it. */
export async function reviewAndReplace(
  w: W,
  input: {
    supersedes: AnalysisRef;
    verdict: string;
    enquiry: EnquiryRef;
    method: string;
    from: ObservationsRef[];
    concludes: readonly { proposition: string; finding: string }[];
  },
): Promise<{ replacement: AnalysisRef; claims: ConcludedClaim[] }> {
  // **The review is not optional scene-setting.** `because` is a `ReviewRef`,
  // so the domain will not let an analysis be superseded without a recorded
  // verdict to point at — which is why this fragment is the pair and not two.
  const { review } = await w.recordReview({ of: input.supersedes, verdict: input.verdict });
  const report = await w.replaceAnalysis({
    supersedes: input.supersedes,
    because: review,
    method: input.method,
    from: input.from,
  });
  // **The array lives here, not on the verb.** `replaceAnalysis` records the
  // replacement and the lineage; each finding it supersedes is its own act.
  // `replacing` names the one it stands in for, so a conclusion the caller
  // does not restate is not superseded.
  const claims: ConcludedClaim[] = [];
  for (const c of input.concludes) {
    const drawn = await w.conclude({ analysis: report.replacement, ...c });
    claims.push(...drawn.claims);
  }
  return { replacement: report.replacement, claims };
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
 * Distinct from {@link reviewAndReplace}, which mints the review as well — this
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

/**
 * The numbers are right; the sentence about them is wrong.
 *
 * The one thing `replaceAnalysis` cannot express — its whole mechanism is
 * invalidating the output, and here the output is fine.
 */
export async function reinterpretClaim(
  w: W,
  input: { of: ClaimRef; as: string; because: string },
): Promise<{ nowClaims: ConcludedClaim }> {
  const report = await w.reinterpret({ of: input.of, as: input.as, because: input.because });
  return { nowClaims: report.nowClaims };
}

/** An earlier analysis re-checked under fresh inputs. Agreement is not reproduction. */
export async function reverifyEarlier(
  w: W,
  input: {
    historical: AnalysisRef;
    enquiry: EnquiryRef;
    method: string;
    under: ObservationsRef[];
    // One conclusion, not a list: a re-verification answers the proposition it
    // was run against, and the command says so.
    concludes: { proposition: string; finding: string };
  },
): Promise<{ verification: AnalysisRef; claims: ConcludedClaim[] }> {
  const report = await w.reverify({
    historical: input.historical,
    enquiry: input.enquiry,
    method: input.method,
    under: input.under,
    concludes: input.concludes,
  });
  return { verification: report.verification, claims: report.claims };
}

/**
 * A question narrowed in light of what has been found.
 *
 * The old question is not deleted — `NARROWS` carries the lineage, and the
 * deciding act freezes the finding it was taken in light of, which is what
 * makes "what was known then" answerable later from durable state.
 */
export async function sharpenQuestion(
  w: W,
  input: { from: QuestionRef; into: string; because: string },
): Promise<{ sharper: QuestionRef }> {
  const { question } = await w.sharpen({
    from: input.from,
    into: input.into,
    because: input.because,
  });
  return { sharper: question };
}

/**
 * A locked condition replaced with another, on the record.
 *
 * Returns `nature`, which is the whole point: an amendment that moves a
 * prespecified comparison is **scientific**, and one that does not is
 * mechanical. The classification is computed from what the criterion was
 * implementing — with `IMPLEMENTS` deleted, S-7 showed the same amendment
 * reporting itself mechanical, which is the wrong answer that earned the edge.
 */
export async function amendLockedDesign(
  w: W,
  input: { criterion: CriterionRef; nowRequires: string; because: string; citing: ClaimRef },
): Promise<{ nature: "mechanical" | "scientific" }> {
  const report = await w.amendDesign({
    criterion: input.criterion,
    nowRequires: input.nowRequires,
    because: input.because,
    citing: input.citing,
  });
  return { nature: report.nature };
}
