/**
 * Captures a scenario's acts so `bun run docs:scenarios` can render the conversation.
 *
 * Silent unless `LABKIT_SCENARIO_DOCS` names a directory, so an ordinary test run writes
 * nothing. One scenario file captures one test — whichever the file treats as the whole
 * conversation rather than a single question about it.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AttributionContext, EventSink } from "@labkit/core-domain";

/** Who is speaking. LabKit's own attribution, so the acts carry it too. */
export function as(label: string): AttributionContext {
  return {
    attribution_label: label,
    attribution_id: label.toLowerCase().replace(/\W+/g, "-"),
    // A scenario states who is speaking, which is the grade `claimed` describes. Nothing
    // observed these people.
    attribution_how: "claimed",
    git_hash: null,
  };
}

export interface ConversationMeta {
  /** "S-11". Orders the index and names the file. */
  id: string;
  /** The scenario's own title, as its describe() says it. */
  title: string;
  /** One line on what the conversation is about. */
  about: string;
}

interface Turn {
  seq: number;
  who: string;
  operation: string;
  subject: string;
  said: string | null;
}

/**
 * Writes the acts `events` recorded, in order, as one scenario's turns.
 *
 * `outcome` is what `why` answered about the subject the scenario is about — the read
 * surface's own words, so the page shows what a researcher would be told rather than a
 * second description of it. A page whose outcome reads wrongly is a defect in `why`.
 */
export async function captureConversation(
  meta: ConversationMeta,
  events: EventSink,
  outcome?: unknown,
): Promise<void> {
  const dir = process.env.LABKIT_SCENARIO_DOCS;
  if (!dir) return;
  const recorded = await events.select({});
  const turns: Turn[] = recorded.map((e) => ({
    seq: e.seq,
    who: e.attribution.attribution_label,
    operation: e.operation,
    subject: e.subject,
    said: saidIn(e.command),
  }));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${meta.id}.json`),
    `${JSON.stringify({ ...meta, turns, outcome: outcome ?? null }, null, 2)}\n`,
  );
}

/** The researcher's own words in the command, when it carried any. */
function saidIn(command: unknown): string | null {
  if (typeof command !== "object" || command === null) return null;
  // In the order a reader wants: what was asked before how it was measured.
  const fields = [
    "question",
    "asks",
    "as",
    "verdict",
    "proposition",
    "finding",
    "objective",
    "method",
    "because",
  ];
  const input = (command as { input?: Record<string, unknown> }).input ?? command;
  for (const field of fields) {
    const value = (input as Record<string, unknown>)[field];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}
