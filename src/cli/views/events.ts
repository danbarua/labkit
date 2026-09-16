/**
 * The acts themselves — the one view over the event log rather than the graph.
 */

import { createdIn, edgesIn, retractedIn } from "../../domain";
import { gist } from "./format";
import type { EventPage, ListedNote } from "../../domain";
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
        ? p.quiet(" on ") + n.concerns.map((h) => h).join(p.quiet(", "))
        : "";
      const supersededMark = n.supersededBy.length
        ? p.quiet(` (superseded by ${n.supersededBy.map((h) => h).join(p.quiet(", "))})`)
        : "";
      // Its own line, and only when there is one: this is the fact that makes
      // the note an origin rather than a remark beside the record.
      const why = n.prompted ? [`         ${p.quiet("prompted ")}${n.prompted}`] : [];
      return [`${n.note}${about}${supersededMark}`, `  ${n.says}`, ...why].join("\n");
    })
    .join("\n\n");
}

export function renderHappened(
  { acts: events, more, since, narrowed }: EventPage,
  p: Palette,
): string {
  // **`more` first.** `--limit 0` returns no acts and `more: true`, and taking
  // the empty branch on the way past said the record held nothing.
  if (events.length === 0 && more)
    return [
      p.untested("Acts exist; this page holds none of them."),
      "",
      p.quiet("`--limit` took a page of zero. Ask for a bigger one."),
    ].join("\n");
  // Three different facts arrive here as one empty list, and a reader has to
  // know which, to decide between advancing the cursor and dropping a filter.
  if (events.length === 0) {
    if (since !== undefined)
      return [
        p.untested(`Nothing after seq ${since}.`),
        "",
        p.quiet(
          narrowed
            ? "The cursor is at the end of what these filters match."
            : "The cursor is at the end of the log.",
        ),
      ].join("\n");
    if (narrowed)
      return [
        p.untested("No act matches those filters."),
        "",
        p.quiet("The log is not empty — `happened` with no filters reads it."),
      ].join("\n");
    return [
      p.untested("Nothing recorded."),
      "",
      p.quiet("An empty log is not an empty record — every other command reads the graph."),
    ].join("\n");
  }
  const rendered = events
    .map((e) => {
      const who =
        e.attribution.attribution_how === "unattributed"
          ? "unattributed"
          : e.attribution.attribution_how === "claimed" && e.attribution.attribution_label === ""
            ? "[empty author label]"
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
      // `null` is not a hash: print that it was not captured, never a hex stand-in.
      const commit = e.attribution.git_hash
        ? ` @${e.attribution.git_hash.slice(0, 8)}`
        : p.quiet(" (not captured)");
      const created = createdIn(e);
      const minted = created.length
        ? p.quiet(", minting ") + created.map((h) => h).join(p.quiet(", "))
        : "";
      // Its own lines, not appended to the `minting` one. An act that writes
      // five nodes writes eight edges, and both on one line pushes past a
      // terminal -- the reason the commit hash above is already truncated.
      const wired = edgesIn(e).map(
        (x) => `           ${x.from} ${p.quiet(`-[${x.label}]->`)} ${x.to}`,
      );
      // What an `undo` took back. Without it the log said `undo LOE_3` and
      // nothing about what stopped being readable.
      const gone = retractedIn(e);
      const retracted = gone.length
        ? [`         ${p.quiet("retracting")}  ${gone.join(p.quiet(", "))}`]
        : [];
      // **What was asked for, not just what it did.** The arguments are on the
      // log and nowhere else: no other read recovers the `--because` behind an
      // `undo`. A gist apiece, and a short one — `wrap` breaks at a space and
      // a value may have none, so the cut plus the indent has to fit a line by
      // itself.
      const asked = Object.entries(e.command)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(
          ([k, v]) => `${p.quiet(`${k} `)}${gist(Array.isArray(v) ? v.join(", ") : String(v), 70)}`,
        );
      const args = asked.length ? [`         ${asked.join(p.quiet("  ·  "))}`] : [];
      // Its own line, and only when there is one. An absence here means nobody
      // said what the act was read off, which is not a claim that it was watched.
      const source = e.reconstructedFrom
        ? [`         ${p.quiet(`read off ${e.reconstructedFrom}`)}`]
        : [];
      return [
        `${p.quiet(String(e.seq).padStart(5))}  ${p.quiet(e.at)}  ${p.heading(e.operation)}  ${e.subject}`,
        `         ${p.quiet(`by ${who}`)}${how}${p.quiet(commit)}${minted}`,
        ...args,
        ...source,
        ...retracted,
        ...(wired.length ? [`         ${p.quiet("connecting")}`, ...wired] : []),
      ].join("\n");
    })
    .join("\n");
  // **Said, not left to be inferred from a full page.** A caller filtering this
  // list — `.seq > 52` over a default page of 50 — gets an empty answer and
  // cannot otherwise tell it from an empty record.
  if (!more) return rendered;
  const last = events.at(-1)!.seq;
  return [
    rendered,
    "",
    p.quiet(`More acts than this page holds. \`happened --since ${last}\` reads the next,`),
    p.quiet("or `--limit` takes a bigger one."),
  ].join("\n");
}
