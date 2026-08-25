/**
 * The acts themselves — the one view over the event log rather than the graph.
 *
 * Ported verbatim from the monolithic `src/cli.ts` — see `./knowledge.ts` for
 * why the comments came with the code.
 */

import type { DomainEvent } from "../../domain";
import type { Palette } from "../palette";

/**
 * The acts themselves, oldest first.
 *
 * **The only renderer here reading the event log rather than the graph**, and
 * the attribution is why it exists: who ran a command is not reconstructable
 * from the record at all (PJ-031), so this line is the only place it can be
 * read back. `seq` prints first because it is both the order and the cursor —
 * a reader paging through hands the last one back as `--since`.
 */
export function renderHappened(events: readonly DomainEvent[], p: Palette): string {
  if (events.length === 0)
    return [
      p.untested("Nothing matching."),
      "",
      p.quiet("An empty log is not an empty record: every other command answers from"),
      p.quiet("the graph, and answers there are durable whether or not an act was logged."),
    ].join("\n");
  return events
    .map((e) => {
      const who = e.attribution.attribution_label || "unattributed";
      // Short hash, because the full forty characters push the line past a
      // terminal and the first eight are what anybody types back into `git`.
      const commit = e.attribution.git_hash ? ` @${e.attribution.git_hash.slice(0, 8)}` : "";
      const minted = e.created?.length
        ? p.quiet(", minting ") + e.created.map((h) => p.handle(h)).join(p.quiet(", "))
        : "";
      return [
        `${p.quiet(String(e.seq ?? 0).padStart(5))}  ${p.quiet(e.at)}  ${p.heading(e.operation)}  ${p.handle(e.subject)}`,
        `         ${p.quiet(`by ${who}${commit}`)}${minted}`,
      ].join("\n");
    })
    .join("\n");
}
