/**
 * Questions and the lines of enquiry under them.
 */

import type { EnquiryRef, EnquiryStatus, QuestionOrigin, QuestionRef } from "../../core-domain";
import type { Palette } from "../palette";
import { bullets } from "./format";

/** An enquiry's standing, separate from the standing of its question. */
export function renderEnquiry(status: EnquiryStatus, p: Palette): string {
  const q = status.question;
  const standing = status.open
    ? q?.acceptedBecause
      ? p.provisional("open — its question is accepted as unresolved")
      : p.untested("open")
    : p.settled(`closed — ${status.closure}`);
  return [
    `${p.heading(status.pursuing)}  ${`(${status.enquiry})`}`,
    `  ${standing}`,
    status.contributed.length
      ? `  produced ${status.contributed.length} finding${status.contributed.length === 1 ? "" : "s"}`
      : `  ${p.untested("has produced nothing yet")}`,
    status.answer ? `  answer: ${status.answer}` : "",
    status.restsOn ? `  resting on ${status.restsOn} work` : "",
    "",
    q ? `Pursuing "${q.asks}"  ${`(${q.question})`}` : p.untested("Pursuing nothing on the record"),
    q?.acceptedBecause ? `  accepted because: ${q.acceptedBecause}` : "",
    q?.reopensIf ? `  reopens if: ${q.reopensIf}` : "",
    q?.acceptedInLightOf?.length
      ? `
The question's acceptance rests on
${bullets(
  q.acceptedInLightOf.map((e) => `(${e.evidence})  ${e.states}`),
  "",
)}`
      : "",
    status.contributed.length
      ? `
This enquiry's findings
${bullets(
  status.contributed.map((e) => `(${e.evidence})  ${e.states}`),
  "",
)}`
      : "",
    status.evidence.length
      ? `
This enquiry's closure rests on
${bullets(
  status.evidence.map((e) => `(${e.evidence})  ${e.states}`),
  "",
)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderPursuits(enquiries: EnquiryRef[], question: QuestionRef, p: Palette): string {
  return [
    p.heading(`Lines of enquiry pursuing ${question}`),
    bullets(
      enquiries.map((e) => e),
      p.untested("none — the question is on the books and nothing has been started on it"),
    ),
    "",
    p.quiet("`labkit enquiry <id>` says whether one is still open and what it has produced."),
  ].join("\n");
}

/**
 * Where a question came from.
 */
export function renderOrigin(
  origin: QuestionOrigin | null,
  question: QuestionRef,
  p: Palette,
): string {
  if (!origin) return [`${question} was posed directly.`].join("\n");
  if (origin.kind === "noted")
    return [`${question} came out of a note  ${`(${origin.from})`}`, `  "${origin.said}"`, ""].join(
      "\n",
    );
  return [
    `${question} narrowed "${origin.said}"  ${`(${origin.from})`}`,
    `  because: ${origin.reason}`,
    "",
    p.heading("Known at that moment"),
    bullets(
      origin.knownAtTheTime.map((f) => `${`(${f.evidence})`}  ${f.states}`),
      p.untested("nothing"),
    ),
    "",
    p.quiet("As it stood at the sharpening. Later evidence is not here."),
  ].join("\n");
}
