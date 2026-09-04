/**
 * A decoder reissues the command the event recorded, verbatim — this tests
 * that in isolation, with a stub surface and no live graph.
 *
 * **What this file used to test is gone with the machinery it tested.** Each
 * decoder rebuilt its command from `detail`, the act's edges and the live
 * record's node properties, and the two tests here covered the sharpest thing
 * that reconstruction got wrong: `Claim.kind` is mutated in place by `is`, so
 * reading it back from the record replayed an exploratory conclusion as
 * confirmatory from birth — a divergence `replay.ts`'s own check could not
 * see, because it compares changes and not properties. There is nothing left
 * to read back, so there is nothing left to read back wrongly.
 */

import { expect, test } from "bun:test";
import type { DomainEvent, WriteSurface } from "../src/domain";
import { DECODERS } from "../fragments/decode";

const attribution = {
  attribution_label: "test",
  attribution_id: "test",
  attribution_how: "claimed" as const,
  git_hash: "0".repeat(40),
};

const anEvent = (operation: string, subject: string, command: object): DomainEvent =>
  ({
    seq: 1,
    at: "2026-08-28T09:00:00.000Z",
    attribution,
    operation,
    subject,
    command,
    changes: [],
  }) as DomainEvent;

test("a decoder passes the recorded command through untouched", async () => {
  const calls: unknown[] = [];
  const writes = {
    conclude: async (cmd: unknown) => {
      calls.push(cmd);
      return { analysis: "COMP_1", claims: [], events: [] };
    },
  } as unknown as WriteSurface;

  // Standing included: `is` mutates `Claim.kind` in place, so a decoder that
  // read the claim back from the record would replay this conclusion as
  // confirmatory if it were promoted later. The command says what was asked
  // for at the time, and cannot say anything else.
  const command = {
    analysis: "COMP_1",
    proposition: "the finding",
    finding: "no delamination",
    bearing: "supports",
    standing: "exploratory",
  };
  await DECODERS.conclude({ writes }, anEvent("conclude", "COMP_1", command));

  expect(calls[0]).toEqual(command);
});

test("a retired verb replays as the verb that replaced it", async () => {
  const calls: unknown[] = [];
  const writes = {
    is: async (cmd: unknown) => {
      calls.push(cmd);
      return { decision: "DEC_1", events: [] };
    },
  } as unknown as WriteSurface;

  // `promote` wrote what `is <claim> confirmed` writes, so its command is
  // translated rather than passed through -- the one decoder that is not the
  // identity, and the reason `RetiredOperation` exists.
  await DECODERS.promote(
    { writes },
    anEvent("promote", "CLM_1", { claim: "CLM_1", because: "the check passed" }),
  );

  expect(calls[0]).toEqual({
    claim: "CLM_1",
    state: "confirmed",
    because: "the check passed",
  });
});
