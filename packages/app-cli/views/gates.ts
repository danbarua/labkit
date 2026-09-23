/**
 * Gates, the conditions bound to them, and the work they protect.
 */

import type {
  AmendmentRecord,
  ConditionHistory,
  CheckStatus,
  CriterionRef,
  DesignHistory,
  GateRef,
  GateStatus,
  ListedGate,
  ListedWork,
  TaskContract,
} from "@labkit/core-domain";
import type { Palette } from "../palette";
import { bullets, relativeAge, rows } from "./format";

/**
 * A gate, itemised per condition.
 */
export function renderGate(status: GateStatus, p: Palette): string {
  // The verdict's own sentence is not here -- see `DecidingEvaluation`. The
  // handle is, so a reader can reach it.
  const check = (c: CheckStatus): string[] => {
    const about = c.decidedBy?.about ? ` about ${c.decidedBy.about}` : "";
    const decided = c.decidedBy
      ? `  decided ${c.decidedBy.outcome === "pass" ? "passed" : "failed"}${about} ${p.quiet(c.decidedBy.at)} ${`(${c.decidedBy.evaluation})`}`
      : "";
    return [c.state, `(${c.criterion})`, `${c.proposition}${decided}`];
  };
  return [
    `${status.gate} — ${status.state}${status.everFailed ? `  ${p.contested("(has failed at least once)")}` : ""}`,
    `  consequence: ${status.consequence}`,
    status.closure
      ? `  closed by ${status.closure.decision}\n  because: ${status.closure.because}`
      : "",
    "",
    `${p.heading("Conditions by state")}\n${bullets(
      rows(
        (Object.entries(status.counts) as [CheckStatus["state"], number][])
          .filter(([, n]) => n > 0)
          .map(([s, n]) => [s, String(n)]),
      ),
      "none",
    )}`,
    "",
    p.heading("Conditions"),
    bullets(rows(status.checks.map(check)), "none"),
    status.unmet.length
      ? `\nNot currently met\n${bullets(
          rows(status.unmet.map((u) => [`(${u.criterion})`, u.requires])),
          "",
        )}`
      : "",
    status.gating.length
      ? `\nGating\n${bullets(rows(status.gating.map((w) => [`(${w.work})`, w.objective])), "")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderCriteria(criteria: CriterionRef[], gate: GateRef, p: Palette): string {
  return [
    p.heading(`Conditions governing ${gate}`),
    bullets(
      criteria.map((c) => c),
      p.untested("none — this gate is bound to no prespecified condition"),
    ),
    "",
    p.quiet("`labkit gate` gives the same conditions with their wording and standing."),
  ].join("\n");
}

/**
 * How a gate's conditions reached their current wording.
 */
export function renderDesign(history: DesignHistory, p: Palette): string {
  const amendment = (a: AmendmentRecord): string =>
    [
      `${`(${a.amendment})`}  ${a.nature}`,
      `  was: ${a.replaced.requires}`,
      `  now: ${a.nowRequires.requires}`,
      `  because: ${a.reason}`,
      a.citing.length ? `  citing: ${a.citing.map((f) => f.states).join("; ")}` : "",
      a.rerun.length
        ? `  ${p.contested("needs re-running")}: ${a.rerun.map((w) => `${`(${w.work})`}  ${w.objective}`).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  const condition = (c: ConditionHistory): string =>
    [
      `${c.criterion}`,
      `  originally: ${c.originally.requires}`,
      `  now requires: ${c.nowRequires.requires}`,
      "",
      c.amendments.length
        ? c.amendments
            .map((a) =>
              amendment(a)
                .split("\n")
                .map((line) => `  ${line}`)
                .join("\n"),
            )
            .join("\n\n")
        : `  ${p.untested("not amended — the condition still reads as it was first stated")}`,
    ].join("\n");
  return [
    history.gate,
    "",
    p.heading("Conditions"),
    history.conditions.map(condition).join("\n\n"),
  ].join("\n");
}

/**
 * A planned piece of work.
 */
export function renderContract(contract: TaskContract, p: Palette): string {
  return [
    `${p.heading(contract.objective)}  ${`(${contract.work})`}`,
    `  meeting it means: ${contract.acceptance}`,
    ...(contract.addressing
      ? [
          `  addressing: ${contract.addressing.enquiry} "${contract.addressing.pursuing}"`,
          `  pursuing: ${contract.addressing.question} "${contract.addressing.asks}"`,
        ]
      : []),
    "",
    p.heading("May read (not enforced)"),
    bullets(contract.mayRead, p.untested("nothing named")),
  ].join("\n");
}

/**
 * Every gate, one per line, with its state.
 */
export function renderGateList(gates: ListedGate[], p: Palette, heading = false): string {
  const title = heading ? p.heading(`Gates — ${gates.length}`) : "";
  if (gates.length === 0) return title ? `${title}\nnothing` : "nothing";
  // One pair of columns for every row, the nested work included: a gate and
  // the work under it put their handles at the same indent, so a reader scans
  // the handle column rather than hunting it inside each line.
  // A gate and the work under it are rows of the same table, so their handles
  // land in one column and a reader scans it rather than hunting each line.
  const cells = gates.flatMap((g) => [
    // Absent for a gate no evaluation has ever reached — nothing to date.
    [
      g.state,
      g.gate,
      `${g.consequence}${g.lastTouched ? `  ${p.quiet(`(${relativeAge(g.lastTouched)})`)}` : ""}`,
    ],
    ...g.gating.map((w) => [p.quiet("holding up"), w.work, w.objective]),
  ]);
  const body = rows(cells).join("\n");
  return title ? `${title}\n${body}` : body;
}

/**
 * Every planned piece of work, one per line, with its state.
 */
export function renderWorkList(work: ListedWork[], p: Palette, heading = false): string {
  const title = heading ? p.heading(`Work — ${work.length}`) : "";
  if (work.length === 0) return title ? `${title}\nnothing` : "nothing";
  // Coloured centrally by `colourVocabulary`; `rows` does the alignment.
  const body = rows(work.map((w) => [w.state, w.work, w.objective])).join("\n");
  return title ? `${title}\n${body}` : body;
}
