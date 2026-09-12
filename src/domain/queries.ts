/**
 * Read-argument shapes. Zod is the source; the TypeScript type is `z.infer`.
 */

import { z } from "zod";
import { GATE_STATES, WORK_STATES } from "./report";

/**
 * What a caller wants out of the event stream.
 */
export const eventFilter = z.object({
  /** Strictly after this `seq`. */
  since: z.number().optional(),
  /** One agent's acts, by `attribution_id`. */
  by: z.string().optional(),
  operation: z.string().optional(),
  /** Acts about, or minting, this handle. */
  touching: z.string().optional(),
  /**
   * `true` for acts that say what they were read off, `false` for the rest.
   * Absent is everything.
   */
  reconstructed: z.boolean().optional(),
  limit: z.number().optional(),
});
export type EventFilter = z.infer<typeof eventFilter>;

export const gateListQuery = z.object({
  state: z.enum(GATE_STATES).optional(),
});
export type GateListQuery = z.infer<typeof gateListQuery>;

export const workListQuery = z.object({
  state: z.enum(WORK_STATES).optional(),
});
export type WorkListQuery = z.infer<typeof workListQuery>;
