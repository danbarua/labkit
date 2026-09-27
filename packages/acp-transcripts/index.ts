import type { ViewEvent } from "@labkit/view-model";
import terms_of_reference from "./data/terms-of-reference.json";
import tool_permutations from "./data/tool-permutations.json";

/**
 * A real agent session, replayed through `session/load` against its saved journal and captured as
 * the `ViewEvent`s that produces -- not written by hand, and not a script's idea of what an agent
 * says. `events` folds through `@labkit/view-model`'s `reduce` exactly like a live session does.
 */
export interface Transcript {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly events: readonly ViewEvent[];
}

/**
 * Recorded sessions, kept as seeds for the harder things a transcript exercises that a hand-built
 * scenario in `@labkit/acp-scenarios` does not: real tool output at real size, a configuration
 * change mid-session, and the exact shape compaction, forking or a multi-agent handoff will need
 * to work against.
 */
export const TRANSCRIPTS: readonly Transcript[] = [
  terms_of_reference as Transcript,
  tool_permutations as Transcript,
];
