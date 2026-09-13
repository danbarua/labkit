/**
 * The read commands — one per public verb on `ReadSurface`.
 */

import { InvalidArgumentError, type Command } from "commander";
import { parseCommand, whole } from "../args";
import { answer } from "../output";
import type { Run } from "../session";
import {
  claimsAssertingQuery,
  contractForQuery,
  criteriaGoverningQuery,
  designHistoryQuery,
  doTheseConflictQuery,
  enquiryStatusQuery,
  eventFilter,
  gateListQuery,
  gateStatusQuery,
  interpretationHistoryQuery,
  knownAtQuery,
  notesQuery,
  nowQuery,
  originOfQuery,
  pursuitsOfQuery,
  reproducibilityOfQuery,
  reproductionOfQuery,
  searchQuery,
  whatDependsOnQuery,
  whyQuery,
  workListQuery,
} from "../../domain/queries";
import { GATE_STATES, WORK_STATES } from "../../domain/vocab";
import {
  renderHistorical,
  renderKnown,
  renderWhyDispatch,
  renderClaims,
  renderConflict,
  renderSearch,
} from "../views/knowledge";
import { renderEnquiry, renderOrigin, renderPursuits } from "../views/enquiry";
import {
  renderContract,
  renderCriteria,
  renderDesign,
  renderGate,
  renderGateList,
  renderWorkList,
} from "../views/gates";
import {
  renderAffects,
  renderInterpretation,
  renderReproducibility,
  renderReproduction,
} from "../views/analysis";
import { renderHappened, renderNotes } from "../views/events";
import { renderStanding } from "../views/standing";

export function registerReads(program: Command, run: Run): void {
  program
    .command("now")
    .helpGroup("What stands")
    .summary("show me what the programme says matters")
    .description(
      "Blocked gates and the work each protects, gates nobody " +
        "has finished checking, planned work nothing has touched, and where every question " +
        "stands. There is deliberately no `--at`: this answers only about now, never about a " +
        "moment in the past. `--since <seq>` narrows every section to what moved since that " +
        "seq, and always prints the current `seq`, to pass back next time.",
    )
    .option("--since <seq>", "only what moved since this seq -- the one `now` last returned", whole)
    .action(async ({ since }: { since?: number }) => {
      const query = parseCommand(nowQuery, { ...(since === undefined ? {} : { since }) });
      return run(async ({ read }) => answer(await read.now(query), renderStanding));
    });
  program
    .command("known")
    .helpGroup("What stands")
    .summary("what the programme knows, now or as of a moment")
    .description(
      "What this research programme currently knows, partitioned by how well each answer is " +
        "held up: established, provisional, accepted as unresolved, unresolved, untested. " +
        "Given --at it answers as of that moment instead, from durable state rather than a " +
        "log — but the historical form cannot split `open` into worked-on and untouched, " +
        "because nothing records when work began.",
    )
    .option("--at <instant>", "ISO instant, e.g. 2026-08-21T09:00:00.000Z")
    .action(async ({ at }: { at?: string }) => {
      // Two reports, not one with an extra field: the as-of answer has `open`
      // where the present-day one has `unresolved` and `untested`, and cannot
      // split them. Two views, chosen here rather than inside one that
      // has to ask which it was given.
      if (at) {
        const query = parseCommand(knownAtQuery, { at });
        return run(async ({ read }) => answer(await read.whatWasKnown(query), renderHistorical));
      }
      return run(async ({ read }) => answer(await read.whatIsKnown(), renderKnown));
    });
  program
    .command("why")
    .helpGroup("What stands")
    .summary("why a record is in the state it's in")
    .description(
      "Dispatches on the handle's own kind: a claim (the findings resting under it, what " +
        "bears against it, what standard it was held to, what has superseded it), a task " +
        "(the line of enquiry and question it exists to advance), or a line of enquiry (its " +
        "status, and where its own question currently sits in `known`'s five buckets). Takes " +
        "a proposition too, when exactly one claim asserts it. Anything else this record does " +
        "not explain yet is refused, naming what it does.",
    )
    .argument("<subject>", "a handle of any kind, or a claim's proposition")
    .action(async (subject: string) => {
      const query = parseCommand(whyQuery, { subject });
      return run(async ({ read }) => answer(await read.why(query), renderWhyDispatch));
    });
  program
    .command("search")
    .helpGroup("Finding a handle")
    .summary("every record containing this text — a second seam where wording is resolved")
    .description(
      "Substring, case-insensitive, across every Prose property in the string taxonomy. " +
        "Returns every match grouped by label rather than picking one -- narrower than this, " +
        "and cheaper, is `claims`, which finds a claim by its exact asserted sentence.",
    )
    .argument("<text>", "the text to search for")
    .action(async (text: string) => {
      const query = parseCommand(searchQuery, { text });
      return run(async ({ read }) => {
        const groups = await read.search(query);
        return answer(groups, (g, p) => renderSearch(g, query.text, p));
      });
    });
  program
    .command("claims")
    .helpGroup("Finding a handle")
    .summary("which claims assert a sentence — text to handle")
    .description(
      "The one place wording is resolved. Returns every match rather than picking: two lines " +
        "of enquiry can assert the same sentence about different endpoints, and they are two " +
        "claims (S-5).",
    )
    .argument("<proposition>", "the sentence, as worded")
    .action(async (proposition: string) => {
      const query = parseCommand(claimsAssertingQuery, { proposition });
      return run(async ({ read }) => {
        const claims = await read.claimsAsserting(query);
        return answer(claims, (c, p) => renderClaims(c, query.proposition, p));
      });
    });
  program
    .command("pursuits")
    .helpGroup("Finding a handle")
    .summary("the lines of enquiry under a question")
    .description(
      "How a caller that did not open an enquiry finds one to work in. An empty list means the " +
        "question is on the books and nothing has been started on it.",
    )
    .argument("<question-id>", "e.g. Q_12")
    .action(async (question: string) => {
      const query = parseCommand(pursuitsOfQuery, { question });
      return run(async ({ read }) => {
        const enquiries = await read.pursuitsOf(query);
        return answer(enquiries, (e, p) => renderPursuits(e, query.question, p));
      });
    });
  program
    .command("origin")
    .helpGroup("Finding a handle")
    .summary("where a question came from, if it was sharpened")
    .description(
      "The question it narrowed, why, and what was known at that moment — frozen when the " +
        "sharpening was recorded rather than recomputed now. Null for a question somebody " +
        "simply asked, which is most of them.",
    )
    .argument("<question-id>", "e.g. Q_12")
    .action(async (question: string) => {
      const query = parseCommand(originOfQuery, { question });
      return run(async ({ read }) => {
        const origin = await read.originOf(query);
        return answer(origin, (o, p) => renderOrigin(o, query.question, p));
      });
    });
  program
    .command("gates")
    .helpGroup("What is blocked")
    .summary("every gate and whether it is satisfied")
    .description(
      "Where to start with a record you do not know. Every other gate command takes a " +
        "handle, and until this existed the only way to get one was to already hold a " +
        "claim. `--state blocked` is what is stopping work.",
    )
    .option("--state <state>", GATE_STATES.join(" | "))
    .action(async (opts: { state?: string }) => {
      const query = parseCommand(gateListQuery, {
        ...(opts.state === undefined ? {} : { state: opts.state }),
      });
      return run(async ({ read }) =>
        answer(await read.gateList(query), (gates, p) => renderGateList(gates, p, true)),
      );
    });
  program
    .command("work")
    .helpGroup("What is blocked")
    .summary("every planned piece of work and whether anything has been done")
    .description(
      "`--state planned` is what is ready to start: on the books, nothing done, nothing in " +
        "its way. `waiting` is planned work behind a gate nobody has finished checking — not " +
        "ready, not blocked; `blocked` is behind a gate with a failed condition. Not the same " +
        "question as `gates` — a gate reaches only the work it protects, and work planned " +
        "without one appears nowhere else. `why <task-id>` gives the line of enquiry (and " +
        "question) a task exists to advance, where `plan` was told one.",
    )
    .option("--state <state>", WORK_STATES.join(" | "))
    .action(async (opts: { state?: string }) => {
      const query = parseCommand(workListQuery, {
        ...(opts.state === undefined ? {} : { state: opts.state }),
      });
      return run(async ({ read }) =>
        answer(await read.workList(query), (work, p) => renderWorkList(work, p, true)),
      );
    });
  program
    .command("gate")
    .helpGroup("What is blocked")
    .summary("is this gate satisfied, itemised per condition")
    .description(
      "Which checks passed, which failed, which were never run, and which have no standing " +
        "verdict.",
    )
    .argument("<gate-id>", "e.g. GATE_1")
    .action(async (gate: string) => {
      const query = parseCommand(gateStatusQuery, { gate });
      return run(async ({ read }) => answer(await read.gateStatus(query), renderGate));
    });
  program
    .command("criteria")
    .helpGroup("What is blocked")
    .summary("which conditions a gate is bound to")
    .description("Pair it with `gate` for their wording and their current standing.")
    .argument("<gate-id>", "e.g. GATE_1")
    .action(async (gate: string) => {
      const query = parseCommand(criteriaGoverningQuery, { gate });
      return run(async ({ read }) => {
        const criteria = await read.criteriaGoverning(query);
        return answer(criteria, (c, p) => renderCriteria(c, query.gate, p));
      });
    });
  program
    .command("design")
    .helpGroup("What is blocked")
    .summary("how a gate's conditions were amended")
    .description(
      "Each amendment, its reason, and whether it was mechanical or substantive. Ordered from " +
        "the record itself rather than from timestamps.",
    )
    .argument("<gate-id>", "e.g. GATE_1")
    .action(async (gate: string) => {
      const query = parseCommand(designHistoryQuery, { gate });
      return run(async ({ read }) => answer(await read.designHistory(query), renderDesign));
    });
  program
    .command("contract")
    .helpGroup("What is blocked")
    .summary("what a piece of planned work is for")
    .description(
      "Its objective, what would count as meeting it, and what it may read. Not enforced, and " +
        "it says so: nothing stops a computation reading elsewhere.",
    )
    .argument("<work-id>", "e.g. TASK_1")
    .action(async (work: string) => {
      const query = parseCommand(contractForQuery, { work });
      return run(async ({ read }) => answer(await read.contractFor(query), renderContract));
    });
  program
    .command("enquiry")
    .helpGroup("One record's story")
    .summary("is this enquiry open, and how did it close")
    .description(
      "Whether a line of enquiry is still open, and if not how it closed — answered, abandoned, " +
        "or deliberately left open — with the answer and the evidence behind it. `why <id>` " +
        "adds which of `known`'s five buckets this enquiry's own question currently sits in — " +
        "did closing it move the bucket?",
    )
    .argument("<enquiry-id>", "e.g. LOE_7")
    .action(async (enquiry: string) => {
      const query = parseCommand(enquiryStatusQuery, { enquiry });
      return run(async ({ read }) => answer(await read.enquiryStatus(query), renderEnquiry));
    });
  program
    .command("interpretation")
    .helpGroup("One record's story")
    .summary("how a claim's reading was narrowed")
    .description(
      "The claims each step withdrew, the decision that narrowed them and why. One step can " +
        "withdraw several claims, so every step names records rather than a sentence.",
    )
    .argument("<claim-id>", "e.g. CLM_4")
    .action(async (claim: string) => {
      const query = parseCommand(interpretationHistoryQuery, { claim });
      return run(async ({ read }) =>
        answer(await read.interpretationHistory(query), renderInterpretation),
      );
    });
  program
    .command("reproduction")
    .helpGroup("One record's story")
    .summary("what a re-run read, against what its original read")
    .description(
      "It does not say whether the re-run reproduced the original: whether reading the same " +
        "records is the same execution depends on what the method does, which the record does " +
        "not know. Takes the id of the analysis that did the verifying.",
    )
    .argument("<analysis-id>", "the verifying analysis, e.g. COMP_5")
    .action(async (analysis: string) => {
      const query = parseCommand(reproductionOfQuery, { verification: analysis });
      return run(async ({ read }) => answer(await read.reproductionOf(query), renderReproduction));
    });
  program
    .command("reproducibility")
    .helpGroup("One record's story")
    .summary("whether an analysis can be accounted for")
    .description(
      "Each input lands in one of four buckets: rebuilt and identical, rebuilt and different, " +
        "unverifiable (the record kept no hash), or not rebuilt. Unverifiable is the record " +
        "admitting it cannot answer, which is different from answering no.",
    )
    .argument("<analysis-id>", "e.g. COMP_3")
    .argument("[parts...]", "<part-id>=<hash> pairs for what you rebuilt")
    .action(async (analysis: string, parts: string[]) => {
      const query = parseCommand(reproducibilityOfQuery, {
        analysis,
        rebuilt: (parts ?? []).map((raw) => {
          const at = raw.indexOf("=");
          if (at < 1) throw new InvalidArgumentError(`\`${raw}\` is not <part-id>=<hash>`);
          return { part: raw.slice(0, at), hash: raw.slice(at + 1) };
        }),
      });
      return run(async ({ read }) =>
        answer(await read.reproducibilityOf(query), renderReproducibility),
      );
    });
  program
    .command("affects")
    .helpGroup("One record's story")
    .summary("what depends on a record, if it turns out wrong")
    .description(
      "The claims and lines of enquiry reached from an artefact, walking downstream through " +
        "every analysis built on it. A lower bound, and it says so: anything connected by a " +
        "route not listed is absent from the lists, not thereby unaffected.",
    )
    .argument("<artefact-or-name>", "a logical name, or an ART_… id when a name is ambiguous")
    .action(async (subject: string) => {
      const query = parseCommand(whatDependsOnQuery, { subject });
      return run(async ({ read }) => answer(await read.whatDependsOn(query), renderAffects));
    });
  program
    .command("conflict")
    .helpGroup("One record's story")
    .summary("whether two conclusions actually disagree")
    .description(
      "Contradiction, dissociation, or corroboration. Two analyses reaching opposite-sounding " +
        "results are not in conflict if they asked about different endpoints, and this is what " +
        "tells them apart.",
    )
    .argument("<claim-a>", "the first claim's id")
    .argument("<claim-b>", "the second claim's id")
    .action(async (a: string, b: string) => {
      const query = parseCommand(doTheseConflictQuery, { a, b });
      return run(async ({ read }) => answer(await read.doTheseConflict(query), renderConflict));
    });
  program
    .command("notes")
    .helpGroup("What was done")
    .summary("every note on the record, newest first")
    .description(
      "Notes are the one write with no prerequisites, and `search` reaches them only by words " +
        "somebody already remembers. This lists them all — what each says, what it concerns, " +
        "and the question it prompted where it prompted one. `--on <handle>` narrows to the " +
        "notes about one record, which is the only route to them for a claim, gate or line of " +
        "enquiry: `why` surfaces attached notes for a question and not for those.",
    )
    .option("--on <handle>", "only the notes concerning this record")
    .action(async ({ on }: { on?: string }) => {
      const query = parseCommand(notesQuery, { ...(on === undefined ? {} : { concerning: on }) });
      return run(async ({ read }) => answer(await read.notes(query), renderNotes));
    });
  program
    .command("happened")
    .helpGroup("What was done")
    .summary("the acts themselves, oldest first, with who ran them")
    .description(
      "The only command that answers from the event log rather than the record. Every other " +
        "read tells you what is true now; this tells you what was done to make it so, when, and " +
        "by which agent against which commit. `seq` is both the order and the cursor.",
    )
    .argument("[id]", "acts about, or minting, this handle")
    .option("--since <seq>", "only acts after this seq — the cursor", whole)
    .option("--by <id>", "one agent's acts, by attribution id")
    .option("--operation <verb>", "one verb, e.g. recordAnalysis")
    .option("--reconstructed", "only acts that say what they were read off")
    // Not `--no-reconstructed`: a negatable flag defaults to on, and the
    // default here is neither arm. "Unsourced" and not "performed" -- nobody
    // said, which is not the same as somebody watched.
    .option("--unsourced", "only acts that say nothing about where they came from")
    .option("--limit <n>", "how many at most", whole, 50)
    .action(
      async (
        id: string | undefined,
        opts: {
          since?: number;
          by?: string;
          operation?: string;
          reconstructed?: boolean;
          unsourced?: boolean;
          limit: number;
        },
      ) => {
        if (opts.reconstructed && opts.unsourced)
          throw new Error(
            "--reconstructed and --unsourced ask for opposite halves; pass neither for both",
          );
        const query = parseCommand(eventFilter, {
          ...(id === undefined ? {} : { touching: id }),
          ...(opts.since === undefined ? {} : { since: opts.since }),
          ...(opts.by === undefined ? {} : { by: opts.by }),
          ...(opts.operation === undefined ? {} : { operation: opts.operation }),
          ...(opts.reconstructed ? { reconstructed: true } : {}),
          ...(opts.unsourced ? { reconstructed: false } : {}),
          limit: opts.limit,
        });
        return run(async ({ read }) => answer(await read.whatHappenedPage(query), renderHappened));
      },
    );
}
