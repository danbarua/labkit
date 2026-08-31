/**
 * Questions and the lines of enquiry under them.
 *
 * Ported verbatim from the monolithic `src/cli.ts` — see `./knowledge.ts` for
 * why the comments came with the code.
 */

import type {
  EnquiryInContext,
  EnquiryRef,
  EnquiryStatus,
  QuestionBucket,
  QuestionOrigin,
  QuestionRef,
} from "../../domain";
import type { Palette } from "../palette";
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
export function renderEnquiry(status: EnquiryStatus, p: Palette): string {
  const q = status.question;
  const standing = !q
    ? p.untested("no question behind this enquiry")
    : q.closure === "accepted-as-unresolved"
      ? p.provisional("open — accepted as unresolved, deliberately")
      : q.open
        ? p.untested("open")
        : p.settled(`closed — ${q.closure}`);
  return [
    // The enquiry first, because that is what was asked about. The question's
    // state is printed as the question's, not as this pursuit's -- PJ-030 §6:
    // flattened, every pursuit of an answered question read as answered itself.
    `${p.heading(status.pursuing)}  ${p.handle(`(${status.enquiry})`)}`,
    status.contributed.length
      ? `  produced ${status.contributed.length} finding${status.contributed.length === 1 ? "" : "s"}`
      : `  ${p.untested("has produced nothing yet")}`,
    "",
    q
      ? `Pursuing "${q.asks}"  ${p.handle(`(${q.question})`)}`
      : p.untested("Pursuing nothing on the record"),
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

/** Colours a bucket name the same way `renderKnown`'s heading for it would. */
function colourBucket(bucket: QuestionBucket, p: Palette): (text: string) => string {
  switch (bucket) {
    case "established":
      return p.settled;
    case "provisional":
    case "accepted":
      return p.provisional;
    case "unresolved":
    case "untested":
      return p.untested;
  }
}

/**
 * `renderEnquiry`, followed by one line: where this enquiry's own question
 * currently sits in the overall survey (#128) -- not the whole survey. The
 * real Bonsai transcript chained `enquiry` with `known` to answer exactly
 * this ("did closing this enquiry move its question's bucket?"), never to
 * read every other question in the programme; see `EnquiryInContext`'s own
 * doc comment for why an earlier version of this got that wrong.
 */
export function renderEnquiryInContext(status: EnquiryInContext, p: Palette): string {
  const s = status.standing;
  return [
    renderEnquiry(status.enquiry, p),
    "",
    s
      ? `Currently in the overall survey: ${colourBucket(s.bucket, p)(s.bucket)}`
      : p.untested("No question stands behind this enquiry."),
  ].join("\n");
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
 *
 * `null` is an answer and prints as one. Most questions are simply asked;
 * only a sharpened one has an earlier question behind it, and rendering the
 * common case as an absence would read as a gap in the record.
 *
 * `knownAtTheTime` was frozen when the sharpening was recorded, not recomputed
 * now — that is the whole of S-1, and the line says so, because a reader who
 * assumes it is current will read later evidence into an earlier decision.
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
      p.quiet("That is an answer, not a gap: only a question sharpened from an earlier"),
      p.quiet("one has an origin on the record."),
    ].join("\n");
  return [
    `${p.handle(question)} narrowed "${origin.fromAsks}"  ${p.handle(`(${origin.from})`)}`,
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
