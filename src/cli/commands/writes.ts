/**
 * The write commands — one per public verb on `WriteSurface`.
 *
 * **Handles in, handles out.** Every command here prints the handles its act
 * minted, one per line and nothing else, because that is what the next
 * command takes: `labkit close "$(labkit analyse …)"` only composes if the id
 * is the whole of stdout. That is the transport half of the repo's rule that
 * *a verb that mints something returns what it minted* — the verbs already
 * do, by way of the event `WriteSurface.emit` records, and a CLI printing
 * "done" would put the caller back to searching for what they had just made.
 *
 * **The handles printed are `events[0].created`** — every verb's return value
 * carries `events: DomainEvent[]`, and `created` is the drained list of
 * everything the act minted. Before #161, a verb that minted more than one
 * thing (an enquiry and its question; a decision alongside a claim) withheld
 * every handle but the one its return type happened to name, and `close`,
 * `evaluate`, `accept` and `promote` withheld all of theirs — they returned
 * nothing, so the CLI answered with an acknowledgement that named what was
 * *acted on* and nothing that was *created*. `mintedHandles()` below reads
 * every event's `created` uniformly, so a verb minting several things and one
 * minting nothing both fall out of the same line rather than a per-command
 * special case.
 *
 * `--json` gives the full return value — the same shape the MCP tool answers
 * with for the same verb, `events` included.
 *
 * Each body calls `write.someVerb(` literally, and `tests/cli/coverage.test.ts`
 * greps this directory for exactly that.
 */

import type { Command } from "commander";
import { collect, conclusion, handle, inputRef } from "../args";
import { answer, asHandles } from "../output";
import type { Run } from "../session";
import type { ClaimRef, DomainEvent, GateRef } from "../../domain";

/**
 * Every handle an act minted, across however many events it recorded — in
 * practice one, per CLAUDE.md's "a verb that composes others records one
 * event, not one per step". Reading `events` rather than a per-verb field is
 * what makes this the same line for every command: a verb minting nothing
 * prints nothing, one minting several prints all of them, with no command
 * having to know which case it is.
 */
const mintedHandles = (events: readonly DomainEvent[]): readonly string[] =>
  events.flatMap((e) => e.created);

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
  program
    .command("pose")
    .summary("put a question on the record")
    .description("A question, without starting work on it. `open` does both at once.")
    .argument("<question>", "the question, as worded")
    .action(async (question: string) =>
      run(async ({ write }) => answer(await write.pose(question), mintedView())),
    );

  program
    .command("open")
    .summary("pose a question and pursue it, as one act")
    .description(
      "The common opening move. It records **one** event, not a `pose` and a `pursue`: the " +
        "event stream is a record of research actions, and a researcher who opened an enquiry " +
        "did one thing.",
    )
    .argument("<question>", "the question, as worded")
    .action(async (question: string) =>
      run(async ({ write }) => answer(await write.openEnquiry(question), mintedView())),
    );

  program
    .command("pursue")
    .summary("open a line of enquiry against a question already on the record")
    .argument("<question-id>", "e.g. Q_12", handle("question"))
    .requiredOption("--approach <text>", "how this line of enquiry will go about it")
    .action(async (question, { approach }: { approach: string }) =>
      run(async ({ write }) => answer(await write.pursue({ question, approach }), mintedView())),
    );

  program
    .command("sharpen")
    .summary("narrow a question into a more precise one, recording why")
    .description(
      "The new question records what was known at the moment it was asked, frozen rather than " +
        "recomputed — so a later reader sees the evidence the sharpening was taken in light of, " +
        "not everything that has arrived since.",
    )
    .argument("<question-id>", "the question being narrowed", handle("question"))
    .requiredOption("--into <question>", "the sharper question")
    .requiredOption("--because <text>", "what prompted the narrowing")
    .action(async (from, { into, because }: { into: string; because: string }) =>
      run(async ({ write }) => answer(await write.sharpen({ from, into, because }), mintedView())),
    );

  program
    .command("observe")
    .summary("put measurement on the record without analysing it")
    .argument("<enquiry-id>", "the line of enquiry this belongs to", handle("enquiry"))
    .requiredOption("--name <text>", "the artefact's logical name")
    .requiredOption("--finding <text>", "what was observed, in the observer's words")
    .option("--hash <text>", "a content hash, if there is one")
    .action(async (enquiry, opts: { name: string; finding: string; hash?: string }) =>
      run(async ({ write }) =>
        answer(
          await write.recordObservations({
            enquiry,
            name: opts.name,
            finding: opts.finding,
            ...(opts.hash === undefined ? {} : { contentHash: opts.hash }),
          }),
          mintedView(),
        ),
      ),
    );

  program
    .command("analyse")
    .summary("record a computation, what it read, and what it concluded")
    .description(
      "The compound verb: a computation, its evidence unit, an output artefact, and one claim " +
        "per conclusion. Answers with every handle the act minted.",
    )
    .argument("<enquiry-id>", "the line of enquiry this belongs to", handle("enquiry"))
    .requiredOption("--method <text>", "what was done")
    .requiredOption(
      "--from <id>",
      "an input: ART_… observations or an earlier COMP_… analysis (repeatable)",
      collect(inputRef),
    )
    .requiredOption(
      "--concludes <json>",
      `'{"proposition": "…", "finding": "…"}' (repeatable; bearing and standing optional)`,
      collect(conclusion),
    )
    .option("--implementing <work-id>", "the planned work this carries out", handle("work"))
    .option(
      "--held-to <criterion-id>",
      "a prespecified condition these conclusions answer to (repeatable)",
      collect(handle("criterion")),
    )
    .action(async (enquiry, opts) =>
      run(async ({ write }) =>
        answer(
          await write.recordAnalysis({
            enquiry,
            method: opts.method,
            from: opts.from,
            concludes: opts.concludes,
            ...(opts.implementing === undefined ? {} : { implementing: opts.implementing }),
            ...(opts.heldTo === undefined ? {} : { heldTo: opts.heldTo }),
          }),
          mintedView(),
        ),
      ),
    );

  program
    .command("review")
    .summary("record a verdict on an analysis")
    .description("A later retraction can rest on this, which is why it is a record of its own.")
    .argument("<analysis-id>", "the analysis being reviewed", handle("analysis"))
    .requiredOption("--verdict <text>", "what the review found")
    .action(async (of, { verdict }: { verdict: string }) =>
      run(async ({ write }) => answer(await write.recordReview({ of, verdict }), mintedView())),
    );

  program
    .command("close")
    .summary("close a line of enquiry — answered, or abandoned")
    .description(
      "With --answered-by it closes as answered on that claim; without, as abandoned. The two " +
        "are different closures and the absence is read, not defaulted. Closing a question that " +
        "is already closed is refused rather than recorded.",
    )
    .argument("<enquiry-id>", "the line of enquiry", handle("enquiry"))
    .option("--answered-by <claim-id>", "the claim that answers its question", handle("claim"))
    // `answeredBy` arrives already coerced -- the option declares `handle("claim")`
    // as its parser, so a wrong-kind id was refused before this ran.
    .action(async (enquiry, { answeredBy }: { answeredBy?: ClaimRef }) =>
      run(async ({ write }) =>
        answer(
          await write.closeEnquiry({
            enquiry,
            ...(answeredBy === undefined ? {} : { answeredBy }),
          }),
          mintedView(),
        ),
      ),
    );

  program
    .command("plan")
    .summary("state an objective and what would count as meeting it")
    .requiredOption("--objective <text>", "what the work is for")
    .requiredOption("--acceptance <text>", "what would count as meeting it")
    .option(
      "--may-read <text>",
      "what this work is permitted to read (repeatable)",
      collect(String),
    )
    .action(async (opts: { objective: string; acceptance: string; mayRead?: string[] }) =>
      run(async ({ write }) =>
        answer(
          await write.planWork({
            objective: opts.objective,
            acceptance: opts.acceptance,
            ...(opts.mayRead === undefined ? {} : { mayRead: opts.mayRead }),
          }),
          mintedView(),
        ),
      ),
    );

  program
    .command("criterion")
    .summary("state a condition a result will be held to")
    .description(
      "Stated before the work, which is the point: a check agreed after seeing the numbers is " +
        "not the same check, and a prespecified check nobody ran still counts against the " +
        "finding it qualifies.",
    )
    .argument("<proposition>", "what must hold")
    .action(async (proposition: string) =>
      run(async ({ write }) => answer(await write.stateCriterion(proposition), mintedView())),
    );

  program
    .command("declare")
    .summary("bind conditions to the work they gate")
    .requiredOption(
      "--governed-by <criterion-id>",
      "a condition this gate is bound to (repeatable)",
      collect(handle("criterion")),
    )
    .requiredOption("--consequence <text>", "what not passing means")
    .requiredOption(
      "--protecting <work-id>",
      "planned work this gate protects (repeatable)",
      collect(handle("work")),
    )
    .action(async (opts) =>
      run(async ({ write }) =>
        answer(
          await write.declareGate({
            governedBy: opts.governedBy,
            consequence: opts.consequence,
            protecting: opts.protecting,
          }),
          mintedView(),
        ),
      ),
    );

  program
    .command("evaluate")
    .summary("record a prespecified check's outcome")
    .description(
      "--gate is optional on purpose: a condition can qualify a finding and gate no work, and " +
        "requiring a gate there would force the caller to mint one protecting nothing.",
    )
    .argument("<criterion-id>", "the condition being checked", handle("criterion"))
    .requiredOption("--value <text>", "what was measured")
    .addOption(
      program
        .createOption("--outcome <pass|fail>", "the verdict")
        .choices(["pass", "fail"])
        .makeOptionMandatory(),
    )
    .option("--gate <gate-id>", "the gate this verdict is reached for", handle("gate"))
    .option("--citing <claim-id>", "the finding that decided it", handle("claim"))
    .action(
      async (
        criterion,
        opts: {
          value: string;
          outcome: "pass" | "fail";
          gate?: GateRef;
          citing?: ClaimRef;
        },
      ) =>
        run(async ({ write }) =>
          answer(
            await write.evaluateCriterion({
              criterion,
              value: opts.value,
              outcome: opts.outcome,
              ...(opts.gate === undefined ? {} : { gate: opts.gate }),
              ...(opts.citing === undefined ? {} : { citing: opts.citing }),
            }),
            mintedView(),
          ),
        ),
    );

  program
    .command("reverify")
    .summary("re-check an earlier analysis under fresh inputs")
    .description(
      "One conclusion, not a list: a re-check reaches one verdict about the thing it " +
        "re-checked. It does not claim reproduction — see `labkit reproduction`.",
    )
    .argument("<analysis-id>", "the analysis being re-checked", handle("analysis"))
    .requiredOption("--enquiry <id>", "the line of enquiry this belongs to", handle("enquiry"))
    .requiredOption("--method <text>", "what the re-check did")
    .requiredOption("--under <id>", "an input the re-check read (repeatable)", collect(inputRef))
    .requiredOption("--concludes <json>", `'{"proposition": "…", "finding": "…"}'`, conclusion)
    .action(async (historical, opts) =>
      run(async ({ write }) =>
        answer(
          await write.reverify({
            historical,
            enquiry: opts.enquiry,
            method: opts.method,
            under: opts.under,
            concludes: opts.concludes,
          }),
          mintedView(),
        ),
      ),
    );

  program
    .command("accept")
    .summary("leave a question open on purpose, and say what would reopen it")
    .description(
      "Not the same as abandoning it, and not the same as nobody having got round to it. The " +
        "enquiry still reports itself open — deliberately — with the reason and the reopening " +
        "condition beside it.",
    )
    .argument("<enquiry-id>", "the line of enquiry", handle("enquiry"))
    .requiredOption("--because <text>", "why it is being left open")
    .requiredOption("--until <text>", "what would reopen it")
    .requiredOption(
      "--in-light-of <claim-id>",
      "the finding this is taken in light of",
      handle("claim"),
    )
    .action(async (enquiry, opts: { because: string; until: string; inLightOf: ClaimRef }) =>
      run(async ({ write }) =>
        answer(
          await write.acceptAsUnresolved({
            enquiry,
            because: opts.because,
            until: opts.until,
            inLightOf: opts.inLightOf,
          }),
          mintedView(),
        ),
      ),
    );

  program
    .command("promote")
    .summary("promote a finding from scratch to something others may build on")
    .description(
      "A separate act from concluding. Until a finding is promoted, an answer resting on it is " +
        "*provisional* rather than *established*, and `labkit known` keeps those apart.",
    )
    .argument("<claim-id>", "the claim being promoted", handle("claim"))
    .requiredOption("--because <text>", "what justifies promoting it")
    .action(async (claim, { because }: { because: string }) =>
      run(async ({ write }) => answer(await write.promote({ claim, because }), mintedView())),
    );

  program
    .command("amend")
    .summary("replace a locked condition with another, recording the act")
    .description(
      "Not an edit: the original wording stays readable, the reason and its evidence survive, " +
        "and one amendment is orderable against another. The report says whether the change was " +
        "mechanical or scientific, and what needs re-running.",
    )
    .argument("<criterion-id>", "the condition being amended", handle("criterion"))
    .requiredOption("--now-requires <text>", "the replacement condition")
    .requiredOption("--because <text>", "what prompted the amendment")
    .requiredOption("--citing <claim-id>", "the diagnosis it rests on", handle("claim"))
    .action(async (criterion, opts: { nowRequires: string; because: string; citing: ClaimRef }) =>
      run(async ({ write }) =>
        answer(
          await write.amendDesign({
            criterion,
            nowRequires: opts.nowRequires,
            because: opts.because,
            citing: opts.citing,
          }),
          mintedView(),
        ),
      ),
    );

  program
    .command("replace")
    .summary("supersede a defective analysis with a corrected one")
    .description(
      "Invalidates the superseded output and records the replacement in one transaction, so a " +
        "failure between the halves cannot leave an earlier failure no longer deciding its " +
        "check with no corrected check in existence. Answers with every handle it minted.",
    )
    .argument("<analysis-id>", "the analysis being superseded", handle("analysis"))
    .requiredOption("--because <review-id>", "the review that found it defective", handle("review"))
    .requiredOption("--enquiry <id>", "the line of enquiry this belongs to", handle("enquiry"))
    .requiredOption("--method <text>", "what the replacement did")
    .requiredOption("--from <id>", "an input it read (repeatable)", collect(inputRef))
    .requiredOption("--concludes <json>", "a conclusion (repeatable)", collect(conclusion))
    .action(async (supersedes, opts) =>
      run(async ({ write }) =>
        answer(
          await write.replaceAnalysis({
            supersedes,
            because: opts.because,
            enquiry: opts.enquiry,
            method: opts.method,
            from: opts.from,
            concludes: opts.concludes,
          }),
          mintedView(),
        ),
      ),
    );

  program
    .command("reinterpret")
    .summary("narrow what a claim is read to mean")
    .description(
      "Withdraws the old reading and records the new one. A single step can withdraw several " +
        "claims — two analyses reaching one reading are withdrawn together — so the report names " +
        "records rather than a sentence.",
    )
    .argument("<claim-id>", "the claim being narrowed", handle("claim"))
    .requiredOption("--as <text>", "the narrower reading")
    .requiredOption("--because <text>", "what prompted the narrowing")
    .action(async (of, opts: { as: string; because: string }) =>
      run(async ({ write }) =>
        answer(
          await write.reinterpret({
            of,
            as: opts.as,
            because: opts.because,
          }),
          mintedView(),
        ),
      ),
    );
}
