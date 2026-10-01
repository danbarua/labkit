/**
 * `labkit enquiries` names the state each line of enquiry is in, through the real CLI.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "..", "packages", "app-cli", "cli.ts");

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "labkit-enquiries-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** One CLI invocation against the scratch record; stdout, trimmed. Throws on a non-zero exit. */
function labkit(...args: string[]): string {
  const { LABKIT_DB_URL: _url, LABKIT_HOME: _home, ...env } = process.env;
  const run = Bun.spawnSync([process.execPath, CLI, "--db", dir, "--no-ansi", ...args], {
    cwd: dir,
    env,
  });
  if (run.exitCode !== 0) throw new Error(`labkit ${args.join(" ")}: ${run.stderr.toString()}`);
  return run.stdout.toString().trim();
}

/** The one handle with this prefix among the lines a write printed. */
const handle = (printed: string, prefix: string): string => {
  const found = printed.split("\n").filter((line) => line.startsWith(prefix));
  if (found.length !== 1) throw new Error(`expected one ${prefix} handle in ${printed}`);
  return found[0]!;
};

test("an enquiry whose question was accepted as unresolved is listed as accepted", () => {
  const accepted = handle(labkit("open", "does the coating slow corrosion?"), "LOE_");
  const running = handle(labkit("open", "does the primer matter?"), "LOE_");
  const untested = handle(labkit("open", "does the colour matter?"), "LOE_");

  const readings = handle(labkit("observe", accepted, "--name", "r", "--finding", "f"), "ART_");
  const analysis = handle(
    labkit("analyse", accepted, "--method", "m", "--from", readings),
    "COMP_",
  );
  const claim = handle(
    labkit("conclude", analysis, "--finding", "no change", "--proposition", "the coating is inert"),
    "CLM_",
  );
  labkit(
    "accept",
    accepted,
    "--because",
    "no more samples",
    "--until",
    "a new batch",
    "--in-light-of",
    claim,
  );
  labkit("observe", running, "--name", "r2", "--finding", "f2");

  const listed = labkit("enquiries");
  const stateOf = (enquiry: string) =>
    listed
      .split("\n")
      .find((line) => line.includes(enquiry))
      ?.trim()
      .split(/\s+/)[0];
  expect(stateOf(accepted)).toBe("accepted");
  expect(stateOf(running)).toBe("running");
  expect(stateOf(untested)).toBe("untested");

  const why = labkit("why", accepted);
  expect(why).toContain("accepted because: no more samples");
  expect(why).toContain("reopens if: a new batch");
});

test("`analyse` without --from records an analysis that read nothing", () => {
  const enquiry = handle(labkit("open", "is a thought experiment an analysis?"), "LOE_");
  const printed = labkit("analyse", enquiry, "--method", "worked it out on paper");
  expect(handle(printed, "COMP_")).toMatch(/^COMP_\d+$/);
});

test("`close enquiry --answered-by` keeps every claim it is given", () => {
  const enquiry = handle(labkit("open", "what does the coating do?"), "LOE_");
  const readings = handle(labkit("observe", enquiry, "--name", "r", "--finding", "f"), "ART_");
  const analysis = handle(labkit("analyse", enquiry, "--method", "m", "--from", readings), "COMP_");
  const first = handle(
    labkit("conclude", analysis, "--finding", "fewer pits", "--proposition", "it slows pitting"),
    "CLM_",
  );
  const second = handle(
    labkit("conclude", analysis, "--finding", "less creep", "--proposition", "it slows creep"),
    "CLM_",
  );
  labkit("close", "enquiry", enquiry, "--answered-by", first, "--answered-by", second);

  const why = JSON.parse(labkit("--json", "why", enquiry)) as {
    report: { enquiry: { answered: { claim: string }[] } };
  };
  expect(why.report.enquiry.answered.map((a) => a.claim).sort()).toEqual([first, second].sort());
});
