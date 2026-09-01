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
  ListedGate,
  ListedWork,
  TaskContract,
} from "../../domain";
import type { Palette } from "../palette";
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
 *
 * An evaluation's `basis` (S-8) is the same shape of omission (#151): empty
 * means the verdict was asserted, not measured, and the type has carried that
 * since S-8 with no view printing it — `labkit gate` read an asserted verdict
 * and a four-times-cited one identically. Prints `asserted` for the former,
 * what it rests on for the latter, the same way `enquiry` prints "The
 * question's answer rests on".
 */
export function renderGate(status: GateStatus, p: Palette): string {
  // The four states are the whole point of this page, so each gets its own
  // colour rather than pass/not-pass.
  //
  // **The colour is chosen from `key` and applied to `text`, which are not
  // always the same string.** A condition's state is padded to a column before
  // it is coloured — padding afterwards would pad the escape bytes nobody can
  // see — and the first version passed the *padded* string in, so `"failed   "`
  // matched none of the cases and every state fell through to the same colour.
  // `tests/cli/views.test.ts` caught it by asserting two states differ.
  const state = (key: string, text: string = key) =>
    key === "passed" || key === "satisfied"
      ? p.settled(text)
      : key === "failed" || key === "blocked"
        ? p.contested(text)
        : key === "never-run" || key === "never-evaluated"
          ? p.untested(text)
          : p.provisional(text);
  const check = (c: CheckStatus): string => {
    const decided = c.decidedBy
      ? `  decided ${state(c.decidedBy.outcome === "pass" ? "passed" : "failed")} on "${c.decidedBy.value}"`
      : "";
    // Padded before colouring: an escape sequence has length and would throw
    // the column off by exactly the bytes nobody can see.
    return `${state(c.state, c.state.padEnd(19))} ${c.proposition}  ${p.handle(`(${c.criterion})`)}${decided}`;
  };
  return [
    `${p.handle(status.gate)} — ${state(status.state)}${status.everFailed ? `  ${p.contested("(has failed at least once)")}` : ""}`,
    `  consequence: ${status.consequence}`,
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
    status.evaluations.length
      ? `\n${p.heading("Evaluations")}\n${bullets(
          status.evaluations.map(
            (e) =>
              `${p.quiet(e.at)}  ${state(e.outcome === "pass" ? "passed" : "failed")}  "${e.value}"  ${p.handle(`(${e.evaluation})`)}${e.withdrawn ? `  ${p.provisional("withdrawn")}` : ""}` +
              (e.basis.length === 0
                ? `  ${p.untested("asserted")}`
                : `  resting on: ${e.basis.map((f) => `${f.states}  ${p.handle(`(${f.evidence})`)}`).join("; ")}`),
          ),
          "",
        )}`
      : "",
    "",
    p.quiet("Computed, never stored. There is no value anyone can set to `satisfied`."),
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
 *
 * `nature` prints on every amendment, first. `mechanical` and `scientific` are
 * what S-7 built `IMPLEMENTS` to tell apart — an amendment that moves a
 * prespecified comparison is not a tidy-up — and it is the field a reader
 * skims for.
 */
export function renderDesign(history: DesignHistory, p: Palette): string {
  const amendment = (a: AmendmentRecord): string =>
    [
      // `mechanical` versus `scientific` is what S-7 built IMPLEMENTS to tell
      // apart, and the field a reader skims for.
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
  return [
    `${p.handle(history.gate)}, on ${p.handle(history.criterion)}`,
    `  originally: ${history.originally.requires}`,
    `  now requires: ${history.nowRequires.requires}`,
    "",
    p.heading("Amendments"),
    history.amendments.length
      ? history.amendments.map(amendment).join("\n\n")
      : `  ${p.untested("none — the condition still reads as it was first stated")}`,
    "",
    p.quiet("Ordered from the record itself, not from timestamps."),
  ].join("\n");
}

/**
 * A planned piece of work.
 *
 * The `enforced` caveat prints unconditionally rather than on a branch — the
 * field is typed `false`, so there is no other case, and a reader who sees a
 * `mayRead` list without it will take the list for a sandbox.
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
 *
 * **The state is padded before it is coloured, and the colour is picked from
 * the unpadded value.** Both halves earned themselves in `renderGate`: an
 * escape sequence has length, so colouring first pads bytes nobody can see, and
 * matching on the padded string means `"blocked  "` matches no case and every
 * gate comes out the same colour.
 *
 * A gate's *consequence* is what a reader is scanning for — `blocked` alone
 * says something is stuck, and the consequence says what it costs — so it is on
 * the line rather than a hop away.
 */
export function renderGateList(gates: ListedGate[], p: Palette): string {
  if (gates.length === 0) return "nothing";
  const width = Math.max(...gates.map((g) => g.state.length));
  return gates
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
}

/**
 * Every planned piece of work, one per line, with its state.
 *
 * The same padding rule as above, for the same reason.
 *
 * `planned` is deliberately the *untested* colour rather than a warning one:
 * work nobody has started is the ordinary state of a queue, not a problem, and
 * colouring it as one is how a list becomes something people stop reading.
 */
export function renderWorkList(work: ListedWork[], p: Palette): string {
  if (work.length === 0) return "nothing";
  const width = Math.max(...work.map((w) => w.state.length));
  return work
    .map((w) => {
      const padded = w.state.padEnd(width);
      const state =
        w.state === "carried-out"
          ? p.settled(padded)
          : w.state === "blocked"
            ? p.contested(padded)
            : p.untested(padded);
      return `${state}  ${p.handle(w.work)}  ${w.objective}`;
    })
    .join("\n");
}
