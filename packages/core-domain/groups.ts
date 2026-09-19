/**
 * The groups a verb is presented in, and their order.
 */

/** The read groups, in the order a reader meets them. */
export const READ_GROUPS = [
  /** What is true now — the question the record exists to answer. */
  "What stands",
  /** Words in hand, handle wanted: the seam where wording becomes a record. */
  "Finding a handle",
  /** What is holding work up, and what that work was for. */
  "What is blocked",
  /** Following one record once it is in hand. */
  "One record's story",
  /** The acts themselves — the only read that is not about now. */
  "What was done",
] as const;

/** The write groups, in the order a reader meets them. */
export const WRITE_GROUPS = [
  /** The one call that must come first: every write below refuses without it. */
  "Before anything",
  /** Putting a question, and opening work against it. */
  "Asking",
  /** Measuring, analysing, concluding, reviewing. */
  "Doing the work",
  /** The conditions a result will be held to, agreed before it exists. */
  "Saying in advance what counts",
  /** Same thing, understood differently now. */
  "Revising",
  /** Closing a question, or deliberately leaving it open. */
  "Stopping",
] as const;

/**
 * Groups the CLI has and MCP does not.
 */
export const OPERATING_GROUPS = [
  /** Running and looking after the record itself, rather than doing research in it. */
  "Operating LabKit",
] as const;

export type ReadGroup = (typeof READ_GROUPS)[number];
export type WriteGroup = (typeof WRITE_GROUPS)[number];
export type OperatingGroup = (typeof OPERATING_GROUPS)[number];
export type VerbGroup = ReadGroup | WriteGroup | OperatingGroup;

/**
 * Every group, reads before writes.
 */
export const VERB_GROUPS = [...READ_GROUPS, ...WRITE_GROUPS, ...OPERATING_GROUPS] as const;
