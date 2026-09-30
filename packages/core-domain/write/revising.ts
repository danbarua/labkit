/** Same thing, understood differently now. */

import type { TenantGraph } from "@labkit/core-db/graph";
import type { Restated } from "../report";
import { stagedRef } from "../report";
import type { ClaimIsConfirmedCommand } from "../commands";
import type { ResearchSessionOptions } from "../core";
import type { Handle } from "./index";
import { Shared } from "./shared";

export class Revising extends Shared {
  constructor(
    graph: TenantGraph,
    options: ResearchSessionOptions,
    private readonly handle: Handle,
  ) {
    super(graph, options);
  }

  /**
   * Records that a finding is something others may build on.
   */
  async isConfirmed(input: ClaimIsConfirmedCommand): Promise<Restated> {
    return this.handle("isConfirmed", input, async (unitOfWork) => {
      const decision = stagedRef(
        "decision",
        unitOfWork.node("Decision", {
          decided_at: this.clock.now(),
          reason: input.because,
          invalidation_check: "evidence that the promoted result does not replicate",
        }),
      );
      unitOfWork.edge(decision, "CONFIRMED", input.claim);

      return {
        subject: input.claim,
        result: { decision },
      };
    });
  }
}
