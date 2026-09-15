/**
 * Argument handling, through the real program.
 */

import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../../src/cli/cli";
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
  for (const command of program.commands) {
    command.exitOverride().configureOutput(silence);
    for (const child of command.commands) child.exitOverride().configureOutput(silence);
  }
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
  // The query schema brands the handle. A claim where a gate belongs is refused
  // before `run` opens a database, the same way a write command is.
  expect(await refusal(["gate", "CLM_1"])).toContain('gate handle expected a Gate id, got "CLM_1"');
});

test("happened touching a non-handle is refused at the boundary", async () => {
  expect(await refusal(["happened", "not-a-handle"])).toContain("not a handle");
});

test("a write handle of the wrong kind is refused at the boundary", async () => {
  expect(await refusal(["is", "confirmed", "GATE_1", "--because", "x"])).toContain(
    'claim handle expected a Claim id, got "GATE_1"',
  );
});

test("a command with no bad arguments reaches its action", async () => {
  // The control. Without it every assertion above could pass because the
  // program refuses everything.
  const { ran } = await parse(["known"]);
  expect(ran).toBe(true);
});

test("a bad --state names the values it would have accepted", async () => {
  // The query schema is the validator. A typo is refused with the vocab, not a silent full list.
  expect(await refusal(["gates", "--state", "blockd"])).toContain("sidestepped");
  expect(await refusal(["gates", "--state", "blockd"])).toContain("retired");
  expect(await refusal(["work", "--state", "carriedout"])).toContain("carried-out");
});

test("a bad gate closure names the schema values", async () => {
  const message = await refusal(["close", "gate", "GATE_1", "--as", "passed", "--because", "x"]);
  expect(message).toContain("sidestepped");
  expect(message).toContain("retired");
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

test("a bad --state is refused before run opens a database", async () => {
  // parseCommand runs in the action before `run`, so a bad --state never opens a database.
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

test("main prints a validation message when --state is wrong", async () => {
  // parseAsync alone would still pass if main swallowed InvalidArgumentError's exitCode.
  const chunks: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  const error = console.error;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stderr.write;
  console.error = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };
  let db: string | undefined;
  try {
    db = await mkdtemp(join(tmpdir(), "labkit-state-msg-"));
    const code = await main(["--db", db, "gates", "--state", "blockd"]);
    expect(code).toBe(1);
    expect(chunks.join("")).toContain("sidestepped");
    expect(chunks.join("")).not.toContain('"labkit":"request-failed"');
  } finally {
    process.stderr.write = write;
    console.error = error;
    if (db !== undefined) rmSync(db, { recursive: true, force: true });
  }
});

test("main prints a validation message for a wrong claim handle", async () => {
  const chunks: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  const error = console.error;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stderr.write;
  console.error = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };
  let db: string | undefined;
  try {
    db = await mkdtemp(join(tmpdir(), "labkit-claim-msg-"));
    const code = await main(["--db", db, "is", "confirmed", "GATE_1", "--because", "x"]);
    expect(code).toBe(1);
    expect(chunks.join("")).toContain("claim handle expected a Claim id");
    expect(chunks.join("")).not.toContain('"labkit":"request-failed"');
  } finally {
    process.stderr.write = write;
    console.error = error;
    if (db !== undefined) rmSync(db, { recursive: true, force: true });
  }
});

test("main prints one labkit line when closing an enquiry twice", async () => {
  let db: string | undefined;
  const chunks: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  const error = console.error;
  try {
    db = await mkdtemp(join(tmpdir(), "labkit-close-twice-"));
    expect(await main(["--db", db, "open", "does width matter?"])).toBe(0);
    expect(await main(["--db", db, "close", "enquiry", "LOE_1"])).toBe(0);

    process.stderr.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    }) as typeof process.stderr.write;
    console.error = (...args: unknown[]) => {
      chunks.push(args.map(String).join(" "));
    };

    const code = await main(["--db", db, "close", "enquiry", "LOE_1"]);
    const stderr = chunks.join("");
    expect(code).toBe(1);
    expect(stderr).toContain("labkit: LOE_1 is already closed by DEC_");
    expect(stderr.match(/^labkit:/gm) ?? []).toHaveLength(1);
    expect(stderr).not.toContain('"labkit":"request-failed"');
  } finally {
    process.stderr.write = write;
    console.error = error;
    if (db !== undefined) rmSync(db, { recursive: true, force: true });
  }
}, 60_000);
