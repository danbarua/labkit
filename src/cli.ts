#!/usr/bin/env bun
/**
 * A read-only CLI over the domain read surface (PJ-023's next phase).
 *
 * **Read-only on purpose, and structurally rather than by discipline.** It
 * constructs a `ReadSurface`, never a `ResearchSession`, so there is no write
 * verb in scope to call by accident. `src/domain/index.ts` exports the two
 * halves separately for exactly this.
 *
 * Four commands, not twenty. `023` set that bar and the reason holds: each one
 * is a question a researcher actually asks, and a surface that answers four
 * well is worth more than one that answers twenty at arm's length.
 *
 * **Rendering is separate from fetching, and that is where this file has gone
 * wrong before.** An external review of the first version (2026-08-21) found
 * the prose quietly dropping three distinctions the domain had scenarios for —
 * `accepted-as-unresolved` rendered as plain `open`, a *withdrawn*
 * interpretation rendered identically to one nobody had examined, and
 * exploratory closure rendered identically to confirmatory. Every one was
 * present and correct in `--json`. A report type gaining a field is not a
 * reason the default view should silently stay behind it, so the renderers
 * below are exported and tested directly.
 */
import { connectDb } from "./db/connect";
import { resolveTenantContext } from "./db/tenant";
import { TenantGraph } from "./db/graph";
import { ReadSurface } from "./domain";
import type {
  ClaimSubject,
  EnquiryStatus,
  HistoricalSurvey,
  KnowledgeSurvey,
  QuestionStanding,
  DependencyReport,
  SupportExplanation,
} from "./domain";

const USAGE = `labkit — read-only queries over a research record

  labkit known [--at <iso-instant>]   what the programme knows, now or as of a moment
  labkit why <proposition>            why a conclusion counts as supported
  labkit affects <artefact-or-name>   what depends on a record, if it turns out wrong
  labkit enquiry <enquiry-id>         is this enquiry open, and how did it close

Options
  --tenant <slug>     which tenant to read (default: labkit)
  --at <iso-instant>  for \`known\`: answer as of a moment rather than now
  --analysis <id>     for \`why\`: which analysis concluded it, when one sentence
                      is asserted in more than one line of enquiry
  --json              emit JSON instead of prose
`;

/**
 * Flags that consume the following argument.
 *
 * Enumerated rather than inferred, because the alternative was the bug this
 * replaced: positionals were taken as "the first argument not starting with
 * `--`", which reads a flag's *value* as the positional the moment a flag comes
 * first. `labkit why --tenant acme "the schedule moves convergence"` asked why
 * `acme` was supported. Order-sensitivity in an argument parser is the kind of
 * defect that looks like the user's mistake.
 */
const VALUED_FLAGS = new Set(["tenant", "at", "analysis"]);

export interface ParsedArgs {
  command?: string;
  positionals: string[];
  flags: Record<string, string>;
  json: boolean;
}

/** Splits argv into a command, its positionals and its flags, in any order. */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (name === "json") {
      json = true;
    } else if (VALUED_FLAGS.has(name)) {
      const value = argv[++i];
      if (value !== undefined) flags[name] = value;
    }
    // Anything else is ignored rather than guessed at; `--help` is handled
    // before parsing, and an unknown flag falls through to the usage error the
    // command itself raises when its positional is missing.
  }

  const [command, ...rest] = positionals;
  return { command, positionals: rest, flags, json };
}

/**
 * Prose by default, JSON on request.
 *
 * The default matters: this surface exists so a researcher can ask a question
 * and read an answer, and a wall of JSON is a different product. `--json` is
 * for the caller that is a program.
 */
function show(json: boolean, value: unknown, prose: () => string): void {
  console.log(json ? JSON.stringify(value, null, 2) : prose());
}

function bullets(items: string[], empty: string): string {
  return items.length === 0 ? `  ${empty}` : items.map((i) => `  - ${i}`).join("\n");
}

/**
 * Questions, with their id shown **only when wording alone cannot tell two
 * apart**.
 *
 * LabKit deliberately allows two distinct questions to carry identical words
 * (S-1), so a survey printed as bare sentences can show two bullets a reader
 * cannot distinguish. Showing every id all the time would put a `Q_41` on
 * every line of the common case, where nothing is ambiguous; showing it on
 * collision puts it exactly where it carries information.
 */
function questionLines(questions: QuestionStanding[], all: QuestionStanding[]): string[] {
  const counts = new Map<string, number>();
  for (const q of all) counts.set(q.asks, (counts.get(q.asks) ?? 0) + 1);
  return questions.map((q) => (counts.get(q.asks)! > 1 ? `${q.asks}  [${q.question}]` : q.asks));
}

/** Every question in a survey, whichever bucket it landed in — the collision set. */
function allOf(survey: { [k: string]: unknown }): QuestionStanding[] {
  return Object.values(survey)
    .filter((v): v is QuestionStanding[] => Array.isArray(v))
    .flat();
}

export function renderKnown(survey: KnowledgeSurvey): string {
  const all = allOf(survey as unknown as { [k: string]: unknown });
  const list = (qs: QuestionStanding[]) => bullets(questionLines(qs, all), "nothing");
  return [
    "Established",
    list(survey.established),
    "",
    "Provisional (resting on work nobody promoted)",
    list(survey.provisional),
    "",
    "Accepted as unresolved",
    list(survey.accepted),
    "",
    "Unresolved (worked on, no answer yet)",
    list(survey.unresolved),
    "",
    "Untested (nothing has been run against these)",
    list(survey.untested),
  ].join("\n");
}

export function renderHistorical(survey: HistoricalSurvey): string {
  const all = allOf(survey as unknown as { [k: string]: unknown });
  const list = (qs: QuestionStanding[]) => bullets(questionLines(qs, all), "nothing");
  return [
    `As of ${survey.at}:`,
    "",
    "Established (resolved on a promoted finding)",
    list(survey.established),
    "",
    "Provisional (resolved, but on unpromoted work)",
    list(survey.provisional),
    "",
    "Accepted as unresolved",
    list(survey.accepted),
    "",
    "Open",
    list(survey.open),
    "",
    "A question posed after this instant is absent, not open. `open` is not",
    "split into worked-on and untouched: nothing records when work began, so",
    "that cannot be placed in time.",
  ].join("\n");
}

/**
 * Why a proposition stands, or does not.
 *
 * The three ways `supported: false` can come about are printed apart, because
 * they are different scientific states and the domain went to some trouble to
 * keep them apart: nothing has examined it, evidence bears against it, or
 * nobody asserts the sentence any more. The first version of this renderer
 * collapsed all three into `NOT supported` above a list of perfectly good
 * findings — which is the S-12 distinction being lost at the transport
 * boundary, after the read surface had got it right.
 */
export function renderWhy(why: SupportExplanation): string {
  const verdict = why.supported
    ? "supported"
    : why.withdrawn
      ? "NOT supported — withdrawn; the record no longer asserts this wording"
      : why.challenged
        ? "NOT supported — challenged by evidence bearing against it"
        : "NOT supported";
  return [
    `"${why.proposition}"`,
    `  ${verdict}, ${why.standing}`,
    why.promotedBecause ? `  promoted because: ${why.promotedBecause}` : "",
    why.replacedBy ? `  replaced by: "${why.replacedBy}"` : "",
    "",
    "Resting on",
    bullets(why.support.map((s) => `${s.finding}  (via ${s.method}, ${s.analysis})`), "nothing"),
    why.against.length
      ? `\nBearing against\n${bullets(why.against.map((a) => `${a.finding}  (via ${a.method}, ${a.analysis})`), "")}`
      : "",
    why.reverifiedBy.length
      ? `\nRe-checked by\n${bullets(why.reverifiedBy.map((r) => `${r.method}  (${r.analysis})`), "")}`
      : "",
    why.standard.length
      ? `\nHeld to\n${bullets(why.standard.map((c) => `${c.proposition} — ${c.state}`), "")}`
      : "\nHeld to no prespecified standard.",
    why.unmet.length
      ? `\nNot currently met\n${bullets(why.unmet.map((u) => `${u.requires}  (${u.criterion})`), "")}`
      : "",
    why.restingOn.length
      ? `\nUltimately resting on\n${bullets(why.restingOn.map((a) => `${a.name}  [${a.part}]`), "")}`
      : "",
    why.superseded.length
      ? `\nSuperseded\n${bullets(why.superseded.map((s) => `${s.finding} — ${s.reason}`), "")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderAffects(report: DependencyReport): string {
  return [
    "Claims that would be affected",
    // Id and wording both. A person reading this needs the sentence; a person
    // acting on it needs the handle every other command takes.
    bullets(report.claims.map((c) => `${c.asserts}  (${c.claim})`), "none found"),
    "",
    "Lines of enquiry",
    bullets(report.enquiries.map((e) => `${e.pursuing}  (${e.enquiry})`), "none found"),
    "",
    "Routes walked",
    bullets(report.routesWalked, ""),
    "",
    "This is a lower bound, not a finding of independence: anything",
    "connected by a route not listed above is absent from these lists",
    "and is not thereby unaffected.",
  ].join("\n");
}

/**
 * An enquiry's standing.
 *
 * `accepted-as-unresolved` deliberately carries `open: true` — it *is* still
 * open, on purpose — so rendering the boolean alone reported the one closure
 * the domain built S-14 for as though nobody had got round to it. The
 * rationale and the reopening condition are what distinguish deciding to stop
 * from not having started, and they now print.
 *
 * Answered enquiries say what their closure rests on for the same reason:
 * `exploratory` does not mean the answer is wrong, it means nothing has
 * promoted what it rests on, and a reader deciding whether to build on it
 * should not have to go and look.
 */
export function renderEnquiry(status: EnquiryStatus): string {
  const q = status.question;
  const standing = !q
    ? "no question behind this enquiry"
    : q.closure === "accepted-as-unresolved"
      ? "open — accepted as unresolved, deliberately"
      : q.open
        ? "open"
        : `closed — ${q.closure}`;
  return [
    // The enquiry first, because that is what was asked about. The question's
    // state is printed as the question's, not as this pursuit's -- PJ-030 §6:
    // flattened, every pursuit of an answered question read as answered itself.
    `${status.pursuing}  (${status.enquiry})`,
    status.contributed.length
      ? `  produced ${status.contributed.length} finding${status.contributed.length === 1 ? "" : "s"}`
      : "  has produced nothing yet",
    "",
    q ? `Pursuing "${q.asks}"  (${q.question})` : "Pursuing nothing on the record",
    `  ${standing}`,
    q?.acceptedBecause ? `  accepted because: ${q.acceptedBecause}` : "",
    q?.reopensIf ? `  reopens if: ${q.reopensIf}` : "",
    q?.answer ? `  answer: ${q.answer}` : "",
    q?.restsOn ? `  resting on ${q.restsOn} work` : "",
    status.contributed.length
      ? `\nThis enquiry's findings\n${bullets(status.contributed.map((e) => `${e.states}  (${e.evidence})`), "")}`
      : "",
    q?.evidence.length
      ? `\nThe question's answer rests on\n${bullets(q.evidence.map((e) => `${e.states}  (${e.evidence})`), "")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function main(argv: string[] = Bun.argv.slice(2)): Promise<number> {
  const first = argv[0];
  if (!first || first === "--help" || first === "-h") {
    console.log(USAGE);
    return first ? 0 : 1;
  }

  const { command, positionals, flags, json } = parseArgs(argv);
  if (!command) {
    console.log(USAGE);
    return 1;
  }

  const connection = await connectDb();
  try {
    const ctx = await resolveTenantContext(connection.db, flags.tenant ?? "labkit");
    const read = new ReadSurface(new TenantGraph(ctx, connection.db));

    switch (command) {
      case "known": {
        if (flags.at) {
          const survey = await read.whatWasKnown(flags.at);
          return show(json, survey, () => renderHistorical(survey)), 0;
        }
        const survey = await read.whatIsKnown();
        return show(json, survey, () => renderKnown(survey)), 0;
      }

      case "why": {
        const proposition = positionals[0];
        if (!proposition) return usageError("why needs a proposition");
        // A claim is identified by its proposition *within a line of enquiry*,
        // never by wording alone (S-5), and `whySupported()` refuses rather
        // than guessing when a sentence is asserted in more than one. Without
        // `--analysis` the CLI had no way to answer that refusal, so a correct
        // refusal became a dead end at the transport boundary.
        const subject: ClaimSubject = flags.analysis
          ? { analysis: { kind: "analysis", id: flags.analysis }, proposition }
          : proposition;
        const why = await read.whySupported(subject);
        return show(json, why, () => renderWhy(why)), 0;
      }

      case "affects": {
        const subject = positionals[0];
        if (!subject) return usageError("affects needs an artefact id or name");
        const report = await read.whatDependsOn(
          subject.startsWith("ART_") ? { kind: "observations", id: subject } : subject,
        );
        return show(json, report, () => renderAffects(report)), 0;
      }

      case "enquiry": {
        const id = positionals[0];
        if (!id) return usageError("enquiry needs an enquiry id");
        const status = await read.enquiryStatus({ kind: "enquiry", id });
        return show(json, status, () => renderEnquiry(status)), 0;
      }

      default:
        return usageError(`unknown command: ${command}`);
    }
  } finally {
    await connection.close();
  }
}

function usageError(message: string): number {
  console.error(`labkit: ${message}\n`);
  console.error(USAGE);
  return 2;
}

if (import.meta.main) process.exit(await main());
