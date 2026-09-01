/**
 * The read commands — one per public verb on `ReadSurface`.
 *
 * **Declared, not dispatched.** The monolithic CLI answered every question
 * inside one `switch` five hundred lines long, where a command's arguments, its
 * validation, its verb call and its rendering were four things separated by
 * indentation. Here commander owns parsing, `../args` owns coercion, `../views`
 * owns rendering, and what is left in each body is the sentence that matters:
 * which verb, with which handles.
 *
 * Each body calls `read.someVerb(` literally, and `tests/cli/coverage.test.ts`
 * greps this directory for exactly that. Derived rather than listed, so a verb
 * added to the surface later is covered without anyone remembering — and
 * derived from the call, not from a `verb:` field beside it, because a field
 * records what a declaration *says* and can disagree with the line below it.
 *
 * The coverage runs one way only: **every read verb needs a command, and a
 * command needs no MCP tool.** `--backup` or anything else the terminal wants
 * and an agent does not is a feature, not a parity failure.
 */

import type { Command } from "commander";
import { gateState, handle, rebuilt, whole, workState } from "../args";
import { answer } from "../output";
import type { Run } from "../session";
import type { EventFilter } from "../../domain";
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
import { renderHappened } from "../views/events";

export function registerReads(program: Command, run: Run): void {
  program
    .command("known")
    .summary("what the programme knows, now or as of a moment")
    .description(
      "What this research programme currently knows, partitioned by how well each answer is " +
        "held up: established, provisional, accepted as unresolved, unresolved, untested. " +
        "Given --at it answers as of that moment instead, from durable state rather than a " +
        "log — but the historical form cannot split `open` into worked-on and untouched, " +
        "because nothing records when work began.",
    )
    .option("--at <instant>", "ISO instant, e.g. 2026-08-21T09:00:00.000Z")
    .action(async ({ at }: { at?: string }) =>
      run(async ({ read }) =>
        // Two reports, not one with an extra field: the as-of answer has `open`
        // where the present-day one has `unresolved` and `untested`, and cannot
        // split them (S-1). Two views, chosen here rather than inside one that
        // has to ask which it was given.
        at
          ? answer(await read.whatWasKnown(at), renderHistorical)
          : answer(await read.whatIsKnown(), renderKnown),
      ),
    );

  program
    .command("why")
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
    .action(async (subject: string) =>
      run(async ({ read }) => answer(await read.why(subject), renderWhyDispatch)),
    );

  program
    .command("claims")
    .summary("which claims assert a sentence — text to handle")
    .description(
      "The one place wording is resolved. Returns every match rather than picking: two lines " +
        "of enquiry can assert the same sentence about different endpoints, and they are two " +
        "claims (S-5).",
    )
    .argument("<proposition>", "the sentence, as worded")
    .action(async (proposition: string) =>
      run(async ({ read }) => {
        const claims = await read.claimsAsserting(proposition);
        return answer(claims, (c, p) => renderClaims(c, proposition, p));
      }),
    );

  program
    .command("search")
    .summary("every record containing this text — a second seam where wording is resolved")
    .description(
      "Substring, case-insensitive, across every Prose property in the string taxonomy. " +
        "Returns every match grouped by label rather than picking one -- narrower than this, " +
        "and cheaper, is `claims`, which finds a claim by its exact asserted sentence.",
    )
    .argument("<text>", "the text to search for")
    .action(async (text: string) =>
      run(async ({ read }) => {
        const groups = await read.search(text);
        return answer(groups, (g, p) => renderSearch(g, text, p));
      }),
    );

  program
    .command("conflict")
    .summary("whether two conclusions actually disagree")
    .description(
      "Contradiction, dissociation, or corroboration. Two analyses reaching opposite-sounding " +
        "results are not in conflict if they asked about different endpoints, and this is what " +
        "tells them apart.",
    )
    .argument("<claim-a>", "the first claim's id", handle("claim"))
    .argument("<claim-b>", "the second claim's id", handle("claim"))
    .action(async (a, b) =>
      run(async ({ read }) => answer(await read.doTheseConflict(a, b), renderConflict)),
    );

  program
    .command("pursuits")
    .summary("the lines of enquiry under a question")
    .description(
      "How a caller that did not open an enquiry finds one to work in. An empty list means the " +
        "question is on the books and nothing has been started on it.",
    )
    .argument("<question-id>", "e.g. Q_12", handle("question"))
    .action(async (question) =>
      run(async ({ read }) => {
        const enquiries = await read.pursuitsOf(question);
        return answer(enquiries, (e, p) => renderPursuits(e, question, p));
      }),
    );

  program
    .command("origin")
    .summary("where a question came from, if it was sharpened")
    .description(
      "The question it narrowed, why, and what was known at that moment — frozen when the " +
        "sharpening was recorded rather than recomputed now. Null for a question somebody " +
        "simply asked, which is most of them.",
    )
    .argument("<question-id>", "e.g. Q_12", handle("question"))
    .action(async (question) =>
      run(async ({ read }) => {
        const origin = await read.originOf(question);
        return answer(origin, (o, p) => renderOrigin(o, question, p));
      }),
    );

  program
    .command("enquiry")
    .summary("is this enquiry open, and how did it close")
    .description(
      "Whether a line of enquiry is still open, and if not how it closed — answered, abandoned, " +
        "or deliberately left open — with the answer and the evidence behind it. `why <id>` " +
        "adds which of `known`'s five buckets this enquiry's own question currently sits in — " +
        "did closing it move the bucket?",
    )
    .argument("<enquiry-id>", "e.g. LOE_7", handle("enquiry"))
    .action(async (enquiry) =>
      run(async ({ read }) => answer(await read.enquiryStatus(enquiry), renderEnquiry)),
    );

  program
    .command("gates")
    .summary("every gate and whether it is satisfied")
    .description(
      "Where to start with a record you do not know. Every other gate command takes a " +
        "handle, and until this existed the only way to get one was to already hold a " +
        "claim. `--state blocked` is what is stopping work.",
    )
    // **The coercion is commander's parser, not called in the action.** Passed
    // here, commander catches the `InvalidArgumentError`, prints it with usage
    // and exits before any command body runs. Called inside `.action()` it
    // still threw, but `main()`'s catch sees a `CommanderError` with
    // `exitCode` already set and returns early on the assumption commander has
    // printed it -- so `labkit gates --state blockd` exited 1 in **silence**,
    // and created a database on the way, because the run wrapper opens one
    // before the body validates anything.
    .option("--state <state>", "never-evaluated | incomplete | blocked | satisfied", gateState)
    .action(async (opts: { state?: ReturnType<typeof gateState> }) =>
      run(async ({ read }) => answer(await read.gateList(opts.state), renderGateList)),
    );

  program
    .command("work")
    .summary("every planned piece of work and whether anything has been done")
    .description(
      "`--state planned` is what is ready to start: on the books, nothing blocking, no " +
        "analysis against it yet. Not the same question as `gates` — a gate reaches only " +
        "the work it protects, and work planned without one appears nowhere else. `why " +
        "<task-id>` gives the line of enquiry (and question) a task exists to advance, " +
        "where `planWork` was told one.",
    )
    // Commander's parser, for the reason given on `gates` above.
    .option("--state <state>", "planned | blocked | carried-out", workState)
    .action(async (opts: { state?: ReturnType<typeof workState> }) =>
      run(async ({ read }) => answer(await read.workList(opts.state), renderWorkList)),
    );

  program
    .command("gate")
    .summary("is this gate satisfied, itemised per condition")
    .description(
      "Which checks passed, which failed, which were never run, and which have no standing " +
        "verdict. Computed, never stored — there is no value anyone can set to `satisfied`.",
    )
    .argument("<gate-id>", "e.g. GATE_1", handle("gate"))
    .action(async (gate) =>
      run(async ({ read }) => answer(await read.gateStatus(gate), renderGate)),
    );

  program
    .command("criteria")
    .summary("which conditions a gate is bound to")
    .description("Pair it with `gate` for their wording and their current standing.")
    .argument("<gate-id>", "e.g. GATE_1", handle("gate"))
    .action(async (gate) =>
      run(async ({ read }) => {
        const criteria = await read.criteriaGoverning(gate);
        return answer(criteria, (c, p) => renderCriteria(c, gate, p));
      }),
    );

  program
    .command("design")
    .summary("how a gate's conditions were amended")
    .description(
      "Each amendment, its reason, and whether it was mechanical or substantive. Ordered from " +
        "the record itself rather than from timestamps.",
    )
    .argument("<gate-id>", "e.g. GATE_1", handle("gate"))
    .action(async (gate) =>
      run(async ({ read }) => answer(await read.designHistory(gate), renderDesign)),
    );

  program
    .command("contract")
    .summary("what a piece of planned work is for")
    .description(
      "Its objective, what would count as meeting it, and what it may read. Not enforced, and " +
        "it says so: nothing stops a computation reading elsewhere.",
    )
    .argument("<work-id>", "e.g. TASK_1", handle("work"))
    .action(async (work) =>
      run(async ({ read }) => answer(await read.contractFor(work), renderContract)),
    );

  program
    .command("interpretation")
    .summary("how a claim's reading was narrowed")
    .description(
      "The claims each step withdrew, the decision that narrowed them and why. One step can " +
        "withdraw several claims, so every step names records rather than a sentence.",
    )
    .argument("<claim-id>", "e.g. CLM_4", handle("claim"))
    .action(async (claim) =>
      run(async ({ read }) =>
        answer(await read.interpretationHistory(claim), renderInterpretation),
      ),
    );

  program
    .command("reproduction")
    .summary("what a re-run read, against what its original read")
    .description(
      "It does not say whether the re-run reproduced the original: whether reading the same " +
        "records is the same execution depends on what the method does, which the record does " +
        "not know. Takes the id of the analysis that did the verifying.",
    )
    .argument("<analysis-id>", "the verifying analysis, e.g. COMP_5", handle("analysis"))
    .action(async (analysis) =>
      run(async ({ read }) => answer(await read.reproductionOf(analysis), renderReproduction)),
    );

  program
    .command("reproducibility")
    .summary("whether an analysis can be accounted for")
    .description(
      "Each input lands in one of four buckets: rebuilt and identical, rebuilt and different, " +
        "unverifiable (the record kept no hash), or not rebuilt. Unverifiable is the record " +
        "admitting it cannot answer, which is different from answering no.",
    )
    .argument("<analysis-id>", "e.g. COMP_3", handle("analysis"))
    .argument("[parts...]", "<part-id>=<hash> pairs for what you rebuilt")
    .action(async (analysis, parts: string[]) =>
      run(async ({ read }) =>
        answer(await read.reproducibilityOf(analysis, parts.map(rebuilt)), renderReproducibility),
      ),
    );

  program
    .command("affects")
    .summary("what depends on a record, if it turns out wrong")
    .description(
      "The claims and lines of enquiry reached from an artefact, walking downstream through " +
        "every analysis built on it. A lower bound, and it says so: anything connected by a " +
        "route not listed is absent from the lists, not thereby unaffected.",
    )
    .argument("<artefact-or-name>", "a logical name, or an ART_… id when a name is ambiguous")
    .action(async (subject: string) =>
      run(async ({ read }) =>
        answer(
          await read.whatDependsOn(
            subject.startsWith("ART_") ? handle("observations")(subject) : subject,
          ),
          renderAffects,
        ),
      ),
    );

  program
    .command("happened")
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
    .option("--limit <n>", "how many at most", whole, 50)
    .action(
      async (
        id: string | undefined,
        opts: {
          since?: number;
          by?: string;
          operation?: string;
          limit: number;
        },
      ) =>
        run(async ({ read }) => {
          const filter: EventFilter = {
            ...(id === undefined ? {} : { touching: id }),
            ...(opts.since === undefined ? {} : { since: opts.since }),
            ...(opts.by === undefined ? {} : { by: opts.by }),
            ...(opts.operation === undefined ? {} : { operation: opts.operation }),
            limit: opts.limit,
          };
          return answer(await read.whatHappened(filter), renderHappened);
        }),
    );
}
