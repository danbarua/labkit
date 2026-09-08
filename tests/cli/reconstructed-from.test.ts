/**
 * `--reconstructed-from` and its environment variable reaching a durable read.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { runner, type Globals } from "../../src/cli/session";
import { answer } from "../../src/cli/output";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "labkit-reconstructed-cli."));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
  delete process.env.LABKIT_RECONSTRUCTED_FROM;
});

const PAPER = "Ito et al. 2024, fig. 3";
const HISTORY = "bonsai-2026 git history";

/** One write, through the runner, returning the act's recorded source. */
const poseWith = async (globals: Partial<Globals>, question: string) => {
  let source: string | null | undefined;
  await runner(
    () => ({ db: dir, ...globals }) as Globals,
    () => {},
  )(async ({ write }) => {
    const result = await write.pose({ question });
    source = result.events[0]?.reconstructedFrom;
    return answer(result, () => "");
  });
  return source;
};

test("--reconstructed-from is recorded, and reads back durably", async () => {
  expect(await poseWith({ reconstructedFrom: PAPER }, "does the coating slow corrosion?")).toBe(
    PAPER,
  );

  let sources: (string | null)[] = [];
  await runner(
    () => ({ db: dir }) as Globals,
    () => {},
  )(async ({ read }) => {
    const events = await read.whatHappened({ operation: "pose" });
    sources = events.map((e) => e.reconstructedFrom);
    return answer(events, () => "");
  });
  expect(sources).toEqual([PAPER]);
});

/** What a backfill script sets once at the top, rather than on every line. */
test("$LABKIT_RECONSTRUCTED_FROM covers the writes that follow it", async () => {
  process.env.LABKIT_RECONSTRUCTED_FROM = HISTORY;
  expect(await poseWith({}, "did the sampler port land?")).toBe(HISTORY);
});

test("the flag wins over the environment", async () => {
  process.env.LABKIT_RECONSTRUCTED_FROM = HISTORY;
  expect(await poseWith({ reconstructedFrom: PAPER }, "which source is on this one?")).toBe(PAPER);
});

/**
 * `null` is *nobody said*. An act with neither must not inherit the last one set, and must not
 * read as a claim that someone watched the work happen.
 */
test("with neither, the act says nothing about how it was come by", async () => {
  expect(await poseWith({}, "a question asked live, at a terminal")).toBeNull();
});
