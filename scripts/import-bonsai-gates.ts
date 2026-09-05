#!/usr/bin/env bun
// The row-by-row logic behind probe-bonsai-3-gates.sh. See that script's
// header for invocation; this file is not meant to be run directly.
//
// Reads Bonsai's real gates.toml (reviewer requirement 4's binding-clause
// inventory) and drives the labkit CLI to transcribe it: one Question, one
// line of enquiry pursuing it, one Task, one Gate governed by one Criterion
// per row, one Evaluation per row, and one observations record per row that
// actually measured something. #127.
//
// Dates are mined from `git blame` on gates.toml itself, per row -- not
// bulk-dated to one or two milestone commits, because the file's own
// commit subjects ("6 of 89", "44/89", "89/89 dispositioned", later
// re-evaluations on 2026-08-10/11) show rows entering and being
// re-dispositioned across several days, including after the "89/89"
// milestone -- the live row count (logged at runtime, not written here)
// disagrees with it. A row's `criterion` is dated at its own introduction
// (the earliest commit touching any line in its block); its `evaluate` is
// dated at its own most recent disposition (the latest).
//
// Row -> verb mapping (confirmed on #127 against six hand-transcribed
// rows before this importer existed): binding_gate and binding_value both
// become criterion+evaluate. binding_claim is the same shape; status
// decides pass (discharged) vs fail (pending_package / unresolved /
// superseded). not_binding is a classification judgement, not deferred
// research -- `accept` doesn't fit, so it's criterion+evaluate too, always
// passing (correctly dispositioned). semantic_review is one row, one
// meta-criterion, evaluated under the Reviewer's own name via `--author`
// (gates.toml keeps `reviewer` distinct from `recorded_by` on the
// Reviewer's explicit instruction that a transcribing agent cannot make
// the attestation independently).
//
// **#150 is fixed, and this importer named it as the reason.** Every row
// used to record as asserted, because `evaluate --citing` took a claim and
// a pipeline check has no scientific claim to cite. It now takes an
// observations record, so a row that measured something cites what it
// measured: a passing binding_gate cites its break demonstration, named by
// the test that ran; a passing binding_value or binding_claim cites its
// provenance or discharge locator.
//
// **A failing row still cites nothing, and that is the point.** Nothing was
// measured -- a binding_gate fails here precisely because its fields are
// empty, and a pending binding_claim fails because the evidence does not
// exist yet. not_binding and semantic_review cite nothing either: both are
// judgements, and semantic_review says so in its own proposition.
//
// **#98 is fixed, and the inventory needed a question to sit under.**
// `plan` used to mint a Task with no enquiry, so `contract` could say what
// the work was for only in its own objective text. The reviewer's
// requirement is a question -- are Stage 2B's binding guarantees enforced
// in code rather than merely documented -- so it is posed and pursued here,
// the Task is planned against it, and every observation is recorded in it.
// The enquiry is this importer's own, not Stage 2B's scientific one: a
// break test is not an observation about whether graph evolution denoises.
//
// `parent_clause`/`canonical_clause` group related obligations under a
// shared clause and have no home in LabKit's schema -- left untranscribed
// per Bonsai's schema not dictating LabKit's; filed as a finding rather
// than forced into a property.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [, , dbArg, sourceArg] = process.argv;
const dbOrNone = dbArg ?? process.env.LABKIT_HOME;
if (!dbOrNone) {
  console.error(
    "usage: LABKIT_HOME=<dir> bun scripts/import-bonsai-gates.ts, or bun scripts/import-bonsai-gates.ts <db-dir> [<bonsai-source-dir>]",
  );
  process.exit(2);
}
const db: string = dbOrNone;
const sourceDir = sourceArg ?? db;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(root, "src/cli/cli.ts");
const relPath = "experiments/stage2b_denoising/gates.toml";
const gatesPath = join(sourceDir, relPath);

const DEFAULT_AUTHOR = "probe-bonsai-3-gates.sh";

function lab(args: string[], opts: { date?: string; author?: string } = {}): string {
  const full = ["--db", db, "--author", opts.author ?? DEFAULT_AUTHOR];
  if (opts.date) full.push("--date", opts.date);
  full.push(...args);
  const result = spawnSync("bun", [cliPath, ...full], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`labkit ${args.join(" ")} failed:\n${result.stderr}`);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

/**
 * The one handle of a kind, from a verb that mints several.
 *
 * `observe` writes an artefact and the finding that cites it, so its stdout
 * is two handles and `lab()`'s whole-stdout answer is not one of them.
 */
function pick(stdout: string, prefix: string): string {
  const found = stdout.split("\n").filter((line) => line.startsWith(prefix));
  if (found.length !== 1) {
    console.error(`expected one ${prefix}… handle, got ${found.length}:\n${stdout}`);
    process.exit(1);
  }
  return found[0]!.trim();
}

function labSearchJson(text: string): unknown[] {
  const result = spawnSync("bun", [cliPath, "--db", db, "--json", "search", text], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout) as unknown[];
}

// ---- idempotency ----

const TASK_OBJECTIVE =
  "produce and maintain the reviewer-required gate inventory (requirement 4, ruling of 2026-08-08) verifying Stage 2B's binding guarantees are enforced in code, not just documented";
const TASK_ACCEPTANCE =
  "every binding_gate/binding_value row has a real break-test demonstrating both that the guard fires and that it fires on the production path; every binding_claim row is discharged against a real artefact or its pending status is honest; every not_binding row's reason fits one of four fixed shapes (narration/rationale/result/plan)";
const GATE_CONSEQUENCE =
  "Stage 2B's readiness signal stays red; the independent package-review gate for stage-4 release is separately and additionally blocked";
const ENQUIRY_QUESTION =
  "are Stage 2B's binding guarantees enforced in code rather than merely documented (reviewer requirement 4, ruling of 2026-08-08)?";
const ENQUIRY_APPROACH =
  "inventory every binding clause in the stage-2B package, classify each as a gate, a value, a claim or not binding, and hold each to its own disposition: a break test that fires on the production path, a provenance chain for a value, or a discharge locator for a claim";
const SEMANTIC_REVIEW_PROPOSITION =
  "requirement 4's inventory mechanism, as a whole, is complete and its dispositions are honest -- the Reviewer's own sign-off judgement, not a machine-checkable predicate";

// Both, because the question is now posed before the task is planned: a run
// that dies between the two leaves the question behind, and a guard that only
// knew the task would let a re-run pose a second one.
if (labSearchJson(TASK_OBJECTIVE).length > 0 || labSearchJson(ENQUIRY_QUESTION).length > 0) {
  console.error("refusing: a question, criterion or task from this import already exists.");
  process.exit(2);
}

// ---- read gates.toml, both as data and as raw text for git blame ----

const gatesModule = (await import(gatesPath)) as {
  default: Record<string, Record<string, unknown>>;
};
const gates = gatesModule.default;
const rawText = readFileSync(gatesPath, "utf8");

type Kind = "binding_gate" | "binding_value" | "binding_claim" | "not_binding" | "semantic_review";
const KINDS: Kind[] = [
  "binding_gate",
  "binding_value",
  "binding_claim",
  "not_binding",
  "semantic_review",
];

interface Row {
  kind: Kind;
  id: string; // "" for semantic_review, the single unkeyed section
  fields: Record<string, string>;
  startLine: number;
  endLine: number;
}

const headerRe =
  /^\[(binding_gate|binding_value|binding_claim|not_binding|semantic_review)(?:\.(\w+))?\]$/;
const lines = rawText.split("\n");
const headers: { kind: Kind; id: string; line: number }[] = [];
lines.forEach((line, idx) => {
  const m = headerRe.exec(line);
  if (m) headers.push({ kind: m[1] as Kind, id: m[2] ?? "", line: idx + 1 });
});

const rows: Row[] = headers.map((h, i) => {
  const endLine =
    i + 1 < headers.length ? (headers[i + 1] as (typeof headers)[number]).line - 1 : lines.length;
  const kindTable = gates[h.kind] as Record<string, unknown>;
  const fields = (h.id ? kindTable[h.id] : kindTable) as Record<string, string>;
  return { kind: h.kind, id: h.id, fields, startLine: h.line, endLine };
});

if (rows.length === 0) {
  console.error(`no rows found in ${gatesPath}`);
  process.exit(2);
}

// ---- per-row dates, mined from git blame ----

const blame = spawnSync("git", ["-C", sourceDir, "blame", "--date=iso-strict", "--", relPath], {
  encoding: "utf8",
  maxBuffer: 50_000_000,
});
if (blame.status !== 0) {
  console.error(`git blame failed on ${relPath} in ${sourceDir}:\n${blame.stderr}`);
  process.exit(2);
}
const blameLineRe = /\((?:.*?)\s(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})\s+(\d+)\)/;
const blameDates = new Map<number, string>();
blame.stdout.split("\n").forEach((line) => {
  const m = blameLineRe.exec(line);
  if (m) blameDates.set(Number(m[2] as string), m[1] as string);
});

function isoZ(offsetDate: string): string {
  return new Date(offsetDate).toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

function rowDates(row: Row): { createdAt: string; lastEditedAt: string } {
  let min: string | undefined;
  let max: string | undefined;
  for (let ln = row.startLine; ln <= row.endLine; ln++) {
    const d = blameDates.get(ln);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  if (!min || !max) {
    console.error(
      `no git blame date found for ${row.kind}.${row.id || "(section)"} (lines ${row.startLine}-${row.endLine})`,
    );
    process.exit(2);
  }
  return { createdAt: isoZ(min as string), lastEditedAt: isoZ(max as string) };
}

// ---- text helpers ----

function collapse(text: unknown): string {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
}

function firstNonEmpty(fields: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const v = collapse(fields[key]);
    if (v) return v;
  }
  return "";
}

// ---- per-kind proposition / evaluate derivation ----

const GATE_REQUIRED_FIELDS = [
  "enforcement",
  "production_reachability",
  "input_wiring",
  "decision_consequence",
  "test",
  "break_demonstrated",
];

interface Disposition {
  proposition: string;
  outcome: "pass" | "fail";
  value: string;
}

/**
 * The observations record a row's verdict was read off, when there is one.
 *
 * `name` is the locator the row itself gives -- the test that ran, the
 * consumer that reads the value, the artefact the claim was discharged
 * against -- so a reader meets the thing rather than a row id. A row that
 * measured nothing returns undefined and its verdict cites nothing, which
 * is the honest record of a judgement or an absence.
 */
function measurementOf(row: Row): { name: string; finding: string } | undefined {
  const f = row.fields;
  if (row.kind === "binding_gate") {
    const empty = GATE_REQUIRED_FIELDS.filter((k) => !collapse(f[k]));
    if (empty.length > 0) return undefined;
    return { name: collapse(f.test), finding: collapse(f.break_demonstrated) };
  }
  if (row.kind === "binding_value" && f.status === "enforced") {
    const finding = firstNonEmpty(f, ["break_demonstrated", "provenance_of_use"]);
    const name = firstNonEmpty(f, ["production_consumers", "value"]);
    if (finding && name) return { name, finding };
    return undefined;
  }
  if (row.kind === "binding_claim" && f.status === "discharged") {
    const finding = collapse(f.evidence);
    const name = firstNonEmpty(f, ["discharged_in", "locator"]);
    if (finding && name) return { name, finding };
    return undefined;
  }
  return undefined;
}

function dispositionOf(row: Row): Disposition {
  const f = row.fields;
  switch (row.kind) {
    case "binding_gate": {
      const empty = GATE_REQUIRED_FIELDS.filter((k) => !collapse(f[k]));
      const proposition = `binding_gate ${row.id}: ${collapse(f.enforcement) || "(no enforcement locator on record)"}`;
      if (empty.length > 0) {
        return {
          proposition,
          outcome: "fail",
          value: `${empty.join(", ")} empty: the guard this row names is not implemented yet. Absence, not a passing predicate -- an empty field fails readiness rather than being reclassified.`,
        };
      }
      return { proposition, outcome: "pass", value: collapse(f.break_demonstrated) };
    }
    case "binding_value": {
      const proposition = `binding_value ${row.id}: ${collapse(f.value) || "(no value recorded)"}`;
      const outcome = f.status === "enforced" ? "pass" : "fail";
      const detail = firstNonEmpty(f, [
        "break_demonstrated",
        "production_consumers",
        "provenance_of_use",
        "value",
      ]);
      const value = detail
        ? `status: ${collapse(f.status)} -- ${detail}`
        : `status: ${collapse(f.status)}`;
      return { proposition, outcome, value };
    }
    case "binding_claim": {
      const proposition = `binding_claim ${row.id}: ${collapse(f.locator) || "(no locator recorded)"}`;
      const outcome = f.status === "discharged" ? "pass" : "fail";
      const detail = firstNonEmpty(f, [
        "evidence",
        "discharged_in",
        "pending_reason",
        "negative_attestation",
        "pending_reason_superseded",
        "superseded_by",
        "amendment_locator",
        "obligation",
      ]);
      return { proposition, outcome, value: `${collapse(f.status)}: ${detail}` };
    }
    case "not_binding": {
      const reason = collapse(f.reason);
      return {
        proposition: `not_binding ${row.id}: ${reason}`,
        outcome: "pass",
        value: reason,
      };
    }
    case "semantic_review": {
      return {
        proposition: SEMANTIC_REVIEW_PROPOSITION,
        outcome: "pass",
        value: collapse(f.outcome),
      };
    }
  }
}

// ---- counts, for the PR body ----

const counts: Record<Kind, number> = {
  binding_gate: 0,
  binding_value: 0,
  binding_claim: 0,
  not_binding: 0,
  semantic_review: 0,
};
for (const row of rows) counts[row.kind]++;
console.error(
  `gates.toml rows: ${KINDS.map((k) => `${k}=${counts[k]}`).join(", ")}, total=${rows.length}`,
);

// ---- the task ----

const orderedDates = rows.map(rowDates);
const createdDates = orderedDates.map((d) => d.createdAt).sort();
const earliestCreated = createdDates[0]!;
const latestCreated = createdDates.at(-1)!;

// The reviewer's requirement, as the question it is. The Task is planned
// against it (#98) and every observation below is recorded in it.
const question = pick(lab(["pose", ENQUIRY_QUESTION], { date: earliestCreated }), "Q_");
const enquiry = pick(
  lab(["pursue", question, "--approach", ENQUIRY_APPROACH], { date: earliestCreated }),
  "LOE_",
);

const task = lab(
  ["plan", "--objective", TASK_OBJECTIVE, "--acceptance", TASK_ACCEPTANCE, "--enquiry", enquiry],
  { date: earliestCreated },
);

// ---- criteria ----

const criteriaHandles: string[] = [];
rows.forEach((row, i) => {
  const { proposition } = dispositionOf(row);
  const handle = lab(["criterion", proposition], { date: orderedDates[i]!.createdAt });
  criteriaHandles.push(handle);
  if ((i + 1) % 20 === 0) console.error(`  ${i + 1}/${rows.length} criteria recorded`);
});
console.error(`${rows.length}/${rows.length} criteria recorded`);

// ---- the gate ----

const declareArgs = ["declare"];
for (const h of criteriaHandles) declareArgs.push("--governed-by", h);
declareArgs.push("--consequence", GATE_CONSEQUENCE, "--protecting", task);
const gate = lab(declareArgs, { date: latestCreated });

// ---- evaluations ----

let cited = 0;
rows.forEach((row, i) => {
  const { outcome, value } = dispositionOf(row);
  const criterionHandle = criteriaHandles[i]!;
  const dates = orderedDates[i]!;
  const evalOpts: { date: string; author?: string } = { date: dates.lastEditedAt };
  if (row.kind === "semantic_review") evalOpts.author = collapse(row.fields.reviewer);

  // What the verdict was read off, when the row measured something (#150).
  // Dated at the row's last disposition, the same instant as the verdict:
  // the evidence and the reading of it are one act in gates.toml's history.
  const args = [
    "evaluate",
    criterionHandle,
    "--value",
    value,
    "--outcome",
    outcome,
    "--gate",
    gate,
  ];
  const measurement = measurementOf(row);
  if (measurement) {
    const observations = pick(
      lab(["observe", enquiry, "--name", measurement.name, "--finding", measurement.finding], {
        date: dates.lastEditedAt,
      }),
      "ART_",
    );
    args.push("--citing", observations);
    cited++;
  }

  lab(args, evalOpts);
  if ((i + 1) % 20 === 0) console.error(`  ${i + 1}/${rows.length} evaluations recorded`);
});
console.error(`${rows.length}/${rows.length} evaluations recorded, ${cited} citing a measurement`);

console.error(
  `\ngate ${gate}, task ${task}, enquiry ${enquiry}, ${rows.length} criteria/evaluations from ${relPath}`,
);
process.stdout.write(`${gate}\n`);
