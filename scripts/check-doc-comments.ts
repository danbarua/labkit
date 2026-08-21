#!/usr/bin/env bun
/**
 * Finds doc comments that have come loose from what they document.
 *
 * Two edits produce the same defect and neither fails a build. The read/write
 * split took spans declaration-to-next-declaration, so every doc comment
 * travelled with the member *above* it; inserting a new interface between a doc
 * and its owner does the same thing by hand, which is how `QuestionStanding`
 * lost its doc to `HistoricalSurvey` a week later. Seventeen comments were wrong
 * for four commits before anyone read one closely enough to notice, and a doc
 * describing the wrong function is worse than none: it is confidently wrong, and
 * in this repo the doc comments *are* the reasoning record.
 *
 * The rule is deliberately narrow, so it stays true rather than becoming a style
 * gate: **a `/** ... *\/` block must be followed by something it can document.**
 * A block followed by another block has been orphaned by whatever was inserted
 * between them; a block followed by a closing brace or end-of-file documents
 * nothing at all.
 *
 * A file-leading module comment is exempt — it documents the file, and the next
 * thing after it is legitimately another doc block.
 *
 * Exit 0 = clean. Exit 1 = strays, listed. Not wired into any hook; run it after
 * moving code between files, which is when the defect is created.
 */
import { readFileSync } from "node:fs";
import { Glob } from "bun";

const glob = new Glob("src/**/*.ts");
let strays = 0;

for await (const path of glob.scan(".")) {
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("/**")) continue;
    // A one-line block opens and closes on the same line.
    let end = i;
    if (!line.endsWith("*/")) {
      while (end < lines.length && !(lines[end]?.trim() ?? "").endsWith("*/")) end++;
    }
    // The module comment at the top of a file documents the file.
    const leading = lines.slice(0, i).every((l) => l.trim() === "");
    let next = end + 1;
    while (next < lines.length && (lines[next]?.trim() ?? "") === "") next++;
    const after = next < lines.length ? (lines[next]?.trim() ?? "") : "(end of file)";
    const orphaned = after === "}" || after === "(end of file)";
    const displaced = after.startsWith("/**") && !leading;
    if (orphaned || displaced) {
      strays++;
      const first = (lines[i + 1] ?? lines[i] ?? "").trim().replace(/^\*\s?/, "");
      console.error(
        `${path}:${i + 1}: doc comment documents ${orphaned ? "nothing" : "another doc comment"}`,
      );
      console.error(`    ${first.slice(0, 90)}`);
    }
    i = end;
  }
}

if (strays > 0) {
  console.error(`\n${strays} stray doc comment${strays === 1 ? "" : "s"}.`);
  console.error("Each belongs to some declaration; find it and move it back.");
  process.exit(1);
}
console.log("check-doc-comments: every doc comment documents something.");
