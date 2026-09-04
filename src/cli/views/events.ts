/**
 * The acts themselves — the one view over the event log rather than the graph.
 *
 * Ported verbatim from the monolithic `src/cli.ts` — see `./knowledge.ts` for
 * why the comments came with the code.
 */

import { createdIn, edgesIn } from "../../domain";
import type { DomainEvent } from "../../domain";
import type { Palette } from "../palette";

/**
 * The acts themselves, oldest first.
 *
 * **The only renderer here reading the event log rather than the graph**, and
 * the attribution is why it exists: who ran a command is not reconstructable
 * from the record at all, so this line is the only place it can be
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
      // **How the name was come by, printed beside it.** `labkit happened` is
      // the command the grade exists for: it is where `--author dan` and a bare
      // an OS-supplied name are otherwise indistinguishable. `observed` is
      // left silent because it is the ordinary case and a mark on every line
      // marks nothing; what a reader needs to see is the line that was merely
      // asserted. `null` is a row written before the grade existed and says so
      // rather than being guessed at.
      const how =
        e.attribution.attribution_how === "claimed"
          ? p.quiet(" (claimed)")
          : e.attribution.attribution_how === null
            ? p.quiet(" (grade not recorded)")
            : "";
      // Short hash, because the full forty characters push the line past a
      // terminal and the first eight are what anybody types back into `git`.
      const commit = e.attribution.git_hash ? ` @${e.attribution.git_hash.slice(0, 8)}` : "";
      const created = createdIn(e);
      const minted = created.length
        ? p.quiet(", minting ") + created.map((h) => p.handle(h)).join(p.quiet(", "))
        : "";
      // Its own lines, not appended to the `minting` one. An act that writes
      // five nodes writes eight edges, and both on one line pushes past a
      // terminal -- the reason the commit hash above is already truncated.
      const wired = edgesIn(e).map(
        (x) => `           ${p.handle(x.from)} ${p.quiet(`-[${x.label}]->`)} ${p.handle(x.to)}`,
      );
      return [
        `${p.quiet(String(e.seq ?? 0).padStart(5))}  ${p.quiet(e.at)}  ${p.heading(e.operation)}  ${p.handle(e.subject)}`,
        `         ${p.quiet(`by ${who}`)}${how}${p.quiet(commit)}${minted}`,
        ...(wired.length ? [`         ${p.quiet("connecting")}`, ...wired] : []),
      ].join("\n");
    })
    .join("\n");
}
