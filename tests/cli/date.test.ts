/**
 * `--date` reaching a durable read — the check that was missing before this
 * flag merged. A hidden flag nothing asserts is the same shape as a check
 * that cannot fail: it exists in the code and nobody would notice it silently
 * stopped working.
 *
 * Driven through `runner()` directly rather than `buildProgram`/`parseAsync`
 * — commander's own parsing of `--date` (refused when not an ISO instant) is
 * `tests/cli/args.test.ts`'s job. This is about the one line downstream: does
 * the value commander accepted actually become the clock a write runs
 * against, durably.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { runner, type Globals } from "../../src/cli/session";
import { answer } from "../../src/cli/output";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "labkit-date-cli."));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const BACKFILLED = "2026-07-15T12:34:56.000Z";

test("--date stamps a write's event with that instant, and it reads back durably", async () => {
  let capturedAt: string | undefined;
  await runner(
    () => ({ db: dir, date: BACKFILLED }) as Globals,
    () => {},
  )(async ({ write }) => {
    const result = await write.pose({ question: "does the backfilled question hold?" });
    capturedAt = result.events[0]?.at;
    return answer(result, () => "");
  });
  expect(capturedAt).toBe(BACKFILLED);

  // Independently, through a fresh read against the same database -- proving
  // this is durable, not an echo of what the write call was handed.
  let events: readonly { operation: string; at: string }[] = [];
  await runner(
    () => ({ db: dir }) as Globals,
    () => {},
  )(async ({ read }) => {
    events = await read.whatHappened({ operation: "pose" });
    return answer(events, () => "");
  });
  expect(events.length).toBeGreaterThan(0);
  expect(events.every((e) => e.at === BACKFILLED)).toBe(true);
});

test("without --date, a write is stamped with the real time, not any prior --date", async () => {
  const before = new Date().toISOString();
  let capturedAt: string | undefined;
  await runner(
    () => ({ db: dir }) as Globals,
    () => {},
  )(async ({ write }) => {
    const result = await write.pose({ question: "a live question, asked without backfilling" });
    capturedAt = result.events[0]?.at;
    return answer(result, () => "");
  });
  expect(capturedAt).not.toBe(BACKFILLED);
  expect(capturedAt !== undefined && capturedAt >= before).toBe(true);
});
