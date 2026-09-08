/**
 * "What am I blocked on right now, what are my priorities?"
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
    renderGateList(standing.unevaluated.gates, p),
    "",
    p.provisional("Waiting work — behind a gate nobody has finished checking"),
    renderWorkList(standing.unevaluated.work, p),
    "",
    p.untested("Untouched work — ready to start"),
    renderWorkList(standing.untouched, p),
    "",
    renderKnown(standing.known, p),
    "",
    // The whole record in both readings, so it is stated as such -- a `--since`
    // report narrows every section above and this line does not follow.
    ...(standing.transcribed.transcribed > 0
      ? [
          p.quiet(
            `${standing.transcribed.transcribed} of ${standing.transcribed.acts} acts on this record were read off something  —  \`happened --reconstructed\` lists them`,
          ),
        ]
      : []),
    p.quiet(`seq: ${standing.seq}  —  \`now --since ${standing.seq}\` asks what moves next`),
  ].join("\n");
}
