/**
 * `DECODERS` reconstructs a write verb's call from a recorded event — this
 * tests the reconstruction itself, in isolation, with a stub `DecodeContext`
 * and no live graph. `fragments/replay.ts`'s own tests cover the pipeline
 * this feeds; what a pipeline test cannot show is a divergence invisible to
 * `operation`/`created`/`edges`, which is exactly what a wrong property read
 * produces.
 */

import { expect, test } from "bun:test";
import type { DomainEvent, WriteSurface } from "../src/domain";
import { DECODERS, type DecodeContext } from "../fragments/decode";

const attribution = {
  attribution_label: "test",
  attribution_id: "test",
  attribution_how: "claimed" as const,
  git_hash: "0".repeat(40),
};

test("conclude decodes standing from wasPromoted, not the live record's mutated Claim.kind", async () => {
  // Claim.kind is mutated in place by `promote` (fragments/decode.ts's
  // header) -- so reading it from the live record gives whatever it is
  // *now*, not what it was when this conclusion was drawn. A claim promoted
  // afterward reads back "confirmatory" here even though it was concluded
  // exploratory, which is exactly the case this test builds.
  const calls: Record<string, unknown>[] = [];
  const writes = {
    conclude: async (cmd: Record<string, unknown>) => {
      calls.push(cmd);
      return { analysis: cmd.analysis as string, claims: [], events: [] };
    },
  } as unknown as WriteSurface;

  const event: DomainEvent = {
    seq: 1,
    at: "2026-08-28T09:00:00.000Z",
    attribution,
    operation: "conclude",
    subject: "COMP_1",
    created: ["EV_1", "CLM_1"],
    edges: [{ from: "EV_1", label: "SUPPORTS", to: "CLM_1" }],
    detail: { conclusions: [{ claim: "CLM_1", finding: "EV_1", proposition: "the finding" }] },
  };

  const ctx: DecodeContext = {
    writes,
    nodeProp: (handle, key) => {
      if (handle === "CLM_1" && key === "kind") return "confirmatory";
      if (handle === "EV_1" && key === "statement") return "the finding";
      return undefined;
    },
    claimFor: () => undefined,
    consumesOf: async () => [],
    wasPromoted: (claim) => claim === "CLM_1",
  };

  await DECODERS.conclude(ctx, event);

  expect(calls[0]?.standing).toBe("exploratory");
});

test("conclude trusts the live record's kind when the claim was never promoted", async () => {
  const calls: Record<string, unknown>[] = [];
  const writes = {
    conclude: async (cmd: Record<string, unknown>) => {
      calls.push(cmd);
      return { analysis: cmd.analysis as string, claims: [], events: [] };
    },
  } as unknown as WriteSurface;

  const event: DomainEvent = {
    seq: 1,
    at: "2026-08-28T09:00:00.000Z",
    attribution,
    operation: "conclude",
    subject: "COMP_1",
    created: ["EV_1", "CLM_1"],
    edges: [{ from: "EV_1", label: "SUPPORTS", to: "CLM_1" }],
    detail: { conclusions: [{ claim: "CLM_1", finding: "EV_1", proposition: "the finding" }] },
  };

  const ctx: DecodeContext = {
    writes,
    nodeProp: (handle, key) => {
      if (handle === "CLM_1" && key === "kind") return "exploratory";
      if (handle === "EV_1" && key === "statement") return "the finding";
      return undefined;
    },
    claimFor: () => undefined,
    consumesOf: async () => [],
    wasPromoted: () => false,
  };

  await DECODERS.conclude(ctx, event);

  expect(calls[0]?.standing).toBe("exploratory");
});
