/**
 * The write commands — one per public verb on `WriteSurface`.
 */

import { createdIn } from "@labkit/core-domain";
import type { DomainEvent, WriteSurface } from "@labkit/core-domain";
import type { Command } from "commander";
import type { z } from "zod";
import { collect, parseCommand } from "../args";
import { answer, asHandles } from "../output";
import type { Run } from "../session";
import {
  acceptAsUnresolvedCommand,
  amendDesignCommand,
  claimIsConfirmedCommand,
  closeEnquiryCommand,
  concludeCommand,
  declareGateCommand,
  evaluateCriterionCommand,
  noteCommand,
  noteSupersedesCommand,
  openEnquiryCommand,
  planWorkCommand,
  poseCommand,
  pursueCommand,
  recordAnalysisCommand,
  recordObservationsCommand,
  stateCriterionCommand,
  stopWorkCommand,
  synthesiseCommand,
} from "@labkit/core-domain/commands";

/**
 * Every handle an act minted, across however many events it recorded — in practice one per act.
 */
const mintedHandles = (events: readonly DomainEvent[]): readonly string[] =>
  events.flatMap(createdIn);

/**
 * Uncoloured on purpose — see {@link asHandles}. The whole of stdout here is
 * an id (or several) the next command consumes, and an escape sequence in it
 * breaks `$(labkit …)` the moment someone sets `FORCE_COLOR`.
 */
const mintedView =
  <T extends { events: readonly DomainEvent[] }>() =>
  (r: T, p: Parameters<typeof asHandles>[1]) =>
    asHandles(mintedHandles(r.events), p);

export function registerWrites(program: Command, run: Run): void {
  const parsed = <S extends z.ZodType>(
    schema: S,
    value: unknown,
    act: (write: WriteSurface, input: z.output<S>) => Promise<{ events: readonly DomainEvent[] }>,
  ) => {
    const input = parseCommand(schema, value);
    return run(async ({ write }) => answer(await act(write, input), mintedView()));
  };
  program
    .command("pose")
    .helpGroup("Asking")
    .summary("put a question on the record")
    .description(
      "Put a question on the record without starting work on it. `open` asks and starts in " +
        "one act; `pursue` starts on a question already asked.",
    )
    .argument("<question>", "the question, as worded")
    .option("--from <note-id>", "the note this question came out of, e.g. NOTE_3")
    .action(async (question: string, opts: { from?: string }) => {
      const input = parseCommand(poseCommand, {
        question,
        ...(opts.from === undefined ? {} : { from: opts.from }),
      });
      return run(async ({ write }) => answer(await write.pose(input), mintedView()));
    });
  program
    .command("open")
    .helpGroup("Asking")
    .summary("pose a question and pursue it, as one act")
    .description(
      "Ask a question and start on it, in one act. `pose` asks without starting; `pursue` " +
        "starts on a question already asked.",
    )
    .argument("<question>", "the question, as worded")
    .option("--from <note-id>", "the note this question came out of, e.g. NOTE_3")
    .action(async (question: string, opts: { from?: string }) => {
      const input = parseCommand(openEnquiryCommand, {
        question,
        ...(opts.from === undefined ? {} : { from: opts.from }),
      });
      return run(async ({ write }) =>
        answer(await write.openEnquiry(input.question, input.from), mintedView()),
      );
    });
  program
    .command("pursue")
    .helpGroup("Asking")
    .summary("open a line of enquiry against a question already on the record")
    .description(
      "Start on a question already on the record, naming the approach. One question can be " +
        "pursued several times, by different approaches, and they stay distinct.",
    )
    .argument("<question-id>", "e.g. Q_12")
    .requiredOption("--approach <text>", "how this line of enquiry will go about it")
    .action(async (question, { approach }: { approach: string }) =>
      parsed(pursueCommand, { question, approach }, (write, input) => write.pursue(input)),
    );
  program
    .command("note")
    .helpGroup("Asking")
    .summary("put a note on the record -- the one write with no prerequisites")
    .description(
      "A dated, attributed record with nothing else required. `search` reaches it like anything " +
        "else with prose on it. --on attaches it to anything already on the record; skipping it " +
        "costs nothing, since attaching is the part this verb exists to make optional. " +
        "An existing note id with --supersedes records that it supersedes those notes, without writing a new note.",
    )
    .argument("<text>", "the note, in your own words, or an existing note id with --supersedes")
    .option("--on <handle>", "what this note concerns, if anything")
    .option(
      "--prompted <question-id>",
      "a question this note is the reason for — why it was asked, not what it is about",
    )
    .option(
      "--supersedes <note-id>",
      "a note this one supersedes — both stay readable (repeatable)",
      collect(String),
    )
    .action(
      async (text: string, opts: { on?: string; prompted?: string; supersedes?: string[] }) => {
        if (opts.supersedes !== undefined && opts.on === undefined && opts.prompted === undefined) {
          const historic = noteSupersedesCommand.safeParse({
            note: text,
            supersedes: opts.supersedes,
          });
          if (historic.success) {
            return run(async ({ write }) =>
              answer(await write.note(historic.data), (r, p) => asHandles([r.note], p)),
            );
          }
        }
        return parsed(
          noteCommand,
          {
            text,
            ...(opts.on === undefined ? {} : { on: opts.on }),
            ...(opts.prompted === undefined ? {} : { prompted: opts.prompted }),
            ...(opts.supersedes === undefined ? {} : { supersedes: opts.supersedes }),
          },
          (write, input) => write.note(input),
        );
      },
    );
  program
    .command("observe")
    .helpGroup("Doing the work")
    .summary("put measurement on the record without analysing it")
    .argument("<enquiry-id>", "the line of enquiry this belongs to")
    .requiredOption("--name <text>", "the artefact's logical name")
    .requiredOption("--finding <text>", "what was observed, in the observer's words")
    .option("--hash <text>", "a content hash, if there is one")
    .action(async (enquiry, opts: { name: string; finding: string; hash?: string }) =>
      parsed(
        recordObservationsCommand,
        {
          enquiry,
          name: opts.name,
          finding: opts.finding,
          ...(opts.hash === undefined ? {} : { contentHash: opts.hash }),
        },
        (write, input) => write.recordObservations(input),
      ),
    );
  program
    .command("analyse")
    .helpGroup("Doing the work")
    .summary("record a computation and what it read")
    .description(
      "Records the run: a computation, its evidence unit, and an output artefact. Answers with " +
        "the analysis handle, which is what `labkit conclude` takes to add each finding. With `--json`, " +
        "the answer also names the `heldTo` criteria actually bound to the run.",
    )
    .argument("<enquiry-id>", "the line of enquiry this belongs to")
    .requiredOption("--method <text>", "what was done")
    .requiredOption(
      "--from <id>",
      "an input: ART_… observations or an earlier COMP_… analysis (repeatable)",
      collect(String),
    )
    .option("--implementing <work-id>", "the planned work this carries out")
    .option(
      "--held-to <criterion-id>",
      "a prespecified condition its conclusions answer to (repeatable)",
      collect(String),
    )
    .action(async (enquiry, opts) =>
      parsed(
        recordAnalysisCommand,
        {
          enquiry,
          method: opts.method,
          from: opts.from,
          ...(opts.implementing === undefined ? {} : { implementing: opts.implementing }),
          ...(opts.heldTo === undefined ? {} : { heldTo: opts.heldTo }),
        },
        (write, input) => write.recordAnalysis(input),
      ),
    );
  program
    .command("conclude")
    .helpGroup("Doing the work")
    .summary("assert one thing an analysis found")
    .description(
      "One conclusion per call. --replacing supersedes exactly one earlier finding and " +
        "inherits its proposition and bearing; a finding nothing names goes on standing.",
    )
    .argument("<analysis-id>", "the analysis this conclusion belongs to")
    .requiredOption("--finding <text>", "what was found, in this analysis's own words")
    .option("--proposition <text>", "what the finding bears on (required unless --replacing)")
    .option("--replacing <id>", "the CLM_… claim or EV_… finding this supersedes")
    .option("--bearing <supports|challenges>", "which way it cuts (default supports)")
    .option("--standing <exploratory|confirmatory>", "confirmatory standing")
    .action(async (analysis, opts) =>
      parsed(
        concludeCommand,
        {
          analysis,
          finding: opts.finding,
          ...(opts.proposition === undefined ? {} : { proposition: opts.proposition }),
          ...(opts.replacing === undefined ? {} : { replacing: opts.replacing }),
          ...(opts.bearing === undefined ? {} : { bearing: opts.bearing }),
          ...(opts.standing === undefined ? {} : { standing: opts.standing }),
        },
        (write, input) => write.conclude(input),
      ),
    );
  program
    .command("synthesise")
    .helpGroup("Doing the work")
    .summary("draw one finding across findings already on the record")
    .description(
      "For the finding that is what other findings say together: no method, no input, no " +
        "output of its own. The claims it rests on are what a reader reaches it by, and what " +
        "`labkit why` reports. Recording it with `labkit analyse` instead mints a run that " +
        "never happened.",
    )
    .argument("<proposition>", "the claim, as a sentence")
    .requiredOption(
      "--resting-on <claim-id>",
      "a finding it is drawn across (repeatable)",
      collect(String),
    )
    .action(async (proposition, opts) =>
      parsed(synthesiseCommand, { proposition, restingOn: opts.restingOn }, (write, input) =>
        write.synthesise(input),
      ),
    );
  program
    .command("plan")
    .helpGroup("Saying in advance what counts")
    .summary("state an objective and what would count as meeting it")
    .requiredOption("--objective <text>", "what the work is for")
    .requiredOption("--acceptance <text>", "what would count as meeting it")
    .option(
      "--may-read <text>",
      "what this work is permitted to read (repeatable)",
      collect(String),
    )
    .option("--enquiry <id>", "the line of enquiry this work exists to advance")
    .option(
      "--after <work>",
      "work this waits on; not ready to start until it has a result (repeatable)",
      collect(String),
    )
    .action(
      async (opts: {
        objective: string;
        acceptance: string;
        mayRead?: string[];
        enquiry?: string;
        after?: string[];
      }) =>
        parsed(
          planWorkCommand,
          {
            objective: opts.objective,
            acceptance: opts.acceptance,
            ...(opts.mayRead === undefined ? {} : { mayRead: opts.mayRead }),
            ...(opts.enquiry === undefined ? {} : { addressing: opts.enquiry }),
            ...(opts.after === undefined ? {} : { after: opts.after }),
          },
          (write, input) => write.planWork(input),
        ),
    );
  program
    .command("criterion")
    .helpGroup("Saying in advance what counts")
    .summary("state a condition a result will be held to")
    .description(
      "Stated before the work, which is the point: a check agreed after seeing the numbers is " +
        "not the same check, and a prespecified check nobody ran still counts against the " +
        "finding it qualifies.",
    )
    .argument("<proposition>", "what must hold")
    .action(async (proposition: string) => {
      const input = parseCommand(stateCriterionCommand, { proposition });
      return run(async ({ write }) =>
        answer(await write.stateCriterion(input.proposition), mintedView()),
      );
    });
  program
    .command("declare")
    .helpGroup("Saying in advance what counts")
    .summary("bind conditions to the work they gate")
    .requiredOption(
      "--governed-by <criterion-id>",
      "a condition this gate is bound to (repeatable)",
      collect(String),
    )
    .requiredOption("--consequence <text>", "what not passing means")
    .requiredOption(
      "--protecting <work-id>",
      "planned work this gate protects (repeatable)",
      collect(String),
    )
    .action(async (opts) =>
      parsed(
        declareGateCommand,
        {
          governedBy: opts.governedBy,
          consequence: opts.consequence,
          protecting: opts.protecting,
        },
        (write, input) => write.declareGate(input),
      ),
    );
  program
    .command("evaluate")
    .helpGroup("Saying in advance what counts")
    .summary("record a prespecified check's outcome")
    .description("`--gate` is optional: a condition can qualify a finding and gate no work.")
    .argument("<criterion-id>", "the condition being checked")
    .requiredOption("--value <text>", "what was measured")
    .requiredOption("--outcome <pass|fail>", "the verdict")
    .option("--gate <gate-id>", "the gate this verdict is reached for")
    .option(
      "--about <claim-id>",
      "the finding this verdict judges, when one criterion is applied to several",
    )
    .option(
      "--citing <id>",
      "what decided it — a CLM_… claim, an ART_… observations record, or an EV_… finding (repeatable)",
      collect(String),
    )
    .action(
      async (
        criterion,
        opts: {
          value: string;
          outcome: string;
          gate?: string;
          about?: string;
          citing?: string[];
        },
      ) =>
        parsed(
          evaluateCriterionCommand,
          {
            criterion,
            value: opts.value,
            outcome: opts.outcome,
            ...(opts.gate === undefined ? {} : { gate: opts.gate }),
            ...(opts.about === undefined ? {} : { about: opts.about }),
            ...(opts.citing === undefined ? {} : { citing: opts.citing }),
          },
          (write, input) => write.evaluateCriterion(input),
        ),
    );
  program
    .command("amend")
    .helpGroup("Saying in advance what counts")
    .summary("replace a locked condition with another, recording the act")
    .description(
      "Not an edit: the original wording stays readable, the reason and its evidence survive, " +
        "and one amendment is orderable against another. The report says whether the change was " +
        "mechanical or scientific, and what needs re-running.",
    )
    .argument("<criterion-id>", "the condition being amended")
    .requiredOption("--now-requires <text>", "the replacement condition")
    .requiredOption("--because <text>", "what prompted the amendment")
    .option(
      "--citing <claim-id>",
      "the diagnosis it rests on — required once the condition has been evaluated, omitted for a fix made before the first run",
    )
    .action(async (criterion, opts: { nowRequires: string; because: string; citing?: string }) =>
      parsed(
        amendDesignCommand,
        {
          criterion,
          nowRequires: opts.nowRequires,
          because: opts.because,
          ...(opts.citing === undefined ? {} : { citing: opts.citing }),
        },
        (write, input) => write.amendDesign(input),
      ),
    );
  program;
  const is = program
    .command("is")
    .helpGroup("Revising")
    .description(
      "**The claim's standing changed; its wording did not.** `confirmed` is one others may build on.",
    );
  is.command("confirmed")
    .helpGroup("Revising")
    .summary("record that a finding is something others may build on")
    .argument("<claim-id>", "the claim")
    .requiredOption("--because <text>", "what justifies vouching for it")
    .action(async (claim, { because }: { because: string }) =>
      parsed(claimIsConfirmedCommand, { claim, because }, (write, input) =>
        write.isConfirmed(input),
      ),
    );
  const close = program
    .command("close")
    .helpGroup("Stopping")
    .description("Close a line of enquiry or a piece of planned work. Subcommand names the kind.");
  close
    .command("enquiry")
    .helpGroup("Stopping")
    .summary("close a line of enquiry, answered or abandoned")
    .argument("<enquiry-id>", "the line of enquiry")
    .option("--answered-by <claim-id>", "the claim that answers it")
    .action(async (enquiry, { answeredBy }: { answeredBy?: string }) =>
      parsed(
        closeEnquiryCommand,
        {
          enquiry,
          ...(answeredBy === undefined ? {} : { answeredBy }),
        },
        (write, input) => write.closeEnquiry(input),
      ),
    );
  close
    .command("work")
    .helpGroup("Stopping")
    .summary("stop a piece of planned work")
    .argument("<work-id>", "the task")
    .requiredOption("--because <text>", "why it is not being done")
    .action(async (work, { because }: { because: string }) =>
      parsed(stopWorkCommand, { work, because }, (write, input) => write.stopWork(input)),
    );
  program
    .command("accept")
    .helpGroup("Stopping")
    .summary("leave a question open, and say what would reopen it")
    .description(
      "Not the same as abandoning it, and not the same as nobody having got round to it. The " +
        "enquiry still reports itself open — deliberately — with the reason and the reopening " +
        "condition beside it.",
    )
    .argument("<enquiry-id>", "the line of enquiry")
    .requiredOption("--because <text>", "why it is being left open")
    .requiredOption("--until <text>", "what would reopen it")
    .requiredOption("--in-light-of <claim-id>", "the finding this is taken in light of")
    .action(async (enquiry, opts: { because: string; until: string; inLightOf: string }) =>
      parsed(
        acceptAsUnresolvedCommand,
        {
          enquiry,
          because: opts.because,
          until: opts.until,
          inLightOf: opts.inLightOf,
        },
        (write, input) => write.acceptAsUnresolved(input),
      ),
    );
}
