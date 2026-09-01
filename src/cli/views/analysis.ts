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
import type { Palette } from "../palette";
import { bullets, partLine } from "./format";

export function renderAffects(report: DependencyReport, p: Palette): string {
  return [
    p.heading("Claims that would be affected"),
    // Id and wording both. A person reading this needs the sentence; a person
    // acting on it needs the handle every other command takes.
    bullets(
      report.claims.map((c) => `${c.asserts}  (${c.claim})`),
      "none found",
    ),
    "",
    p.heading("Lines of enquiry"),
    bullets(
      report.enquiries.map((e) => `${e.pursuing}  (${e.enquiry})`),
      "none found",
    ),
    "",
    p.heading("Routes walked"),
    bullets(
      report.routesWalked.map((r) => p.quiet(r)),
      "",
    ),
    "",
    p.provisional("This is a lower bound, not a finding of independence: anything"),
    p.provisional("connected by a route not listed above is absent from these lists"),
    p.provisional("and is not thereby unaffected."),
  ].join("\n");
}

/**
 * A re-run, against what its original read.
 *
 * It says `agrees`/`disagrees` and never `reproduced`, which is the word a
 * reader most wants and the one the record cannot support: whether reading the
 * same inputs constitutes the same execution depends on what the method does,
 * and the record does not know that. The closing paragraph says so
 * rather than leaving the reader to supply the stronger claim themselves.
 */
export function renderReproduction(report: ReproductionReport, p: Palette): string {
  const verdict = report.conclusion === "agrees" ? p.settled : p.contested;
  return [
    `${p.heading(report.verificationMethod)}  ${p.handle(`(${report.verification})`)}`,
    `  re-checking ${report.ofMethod}  ${p.handle(`(${report.of})`)}`,
    `  the two runs' findings ${verdict(report.conclusion)} — this ${verdict(report.bearing)} confidence`,
    "",
    p.heading("The re-run read"),
    bullets(
      report.verificationRead.map((a) => partLine(a, p)),
      p.untested("nothing on the record"),
    ),
    "",
    p.heading("The original read"),
    bullets(
      report.ofRead.map((a) => partLine(a, p)),
      p.untested("nothing on the record"),
    ),
    report.differs.length
      ? `\n${p.contested("Differing")}\n${bullets(
          report.differs.map((d) => `${partLine(d.what, p)} — ${p.contested(d.standing)}`),
          "",
        )}`
      : `\n${p.settled("Nothing differs in what the two runs read.")}`,
    "",
    p.provisional("This does not say the original was reproduced. Whether reading the same"),
    p.provisional("records is the same execution depends on what the method does, and the"),
    p.provisional("record does not know that."),
  ].join("\n");
}

/**
 * Whether an analysis can be accounted for from what it read.
 *
 * `unverifiable` gets its own bucket and its own explanation. It is the record
 * admitting it kept no hash, which is not the same answer as "differs" — and
 * folding it in would report a failure nobody found.
 */
export function renderReproducibility(report: ReproducibilityReport, p: Palette): string {
  return [
    `${p.handle(report.analysis)} — ${report.reproducible ? p.settled("accounted for") : p.contested("not accounted for")}`,
    "",
    p.settled("Rebuilt and identical"),
    bullets(
      report.exact.map((a) => partLine(a, p)),
      p.untested("nothing"),
    ),
    "",
    p.contested("Rebuilt and different"),
    bullets(
      report.differing.map((a) => partLine(a, p)),
      p.untested("nothing"),
    ),
    "",
    // Provisional, not contested: the record declining to answer is not the
    // same as answering no, which is the distinction this bucket exists for.
    p.provisional("Unverifiable (the record kept no hash, so nothing can be said either way)"),
    bullets(
      report.unverifiable.map((a) => partLine(a, p)),
      p.untested("nothing"),
    ),
    "",
    p.untested("Not rebuilt"),
    bullets(
      report.notRebuilt.map((a) => partLine(a, p)),
      p.untested("nothing"),
    ),
  ].join("\n");
}

/**
 * How a claim's current reading was arrived at.
 *
 * Every step names records rather than a sentence, because one narrowing can
 * withdraw several claims at once — two analyses reaching one reading are
 * withdrawn together. A rendering keyed on wording would show one
 * withdrawal where there were two.
 */
export function renderInterpretation(history: InterpretationHistory, p: Palette): string {
  const revision = (r: Revision): string =>
    [
      p.handle(r.revision),
      `  ${p.provisional("withdrew")}: ${r.previously.map((c) => `"${c.asserts}" ${p.handle(`(${c.claim})`)}`).join("; ")}`,
      `  now claims: "${r.nowClaims.asserts}"  ${p.handle(`(${r.nowClaims.claim})`)}`,
      `  because: ${r.reason}`,
      r.restingOnTheOldReading.length
        ? `  ${p.contested("resting on the old reading")}: ${r.restingOnTheOldReading
            .map((q) => `"${q.asks}" ${p.handle(`(${q.question})`)}`)
            .join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  return [
    `${p.heading(`Now claims "${history.nowClaims.asserts}"`)}  ${p.handle(`(${history.nowClaims.claim})`)}`,
    "",
    p.heading("Originally"),
    bullets(
      history.originally.map((c) => `${c.asserts}  ${p.handle(`(${c.claim})`)}`),
      p.untested("nothing was withdrawn to reach this reading"),
    ),
    "",
    p.heading("Revisions"),
    history.revisions.length
      ? history.revisions.map(revision).join("\n\n")
      : `  ${p.untested("none — this reading has not been narrowed")}`,
  ].join("\n");
}
