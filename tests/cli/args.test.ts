/**
 * Argument handling, through the real program.
 */

import { expect, test } from "bun:test";
import { buildProgram } from "../../src/cli/program";
import type { Run } from "../../src/cli/session";

/**
 * Parses one argv and reports whether the command's action was reached.
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
  // The bug this replaced: positionals were "the first argument not starting with --", so
  // `labkit why --tenant acme "the schedule…"` asked why `acme` was supported. Order-
  // sensitivity in an argument parser is the kind of defect that looks like the user's mistake.
  const before = buildProgram(async () => {});
  before.parseOptions(["--tenant", "acme", "known"]);
  expect(before.opts().tenant).toBe("acme");

  const after = buildProgram(async () => {});
  after.parseOptions(["known", "--tenant", "acme"]);
  expect(after.opts().tenant).toBe("acme");
});

test("an unknown flag is refused, not ignored", async () => {
  // Dropping it on the floor and trusting a missing positional to surface the mistake would
  // hold for a read, where the worst case is an answer to a slightly different question. A
  // mistyped `--becuase` on a write puts a record on the permanent register with a field the
  // caller believes they set.
  expect(await refusal(["known", "--becuase", "it holds"])).toContain("--becuase");
});

test("a repeated option keeps every value, in order", async () => {
  // Six write verbs take a list of handles, and repetition is how one is given.
  // A list of *records* -- conclusions, carrying prose -- is JSON instead, for
  // the reason `PlanWorkCommand.mayRead`'s own doc comment gives.
  const program = buildProgram(async () => {});
  program.exitOverride();
  const analyse = program.commands.find((c) => c.name() === "analyse")!;
  analyse.parseOptions(["--method", "m", "--from", "ART_1", "--from", "COMP_2"]);
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
    "planned, waiting, blocked, carried-out, abandoned",
  );
});

test("a non-ISO --date is refused, not stamped into the record", async () => {
  // `--date` reaches `Clock.now()` unwrapped, straight into every write's
  // `DomainEvent.at` -- an unvalidated string there is not a CLI typo caught
  // at the boundary, it is a bad timestamp durably stamped into the record.
  expect(await refusal(["--date", "banana", "pose", "does it hold?"])).toContain("--date");
  // Same shape as the `--state blockd` case below: refused during parsing, so
  // `ran` -- and therefore the database connection `pose`'s action would open
  // -- is never reached.
  let ran = false;
  const program = buildProgram(async () => {
    ran = true;
  });
  const silence = { writeErr: () => {}, writeOut: () => {} };
  program.exitOverride().configureOutput(silence);
  for (const command of program.commands) command.exitOverride().configureOutput(silence);
  await expect(
    program.parseAsync(["--date", "banana", "pose", "does it hold?"], { from: "user" }),
  ).rejects.toThrow();
  expect(ran).toBe(false);
});

test("a bad --state is refused before the action, so no database is opened", async () => {
  // **This is the assertion that would have caught it, and the message one would not.**
  // `gateState` was called *inside* `.action()`, so it did throw -- but by then `run` had been
  // reached and the run wrapper had created a database. Worse, `main()`'s catch returns early
  // on any error carrying an `exitCode`, on the assumption commander has already printed it.
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
