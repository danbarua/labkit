import type { ViewEvent } from "@labkit/view-model";
import terms_of_reference from "./data/terms-of-reference.json";
import terms_of_reference_live from "./data/terms-of-reference-live.json";
import tool_permutations from "./data/tool-permutations.json";
import tool_permutations_live from "./data/tool-permutations-live.json";

/**
 * A real agent session as the `ViewEvent`s a client folded, not written by hand. A `-live` one is
 * what the VS Code client received while the session ran (`capture/vscode-logs.ts`), with `at`:
 * when each event arrived, in ms from the first. The others are the same sessions reopened with
 * `session/load`: what reopening drew, not what was shown live.
 */
export interface Transcript {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly events: readonly ViewEvent[];
  readonly at?: readonly number[];
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
  terms_of_reference_live as Transcript,
  tool_permutations_live as Transcript,
];

// label-areas probe: reverted in the next commit.
