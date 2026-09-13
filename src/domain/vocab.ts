/**
 * Closed vocabularies both reads and writes name. A leaf: nothing here imports
 * events, commands, or reports, so query schemas can use the arrays without a cycle.
 */

export const GATE_STATES = [
  "never-evaluated",
  "incomplete",
  "blocked",
  "satisfied",
  "sidestepped",
  "retired",
] as const;

export const WORK_STATES = ["planned", "waiting", "blocked", "carried-out", "abandoned"] as const;
