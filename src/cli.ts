#!/usr/bin/env bun
/**
 * A read-only CLI over the domain read surface (PJ-023's next phase).
 *
 * **Read-only on purpose, and structurally rather than by discipline.** It
 * constructs a `ReadSurface`, never a `ResearchSession`, so there is no write
 * verb in scope to call by accident. `src/domain/index.ts` exports the two
 * halves separately for exactly this.
 *
 * **It answers every question the MCP read tools answer.** It did not for a
 * while: it shipped with four commands against a read surface that had grown
 * well past them, and the sentence here said four was the point. That was a
 * position about a smaller surface, not a bar PJ-023 set — 023 asked for "the
 * thinnest read-only MCP/CLI adapter", and thin means no logic of its own, not
 * few questions. A human at a terminal and an agent over MCP are asking one
 * record the same things, and there is no reason the terminal should get the
 * subset. `tests/cli.test.ts` derives the parity from `src/domain/read.ts`
 * rather than listing it, so a read verb added later is covered without anyone
 * remembering.
 *
 * **The event log is passed in, never defaulted.** `SessionCore` falls back to
 * `inMemoryEventLog()`, which in a CLI process is an empty array that dies at
 * exit — `labkit happened` over one would confidently report that nothing has
 * ever happened, against a database full of events. `main()` builds
 * `pgEventLog()` over the same connection the graph uses, as the MCP server
 * does.
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
import { pgEventLog } from "./domain/event-store";
import { ref } from "./domain/report";
import type {
  AmendmentRecord,
  CheckStatus,
  ClaimRef,
  ConcludedClaim,
  ConflictSide,
  ConflictVerdict,
  CriterionRef,
  DomainEvent,
  EnquiryRef,
  EnquiryStatus,
  EventFilter,
  GateRef,
  GateStatus,
  HistoricalSurvey,
  IdentifiedArtefact,
  InterpretationHistory,
  KnowledgeSurvey,
  ObservationsRef,
  QuestionOrigin,
  QuestionRef,
  QuestionStanding,
  DependencyReport,
  DesignHistory,
  ReproducibilityReport,
  ReproductionReport,
  Revision,
  SupportExplanation,
  TaskContract,
} from "./domain";

const USAGE = `labkit — read-only queries over a research record

What is known
  labkit known [--at <iso-instant>]   what the programme knows, now or as of a moment
  labkit why <claim-id>               why a conclusion counts as supported
  labkit claims <proposition>         which claims assert a sentence — text to handle
  labkit conflict <claim-a> <claim-b> whether two conclusions actually disagree

Questions and enquiries
  labkit pursuits <question-id>       the lines of enquiry under a question
  labkit origin <question-id>         where a question came from, if it was sharpened
  labkit enquiry <enquiry-id>         is this enquiry open, and how did it close

Gates, conditions and planned work
  labkit gate <gate-id>               is this gate satisfied, itemised per condition
  labkit criteria <gate-id>           which conditions a gate is bound to
  labkit design <gate-id>             how a gate's conditions were amended
  labkit contract <work-id>           what a piece of planned work is for

Analyses and what rests on them
  labkit interpretation <claim-id>    how a claim's reading was narrowed
  labkit reproduction <analysis-id>   what a re-run read, against what its original read
  labkit reproducibility <analysis-id> [<part-id>=<hash> ...]
                                      whether an analysis can be accounted for
  labkit affects <artefact-or-name>   what depends on a record, if it turns out wrong

What was done
  labkit happened [<id>] [--since <seq>] [--by <id>] [--operation <verb>] [--limit <n>]
                                      the acts themselves, oldest first, with who ran them

Options
  --tenant <slug>     which tenant to read (default: labkit)
  --at <iso-instant>  for \`known\`: answer as of a moment rather than now
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
const VALUED_FLAGS = new Set(["tenant", "at", "since", "by", "operation", "limit"]);

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
    why.replacedBy ? `  replaced by: "${why.replacedBy.asserts}"  (${why.replacedBy.claim})` : "",
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

/**
 * The acts themselves, oldest first.
 *
 * **The only renderer here reading the event log rather than the graph**, and
 * the attribution is why it exists: who ran a command is not reconstructable
 * from the record at all (PJ-031), so this line is the only place it can be
 * read back. `seq` prints first because it is both the order and the cursor —
 * a reader paging through hands the last one back as `--since`.
 */
export function renderHappened(events: readonly DomainEvent[]): string {
  if (events.length === 0)
    return [
      "Nothing matching.",
      "",
      "An empty log is not an empty record: every other command answers from",
      "the graph, and answers there are durable whether or not an act was logged.",
    ].join("\n");
  return events
    .map((e) => {
      const who = e.attribution.attribution_label || "unattributed";
      // Short hash, because the full forty characters push the line past a
      // terminal and the first eight are what anybody types back into `git`.
      const commit = e.attribution.git_hash ? ` @${e.attribution.git_hash.slice(0, 8)}` : "";
      const minted = e.created?.length ? `, minting ${e.created.join(", ")}` : "";
      return [
        `${String(e.seq ?? 0).padStart(5)}  ${e.at}  ${e.operation}  ${e.subject}`,
        `         by ${who}${commit}${minted}`,
      ].join("\n");
    })
    .join("\n");
}

/**
 * Which claims assert a sentence — the one place text becomes a handle.
 *
 * Several matches is not a duplicate to be tidied away. Two lines of enquiry
 * can assert the same sentence about different endpoints, and they are two
 * claims (S-5); collapsing them reports one record that is simultaneously
 * supported and challenged when each separately has a clean answer. So the
 * multiple case gets a sentence saying so, rather than a list a reader might
 * take for redundancy.
 */
export function renderClaims(claims: ConcludedClaim[], proposition: string): string {
  return [
    `Claims asserting "${proposition}"`,
    bullets(
      claims.map((c) => `${c.asserts}  (${c.claim})`),
      "none — nothing on the record asserts this wording",
    ),
    claims.length > 1
      ? "\nMore than one, and none of them is redundant: two lines of enquiry can\nassert the same sentence about different endpoints. Name the one you mean."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The lines of enquiry under a question. Handles only — the surface returns handles. */
export function renderPursuits(enquiries: EnquiryRef[], question: QuestionRef): string {
  return [
    `Lines of enquiry pursuing ${question}`,
    bullets(
      [...enquiries],
      "none — the question is on the books and nothing has been started on it",
    ),
    "",
    "`labkit enquiry <id>` says whether one is still open and what it has produced.",
  ].join("\n");
}

/**
 * Where a question came from.
 *
 * `null` is an answer and prints as one. Most questions are simply asked;
 * only a sharpened one has an earlier question behind it, and rendering the
 * common case as an absence would read as a gap in the record.
 *
 * `knownAtTheTime` was frozen when the sharpening was recorded, not recomputed
 * now — that is the whole of S-1, and the line says so, because a reader who
 * assumes it is current will read later evidence into an earlier decision.
 */
export function renderOrigin(origin: QuestionOrigin | null, question: QuestionRef): string {
  if (!origin)
    return [
      `${question} was posed directly.`,
      "",
      "That is an answer, not a gap: only a question sharpened from an earlier",
      "one has an origin on the record.",
    ].join("\n");
  return [
    `${question} narrowed "${origin.fromAsks}"  (${origin.from})`,
    `  because: ${origin.reason}`,
    "",
    "Known at that moment",
    bullets(
      origin.knownAtTheTime.map((f) => `${f.states}  (${f.evidence})`),
      "nothing",
    ),
    "",
    "Frozen when the sharpening was recorded, not recomputed now. Evidence that",
    "arrived later is deliberately absent from this list.",
  ].join("\n");
}

/**
 * A planned piece of work.
 *
 * The `enforced` caveat prints unconditionally rather than on a branch — the
 * field is typed `false`, so there is no other case, and a reader who sees a
 * `mayRead` list without it will take the list for a sandbox.
 */
export function renderContract(contract: TaskContract): string {
  return [
    `${contract.objective}  (${contract.work})`,
    `  meeting it means: ${contract.acceptance}`,
    "",
    "May read",
    bullets(contract.mayRead, "nothing named"),
    "",
    "Not enforced. The record states what this work may look at; nothing stops",
    "a computation reading elsewhere.",
  ].join("\n");
}

/** Which conditions a gate is bound to. Wording and standing are `labkit gate`. */
export function renderCriteria(criteria: CriterionRef[], gate: GateRef): string {
  return [
    `Conditions governing ${gate}`,
    bullets([...criteria], "none — this gate is bound to no prespecified condition"),
    "",
    "Handles only. `labkit gate` gives the same conditions with their wording and",
    "their current standing.",
  ].join("\n");
}

/**
 * A gate, itemised per condition.
 *
 * Two things are deliberately not collapsed. The four states are printed as
 * themselves — `never-run` and `no-standing-verdict` are different facts, and
 * a boolean would report both as "not passed". And `everFailed` prints beside
 * the state rather than being implied by it: a gate that failed and was
 * re-checked is satisfied *now* and has failed, which is why the field
 * survives a later pass at all (S-3c).
 *
 * Withdrawn evaluations are listed rather than dropped, marked as withdrawn.
 * A check that was decided and then withdrawn is not a check nobody ran.
 */
export function renderGate(status: GateStatus): string {
  const check = (c: CheckStatus): string => {
    const decided = c.decidedBy ? `  decided ${c.decidedBy.outcome} on "${c.decidedBy.value}"` : "";
    return `${c.state.padEnd(19)} ${c.proposition}  (${c.criterion})${decided}`;
  };
  return [
    `${status.gate} — ${status.state}${status.everFailed ? "  (has failed at least once)" : ""}`,
    `  consequence: ${status.consequence}`,
    "",
    "Conditions",
    bullets(status.checks.map(check), "none"),
    status.unmet.length
      ? `\nNot currently met\n${bullets(status.unmet.map((u) => `${u.requires}  (${u.criterion})`), "")}`
      : "",
    status.gating.length
      ? `\nGating\n${bullets(status.gating.map((w) => `${w.objective}  (${w.work})`), "")}`
      : "",
    status.evaluations.length
      ? `\nEvaluations\n${bullets(
          status.evaluations.map(
            (e) =>
              `${e.at}  ${e.outcome}  "${e.value}"  (${e.evaluation})${e.withdrawn ? "  withdrawn" : ""}`,
          ),
          "",
        )}`
      : "",
    "",
    "Computed, never stored. There is no value anyone can set to `satisfied`.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Whether two conclusions disagree.
 *
 * Three relations, three sentences, and `dissociation` is the one this verb
 * exists for: two analyses reaching opposite-sounding results are not in
 * conflict if they asked about different endpoints. Rendering that as a
 * contradiction is precisely the defect the domain went to trouble to prevent
 * (S-5), so the word never appears for it.
 */
export function renderConflict(verdict: ConflictVerdict): string {
  const side = (s: ConflictSide): string =>
    [
      `"${s.proposition}"  (${s.claim})`,
      `  asking "${s.asks}"  (${s.question})`,
      s.supportedBy.length
        ? `  supported by: ${s.supportedBy.map((f) => f.states).join("; ")}`
        : "",
      s.challengedBy.length
        ? `  challenged by: ${s.challengedBy.map((f) => f.states).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  const verdictLine: Record<ConflictVerdict["relation"], string> = {
    contradiction: "Contradiction — these disagree, and about the same thing.",
    dissociation:
      "Dissociation — these are about different things, so they do not disagree" +
      (verdict.differsBy ? `; they differ by ${verdict.differsBy}.` : "."),
    corroboration: "Corroboration — these agree.",
  };
  return [verdictLine[verdict.relation], "", verdict.sides.map(side).join("\n\n")].join("\n");
}

/** One input, named and flagged if the record has since invalidated it. */
function partLine(a: IdentifiedArtefact): string {
  return `${a.name}  (${a.part})${a.invalidated ? "  invalidated" : ""}`;
}

/**
 * A re-run, against what its original read.
 *
 * It says `agrees`/`disagrees` and never `reproduced`, which is the word a
 * reader most wants and the one the record cannot support: whether reading the
 * same inputs constitutes the same execution depends on what the method does,
 * and the record does not know that (PJ-019). The closing paragraph says so
 * rather than leaving the reader to supply the stronger claim themselves.
 */
export function renderReproduction(report: ReproductionReport): string {
  return [
    `${report.verificationMethod}  (${report.verification})`,
    `  re-checking ${report.ofMethod}  (${report.of})`,
    `  the two runs' findings ${report.conclusion} — this ${report.bearing} confidence`,
    "",
    "The re-run read",
    bullets(report.verificationRead.map(partLine), "nothing on the record"),
    "",
    "The original read",
    bullets(report.ofRead.map(partLine), "nothing on the record"),
    report.differs.length
      ? `\nDiffering\n${bullets(report.differs.map((d) => `${partLine(d.what)} — ${d.standing}`), "")}`
      : "\nNothing differs in what the two runs read.",
    "",
    "This does not say the original was reproduced. Whether reading the same",
    "records is the same execution depends on what the method does, and the",
    "record does not know that.",
  ].join("\n");
}

/**
 * Whether an analysis can be accounted for from what it read.
 *
 * `unverifiable` gets its own bucket and its own explanation. It is the record
 * admitting it kept no hash, which is not the same answer as "differs" — and
 * folding it in would report a failure nobody found.
 */
export function renderReproducibility(report: ReproducibilityReport): string {
  return [
    `${report.analysis} — ${report.reproducible ? "accounted for" : "not accounted for"}`,
    "",
    "Rebuilt and identical",
    bullets(report.exact.map(partLine), "nothing"),
    "",
    "Rebuilt and different",
    bullets(report.differing.map(partLine), "nothing"),
    "",
    "Unverifiable (the record kept no hash, so nothing can be said either way)",
    bullets(report.unverifiable.map(partLine), "nothing"),
    "",
    "Not rebuilt",
    bullets(report.notRebuilt.map(partLine), "nothing"),
  ].join("\n");
}

/**
 * How a gate's conditions reached their current wording.
 *
 * `nature` prints on every amendment, first. `mechanical` and `scientific` are
 * what S-7 built `IMPLEMENTS` to tell apart — an amendment that moves a
 * prespecified comparison is not a tidy-up — and it is the field a reader
 * skims for.
 */
export function renderDesign(history: DesignHistory): string {
  const amendment = (a: AmendmentRecord): string =>
    [
      `${a.nature}  (${a.amendment})`,
      `  was: ${a.replaced.requires}`,
      `  now: ${a.nowRequires.requires}`,
      `  because: ${a.reason}`,
      a.citing.length ? `  citing: ${a.citing.map((f) => f.states).join("; ")}` : "",
      a.rerun.length
        ? `  needs re-running: ${a.rerun.map((w) => `${w.objective} (${w.work})`).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  return [
    `${history.gate}, on ${history.criterion}`,
    `  originally: ${history.originally.requires}`,
    `  now requires: ${history.nowRequires.requires}`,
    "",
    "Amendments",
    history.amendments.length
      ? history.amendments.map(amendment).join("\n\n")
      : "  none — the condition still reads as it was first stated",
    "",
    "Ordered from the record itself, not from timestamps.",
  ].join("\n");
}

/**
 * How a claim's current reading was arrived at.
 *
 * Every step names records rather than a sentence, because one narrowing can
 * withdraw several claims at once — two analyses reaching one reading are
 * withdrawn together (S-12). A rendering keyed on wording would show one
 * withdrawal where there were two.
 */
export function renderInterpretation(history: InterpretationHistory): string {
  const revision = (r: Revision): string =>
    [
      `${r.revision}`,
      `  withdrew: ${r.previously.map((c) => `"${c.asserts}" (${c.claim})`).join("; ")}`,
      `  now claims: "${r.nowClaims.asserts}"  (${r.nowClaims.claim})`,
      `  because: ${r.reason}`,
      r.restingOnTheOldReading.length
        ? `  resting on the old reading: ${r.restingOnTheOldReading
            .map((q) => `"${q.asks}" (${q.question})`)
            .join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  return [
    `Now claims "${history.nowClaims.asserts}"  (${history.nowClaims.claim})`,
    "",
    "Originally",
    bullets(
      history.originally.map((c) => `${c.asserts}  (${c.claim})`),
      "nothing was withdrawn to reach this reading",
    ),
    "",
    "Revisions",
    history.revisions.length
      ? history.revisions.map(revision).join("\n\n")
      : "  none — this reading has not been narrowed",
  ].join("\n");
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
    // The sink is handed in, not defaulted. `SessionCore` falls back to
    // `inMemoryEventLog()`, which in a process that exits after one query is an
    // array nothing has ever written to -- `happened` would report that nothing
    // has ever happened, which is a confidently wrong answer rather than an
    // empty one.
    const read = new ReadSurface(new TenantGraph(ctx, connection.db), {
      events: pgEventLog(connection.db, ctx.tenantId),
    });

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
        const subject = positionals[0];
        if (!subject) return usageError("why needs a claim id or a proposition");
        // A person types a sentence; the domain takes a handle. Resolving one
        // to the other happens HERE, at the human boundary, and refuses rather
        // than picking when a sentence is asserted in more than one line of
        // enquiry (S-5). No read verb guesses any more.
        let claim: ClaimRef;
        if (subject.startsWith("CLM_")) {
          claim = ref("claim", subject);
        } else {
          const found = await read.claimsAsserting(subject);
          if (found.length === 0) return usageError(`nothing on the record claims "${subject}"`);
          if (found.length > 1)
            return usageError(
              `"${subject}" is claimed ${found.length} times; name one: ${found
                .map((c) => c.claim)
                .join(", ")}`,
            );
          claim = found[0]!.claim;
        }
        const why = await read.whySupported(claim);
        return show(json, why, () => renderWhy(why)), 0;
      }

      case "affects": {
        const subject = positionals[0];
        if (!subject) return usageError("affects needs an artefact id or name");
        const report = await read.whatDependsOn(
          subject.startsWith("ART_") ? ref("observations", subject) : subject,
        );
        return show(json, report, () => renderAffects(report)), 0;
      }

      case "enquiry": {
        const id = positionals[0];
        if (!id) return usageError("enquiry needs an enquiry id");
        const status = await read.enquiryStatus(ref("enquiry", id));
        return show(json, status, () => renderEnquiry(status)), 0;
      }

      case "claims": {
        const proposition = positionals[0];
        if (!proposition) return usageError("claims needs a proposition");
        const found = await read.claimsAsserting(proposition);
        return show(json, { claims: found }, () => renderClaims(found, proposition)), 0;
      }

      case "conflict": {
        const [a, b] = positionals;
        if (!a || !b) return usageError("conflict needs two claim ids");
        const verdict = await read.doTheseConflict(ref("claim", a), ref("claim", b));
        return show(json, verdict, () => renderConflict(verdict)), 0;
      }

      case "pursuits": {
        const id = positionals[0];
        if (!id) return usageError("pursuits needs a question id");
        const question = ref("question", id);
        const enquiries = await read.pursuitsOf(question);
        return show(json, { enquiries }, () => renderPursuits(enquiries, question)), 0;
      }

      case "origin": {
        const id = positionals[0];
        if (!id) return usageError("origin needs a question id");
        const question = ref("question", id);
        const origin = await read.originOf(question);
        return show(json, { origin }, () => renderOrigin(origin, question)), 0;
      }

      case "gate": {
        const id = positionals[0];
        if (!id) return usageError("gate needs a gate id");
        const status = await read.gateStatus(ref("gate", id));
        return show(json, status, () => renderGate(status)), 0;
      }

      case "criteria": {
        const id = positionals[0];
        if (!id) return usageError("criteria needs a gate id");
        const gate = ref("gate", id);
        const criteria = await read.criteriaGoverning(gate);
        return show(json, { criteria }, () => renderCriteria(criteria, gate)), 0;
      }

      case "design": {
        const id = positionals[0];
        if (!id) return usageError("design needs a gate id");
        const history = await read.designHistory(ref("gate", id));
        return show(json, history, () => renderDesign(history)), 0;
      }

      case "contract": {
        const id = positionals[0];
        if (!id) return usageError("contract needs a work id");
        const contract = await read.contractFor(ref("work", id));
        return show(json, contract, () => renderContract(contract)), 0;
      }

      case "interpretation": {
        const id = positionals[0];
        if (!id) return usageError("interpretation needs a claim id");
        const history = await read.interpretationHistory(ref("claim", id));
        return show(json, history, () => renderInterpretation(history)), 0;
      }

      case "reproduction": {
        const id = positionals[0];
        // The verifying analysis, not the one being verified. Getting this the
        // wrong way round is the easy mistake and the message says which.
        if (!id) return usageError("reproduction needs the id of the analysis that did the verifying");
        const report = await read.reproductionOf(ref("analysis", id));
        return show(json, report, () => renderReproduction(report)), 0;
      }

      case "reproducibility": {
        const id = positionals[0];
        if (!id) return usageError("reproducibility needs an analysis id");
        // `<part-id>=<hash>` positionals rather than a repeated flag: `flags`
        // holds one value per name, and widening it to an array for one
        // command would change how every other flag reads. Omitting them all
        // is meaningful -- it asks what the record can account for on its own.
        const rebuilt: Array<{ part: ObservationsRef; hash: string }> = [];
        for (const pair of positionals.slice(1)) {
          const at = pair.indexOf("=");
          if (at < 1) return usageError(`\`${pair}\` is not <part-id>=<hash>`);
          rebuilt.push({ part: ref("observations", pair.slice(0, at)), hash: pair.slice(at + 1) });
        }
        const report = await read.reproducibilityOf(ref("analysis", id), rebuilt);
        return show(json, report, () => renderReproducibility(report)), 0;
      }

      case "happened": {
        // Every field narrows; a bare `labkit happened` asks for everything,
        // capped. The cap is here and not in the surface for the same reason
        // the MCP tool carries its own: a terminal that scrolls a thousand
        // events has answered nothing.
        const filter: EventFilter = {
          ...(positionals[0] === undefined ? {} : { touching: positionals[0] }),
          ...(flags.since === undefined ? {} : { since: Number(flags.since) }),
          ...(flags.by === undefined ? {} : { by: flags.by }),
          ...(flags.operation === undefined ? {} : { operation: flags.operation }),
          limit: flags.limit === undefined ? 50 : Number(flags.limit),
        };
        const events = await read.whatHappened(filter);
        return show(json, { events }, () => renderHappened(events)), 0;
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
