/**
 * The acts themselves — the one view over the event log rather than the graph.
 */

import { createdIn, edgesIn } from "../../domain";
import type { DomainEvent, EventPage, ListedNote } from "../../domain";
import type { Palette } from "../palette";

/**
 * The acts themselves, oldest first.
 */
export function renderNotes(notes: readonly ListedNote[], p: Palette): string {
  if (notes.length === 0)
    return [
      p.untested("No notes."),
      "",
      p.quiet('A note is the one write with nothing required of it — `labkit note "…"`.'),
    ].join("\n");
  return notes
    .map((n) => {
      const about = n.concerns.length
        ? p.quiet(" on ") + n.concerns.map((h) => p.handle(h)).join(p.quiet(", "))
        : "";
      // Its own line, and only when there is one: this is the fact that makes
      // the note an origin rather than a remark beside the record.
      const why = n.prompted ? [`         ${p.quiet("prompted ")}${p.handle(n.prompted)}`] : [];
      return [`${p.handle(n.note)}${about}`, `  ${n.says}`, ...why].join("\n");
    })
    .join("\n\n");
}

export function renderHappened({ acts: events, more }: EventPage, p: Palette): string {
  if (events.length === 0)
    return [
      p.untested("Nothing matching."),
      "",
      p.quiet("An empty log is not an empty record: every other command answers from"),
      p.quiet("the graph, and answers there are durable whether or not an act was logged."),
    ].join("\n");
  const rendered = events
    .map((e) => {
      const who =
        e.attribution.attribution_how === "unattributed"
          ? "unattributed"
          : e.attribution.attribution_label;
      // **How the name was come by, printed beside it.** `labkit happened` is the command the
      // grade exists for: it is where `--author dan` and a bare an OS-supplied name are
      // otherwise indistinguishable.
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
      // Its own line, and only when there is one. An absence here means nobody
      // said what the act was read off, which is not a claim that it was watched.
      const source = e.reconstructedFrom
        ? [`         ${p.quiet(`read off ${e.reconstructedFrom}`)}`]
        : [];
      return [
        `${p.quiet(String(e.seq ?? 0).padStart(5))}  ${p.quiet(e.at)}  ${p.heading(e.operation)}  ${p.handle(e.subject)}`,
        `         ${p.quiet(`by ${who}`)}${how}${p.quiet(commit)}${minted}`,
        ...source,
        ...(wired.length ? [`         ${p.quiet("connecting")}`, ...wired] : []),
      ].join("\n");
    })
    .join("\n");
  // **Said, not left to be inferred from a full page.** A caller filtering this
  // list — `.seq > 52` over a default page of 50 — gets an empty answer and
  // cannot otherwise tell it from an empty record.
  if (!more) return rendered;
  const last = events.at(-1)?.seq ?? 0;
  return [
    rendered,
    "",
    p.quiet(`More acts than this page holds. \`happened --since ${last}\` reads the next,`),
    p.quiet("or `--limit` takes a bigger one."),
  ].join("\n");
}
