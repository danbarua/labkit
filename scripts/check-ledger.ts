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
 * **Two rules, and the second exists because the first inherited the blind spot
 * it was built to close.** §3 records every row's status twice — once in the
 * index table, once in the row's own cell — and this script reads only the
 * table. Row AD shipped with `demonstrated` in the table and `open` in its cell
 * within hours of the status being invented, which is PJ-024 §5's finding
 * recurring in the row created to carry it. The consequence is worse than a
 * stale word: the natural way to reconcile two disagreeing sources is to trust
 * the prose and edit the table, and at that moment this check passes with zero
 * demonstrated rows while a demonstrated wrong answer ships green — silently,
 * in exactly the situation it exists for.
 *
 * So it also checks that the two agree. That is not judgment, it is equality
 * between two places recording the same fact, and it is the same shape as *a
 * doc block must be followed by something it can document*. Both checks in this
 * repo now exist because one fact was written in two places and the copies
 * drifted; a checker that reads one copy inherits the defect class.
 *
 * Deliberately **not** a linter for the rest of the table. Whether a row is
 * `open` or `boundary`, whether a named discriminator is real — that is
 * judgment, and a script adjudicating it would be wrong more often than the
 * table is.
 *
 * Exit 0 = at most one `demonstrated` row, and every status agrees with itself.
 * Exit 1 = otherwise, listed.
 */
import { readFileSync } from "node:fs";

const LEDGER = "docs/project-journal/008_user_story_mining.md";
const lines = readFileSync(LEDGER, "utf8").split("\n");

/** `| AD | Pressure point | S-9b | demonstrated |` — the §3 table's row shape. */
const demonstrated: Array<{ row: string; what: string }> = [];
const tableStatus = new Map<string, { status: string; line: number }>();
lines.forEach((line, i) => {
  if (!line.startsWith("|")) return;
  const columns = line.split("|").map((c) => c.trim());
  // columns[0] is the empty string before the leading pipe.
  const [, row, what, , status] = columns;
  // The status legend quotes the vocabulary in a narrower table; a real row has
  // an id of one or two capitals and four columns after it.
  if (columns.length < 6 || !row || !/^[A-Z]{1,2}$/.test(row) || !status) return;
  tableStatus.set(row, { status, line: i + 1 });
  if (status === "demonstrated") demonstrated.push({ row, what: what ?? "" });
});

/**
 * The narrative status, from each row's own cell.
 *
 * `### Row AD — ...` followed by `**Scenarios:** ... · **Status:** open`. The
 * heading carries the id, because the cell line does not.
 */
const cells = new Map<string, { status: string; line: number }>();
let currentRow: string | null = null;
lines.forEach((line, i) => {
  const heading = /^### Row ([A-Z]{1,2}) —/.exec(line);
  if (heading) {
    currentRow = heading[1]!;
    return;
  }
  const status = /^\*\*Scenarios:\*\*.*·\s*\*\*Status:\*\*\s*(.+?)\s*$/.exec(line);
  if (status && currentRow) {
    cells.set(currentRow, { status: status[1]!, line: i + 1 });
    currentRow = null;
  }
});

const disagreements: string[] = [];
for (const [row, { status: table, line }] of tableStatus) {
  const cell = cells.get(row);
  if (!cell) {
    disagreements.push(`  row ${row}: in the index table (line ${line}), no cell of its own`);
  } else if (cell.status !== table) {
    disagreements.push(
      `  row ${row}: table says "${table}" (line ${line}), cell says "${cell.status}" (line ${cell.line})`,
    );
  }
}
for (const [row, { line }] of cells) {
  if (!tableStatus.has(row)) {
    disagreements.push(`  row ${row}: has a cell (line ${line}), missing from the index table`);
  }
}

if (disagreements.length > 0) {
  console.error(`${LEDGER}: a row's status disagrees with itself.`);
  for (const d of disagreements) console.error(d);
  console.error(
    "\nThe index and the cell record the same fact. A reader following the index",
  );
  console.error(
    "reaches the wrong verdict — PJ-024 §5 found exactly that, in row F.",
  );
  process.exit(1);
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
