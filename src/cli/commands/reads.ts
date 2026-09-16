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
  howQuery,
  workListQuery,
} from "../../domain/queries";
import { GATE_STATES, WORK_STATES } from "../../domain/vocab";
import {
  renderHistorical,
  renderKnown,
  renderWhyDispatch,
  renderHow,
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
  renderAnalysisList,
  renderClaimList,
  renderCriterionList,
  renderEnquiryList,
} from "../views/inventory";
import { renderLearned } from "../views/learned";
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
      "Blocked gates and the work each protects, gates nobody has finished checking, planned " +
        "work nothing has touched, and where every question stands. `--since <seq>` narrows " +
        "every section to what moved since that seq. Always prints the current `seq`. " +
        "`known --at` answers about a past moment.",
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
      "Every question, partitioned by how well its answer is held up: established, " +
        "provisional, accepted as unresolved, unresolved, untested. `--at <instant>` answers " +
        "as of that moment, where the partition is `open` instead of the last two.",
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
    .command("learned")
    .helpGroup("What stands")
    .summary("what the programme found out")
    .description(
      "Every conclusion, under the question it was reached against, with the finding beneath " +
        "it. `claims` lists the same conclusions without saying what any of them was for.",
    )
    .action(async () => run(async ({ read }) => answer(await read.learned(), renderLearned)));
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
    .command("how")
    .helpGroup("What stands")
    .summary("how a handle reached its current state")
    .description(
      "The ordered steps that produced the current state of any handle on the record. " +
        "Marks steps that were superseded (false starts) and names their successor when " +
        "the record says one step supersedes or changes another. Optional --since <seq> narrows like happened.",
    )
    .argument("<subject>", "a handle of any kind")
    .option("--since <n>", "only steps after this event seq", whole)
    .action(async (subject: string, opts: { since?: number }) => {
      const query = parseCommand(howQuery, {
        subject,
        ...(opts.since === undefined ? {} : { since: opts.since }),
      });
      return run(async ({ read }) => answer(await read.how(query), renderHow));
    });
  program
    .command("search")
    .helpGroup("Finding a handle")
    .summary("every record containing this text — a second seam where wording is resolved")
    .description(
      "Substring, case-insensitive, across every text property. Groups matches by kind. " +
        "`claims <sentence>` is the narrower search, by a claim's exact wording.",
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
    .summary("every claim, or the ones asserting a sentence")
    .description(
      "With no argument, every claim on the record and whether anything bears against it. " +
        "With one, the claims asserting that sentence — every match rather than one, because " +
        "two lines of enquiry can assert the same sentence about different endpoints.",
    )
    .argument("[proposition]", "the sentence, as worded")
    .action(async (proposition?: string) => {
      if (proposition === undefined)
        return run(async ({ read }) => answer(await read.claimList(), renderClaimList));
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
      "The question it narrowed, why, and what was known at the moment of the sharpening. " +
        "Null for a question somebody simply asked.",
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
    .command("enquiries")
    .helpGroup("Finding a handle")
    .summary("every line of enquiry")
    .description("What is being pursued, and how much of it has actually been run.")
    .action(async () =>
      run(async ({ read }) => answer(await read.enquiryList(), renderEnquiryList)),
    );
  program
    .command("analyses")
    .helpGroup("Finding a handle")
    .summary("every analysis")
    .description("What was run, and how many findings came out of it.")
    .action(async () =>
      run(async ({ read }) => answer(await read.analysisList(), renderAnalysisList)),
    );
  program
    .command("conditions")
    .helpGroup("What is blocked")
    .summary("every condition on the record")
    .description("What results are held to, and how each condition currently stands.")
    .action(async () =>
      run(async ({ read }) => answer(await read.criterionList(), renderCriterionList)),
    );
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
    .description("Each amendment, its reason, and whether it was mechanical or substantive.")
    .argument("<gate-id>", "e.g. GATE_1")
    .action(async (gate: string) => {
      const query = parseCommand(designHistoryQuery, { gate });
      return run(async ({ read }) => answer(await read.designHistory(query), renderDesign));
    });
  program
    .command("contract")
    .helpGroup("What is blocked")
    .summary("what a piece of planned work is for")
    .description("Its objective, what would count as meeting it, and what it may read.")
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
      "Whether a line of enquiry is still open, and if not how it closed — answered, " +
        "abandoned, or left open — with the answer and the evidence behind it. `why <id>` " +
        "adds which of `known`'s buckets its question now sits in.",
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
      "The claims each step withdrew, the decision that narrowed them, and why. A step names " +
        "every claim it withdrew.",
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
      "What was done, when, by which agent against which commit. `seq` is both the order " +
        "and the cursor for `--since`.",
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
