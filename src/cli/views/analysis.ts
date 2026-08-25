/**
 * Analyses: what rests on them, what re-checked them, how they were read.
 *
 * Ported verbatim from the monolithic `src/cli.ts` — see `./knowledge.ts` for
 * why the comments came with the code.
 */

import type {
  DependencyReport,
  InterpretationHistory,
  ReproducibilityReport,
  ReproductionReport,
  Revision,
} from "../../domain";
import { bullets, partLine } from "./format";

export function renderAffects(report: DependencyReport): string {
  return [
    "Claims that would be affected",
    // Id and wording both. A person reading this needs the sentence; a person
    // acting on it needs the handle every other command takes.
    bullets(report.claims.map((c) => `${c.asserts}  (${c.claim})`), "none found"),
    "",
    "Lines of enquiry",
    bullets(report.enquiries.map((e) => `${e.pursuing}  (${e.enquiry})`), "none found"),
    "",
    "Routes walked",
    bullets(report.routesWalked, ""),
    "",
    "This is a lower bound, not a finding of independence: anything",
    "connected by a route not listed above is absent from these lists",
    "and is not thereby unaffected.",
  ].join("\n");
}

/**
 * A re-run, against what its original read.
 *
 * It says `agrees`/`disagrees` and never `reproduced`, which is the word a
 * reader most wants and the one the record cannot support: whether reading the
 * same inputs constitutes the same execution depends on what the method does,
 * and the record does not know that (PJ-019). The closing paragraph says so
 * rather than leaving the reader to supply the stronger claim themselves.
 */
export function renderReproduction(report: ReproductionReport): string {
  return [
    `${report.verificationMethod}  (${report.verification})`,
    `  re-checking ${report.ofMethod}  (${report.of})`,
    `  the two runs' findings ${report.conclusion} — this ${report.bearing} confidence`,
    "",
    "The re-run read",
    bullets(report.verificationRead.map(partLine), "nothing on the record"),
    "",
    "The original read",
    bullets(report.ofRead.map(partLine), "nothing on the record"),
    report.differs.length
      ? `\nDiffering\n${bullets(report.differs.map((d) => `${partLine(d.what)} — ${d.standing}`), "")}`
      : "\nNothing differs in what the two runs read.",
    "",
    "This does not say the original was reproduced. Whether reading the same",
    "records is the same execution depends on what the method does, and the",
    "record does not know that.",
  ].join("\n");
}

/**
 * Whether an analysis can be accounted for from what it read.
 *
 * `unverifiable` gets its own bucket and its own explanation. It is the record
 * admitting it kept no hash, which is not the same answer as "differs" — and
 * folding it in would report a failure nobody found.
 */
export function renderReproducibility(report: ReproducibilityReport): string {
  return [
    `${report.analysis} — ${report.reproducible ? "accounted for" : "not accounted for"}`,
    "",
    "Rebuilt and identical",
    bullets(report.exact.map(partLine), "nothing"),
    "",
    "Rebuilt and different",
    bullets(report.differing.map(partLine), "nothing"),
    "",
    "Unverifiable (the record kept no hash, so nothing can be said either way)",
    bullets(report.unverifiable.map(partLine), "nothing"),
    "",
    "Not rebuilt",
    bullets(report.notRebuilt.map(partLine), "nothing"),
  ].join("\n");
}

/**
 * How a claim's current reading was arrived at.
 *
 * Every step names records rather than a sentence, because one narrowing can
 * withdraw several claims at once — two analyses reaching one reading are
 * withdrawn together (S-12). A rendering keyed on wording would show one
 * withdrawal where there were two.
 */
export function renderInterpretation(history: InterpretationHistory): string {
  const revision = (r: Revision): string =>
    [
      `${r.revision}`,
      `  withdrew: ${r.previously.map((c) => `"${c.asserts}" (${c.claim})`).join("; ")}`,
      `  now claims: "${r.nowClaims.asserts}"  (${r.nowClaims.claim})`,
      `  because: ${r.reason}`,
      r.restingOnTheOldReading.length
        ? `  resting on the old reading: ${r.restingOnTheOldReading
            .map((q) => `"${q.asks}" (${q.question})`)
            .join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  return [
    `Now claims "${history.nowClaims.asserts}"  (${history.nowClaims.claim})`,
    "",
    "Originally",
    bullets(
      history.originally.map((c) => `${c.asserts}  (${c.claim})`),
      "nothing was withdrawn to reach this reading",
    ),
    "",
    "Revisions",
    history.revisions.length
      ? history.revisions.map(revision).join("\n\n")
      : "  none — this reading has not been narrowed",
  ].join("\n");
}
