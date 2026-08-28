/**
 * Argument handling, through the real program.
 *
 * Four behaviours the hand-rolled parser had to implement and get wrong first,
 * now commander's — which is not a reason to stop asserting them. A dependency
 * doing something today is not a promise it will next major version, and three
 * of the four are here because this repo shipped the opposite at least once.
 *
 * Driven through `buildProgram` with a capturing `Run`, so nothing opens a
 * database: `exitOverride()` turns commander's `process.exit` into a throw the
 * test can catch, and a command that reaches its action records what it was
 * given instead of running a verb.
 */

import { expect, test } from "bun:test";
import { buildProgram } from "../../src/cli/program";
import type { Run } from "../../src/cli/session";

/**
 * Parses one argv and reports whether the command's action was reached.
 *
 * **`run` records and does not invoke.** The first version called
 * `work({} as Surfaces)`, on the reasoning that no assertion here reaches a
 * verb — which was wrong the moment it ran: `known`'s body calls
 * `read.whatIsKnown` before anything else, and the empty object threw. Reaching
 * `run` at all is the whole property this needs, and stopping there keeps the
 * lie from ever being dereferenced.
 */
async function parse(argv: string[]): Promise<{ globals: Record<string, unknown>; ran: boolean }> {
  let ran = false;
  const run: Run = async () => {
    ran = true;
  };
  const program = buildProgram(run);
  program.exitOverride();
  await program.parseAsync(argv, { from: "user" });
  return { globals: program.opts(), ran };
}

/**
 * The message commander produces for a bad value, without the process exiting.
 *
 * `exitOverride` and `configureOutput` are applied to **every** command, not
 * just the root. Commander copies inherited settings when a subcommand is
 * added, and `buildProgram` adds all of them before this runs — so configuring
 * only the root leaves each subcommand still calling `process.exit` and still
 * printing its own help to stderr. Found by a test run that printed a usage
 * page into the middle of the suite output.
 */
async function refusal(argv: string[]): Promise<string> {
  const program = buildProgram(async () => {});
  const silence = { writeErr: () => {}, writeOut: () => {} };
  program.exitOverride().configureOutput(silence);
  for (const command of program.commands) command.exitOverride().configureOutput(silence);
  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`\`${argv.join(" ")}\` was accepted and should not have been`);
}

test("a global flag may precede or follow the command", () => {
  // The bug this replaced: positionals were "the first argument not starting
  // with --", so `labkit why --tenant acme "the schedule…"` asked why `acme`
  // was supported. Order-sensitivity in an argument parser is the kind of
  // defect that looks like the user's mistake.
  //
  // Not run through `parse` because `why` would reach a surface; the assertion
  // is about where the flag lands, which `optsWithGlobals` settles.
  const before = buildProgram(async () => {});
  before.parseOptions(["--tenant", "acme", "known"]);
  expect(before.opts().tenant).toBe("acme");

  const after = buildProgram(async () => {});
  after.parseOptions(["known", "--tenant", "acme"]);
  expect(after.opts().tenant).toBe("acme");
});

test("an unknown flag is refused, not ignored", async () => {
  // It used to be dropped on the floor, on the reasoning that a missing
  // positional would surface the mistake. That held while every command was a
  // read: the worst case was an answer to a slightly different question. A
  // mistyped `--becuase` on a write puts a record on the permanent register
  // with a field the caller believes they set.
  // On a command with no required options, so the message is about the unknown
  // flag rather than a missing one -- `promote --becuase …` reports the absent
  // `--because` first, which would let this pass for the wrong reason.
  expect(await refusal(["known", "--becuase", "it holds"])).toContain("--becuase");
});

test("a repeated option keeps every value, in order", async () => {
  // Six write verbs take a list of handles, and repetition is how one is given.
  // A list of *records* -- conclusions, carrying prose -- is JSON instead, for
  // the reason `PlanWorkCommand.mayRead`'s own doc comment gives.
  const program = buildProgram(async () => {});
  program.exitOverride();
  const analyse = program.commands.find((c) => c.name() === "analyse")!;
  analyse.parseOptions([
    "--method",
    "m",
    "--from",
    "ART_1",
    "--from",
    "COMP_2",
    "--concludes",
    JSON.stringify({ proposition: "p", finding: "f" }),
  ]);
  expect(analyse.opts().from).toEqual(["ART_1", "COMP_2"]);
});

test("a non-numeric --since or --limit is refused, not coerced", async () => {
  // `Number("abc")` is `NaN`, which reaches `pgEventLog` as a bound SQL
  // parameter and comes back empty -- a wrong-shaped answer to a question the
  // caller mistyped. `int()` also refuses `1.5`, which a cursor cannot be.
  expect(await refusal(["happened", "--limit", "abc"])).toContain("--limit");
  expect(await refusal(["happened", "--since", "1.5"])).toContain("--since");
});

test("a handle of the wrong kind is refused at the boundary", async () => {
  // `ref()` already refuses a mismatch, because an id's prefix names the label
  // a kind expects. Carrying that to the boundary means a caller who passes a
  // claim where a gate belongs is told which argument was wrong.
  expect(await refusal(["gate", "CLM_1"])).toContain("gate-id");
});

test("a command with no bad arguments reaches its action", async () => {
  // The control. Without it every assertion above could pass because the
  // program refuses everything.
  const { ran } = await parse(["known"]);
  expect(ran).toBe(true);
});

test("a bad --state names the values it would have accepted", async () => {
  // `oneOf`'s whole purpose: a typo means the caller asked for something and is
  // owed a message naming what was available, not a silent full list.
  expect(await refusal(["gates", "--state", "blockd"])).toContain(
    "never-evaluated, incomplete, blocked, satisfied",
  );
  expect(await refusal(["work", "--state", "carriedout"])).toContain(
    "planned, blocked, carried-out",
  );
});

test("a bad --state is refused before the action, so no database is opened", async () => {
  // **This is the assertion that would have caught it, and the message one
  // would not.** `gateState` was called *inside* `.action()`, so it did throw --
  // but by then `run` had been reached and the run wrapper had created a
  // database. Worse, `main()`'s catch returns early on any error carrying an
  // `exitCode`, on the assumption commander has already printed it. Commander
  // had not: `labkit gates --state blockd` exited 1 in complete silence, having
  // created a 42MB record on the way. Measured before the fix.
  //
  // As a parser the refusal happens during `parseAsync`, so `ran` stays false.
  for (const argv of [
    ["gates", "--state", "blockd"],
    ["work", "--state", "carriedout"],
  ]) {
    let ran = false;
    const program = buildProgram(async () => {
      ran = true;
    });
    const silence = { writeErr: () => {}, writeOut: () => {} };
    program.exitOverride().configureOutput(silence);
    for (const command of program.commands) command.exitOverride().configureOutput(silence);
    await expect(program.parseAsync(argv, { from: "user" })).rejects.toThrow();
    expect(ran).toBe(false);
  }
});
