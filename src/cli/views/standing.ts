/**
 * "What am I blocked on right now, what are my priorities?"
 *
 * Composes the same renderers `gates`, `work` and `known` already use: this
 * file adds no rendering logic of its own for a gate or a task, only the
 * section order. The top half (blocked gates, blocked work, incomplete
 * gates, untouched work) answers what is in the way; the bottom half (the
 * five buckets from `known`) answers what the record currently holds. No
 * heading marks the split — keep the two halves from interleaving rather
 * than labelling them.
 */

import type { Standing } from "../../domain";
import type { Palette } from "../palette";
import { renderGateList, renderWorkList } from "./gates";
import { renderKnown } from "./knowledge";

export function renderStanding(standing: Standing, p: Palette): string {
  const scope =
    standing.since !== undefined ? `Since seq ${standing.since} — what moved` : "Right now";
  return [
    p.heading(scope),
    "",
    p.contested("Blocked gates"),
    renderGateList(standing.blocked.gates, p),
    "",
    p.contested("Blocked work"),
    renderWorkList(standing.blocked.work, p),
    "",
    p.untested("Incomplete gates"),
    renderGateList(standing.unevaluated, p),
    "",
    p.untested("Untouched work — ready to start"),
    renderWorkList(standing.untouched, p),
    "",
    renderKnown(standing.known, p),
    "",
    p.quiet(`seq: ${standing.seq}  —  \`now --since ${standing.seq}\` asks what moves next`),
  ].join("\n");
}
