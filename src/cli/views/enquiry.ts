/**
 * Questions and the lines of enquiry under them.
 */

import type { EnquiryRef, EnquiryStatus, QuestionOrigin, QuestionRef } from "../../domain";
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
    `${p.heading(status.pursuing)}  ${p.handle(`(${status.enquiry})`)}`,
    `  ${standing}`,
    status.contributed.length
      ? `  produced ${status.contributed.length} finding${status.contributed.length === 1 ? "" : "s"}`
      : `  ${p.untested("has produced nothing yet")}`,
    status.answer ? `  answer: ${status.answer}` : "",
    status.restsOn ? `  resting on ${status.restsOn} work` : "",
    "",
    q
      ? `Pursuing "${q.asks}"  ${p.handle(`(${q.question})`)}`
      : p.untested("Pursuing nothing on the record"),
    q?.acceptedBecause ? `  accepted because: ${q.acceptedBecause}` : "",
    q?.reopensIf ? `  reopens if: ${q.reopensIf}` : "",
    q?.acceptedInLightOf?.length
      ? `
The question's acceptance rests on
${bullets(
  q.acceptedInLightOf.map((e) => `${e.states}  (${e.evidence})`),
  "",
)}`
      : "",
    status.contributed.length
      ? `
This enquiry's findings
${bullets(
  status.contributed.map((e) => `${e.states}  (${e.evidence})`),
  "",
)}`
      : "",
    status.evidence.length
      ? `
This enquiry's closure rests on
${bullets(
  status.evidence.map((e) => `${e.states}  (${e.evidence})`),
  "",
)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderPursuits(enquiries: EnquiryRef[], question: QuestionRef, p: Palette): string {
  return [
    p.heading(`Lines of enquiry pursuing ${p.handle(question)}`),
    bullets(
      enquiries.map((e) => p.handle(e)),
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
  if (!origin)
    return [
      `${p.handle(question)} was posed directly.`,
      "",
      p.quiet("That is an answer, not a gap: a question has an origin here only when it"),
      p.quiet("was sharpened from an earlier one or posed out of a note."),
    ].join("\n");
  if (origin.kind === "noted")
    return [
      `${p.handle(question)} came out of a note  ${p.handle(`(${origin.from})`)}`,
      `  "${origin.said}"`,
      "",
      p.quiet("A note records no reason and cites nothing — it was written before there"),
      p.quiet("was anything to ask. What it carries is when, and who."),
    ].join("\n");
  return [
    `${p.handle(question)} narrowed "${origin.said}"  ${p.handle(`(${origin.from})`)}`,
    `  because: ${origin.reason}`,
    "",
    p.heading("Known at that moment"),
    bullets(
      origin.knownAtTheTime.map((f) => `${f.states}  ${p.handle(`(${f.evidence})`)}`),
      p.untested("nothing"),
    ),
    "",
    p.quiet("Frozen when the sharpening was recorded, not recomputed now. Evidence that"),
    p.quiet("arrived later is deliberately absent from this list."),
  ].join("\n");
}
