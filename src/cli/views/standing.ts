/**
 * "What am I blocked on right now, what are my priorities?" (#55).
 *
 * Composes the same renderers `gates`, `work` and `known` already use —
 * `lists filter, detail tools explain` applies to the page as much as to the
 * data: this file adds no rendering logic of its own for a gate or a task,
 * only the section headings that order them the way Dan's own framing does
 * (blocked first, then where the map hasn't been walked, then the standing
 * of what the gates were for).
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
    p.untested("Unevaluated gates"),
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
