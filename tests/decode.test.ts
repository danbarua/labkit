/**
 * `DECODERS` reconstructs a write verb's call from a recorded event — this
 * tests the reconstruction itself, in isolation, with a stub `DecodeContext`
 * and no live graph. `fragments/replay.ts`'s own tests cover the pipeline
 * this feeds; what a pipeline test cannot show is a divergence invisible to
 * `operation`/`created`/`edges`, which is exactly what a wrong property read
 * produces.
 *
 * `conclude` and `reverify` decode `standing` two different ways because
 * they emit differently — see `decode.ts`'s header on `Claim.kind` and #211.
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

function stubContext(
  overrides: Partial<DecodeContext> & { writes: DecodeContext["writes"] },
): DecodeContext {
  return {
    nodeProp: () => undefined,
    claimFor: () => undefined,
    consumesOf: async () => [],
    wasPromoted: () => false,
    ...overrides,
  };
}

test("conclude reads standing off its own event, not the live record's mutated Claim.kind", async () => {
  // #211: conclude's own emit now carries the standing it recorded, so its
  // decoder no longer needs to infer anything about a later promotion.
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
    detail: {
      conclusions: [{ claim: "CLM_1", finding: "EV_1", proposition: "the finding" }],
      standing: "exploratory",
    },
  };

  const ctx = stubContext({
    writes,
    // Answering "confirmatory" here is the trap: a decoder that still read
    // Claim.kind from the live record would report this claim confirmatory
    // from birth, because CLM_1 was promoted after this conclusion.
    nodeProp: (handle, key) =>
      handle === "CLM_1" && key === "kind"
        ? "confirmatory"
        : handle === "EV_1" && key === "statement"
          ? "the finding"
          : undefined,
    wasPromoted: (claim) => claim === "CLM_1",
  });

  await DECODERS.conclude(ctx, event);

  expect(calls[0]?.standing).toBe("exploratory");
});

test("reverify falls back to wasPromoted, since its own event carries no standing", async () => {
  // #211 gave conclude's emit a standing field and left reverify's alone --
  // it composes the same private write-side helper but emits its own event.
  const calls: Record<string, unknown>[] = [];
  const writes = {
    reverify: async (cmd: Record<string, unknown>) => {
      calls.push(cmd);
      return {
        at: "",
        verification: "COMP_9",
        of: cmd.historical as string,
        claims: [],
        events: [],
      };
    },
  } as unknown as WriteSurface;

  const event: DomainEvent = {
    seq: 1,
    at: "2026-08-28T09:00:00.000Z",
    attribution,
    operation: "reverify",
    subject: "COMP_9",
    created: ["EV_23", "CLM_16"],
    edges: [
      { from: "EU_16", label: "ADDRESSES", to: "LOE_5" },
      { from: "EV_23", label: "CHALLENGES", to: "CLM_16" },
    ],
    detail: {
      of: "COMP_8",
      proposition: "the finding",
      conclusions: [{ claim: "CLM_16", finding: "EV_23", proposition: "the finding" }],
    },
  };

  const ctx = stubContext({
    writes,
    nodeProp: (handle, key) =>
      handle === "COMP_9" && key === "kind"
        ? "some-method"
        : handle === "CLM_16" && key === "kind"
          ? "confirmatory"
          : handle === "EV_23" && key === "statement"
            ? "the finding"
            : undefined,
    wasPromoted: (claim) => claim === "CLM_16",
  });

  await DECODERS.reverify(ctx, event);

  expect(calls[0]?.concludes).toMatchObject({ standing: "exploratory" });
});
