/**
 * Gates, the conditions bound to them, and the work they protect.
 *
 * Ported verbatim from the monolithic `src/cli.ts` — see `./knowledge.ts` for
 * why the comments came with the code.
 */

import type {
  AmendmentRecord,
  CheckStatus,
  CriterionRef,
  DesignHistory,
  GateRef,
  GateStatus,
  TaskContract,
} from "../../domain";
import { bullets } from "./format";

/**
 * A gate, itemised per condition.
 *
 * Two things are deliberately not collapsed. The four states are printed as
 * themselves — `never-run` and `no-standing-verdict` are different facts, and
 * a boolean would report both as "not passed". And `everFailed` prints beside
 * the state rather than being implied by it: a gate that failed and was
 * re-checked is satisfied *now* and has failed, which is why the field
 * survives a later pass at all (S-3c).
 *
 * Withdrawn evaluations are listed rather than dropped, marked as withdrawn.
 * A check that was decided and then withdrawn is not a check nobody ran.
 */
export function renderGate(status: GateStatus): string {
  const check = (c: CheckStatus): string => {
    const decided = c.decidedBy ? `  decided ${c.decidedBy.outcome} on "${c.decidedBy.value}"` : "";
    return `${c.state.padEnd(19)} ${c.proposition}  (${c.criterion})${decided}`;
  };
  return [
    `${status.gate} — ${status.state}${status.everFailed ? "  (has failed at least once)" : ""}`,
    `  consequence: ${status.consequence}`,
    "",
    "Conditions",
    bullets(status.checks.map(check), "none"),
    status.unmet.length
      ? `\nNot currently met\n${bullets(status.unmet.map((u) => `${u.requires}  (${u.criterion})`), "")}`
      : "",
    status.gating.length
      ? `\nGating\n${bullets(status.gating.map((w) => `${w.objective}  (${w.work})`), "")}`
      : "",
    status.evaluations.length
      ? `\nEvaluations\n${bullets(
          status.evaluations.map(
            (e) =>
              `${e.at}  ${e.outcome}  "${e.value}"  (${e.evaluation})${e.withdrawn ? "  withdrawn" : ""}`,
          ),
          "",
        )}`
      : "",
    "",
    "Computed, never stored. There is no value anyone can set to `satisfied`.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderCriteria(criteria: CriterionRef[], gate: GateRef): string {
  return [
    `Conditions governing ${gate}`,
    bullets([...criteria], "none — this gate is bound to no prespecified condition"),
    "",
    "Handles only. `labkit gate` gives the same conditions with their wording and",
    "their current standing.",
  ].join("\n");
}

/**
 * How a gate's conditions reached their current wording.
 *
 * `nature` prints on every amendment, first. `mechanical` and `scientific` are
 * what S-7 built `IMPLEMENTS` to tell apart — an amendment that moves a
 * prespecified comparison is not a tidy-up — and it is the field a reader
 * skims for.
 */
export function renderDesign(history: DesignHistory): string {
  const amendment = (a: AmendmentRecord): string =>
    [
      `${a.nature}  (${a.amendment})`,
      `  was: ${a.replaced.requires}`,
      `  now: ${a.nowRequires.requires}`,
      `  because: ${a.reason}`,
      a.citing.length ? `  citing: ${a.citing.map((f) => f.states).join("; ")}` : "",
      a.rerun.length
        ? `  needs re-running: ${a.rerun.map((w) => `${w.objective} (${w.work})`).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  return [
    `${history.gate}, on ${history.criterion}`,
    `  originally: ${history.originally.requires}`,
    `  now requires: ${history.nowRequires.requires}`,
    "",
    "Amendments",
    history.amendments.length
      ? history.amendments.map(amendment).join("\n\n")
      : "  none — the condition still reads as it was first stated",
    "",
    "Ordered from the record itself, not from timestamps.",
  ].join("\n");
}

/**
 * A planned piece of work.
 *
 * The `enforced` caveat prints unconditionally rather than on a branch — the
 * field is typed `false`, so there is no other case, and a reader who sees a
 * `mayRead` list without it will take the list for a sandbox.
 */
export function renderContract(contract: TaskContract): string {
  return [
    `${contract.objective}  (${contract.work})`,
    `  meeting it means: ${contract.acceptance}`,
    "",
    "May read",
    bullets(contract.mayRead, "nothing named"),
    "",
    "Not enforced. The record states what this work may look at; nothing stops",
    "a computation reading elsewhere.",
  ].join("\n");
}
