/**
 * A recorded `promote` event still replays, into what `is <claim> confirmed`
 * writes.
 *
 * `promote` was retired by the `is` grammar, and retiring a *writer* does not
 * retire the events it already wrote: every snapshot in `~/labkit-snapshots/`
 * holds them, and replaying a record is how the Explorer reads one. A decoder
 * that went with the verb would stop the replay at the first such event —
 * `replayIntoScratch` refuses on `no decoder for operation "promote"` rather
 * than serving a partial trace, so the failure would be loud, and it would
 * still mean an old record could not be read.
 *
 * This asserts the forwarding directly, with a stub surface, because the
 * property is about which call the decoder makes and not about the graph it
 * would leave.
 */

import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectScratch } from "../src/db/connect";
import { resolveTenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { TenantGraph } from "../src/db/graph";
import {
  WriteSurface as Writes,
  inMemoryEventLog,
  systemClock,
  type DomainEvent,
  type WriteSurface,
} from "../src/domain";
import { DECODERS, type DecodeContext } from "../fragments/decode";
import { fetchNodeProps, replayIntoScratch } from "../fragments/replay";

const home = mkdtempSync(join(tmpdir(), "labkit-retired-promote-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));

const attribution = {
  attribution_label: "test",
  attribution_id: "test",
  attribution_how: "claimed" as const,
  git_hash: "0".repeat(40),
};

test("a recorded promote event decodes into `is confirmed`, carrying its reason", async () => {
  const calls: Record<string, unknown>[] = [];
  const writes = {
    is: async (cmd: Record<string, unknown>) => {
      calls.push(cmd);
      return { decision: "DEC_1", events: [] };
    },
  } as unknown as WriteSurface;

  const event: DomainEvent = {
    seq: 7,
    at: "2026-08-28T09:00:00.000Z",
    attribution,
    operation: "promote",
    subject: "CLM_4",
    created: ["DEC_1"],
    edges: [{ from: "DEC_1", label: "PROMOTES", to: "CLM_4" }],
    detail: { proposition: "the speedup holds", from: "exploratory", to: "confirmatory" },
  };

  const ctx: DecodeContext = {
    writes,
    // `promote` never put its reason in the event; it lives on the Decision it
    // minted, which is why the decoder reads a node property here.
    nodeProp: (handle, key) =>
      handle === "DEC_1" && key === "reason" ? "re-timed on a quiet machine" : undefined,
    claimFor: () => undefined,
    consumesOf: async () => [],
  };

  await DECODERS.promote(ctx, event);

  expect(calls[0]).toEqual({
    claim: "CLM_4",
    state: "confirmed",
    because: "re-timed on a quiet machine",
  });
});

/**
 * The decoder alone is not enough, and this is the test that says so.
 *
 * `replayIntoScratch` compares the replayed event's `operation` against the
 * recorded one, so a retired verb forwarding to its replacement reads as a
 * divergence and the whole replay refuses — while the decoder test above goes
 * on passing, because forwarding is exactly what it asserts. Found by running
 * the live record, not by the suite.
 */
test("a history containing a retired promote replays end to end, not just decodes", async () => {
  const dir = mkdtempSync(join(home, "run-"));
  const connection = await connectScratch(dir);
  try {
    const ctx = await resolveTenantContext(connection.db, connection.tx, "labkit");
    await scopeToTenant(connection.db, ctx);
    const graph = new TenantGraph(ctx, connection.db, connection.tx);
    const events = inMemoryEventLog();
    const w = new Writes(graph, { clock: systemClock, events });

    const { question } = await w.pose("does the speedup hold");
    const { enquiry } = await w.pursue({ question, approach: "time it" });
    const { observations } = await w.recordObservations({
      enquiry,
      name: "timings",
      finding: "twelve runs",
    });
    const { analysis } = await w.recordAnalysis({
      enquiry,
      method: "paired timing",
      from: [observations],
    });
    const { claims } = await w.conclude({
      analysis,
      proposition: "the speedup holds",
      finding: "1.4x",
    });
    await w.is({
      claim: claims[0]!.claim,
      state: "confirmed",
      because: "re-timed on a quiet machine",
    });

    // The history as a pre-retirement record holds it: the same act, under the
    // name the verb had when it wrote.
    const history = [...(await events.all())]
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      .map((e) => (e.operation === "is" ? { ...e, operation: "promote" } : e));

    const nodeProps = await fetchNodeProps(graph, history);
    const result = await replayIntoScratch(history, nodeProps);

    expect(result.refusedAt).toBeUndefined();
  } finally {
    await connection.close();
  }
}, 30000);
