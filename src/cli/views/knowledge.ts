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
  AcceptedQuestion,
  AnsweredQuestion,
  ConcludedClaim,
  ConflictSide,
  ConflictVerdict,
  Explanation,
  HistoricalSurvey,
  KnowledgeSurvey,
  QuestionStanding,
  SearchGroup,
  SupportExplanation,
} from "../../domain";
import type { Palette } from "../palette";
import { bullets, questionLines } from "./format";

/**
 * `AcceptedQuestion`'s own line — `asks` and the handle, plus why it was
 * accepted and what would reopen it. Without the second half, "accepted"
 * says only that a decision was taken, not what it would take to revisit it.
 */
function acceptedLines(qs: AcceptedQuestion[], p: Palette): string[] {
  return qs.map(
    (q) =>
      `${q.asks}  ${p.handle(`(${q.question})`)}  — accepted because: ${q.acceptedBecause}; reopens if: ${q.reopensIf}`,
  );
}

/**
 * `AnsweredQuestion`'s own line — `asks`, the handle, and which way it was
 * answered. Without the polarity, reading only `asks` for an established
 * question cannot tell a confirmed "no" apart from a "yes".
 */
function answeredLines(qs: AnsweredQuestion[], p: Palette): string[] {
  return qs.map((q) => `${q.asks}  ${p.handle(`(${q.question})`)}  — ${q.answer}`);
}

export function renderKnown(survey: KnowledgeSurvey, p: Palette): string {
  const list = (qs: QuestionStanding[]) => bullets(questionLines(qs, p), "nothing");
  return [
    // The five headings carry the distinction the buckets exist for, so they
    // are coloured by what the bucket means rather than uniformly.
    p.settled("Established"),
    bullets(answeredLines(survey.established, p), "nothing"),
    "",
    p.provisional("Provisional (answered, but not something to build on yet)"),
    bullets(answeredLines(survey.provisional, p), "nothing"),
    "",
    p.provisional("Accepted as unresolved"),
    bullets(acceptedLines(survey.accepted, p), "nothing"),
    "",
    p.untested("Unresolved (worked on, no answer yet)"),
    list(survey.unresolved),
    "",
    p.untested("Untested (nothing has been run against these)"),
    list(survey.untested),
  ].join("\n");
}

export function renderHistorical(survey: HistoricalSurvey, p: Palette): string {
  const list = (qs: QuestionStanding[]) => bullets(questionLines(qs, p), "nothing");
  return [
    p.heading(`As of ${survey.at}:`),
    "",
    p.settled("Established (resolved on a confirmed finding)"),
    list(survey.established),
    "",
    p.provisional("Provisional (resolved, but on unconfirmed work)"),
    list(survey.provisional),
    "",
    p.provisional("Accepted as unresolved"),
    list(survey.accepted),
    "",
    p.untested("Open"),
    list(survey.open),
    "",
    p.quiet("A question posed after this instant is absent, not open. `open` is not"),
    p.quiet("split into worked-on and untouched: nothing records when work began, so"),
    p.quiet("that cannot be placed in time."),
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
 * findings — the distinction being lost at the transport
 * boundary, after the read surface had got it right.
 */
export function renderWhy(why: SupportExplanation, p: Palette): string {
  // Four ways to be unsupported, and they are different states the page says
  // in words: settles-nothing, withdrawn, challenged, and nothing found yet.
  const verdict = why.supported
    ? p.settled("supported")
    : why.standing === "undecided"
      ? p.untested("NOT supported — the finding settles this neither way")
      : why.withdrawn
        ? p.provisional("NOT supported — withdrawn; the record no longer asserts this wording")
        : why.challenged
          ? p.contested("NOT supported — challenged by evidence bearing against it")
          : p.untested("NOT supported");
  return [
    p.heading(`"${why.proposition}"`),
    `  ${verdict}, ${why.standing}`,
    why.promotedBecause ? `  confirmed because: ${why.promotedBecause}` : "",
    why.replacedBy
      ? `  replaced by: "${why.replacedBy.asserts}"  ${p.handle(`(${why.replacedBy.claim})`)}`
      : "",
    "",
    // **One word, one meaning.** This list is the supporting *findings*; the
    // inputs they rest on are `restingOn`, below. An undecided claim keeps its
    // findings and they support nothing, so the heading names what they are
    // rather than what they do -- a heading has to describe the list under it.
    p.heading(why.standing === "undecided" ? "Findings" : "Supported by"),
    bullets(
      why.support.map(
        (s) =>
          `${s.finding}  ${p.quiet(`(via ${s.method},`)} ${p.handle(s.analysis)}${p.quiet(")")}`,
      ),
      "no supporting findings",
    ),
    why.against.length
      ? `\nBearing against\n${bullets(
          why.against.map((a) => `${a.finding}  (via ${a.method}, ${a.analysis})`),
          "",
        )}`
      : "",
    why.reverifiedBy.length
      ? `\nRe-checked by\n${bullets(
          why.reverifiedBy.map((r) => `${r.method}  (${r.analysis})`),
          "",
        )}`
      : "",
    why.standard.length
      ? `\nHeld to\n${bullets(
          why.standard.map((c) => `${c.proposition} — ${c.state}`),
          "",
        )}`
      : "\nHeld to no prespecified standard.",
    why.unmet.length
      ? `\nNot currently met\n${bullets(
          why.unmet.map((u) =>
            [
              `${u.requires}  ${p.handle(`(${u.criterion})`)}`,
              // What the unmet check is holding up, indented beneath it rather
              // than bulleted beside it: these are consequences of the line
              // above, not siblings of it. The consequence is in the words of
              // whoever declared the gate, which is the sentence a reader
              // needs and previously had no way to reach.
              ...u.blocks.map((b) =>
                [
                  `      blocks ${p.handle(b.gate)} — ${p.contested(b.consequence)}`,
                  ...b.gating.map(
                    (g) => `        holding up ${g.objective}  ${p.handle(`(${g.work})`)}`,
                  ),
                ].join("\n"),
              ),
            ].join("\n"),
          ),
          "",
        )}`
      : "",
    why.restingOn.length
      ? `\nResting on\n${bullets(
          why.restingOn.map((a) => `${a.name}  [${a.part}]`),
          "",
        )}`
      : "",
    why.superseded.length
      ? `\nSuperseded\n${bullets(
          why.superseded.map((s) => `${s.finding} — ${s.reason}`),
          "",
        )}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The `Work`/`LineOfEnquiry` cases of `why` — one sentence, then the causes
 * behind it. `Claim` gets the richer view above
 * instead (`renderWhyDispatch`, below); this is deliberately the smaller of
 * the two, since a task or an enquiry's own detail command already prints the
 * embedded `report` in full.
 */
function renderExplanation(explanation: Explanation, p: Palette): string {
  const sentence = `${p.handle(explanation.subject)} is ${explanation.is}`;
  if (explanation.because.length === 0) return sentence;
  return [
    `${sentence} because`,
    bullets(
      explanation.because.map(
        (c) => `${c.wording}  ${p.handle(`(${c.handle})`)}${c.when ? `  on ${c.when}` : ""}`,
      ),
      "",
    ),
  ].join("\n");
}

/**
 * `why <handle>` — dispatches on `Explanation.kind`, not on what the caller
 * passed in: the redesign's whole point is that the CLI does not know which
 * kind it got until the domain says so.
 *
 * `Claim` renders through the existing rich view over its embedded
 * `SupportExplanation` (the *Resting on / Held to / Ultimately resting on*
 * page); every other kind (`Work`, `LineOfEnquiry`, `Gate`) renders the
 * sentence-plus-causes shape instead, since their own detail commands
 * (`contract`, `enquiry`, `gate`) already show the fuller report. `--json`
 * gets the same `{kind, subject, is, because, report}` envelope regardless of
 * which branch prints for a terminal.
 */
export function renderWhyDispatch(explanation: Explanation, p: Palette): string {
  switch (explanation.kind) {
    case "claim":
      return renderWhy(explanation.report, p);
    case "work":
    case "enquiry":
    case "gate":
    case "analysis":
      return renderExplanation(explanation, p);
    default: {
      const check: never = explanation;
      throw new Error(`unreached why kind: ${JSON.stringify(check)}`);
    }
  }
}

/**
 * Which claims assert a sentence — the one place text becomes a handle.
 *
 * Several matches is not a duplicate to be tidied away. Two lines of enquiry
 * can assert the same sentence about different endpoints, and they are two
 * claims; collapsing them reports one record that is simultaneously
 * supported and challenged when each separately has a clean answer. So the
 * multiple case gets a sentence saying so, rather than a list a reader might
 * take for redundancy.
 */
export function renderClaims(claims: ConcludedClaim[], proposition: string, p: Palette): string {
  return [
    p.heading(`Claims asserting "${proposition}"`),
    bullets(
      claims.map((c) => `${c.asserts}  ${p.handle(`(${c.claim})`)}`),
      p.untested("none — nothing on the record asserts this wording"),
    ),
    claims.length > 1
      ? p.quiet(
          "\nMore than one, and none of them is redundant: two lines of enquiry can\nassert the same sentence about different endpoints. Name the one you mean.",
        )
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderSearch(groups: SearchGroup[], text: string, p: Palette): string {
  const total = groups.reduce((n, g) => n + g.matches.length, 0);
  return [
    p.heading(`Records containing "${text}"`),
    total === 0
      ? p.untested("none — nothing on the record contains this text")
      : groups
          .map((g) =>
            [
              p.quiet(`${g.label}:`),
              bullets(
                g.matches.map((m) => `${m.wording}  ${p.handle(`(${m.handle})`)}`),
                "nothing",
              ),
            ].join("\n"),
          )
          .join("\n\n"),
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
 * so the word never appears for it.
 */
export function renderConflict(verdict: ConflictVerdict, p: Palette): string {
  const side = (s: ConflictSide): string =>
    [
      `"${s.proposition}"  ${p.handle(`(${s.claim})`)}`,
      `  asking "${s.asks}"  ${p.handle(`(${s.question})`)}`,
      s.supportedBy.length
        ? `  ${p.settled("supported by")}: ${s.supportedBy.map((f) => f.states).join("; ")}`
        : "",
      s.challengedBy.length
        ? `  ${p.contested("challenged by")}: ${s.challengedBy.map((f) => f.states).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  const verdictLine: Record<ConflictVerdict["relation"], string> = {
    contradiction: p.contested("Contradiction — these disagree, and about the same thing."),
    dissociation: p.provisional(
      "Dissociation — these are about different things, so they do not disagree" +
        (verdict.differsBy ? `; they differ by ${verdict.differsBy}.` : "."),
    ),
    corroboration: p.settled("Corroboration — these agree."),
  };
  return [verdictLine[verdict.relation], "", verdict.sides.map(side).join("\n\n")].join("\n");
}
