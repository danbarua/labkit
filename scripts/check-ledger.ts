#!/usr/bin/env bun
/**
 * Enforces the one rule in CLAUDE.md that has a deadline attached.
 *
 * > At most one confirmed wrong answer ships green at a time, and clearing it
 * > is the next thing built.
 *
 * That rule sat in prose for eleven scenarios with no way to check it. Its
 * precondition — *is any row currently a demonstrated wrong answer?* — could
 * only be answered by reading PJ-008 §3 closely enough to tell a demonstrated
 * defect from an unowned gap, and the ledger's own vocabulary could not mark
 * the difference until row AD needed it.
 *
 * That is row K's failure mode: a condition recorded in a section nobody
 * re-reads is not a mechanism. Row K's trigger fired and sat unnoticed through
 * three external reviews. A fourth status label that nothing counts would
 * repeat it, so this counts it.
 *
 * Deliberately one rule and not a linter for the whole table. Everything else
 * in §3 is judgment — whether a row is `open` or `boundary`, whether a
 * discriminator is really named — and a script that adjudicated those would be
 * wrong more often than the table is.
 *
 * Exit 0 = at most one `demonstrated` row. Exit 1 = two or more, listed.
 */
import { readFileSync } from "node:fs";

const LEDGER = "docs/project-journal/008_user_story_mining.md";
const lines = readFileSync(LEDGER, "utf8").split("\n");

/** `| AD | Pressure point | S-9b | demonstrated |` — the §3 table's row shape. */
const demonstrated: Array<{ row: string; what: string }> = [];
for (const line of lines) {
  if (!line.startsWith("|")) continue;
  const cells = line.split("|").map((c) => c.trim());
  // cells[0] is the empty string before the leading pipe.
  const [, row, what, , status] = cells;
  if (cells.length < 6 || status !== "demonstrated") continue;
  // The status legend quotes the vocabulary in a two-column table; a real row
  // has an id of one or two letters.
  if (!row || !/^[A-Z]{1,2}$/.test(row)) continue;
  demonstrated.push({ row, what: what ?? "" });
}

if (demonstrated.length > 1) {
  console.error(
    `${LEDGER}: ${demonstrated.length} rows are \`demonstrated\`, and CLAUDE.md permits one.`,
  );
  for (const d of demonstrated) console.error(`    row ${d.row} — ${d.what}`);
  console.error(
    "\nA demonstrated wrong answer is a live defect with a comment on it. One is a",
  );
  console.error(
    "considered trade; two means the trade stopped being considered. Clear one",
  );
  console.error("before opening another, or argue in the ledger why this is not that.");
  process.exit(1);
}

console.log(
  demonstrated.length === 1
    ? `check-ledger: row ${demonstrated[0]!.row} is the one demonstrated wrong answer. Clearing it is next.`
    : "check-ledger: no demonstrated wrong answer is shipping green.",
);
