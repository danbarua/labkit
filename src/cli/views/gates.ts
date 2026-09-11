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
} from "../../domain";
import type { Palette } from "../palette";
import { bullets } from "./format";

/**
 * A gate, itemised per condition.
 */
export function renderGate(status: GateStatus, p: Palette): string {
  // A gate closure is neither a passed nor a failed check. Keep it visibly distinct from both.
  const state = (key: string, text: string = key) =>
    key === "passed" || key === "satisfied"
      ? p.settled(text)
      : key === "failed" || key === "blocked"
        ? p.contested(text)
        : key === "never-run" || key === "never-evaluated"
          ? p.untested(text)
          : p.provisional(text);
  const check = (c: CheckStatus): string => {
    // The verdict's own sentence is not here -- see `DecidingEvaluation`. The handle is, so a
    // reader can reach it.
    const about = c.decidedBy?.about ? ` about ${p.handle(c.decidedBy.about)}` : "";
    const decided = c.decidedBy
      ? `  decided ${state(c.decidedBy.outcome === "pass" ? "passed" : "failed")}${about} ${p.quiet(c.decidedBy.at)} ${p.handle(`(${c.decidedBy.evaluation})`)}`
      : "";
    // Padded before colouring: an escape sequence has length and would throw
    // the column off by exactly the bytes nobody can see.
    return `${state(c.state, c.state.padEnd(19))} ${c.proposition}  ${p.handle(`(${c.criterion})`)}${decided}`;
  };
  return [
    `${p.handle(status.gate)} — ${state(status.state)}${status.everFailed ? `  ${p.contested("(has failed at least once)")}` : ""}`,
    `  consequence: ${status.consequence}`,
    status.closure
      ? `  closed: ${status.closure.kind} by ${p.handle(status.closure.decision)}\n  because: ${status.closure.because}`
      : "",
    "",
    `${p.heading("Conditions by state")}\n${bullets(
      (Object.entries(status.counts) as [CheckStatus["state"], number][])
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${state(s, s.padEnd(19))} ${n}`),
      "none",
    )}`,
    "",
    p.heading("Conditions"),
    bullets(status.checks.map(check), "none"),
    status.unmet.length
      ? `\nNot currently met\n${bullets(
          status.unmet.map((u) => `${u.requires}  (${u.criterion})`),
          "",
        )}`
      : "",
    status.gating.length
      ? `\nGating\n${bullets(
          status.gating.map((w) => `${w.objective}  (${w.work})`),
          "",
        )}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderCriteria(criteria: CriterionRef[], gate: GateRef, p: Palette): string {
  return [
    p.heading(`Conditions governing ${p.handle(gate)}`),
    bullets(
      criteria.map((c) => p.handle(c)),
      p.untested("none — this gate is bound to no prespecified condition"),
    ),
    "",
    p.quiet("Handles only. `labkit gate` gives the same conditions with their wording and"),
    p.quiet("their current standing."),
  ].join("\n");
}

/**
 * How a gate's conditions reached their current wording.
 */
export function renderDesign(history: DesignHistory, p: Palette): string {
  const amendment = (a: AmendmentRecord): string =>
    [
      `${a.nature === "scientific" ? p.contested(a.nature) : p.provisional(a.nature)}  ${p.handle(`(${a.amendment})`)}`,
      `  was: ${a.replaced.requires}`,
      `  now: ${a.nowRequires.requires}`,
      `  because: ${a.reason}`,
      a.citing.length ? `  citing: ${a.citing.map((f) => f.states).join("; ")}` : "",
      a.rerun.length
        ? `  ${p.contested("needs re-running")}: ${a.rerun.map((w) => `${w.objective} ${p.handle(`(${w.work})`)}`).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  const condition = (c: ConditionHistory): string =>
    [
      `${p.handle(c.criterion)}`,
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
    p.handle(history.gate),
    "",
    p.heading("Conditions"),
    history.conditions.map(condition).join("\n\n"),
    "",
    p.quiet("Ordered from the record itself, not from timestamps."),
  ].join("\n");
}

/**
 * A planned piece of work.
 */
export function renderContract(contract: TaskContract, p: Palette): string {
  return [
    `${p.heading(contract.objective)}  ${p.handle(`(${contract.work})`)}`,
    `  meeting it means: ${contract.acceptance}`,
    ...(contract.addressing
      ? [
          `  addressing: ${p.handle(contract.addressing.enquiry)} "${contract.addressing.pursuing}"`,
          `  pursuing: ${p.handle(contract.addressing.question)} "${contract.addressing.asks}"`,
        ]
      : []),
    "",
    p.heading("May read"),
    bullets(contract.mayRead, p.untested("nothing named")),
    "",
    p.provisional("Not enforced. The record states what this work may look at; nothing stops"),
    p.provisional("a computation reading elsewhere."),
  ].join("\n");
}

/**
 * Every gate, one per line, with its state.
 */
export function renderGateList(gates: ListedGate[], p: Palette, heading = false): string {
  const title = heading ? p.heading(`Gates — ${gates.length}`) : "";
  if (gates.length === 0) return title ? `${title}\nnothing` : "nothing";
  const width = Math.max(...gates.map((g) => g.state.length));
  const rows = gates
    .map((g) => {
      const padded = g.state.padEnd(width);
      const state =
        g.state === "satisfied"
          ? p.settled(padded)
          : g.state === "blocked"
            ? p.contested(padded)
            : g.state === "never-evaluated"
              ? p.untested(padded)
              : p.provisional(padded);
      return `${state}  ${p.handle(g.gate)}  ${g.consequence}`;
    })
    .join("\n");
  return title ? `${title}\n${rows}` : rows;
}

/**
 * Every planned piece of work, one per line, with its state.
 */
export function renderWorkList(work: ListedWork[], p: Palette, heading = false): string {
  const title = heading ? p.heading(`Work — ${work.length}`) : "";
  if (work.length === 0) return title ? `${title}\nnothing` : "nothing";
  const width = Math.max(...work.map((w) => w.state.length));
  const rows = work
    .map((w) => {
      const padded = w.state.padEnd(width);
      const state =
        w.state === "carried-out"
          ? p.settled(padded)
          : w.state === "blocked"
            ? p.contested(padded)
            : w.state === "waiting"
              ? p.provisional(padded)
              : // Abandoned work is not waiting on anything, so it reads like the
                // rest of the record's settled-and-set-aside states rather than
                // like something a reader still has to act on.
                w.state === "abandoned"
                ? p.quiet(padded)
                : p.untested(padded);
      return `${state}  ${p.handle(w.work)}  ${w.objective}`;
    })
    .join("\n");
  return title ? `${title}\n${rows}` : rows;
}
