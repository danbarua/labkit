/**
 * What the programme knows, and why.
 *
 * **Ported verbatim from the monolithic `src/cli.ts`, comments included**, and
 * that is deliberate: an external review of the first version (2026-08-21)
 * found three distinctions the domain has scenarios for being dropped between
 * the report and the page, every one of them correct in `--json`. The comments
 * on each function are what those defects cost, and a rewrite during a move is
 * how they come back.
 */

import type {
  ConcludedClaim,
  ConflictSide,
  ConflictVerdict,
  HistoricalSurvey,
  KnowledgeSurvey,
  QuestionStanding,
  SupportExplanation,
} from "../../domain";
import { allOf, bullets, questionLines } from "./format";

export function renderKnown(survey: KnowledgeSurvey): string {
  const all = allOf(survey as unknown as { [k: string]: unknown });
  const list = (qs: QuestionStanding[]) => bullets(questionLines(qs, all), "nothing");
  return [
    "Established",
    list(survey.established),
    "",
    "Provisional (resting on work nobody promoted)",
    list(survey.provisional),
    "",
    "Accepted as unresolved",
    list(survey.accepted),
    "",
    "Unresolved (worked on, no answer yet)",
    list(survey.unresolved),
    "",
    "Untested (nothing has been run against these)",
    list(survey.untested),
  ].join("\n");
}

export function renderHistorical(survey: HistoricalSurvey): string {
  const all = allOf(survey as unknown as { [k: string]: unknown });
  const list = (qs: QuestionStanding[]) => bullets(questionLines(qs, all), "nothing");
  return [
    `As of ${survey.at}:`,
    "",
    "Established (resolved on a promoted finding)",
    list(survey.established),
    "",
    "Provisional (resolved, but on unpromoted work)",
    list(survey.provisional),
    "",
    "Accepted as unresolved",
    list(survey.accepted),
    "",
    "Open",
    list(survey.open),
    "",
    "A question posed after this instant is absent, not open. `open` is not",
    "split into worked-on and untouched: nothing records when work began, so",
    "that cannot be placed in time.",
  ].join("\n");
}

/**
 * Why a proposition stands, or does not.
 *
 * The three ways `supported: false` can come about are printed apart, because
 * they are different scientific states and the domain went to some trouble to
 * keep them apart: nothing has examined it, evidence bears against it, or
 * nobody asserts the sentence any more. The first version of this renderer
 * collapsed all three into `NOT supported` above a list of perfectly good
 * findings — which is the S-12 distinction being lost at the transport
 * boundary, after the read surface had got it right.
 */
export function renderWhy(why: SupportExplanation): string {
  const verdict = why.supported
    ? "supported"
    : why.withdrawn
      ? "NOT supported — withdrawn; the record no longer asserts this wording"
      : why.challenged
        ? "NOT supported — challenged by evidence bearing against it"
        : "NOT supported";
  return [
    `"${why.proposition}"`,
    `  ${verdict}, ${why.standing}`,
    why.promotedBecause ? `  promoted because: ${why.promotedBecause}` : "",
    why.replacedBy ? `  replaced by: "${why.replacedBy.asserts}"  (${why.replacedBy.claim})` : "",
    "",
    "Resting on",
    bullets(why.support.map((s) => `${s.finding}  (via ${s.method}, ${s.analysis})`), "nothing"),
    why.against.length
      ? `\nBearing against\n${bullets(why.against.map((a) => `${a.finding}  (via ${a.method}, ${a.analysis})`), "")}`
      : "",
    why.reverifiedBy.length
      ? `\nRe-checked by\n${bullets(why.reverifiedBy.map((r) => `${r.method}  (${r.analysis})`), "")}`
      : "",
    why.standard.length
      ? `\nHeld to\n${bullets(why.standard.map((c) => `${c.proposition} — ${c.state}`), "")}`
      : "\nHeld to no prespecified standard.",
    why.unmet.length
      ? `\nNot currently met\n${bullets(why.unmet.map((u) => `${u.requires}  (${u.criterion})`), "")}`
      : "",
    why.restingOn.length
      ? `\nUltimately resting on\n${bullets(why.restingOn.map((a) => `${a.name}  [${a.part}]`), "")}`
      : "",
    why.superseded.length
      ? `\nSuperseded\n${bullets(why.superseded.map((s) => `${s.finding} — ${s.reason}`), "")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Which claims assert a sentence — the one place text becomes a handle.
 *
 * Several matches is not a duplicate to be tidied away. Two lines of enquiry
 * can assert the same sentence about different endpoints, and they are two
 * claims (S-5); collapsing them reports one record that is simultaneously
 * supported and challenged when each separately has a clean answer. So the
 * multiple case gets a sentence saying so, rather than a list a reader might
 * take for redundancy.
 */
export function renderClaims(claims: ConcludedClaim[], proposition: string): string {
  return [
    `Claims asserting "${proposition}"`,
    bullets(
      claims.map((c) => `${c.asserts}  (${c.claim})`),
      "none — nothing on the record asserts this wording",
    ),
    claims.length > 1
      ? "\nMore than one, and none of them is redundant: two lines of enquiry can\nassert the same sentence about different endpoints. Name the one you mean."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Whether two conclusions disagree.
 *
 * Three relations, three sentences, and `dissociation` is the one this verb
 * exists for: two analyses reaching opposite-sounding results are not in
 * conflict if they asked about different endpoints. Rendering that as a
 * contradiction is precisely the defect the domain went to trouble to prevent
 * (S-5), so the word never appears for it.
 */
export function renderConflict(verdict: ConflictVerdict): string {
  const side = (s: ConflictSide): string =>
    [
      `"${s.proposition}"  (${s.claim})`,
      `  asking "${s.asks}"  (${s.question})`,
      s.supportedBy.length
        ? `  supported by: ${s.supportedBy.map((f) => f.states).join("; ")}`
        : "",
      s.challengedBy.length
        ? `  challenged by: ${s.challengedBy.map((f) => f.states).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  const verdictLine: Record<ConflictVerdict["relation"], string> = {
    contradiction: "Contradiction — these disagree, and about the same thing.",
    dissociation:
      "Dissociation — these are about different things, so they do not disagree" +
      (verdict.differsBy ? `; they differ by ${verdict.differsBy}.` : "."),
    corroboration: "Corroboration — these agree.",
  };
  return [verdictLine[verdict.relation], "", verdict.sides.map(side).join("\n\n")].join("\n");
}
