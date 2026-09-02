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
 * everything the act minted. A per-verb field instead withholds every handle
 * but the one a return type happens to name — an enquiry without its question,
 * a claim without the decision beside it — and answers some acts with nothing
 * created at all. `mintedHandles()` below reads
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
import { anyRef, bearing, collect, handle, inputRef, standing, supersededRef } from "../args";
import { answer, asHandles } from "../output";
import type { Run } from "../session";
import type { ClaimRef, DomainEvent, EnquiryRef, GateRef } from "../../domain";

/**
 * Every handle an act minted, across however many events it recorded — in
 * practice one per act. Reading `events` rather than a per-verb field is
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
    .command("note")
    .summary("put a note on the record -- the one write with no prerequisites")
    .description(
      "A dated, attributed record with nothing else required. `search` reaches it like anything " +
        "else with prose on it. --on attaches it to anything already on the record; skipping it " +
        "costs nothing, since attaching is the part this verb exists to make optional.",
    )
    .argument("<text>", "the note, in your own words")
    .option("--on <handle>", "what this note concerns, if anything", anyRef)
    .action(async (text: string, opts: { on?: ReturnType<typeof anyRef> }) =>
      run(async ({ write }) =>
        answer(
          await write.note({ text, ...(opts.on === undefined ? {} : { on: opts.on }) }),
          mintedView(),
        ),
      ),
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
    .summary("record a computation and what it read")
    .description(
      "Records the run: a computation, its evidence unit, and an output artefact. Answers with " +
        "the analysis handle, which is what `labkit conclude` takes to add each finding.",
    )
    .argument("<enquiry-id>", "the line of enquiry this belongs to", handle("enquiry"))
    .requiredOption("--method <text>", "what was done")
    .requiredOption(
      "--from <id>",
      "an input: ART_… observations or an earlier COMP_… analysis (repeatable)",
      collect(inputRef),
    )
    .option("--implementing <work-id>", "the planned work this carries out", handle("work"))
    .option(
      "--held-to <criterion-id>",
      "a prespecified condition its conclusions answer to (repeatable)",
      collect(handle("criterion")),
    )
    .action(async (enquiry, opts) =>
      run(async ({ write }) =>
        answer(
          await write.recordAnalysis({
            enquiry,
            method: opts.method,
            from: opts.from,
            ...(opts.implementing === undefined ? {} : { implementing: opts.implementing }),
            ...(opts.heldTo === undefined ? {} : { heldTo: opts.heldTo }),
          }),
          mintedView(),
        ),
      ),
    );

  program
    .command("conclude")
    .summary("assert one thing an analysis found")
    .description(
      "One conclusion per call. --replacing supersedes exactly one earlier finding and " +
        "inherits its proposition and bearing; a finding nothing names goes on standing.",
    )
    .argument("<analysis-id>", "the analysis this conclusion belongs to", handle("analysis"))
    .requiredOption("--finding <text>", "what was found, in this analysis's own words")
    .option("--proposition <text>", "what the finding bears on (required unless --replacing)")
    .option("--replacing <id>", "the CLM_… claim or EV_… finding this supersedes", supersededRef)
    .option("--bearing <supports|challenges>", "which way it cuts (default supports)", bearing)
    .option("--standing <exploratory|confirmatory>", "confirmatory standing", standing)
    .action(async (analysis, opts) =>
      run(async ({ write }) =>
        answer(
          await write.conclude({
            analysis,
            finding: opts.finding,
            ...(opts.proposition === undefined ? {} : { proposition: opts.proposition }),
            ...(opts.replacing === undefined ? {} : { replacing: opts.replacing }),
            ...(opts.bearing === undefined ? {} : { bearing: opts.bearing }),
            ...(opts.standing === undefined ? {} : { standing: opts.standing }),
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
    .option("--enquiry <id>", "the line of enquiry this work exists to advance", handle("enquiry"))
    .action(
      async (opts: {
        objective: string;
        acceptance: string;
        mayRead?: string[];
        enquiry?: EnquiryRef;
      }) =>
        run(async ({ write }) =>
          answer(
            await write.planWork({
              objective: opts.objective,
              acceptance: opts.acceptance,
              ...(opts.mayRead === undefined ? {} : { mayRead: opts.mayRead }),
              ...(opts.enquiry === undefined ? {} : { addressing: opts.enquiry }),
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
    .requiredOption("--proposition <text>", "what the re-check reached a verdict about")
    .requiredOption("--finding <text>", "what it found this time")
    .option("--bearing <supports|challenges>", "which way it cuts (default supports)", bearing)
    .option("--standing <exploratory|confirmatory>", "confirmatory standing", standing)
    .action(async (historical, opts) =>
      run(async ({ write }) =>
        answer(
          await write.reverify({
            historical,
            enquiry: opts.enquiry,
            method: opts.method,
            under: opts.under,
            // Flat flags rather than JSON, and this one stays on the verb: a
            // re-check reaches exactly one verdict about the thing it
            // re-checked, so there is no list to serialise.
            concludes: {
              proposition: opts.proposition,
              finding: opts.finding,
              ...(opts.bearing === undefined ? {} : { bearing: opts.bearing }),
              ...(opts.standing === undefined ? {} : { standing: opts.standing }),
            },
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
    .command("keep")
    .summary("revise an analysis, naming the conclusions that survive")
    .description(
      "Records a successor to the analysis those claims came from, supersedes every other " +
        "conclusion of it, and carries the named ones forward on their original evidence — " +
        "`labkit why` on a kept claim still rests on the run that produced the number. Add the " +
        "successor's own findings with `labkit conclude`. The successor reads what its " +
        "predecessor read; --from adds to that.",
    )
    .argument("<claim-id...>", "the conclusions that survive", (v, prev: string[] = []) => [
      ...prev,
      handle("claim")(v),
    ])
    .requiredOption("--because <review-id>", "the review that found it wanting", handle("review"))
    .requiredOption("--method <text>", "what the revision did differently")
    .option("--from <id>", "an input the successor read as well (repeatable)", collect(inputRef))
    .action(async (keeping, opts) =>
      run(async ({ write }) => {
        const report = await write.keep({
          keeping,
          because: opts.because,
          method: opts.method,
          ...(opts.from === undefined ? {} : { from: opts.from }),
        });
        // **What was superseded is the complement of what the caller typed**,
        // over a set they may not have had in front of them, so the act says
        // out loud what it did. stderr, because stdout is the handles.
        const total = report.superseded.length + report.kept.length;
        process.stderr.write(
          `labkit: superseding ${report.supersedes} — ${report.superseded.length} of ${total} ` +
            `conclusions; keeping ${report.kept.join(", ")}\n`,
        );
        return answer(report, mintedView());
      }),
    );

  program
    .command("replace")
    .summary("supersede a defective analysis with a corrected one")
    .description(
      "Every conclusion of the superseded analysis falls here — use `labkit keep` instead to " +
        "carry some of them forward. Add the successor's own findings with `labkit conclude`. " +
        "It reads what its predecessor read; --from adds to that.",
    )
    .argument("<analysis-id>", "the analysis being superseded", handle("analysis"))
    .requiredOption("--because <review-id>", "the review that found it defective", handle("review"))
    .requiredOption("--method <text>", "what the replacement did")
    .option("--from <id>", "an input the successor read as well (repeatable)", collect(inputRef))
    .action(async (supersedes, opts) =>
      run(async ({ write }) =>
        answer(
          await write.replaceAnalysis({
            supersedes,
            because: opts.because,
            method: opts.method,
            ...(opts.from === undefined ? {} : { from: opts.from }),
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
