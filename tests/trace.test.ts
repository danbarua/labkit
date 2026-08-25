/**
 * `traced()` must be free when off and useful when on.
 *
 * Both halves matter. Free-when-off is what lets this ship in the DB layer
 * rather than living in a scratch diff that gets rebuilt from memory every time
 * someone investigates — which is what happened twice, at the cost of three
 * documents asserting a wrong cause in between. Useful-when-on means recording
 * the two things that actually settled that investigation: in-flight queries,
 * and per-connection totals.
 */
import { afterEach, expect, test } from "bun:test";
import { traced, traceTotals, tracedInFlight } from "../src/db/trace";
import type { LabKitDB } from "../src/db/client";

const stub: LabKitDB = {
  async query() {
    return { rows: [] };
  },
};

afterEach(() => {
  delete process.env.LABKIT_TRACE;
  delete process.env.LABKIT_TRACE_SLOW_MS;
});

test("off by default, and off means the very same object", () => {
  delete process.env.LABKIT_TRACE;
  // Identity, not equivalence. A wrapper that merely behaved the same would
  // still allocate and still branch per query; returning the argument is what
  // makes a disabled trace cost exactly one env read at construction.
  expect(traced(stub, "x")).toBe(stub);
});

test("explicitly disabled values are honoured, not just absence", () => {
  for (const off of ["0", "false", ""]) {
    process.env.LABKIT_TRACE = off;
    expect(traced(stub, "x")).toBe(stub);
  }
});

test("when on, it wraps and counts per connection", async () => {
  process.env.LABKIT_TRACE = "1";
  const a = traced(stub, "conn-a");
  const b = traced(stub, "conn-b");
  expect(a).not.toBe(stub);

  await a.query("SELECT 1");
  await a.query("SELECT 2");
  await b.query("SELECT 3");

  const totals = Object.fromEntries(traceTotals().map((t) => [t.connection, t.queries]));
  expect(totals["conn-a"]).toBeGreaterThanOrEqual(2);
  expect(totals["conn-b"]).toBeGreaterThanOrEqual(1);
});

test("a throwing query is still cleared from the in-flight set", async () => {
  process.env.LABKIT_TRACE = "1";

  // Both directions, because only the pair proves anything. Asserting the set
  // is empty afterwards is satisfied by a tracker that never records at all.
  let release!: () => void;
  const pending: LabKitDB = {
    query: () =>
      new Promise((resolve) => {
        release = () => resolve({ rows: [] });
      }),
  };
  const slow = traced(pending, "conn-pending");
  const inProgress = slow.query("SELECT waiting");
  expect(tracedInFlight().filter((q) => q.connection === "conn-pending")).toHaveLength(1);
  release();
  await inProgress;
  expect(tracedInFlight().filter((q) => q.connection === "conn-pending")).toEqual([]);

  // And the failure mode this test exists for: a leaked entry would make the
  // watchdog report a phantom stuck query forever, which is the one thing that
  // would make this module lie. Until PJ-028 it was described in a comment
  // above `expect(true).toBe(true)` -- and moving `inFlight.delete(id)` out of
  // traced()'s `finally` left the whole suite green.
  const boom: LabKitDB = {
    async query() {
      throw new Error("nope");
    },
  };
  const t = traced(boom, "conn-boom");
  await expect(t.query("SELECT bad")).rejects.toThrow(/nope/);
  expect(tracedInFlight().filter((q) => q.connection === "conn-boom")).toEqual([]);
});

test("parameters are never emitted", async () => {
  process.env.LABKIT_TRACE = "all";
  const written: string[] = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string) => {
    written.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    await traced(stub, "conn-secret").query("MATCH (c:Claim {name: $name}) RETURN c", [
      "a proposition nobody should find in a trace file",
    ]);
  } finally {
    process.stderr.write = realWrite;
  }
  const all = written.join("");
  expect(all).toContain("MATCH (c:Claim");
  expect(all).not.toContain("nobody should find");
});
