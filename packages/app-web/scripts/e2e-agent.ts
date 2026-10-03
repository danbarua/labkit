/**
 * A session with the dev agent end to end over HTTP: start one, send a prompt and see the turn end,
 * reopen it and see what the live session showed, and find it in the agent's list. It uses the
 * real agent and model, so it is not in `bun run check`. `bun run e2e:agent [--url <acp url>]`
 * (default :8850's `/acp`); exits 1 if a check fails, printing what it got.
 */

import path from "node:path";
import { connectSession, listSessions, sessionHistory } from "@labkit/acp-client";
import { replay, textOf, type TranscriptState, type ViewEvent } from "@labkit/view-model";

const urlFlag = process.argv.indexOf("--url");
const url = urlFlag === -1 ? "http://127.0.0.1:8850/acp" : process.argv[urlFlag + 1];
if (url === undefined) throw new Error("--url needs a value");
/** The directory the dev agent keeps its sessions for, as `dev-with-agent.ts` sets it. */
const cwd = path.resolve(import.meta.dirname, "../../../.labkit-dev/agent-workspace");
const PROMPT = "Reply with the single word: ready. Do not use any tools.";

const failures: string[] = [];
const check = (what: string, ok: boolean, got: unknown): void => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) {
    console.log("     got:", JSON.stringify(got, null, 2));
    failures.push(what);
  }
};

const since = (start: number): string => `${((Date.now() - start) / 1000).toFixed(1)} s`;

/** What a reader sees: each block's kind, and the text of the blocks that hold text. */
const seen = (state: TranscriptState) =>
  state.blocks.map((block) =>
    "content" in block
      ? { kind: block.kind, text: textOf(block.content).trim() }
      : { kind: block.kind },
  );

const live: ViewEvent[] = [];
let started = Date.now();
const client = await connectSession({ url, cwd, onEvent: (event) => live.push(event) });
console.log(`session ${client.sessionId} opened in ${since(started)}`);

started = Date.now();
await client.prompt(PROMPT);
console.log(`turn ended in ${since(started)}`);
const ended = live.find((event) => event.type === "prompt_ended");
check(
  "the turn ends with end_turn",
  ended?.type === "prompt_ended" && ended.stopReason === "end_turn",
  ended,
);
check(
  "nothing failed",
  !live.some((event) => event.type === "failed"),
  live.filter((event) => event.type === "failed"),
);
const shown = seen(replay(live));
check(
  "the agent answered with text",
  shown.some((block) => block.kind === "assistant" && "text" in block && block.text !== ""),
  shown,
);
await client.close();

started = Date.now();
const history = await sessionHistory({ url, cwd, sessionId: client.sessionId });
console.log(`reopened in ${since(started)}: ${history.length} events`);
const reopened = seen(replay(history));
// Thinking is shown live and is not kept by every agent, so the comparison is of what remains.
const withoutThoughts = (blocks: ReturnType<typeof seen>) =>
  blocks.filter((block) => block.kind !== "thought");
check(
  "reopening shows what the live session showed",
  JSON.stringify(withoutThoughts(reopened)) === JSON.stringify(withoutThoughts(shown)),
  { live: shown, reopened },
);

started = Date.now();
const sessions = await listSessions({ url, cwd });
console.log(`listed in ${since(started)}: ${sessions?.length ?? "not offered"}`);
check(
  "the agent lists the session",
  sessions?.some((session) => session.sessionId === client.sessionId) === true,
  sessions?.map((session) => session.sessionId),
);

if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("\nall checks passed");
