/**
 * Read-argument shapes. Zod is the source; the TypeScript type is `z.infer`.
 */

import { z } from "zod";
import type { EventFilter } from "./events";
import { GATE_STATES, WORK_STATES } from "./report";

export type { EventFilter };

/**
 * Kept as `z.custom` so this file does not become the home of `EventFilter` —
 * the log already names that type, and moving it here would cycle events through report.
 */
export const eventFilter = z.custom<EventFilter>();

export const gateListQuery = z.object({
  state: z.enum(GATE_STATES).optional(),
});
export type GateListQuery = z.infer<typeof gateListQuery>;

export const workListQuery = z.object({
  state: z.enum(WORK_STATES).optional(),
});
export type WorkListQuery = z.infer<typeof workListQuery>;
