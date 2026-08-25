/**
 * Questions and the lines of enquiry under them.
 *
 * Ported verbatim from the monolithic `src/cli.ts` — see `./knowledge.ts` for
 * why the comments came with the code.
 */

import type { EnquiryRef, EnquiryStatus, QuestionOrigin, QuestionRef } from "../../domain";
import { bullets } from "./format";

/**
 * An enquiry's standing.
 *
 * `accepted-as-unresolved` deliberately carries `open: true` — it *is* still
 * open, on purpose — so rendering the boolean alone reported the one closure
 * the domain built S-14 for as though nobody had got round to it. The
 * rationale and the reopening condition are what distinguish deciding to stop
 * from not having started, and they now print.
 *
 * Answered enquiries say what their closure rests on for the same reason:
 * `exploratory` does not mean the answer is wrong, it means nothing has
 * promoted what it rests on, and a reader deciding whether to build on it
 * should not have to go and look.
 */
export function renderEnquiry(status: EnquiryStatus): string {
  const q = status.question;
  const standing = !q
    ? "no question behind this enquiry"
    : q.closure === "accepted-as-unresolved"
      ? "open — accepted as unresolved, deliberately"
      : q.open
        ? "open"
        : `closed — ${q.closure}`;
  return [
    // The enquiry first, because that is what was asked about. The question's
    // state is printed as the question's, not as this pursuit's -- PJ-030 §6:
    // flattened, every pursuit of an answered question read as answered itself.
    `${status.pursuing}  (${status.enquiry})`,
    status.contributed.length
      ? `  produced ${status.contributed.length} finding${status.contributed.length === 1 ? "" : "s"}`
      : "  has produced nothing yet",
    "",
    q ? `Pursuing "${q.asks}"  (${q.question})` : "Pursuing nothing on the record",
    `  ${standing}`,
    q?.acceptedBecause ? `  accepted because: ${q.acceptedBecause}` : "",
    q?.reopensIf ? `  reopens if: ${q.reopensIf}` : "",
    q?.answer ? `  answer: ${q.answer}` : "",
    q?.restsOn ? `  resting on ${q.restsOn} work` : "",
    status.contributed.length
      ? `\nThis enquiry's findings\n${bullets(
          status.contributed.map((e) => `${e.states}  (${e.evidence})`),
          "",
        )}`
      : "",
    q?.evidence.length
      ? `\nThe question's answer rests on\n${bullets(
          q.evidence.map((e) => `${e.states}  (${e.evidence})`),
          "",
        )}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderPursuits(enquiries: EnquiryRef[], question: QuestionRef): string {
  return [
    `Lines of enquiry pursuing ${question}`,
    bullets(
      [...enquiries],
      "none — the question is on the books and nothing has been started on it",
    ),
    "",
    "`labkit enquiry <id>` says whether one is still open and what it has produced.",
  ].join("\n");
}

/**
 * Where a question came from.
 *
 * `null` is an answer and prints as one. Most questions are simply asked;
 * only a sharpened one has an earlier question behind it, and rendering the
 * common case as an absence would read as a gap in the record.
 *
 * `knownAtTheTime` was frozen when the sharpening was recorded, not recomputed
 * now — that is the whole of S-1, and the line says so, because a reader who
 * assumes it is current will read later evidence into an earlier decision.
 */
export function renderOrigin(origin: QuestionOrigin | null, question: QuestionRef): string {
  if (!origin)
    return [
      `${question} was posed directly.`,
      "",
      "That is an answer, not a gap: only a question sharpened from an earlier",
      "one has an origin on the record.",
    ].join("\n");
  return [
    `${question} narrowed "${origin.fromAsks}"  (${origin.from})`,
    `  because: ${origin.reason}`,
    "",
    "Known at that moment",
    bullets(
      origin.knownAtTheTime.map((f) => `${f.states}  (${f.evidence})`),
      "nothing",
    ),
    "",
    "Frozen when the sharpening was recorded, not recomputed now. Evidence that",
    "arrived later is deliberately absent from this list.",
  ].join("\n");
}
