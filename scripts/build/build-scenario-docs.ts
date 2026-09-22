/**
 * Renders the acts each scenario recorded as a conversation, into docs/scenarios/.
 *
 * The source is the event log, not the test file: a scenario's turns are what it actually
 * wrote to the record, so a diagram cannot describe a conversation the suite does not have.
 *
 * Usage: `bun run docs:scenarios [--out <dir>]`
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Turn {
  seq: number;
  who: string;
  operation: string;
  subject: string;
  said: string | null;
}

/**
 * A read's own answer about the subject the scenario is about, as it came back.
 *
 * Two shapes, told apart by what they carry: `why` answers about any record, `whySupported`
 * answers about one claim and has no `kind`.
 */
interface WhyOutcome {
  kind: string;
  subject: string;
  is?: string;
  because?: Array<{ handle: string; wording: string }>;
  report?: {
    changed?: Array<{ proposition: string; before: string; after: string }>;
    restated?: Array<{ asserts: string }>;
    kept?: Array<{ asserts?: string }>;
  };
}

interface SupportOutcome {
  claim: string;
  proposition: string;
  verdict: string;
  standing: string;
  support?: Array<{ finding: string }>;
  against?: Array<{ finding: string }>;
  superseded?: Array<{ finding: string; reason?: string }>;
}

type Outcome = WhyOutcome | SupportOutcome;

const isWhy = (o: Outcome): o is WhyOutcome => "kind" in o;

interface Conversation {
  id: string;
  title: string;
  about: string;
  turns: Turn[];
  outcome: Outcome | null;
}

/** Mermaid takes no quotes, colons or newlines inside a message. */
function safe(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/[:;"#]/g, "")
    .trim();
}

/** Long enough to read, short enough to sit on one line of a diagram. */
function clip(text: string, at = 64): string {
  return text.length > at ? `${text.slice(0, at - 1)}…` : text;
}

/**
 * A run of the same act by the same person is one turn in the conversation.
 *
 * Six `conclude` calls are a researcher writing down six conclusions, not six exchanges,
 * and drawn one-per-arrow they bury the act that mattered.
 */
function runs(turns: Turn[]): Array<{ turn: Turn; count: number }> {
  const out: Array<{ turn: Turn; count: number }> = [];
  for (const turn of turns) {
    const last = out[out.length - 1];
    if (last && last.turn.who === turn.who && last.turn.operation === turn.operation)
      last.count += 1;
    else out.push({ turn, count: 1 });
  }
  return out;
}

function diagram(convo: Conversation): string {
  const actors = [...new Set(convo.turns.map((t) => t.who))];
  const lines = [
    "```mermaid",
    "sequenceDiagram",
    ...actors.map((a) => `    actor ${a.replace(/\W+/g, "")}`),
    "    participant R as LabKit",
  ];
  for (const { turn, count } of runs(convo.turns)) {
    const who = turn.who.replace(/\W+/g, "");
    // A run shows its count, never the first act's words: six conclusions drawn under one
    // arrow labelled with one of them reads as all six having said it.
    const label =
      count > 1
        ? `${turn.operation} x${count}`
        : `${turn.operation}${turn.said === null ? "" : ` ${clip(safe(turn.said))}`}`;
    lines.push(`    ${who}->>R: ${label}`);
    // Only the handle a later act names comes back. A `conclude` answering with the
    // analysis it hung off says nothing the previous line did not.
    if (mentionedLater(turn, convo.turns)) lines.push(`    R-->>${who}: ${turn.subject}`);
  }
  lines.push("```");
  return lines.join("\n");
}

/** Whether anything after this act refers to what it recorded. */
function mentionedLater(turn: Turn, turns: Turn[]): boolean {
  return !turns.some((t) => t.seq > turn.seq && t.subject === turn.subject)
    ? turns.some((t) => t.seq > turn.seq && (t.said ?? "").includes(turn.subject))
    : true;
}

/**
 * What the record says happened, in `why`'s words rather than a second description.
 */
function moved(outcome: Outcome | null): string[] {
  if (outcome === null) return [];
  return ["## What moved", "", ...(isWhy(outcome) ? fromWhy(outcome) : fromSupport(outcome)), ""];
}

function fromWhy(outcome: WhyOutcome): string[] {
  const out = [`\`labkit why ${outcome.subject}\` answers:`, ""];
  if (outcome.is) out.push(`**${outcome.subject}** is ${outcome.is}.`, "");
  for (const cause of outcome.because ?? []) out.push(`- because ${cause.wording}`);
  if ((outcome.because ?? []).length > 0) out.push("");

  const report = outcome.report ?? {};
  for (const change of report.changed ?? [])
    out.push(`- **changed** ${change.proposition}: ${change.before} → ${change.after}`);
  const restated = report.restated ?? [];
  if (restated.length > 0)
    out.push(`- **restated** unchanged: ${restated.map((r) => r.asserts).join("; ")}`);
  const kept = report.kept ?? [];
  if (kept.length > 0) out.push(`- **kept** from the predecessor: ${kept.length}`);
  return out;
}

function fromSupport(outcome: SupportOutcome): string[] {
  const findings = (rows: Array<{ finding: string }> | undefined) =>
    (rows ?? []).map((r) => r.finding).join("; ");
  const out = [
    `\`labkit why-supported ${outcome.claim}\` answers:`,
    "",
    `**${outcome.proposition}** — ${outcome.verdict}, held as ${outcome.standing}.`,
    "",
  ];
  if ((outcome.support ?? []).length > 0)
    out.push(`- **supported by** ${findings(outcome.support)}`);
  if ((outcome.against ?? []).length > 0)
    out.push(`- **challenged by** ${findings(outcome.against)}`);
  for (const gone of outcome.superseded ?? [])
    out.push(`- **superseded** ${gone.finding}${gone.reason ? ` — ${gone.reason}` : ""}`);
  return out;
}

function page(convo: Conversation): string {
  const actors = [...new Set(convo.turns.map((t) => t.who))];
  return [
    `# ${convo.id} — ${convo.title}`,
    "",
    convo.about,
    "",
    `${convo.turns.length} acts, ${actors.length === 1 ? "one voice" : actors.join(" and ")}.`,
    "",
    diagram(convo),
    "",
    ...moved(convo.outcome),
    "## The acts, in order",
    "",
    "| | who | act | said | recorded |",
    "| --- | --- | --- | --- | --- |",
    ...convo.turns.map(
      (t) =>
        `| ${t.seq} | ${t.who} | \`${t.operation}\` | ${t.said === null ? "" : clip(t.said, 80)} | \`${t.subject}\` |`,
    ),
    "",
  ].join("\n");
}

function index(convos: Conversation[]): string {
  return [
    "# Scenario conversations",
    "",
    "Each scenario in `tests/scenarios/` is a research conversation that runs as a test.",
    "These pages are the acts each one recorded, read back out of the event log.",
    "",
    "Generated by `bun run docs:scenarios`. Edits here are overwritten; change the scenario.",
    "",
    "| | conversation | voices | acts |",
    "| --- | --- | --- | --- |",
    ...convos.map((c) => {
      const actors = [...new Set(c.turns.map((t) => t.who))];
      return `| [${c.id}](${c.id}.md) | ${c.title} | ${actors.join(", ")} | ${c.turns.length} |`;
    }),
    "",
  ].join("\n");
}

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1]!;
};
const out = flag("--out", "docs/scenarios");
const captured = flag("--capture", mkdtempSync(join(tmpdir(), "labkit-scenario-capture-")));

// The scenarios write what they recorded; this reads it back. Run rather than parsed,
// because a test file says what it calls and the log says what the record received.
const run = spawnSync("bun", ["test", "tests/scenarios", "--timeout", "20000"], {
  encoding: "utf8",
  env: { ...process.env, LABKIT_SCENARIO_DOCS: captured },
  stdio: ["ignore", "pipe", "pipe"],
});
// `bun test` exits non-zero on a clean run when PGlite's teardown races, so the pass/fail
// counts in its output are what says whether the suite passed.
const summary = `${run.stdout ?? ""}${run.stderr ?? ""}`;
const failed = /^\s*(\d+) fail/m.exec(summary)?.[1];
if (failed !== undefined && failed !== "0") {
  process.stderr.write(summary);
  process.stderr.write(`FAILED: ${failed} scenario test(s) failed; the pages would be wrong.\n`);
  process.exit(1);
}

const convos: Conversation[] = readdirSync(captured)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(captured, f), "utf8")) as Conversation)
  .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

mkdirSync(out, { recursive: true });
for (const convo of convos) writeFileSync(join(out, `${convo.id}.md`), page(convo));
writeFileSync(join(out, "README.md"), index(convos));
process.stdout.write(`${convos.length} conversations -> ${out}\n`);
