/**
 * The groups a verb is presented in, and their order.
 *
 * Both surfaces show a researcher a list — `labkit --help` and MCP's
 * `tools/list` — and 43 entries in one flat run is a list nobody reads. The
 * groups say what someone is *doing* when they reach for a verb, which is the
 * only thing a reader has to go on before they know the vocabulary.
 *
 * **One list, imported by both.** The CLI's help order and the MCP tool order
 * agreeing by hand is one fact in two places, which is the defect this
 * repository has found more often than any other. The names live here so the
 * two orders cannot drift; `src/domain` because `src/cli` and `src/mcp` may
 * both import it and may not import each other.
 *
 * Order matters: the array's order is the order a reader meets the groups in.
 * `WHAT_STANDS` first because it answers the question the record exists for;
 * `BEFORE_ANYTHING` first among the writes because `register_session` gates
 * every one of the others, and it sat 22nd of 43 until 2026-09-03.
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
 *
 * Not every command is a research verb. `mcp` starts a server and `backup`
 * (#253) will dump the record — a person at a terminal wants both, and an
 * agent has no use for either, so they have no tool and no place in the two
 * arrays above. Grouping them says that in the help rather than leaving them
 * loose at the end of a list of verbs.
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
 *
 * A surface that shows reads and writes together renders in this order; one
 * that shows them apart uses the two arrays above.
 */
export const VERB_GROUPS = [...READ_GROUPS, ...WRITE_GROUPS, ...OPERATING_GROUPS] as const;
