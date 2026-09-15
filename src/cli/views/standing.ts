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
  // Only what is there. Nine headings over "nothing" buried the one line that
  // was not, and every section is reachable by its own command when empty.
  const section = (title: string, body: string) => (body === "nothing" ? [] : [title, body, ""]);
  const known = renderKnown(standing.known, p);
  return [
    p.heading(scope),
    "",
    ...section(p.contested("Blocked gates"), renderGateList(standing.blocked.gates, p)),
    ...section(p.contested("Blocked work"), renderWorkList(standing.blocked.work, p)),
    ...section(p.untested("Incomplete gates"), renderGateList(standing.unevaluated.gates, p)),
    ...section(
      p.provisional("Waiting work — behind a gate nobody has finished checking"),
      renderWorkList(standing.unevaluated.work, p),
    ),
    ...section(
      p.untested("Untouched work — ready to start"),
      renderWorkList(standing.untouched, p),
    ),
    ...(known === "" ? [] : [known, ""]),
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
