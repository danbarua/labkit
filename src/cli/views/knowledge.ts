/**
 * What the programme knows, and why.
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
  Verdict,
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

/** Each question line keeps every pursuit answer visible. */
function answeredLines(qs: AnsweredQuestion[], p: Palette): string[] {
  return qs.map((q) => {
    const parked = q.reopensIf ? p.quiet(`  (was parked until: ${q.reopensIf})`) : "";
    const answers = q.answers
      .map(
        (answer) =>
          `${answer.answer} via ${p.handle(answer.enquiry)} ${p.handle(`(${answer.claim})`)}`,
      )
      .join("; ");
    return `${q.asks}  ${p.handle(`(${q.question})`)}  — ${answers}${parked}`;
  });
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
    p.untested("Unresolved (active or closed without a complete answer)"),
    list(survey.unresolved),
    "",
    p.untested("Untested (nothing has been run and no pursuit has closed)"),
    list(survey.untested),
    "",
    p.heading("Closed pursuits"),
    bullets(
      survey.closedPursuits.map(
        (pursuit) =>
          `${pursuit.closure}  ${p.handle(pursuit.enquiry)}  ${pursuit.pursuing}  ${p.handle(`(${pursuit.decision})`)}`,
      ),
      "nothing",
    ),
    "",
    p.quiet("Evidence or an explicit pursuit closure moves a question from untested to"),
    p.quiet("unresolved. An open sibling keeps the question unsettled until every pursuit closes."),
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
 * How each verdict reads on the page, and in which colour.
 */
const VERDICT_LINE: Record<Verdict, (why: SupportExplanation, p: Palette) => string> = {
  supported: (_, p) => p.settled("supported"),
  undecided: (_, p) => p.untested("NOT supported — the finding settles this neither way"),
  withdrawn: (_, p) =>
    p.provisional("NOT supported — withdrawn; the record no longer asserts this wording"),
  challenged: (_, p) => p.contested("NOT supported — challenged by evidence bearing against it"),
  // Not a verdict declined for want of data: whether four findings bear a
  // sentence out is not something the record can work out, since a synthesis
  // may assert what its parts say or the negation of it. So it names the basis.
  "drawn-across": (why, p) => p.quiet(`drawn across ${why.drawnAcross.length} findings`),
  "standard-unmet": (_, p) => p.untested("NOT supported — held to a standard it does not meet"),
  unexamined: (_, p) => p.untested("NOT supported — nothing has examined it"),
};

/**
 * Why a proposition stands, or does not.
 */
export function renderWhy(why: SupportExplanation, p: Palette): string {
  const undecided = why.standing === "undecided";
  // A synthesis measured nothing, so it has no evidence of its own, and the
  // lists below say so rather than printing "no supporting findings" under a
  // verdict line that just named four.
  const synthesis = why.verdict === "drawn-across";
  const verdict = VERDICT_LINE[why.verdict]!(why, p);
  return [
    p.heading(`"${why.proposition}"`),
    `  ${verdict}, ${why.standing}`,
    why.promotedBecause ? `  confirmed because: ${why.promotedBecause}` : "",
    why.replacedBy
      ? `  replaced by: "${why.replacedBy.asserts}"  ${p.handle(`(${why.replacedBy.claim})`)}`
      : "",
    "",
    // **One word, one meaning.** This list is the supporting *findings*; the inputs they rest
    // on are `restingOn`, below. An undecided claim keeps its findings and they support
    // nothing, so the heading names what they are rather than what they do -- a heading has to
    // describe the list under it.
    synthesis ? "" : p.heading(undecided ? "Findings" : "Supported by"),
    synthesis
      ? ""
      : bullets(
          (undecided ? [...why.support, ...why.against] : why.support).map(
            (s) =>
              `${s.finding}  ${p.quiet(`(via ${s.method},`)} ${p.handle(s.analysis)}${p.quiet(")")}` +
              (undecided && why.against.includes(s as (typeof why.against)[number])
                ? `  ${p.quiet("recorded as bearing against")}`
                : ""),
          ),
          undecided ? "no findings" : "no supporting findings",
        ),
    !undecided && why.against.length
      ? `\nBearing against\n${bullets(
          why.against.map((a) => `${a.finding}  (via ${a.method}, ${a.analysis})`),
          "",
        )}`
      : "",
    // A synthesis, above the standards and the inputs: it is what the claim
    // *is*, not something it was checked against. `Supported by` reads "no
    // supporting findings" for one, which is true — it measured nothing.
    why.drawnAcross.length
      ? `\nDrawn across\n${bullets(
          why.drawnAcross.map((c) => `${c.asserts}  ${p.handle(`(${c.claim})`)}`),
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
 * The `Work`/`LineOfEnquiry` cases of `why` — one sentence, then the causes behind it.
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
 * `why <handle>` — dispatches on `Explanation.kind`, not on what the caller passed in: the
 * redesign's whole point is that the CLI does not know which kind it got until the domain says
 * so.
 */
export function renderWhyDispatch(explanation: Explanation, p: Palette): string {
  switch (explanation.kind) {
    case "claim":
      return renderWhy(explanation.report, p);
    case "work":
    case "enquiry":
    case "gate":
    case "analysis":
    // A criterion's causes are its evaluations, each already carrying the
    // verdict text and its handle — which is the generic page's shape, so it
    // needs no branch of its own.
    case "criterion":
    // Every kind answered by walking the record rather than from a report of
    // its own: `is` and `because` are the whole of the answer, which is what
    // the generic page renders.
    case "question":
    case "unit":
    case "evidence":
    case "decision":
    case "evaluation":
    case "review":
    case "observations":
    case "note":
      return renderExplanation(explanation, p);
    default: {
      const check: never = explanation;
      throw new Error(`unreached why kind: ${JSON.stringify(check)}`);
    }
  }
}

/**
 * Which claims assert a sentence — the one place text becomes a handle.
 */
export function renderClaims(claims: ConcludedClaim[], proposition: string, p: Palette): string {
  return [
    p.heading(`Claims asserting "${proposition}" — ${claims.length}`),
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
    p.heading(`Records containing "${text}" — ${total}`),
    total === 0
      ? p.untested("none — nothing on the record's text contains this")
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
