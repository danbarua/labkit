/**
 * Turns the VS Code extension's two output logs into one transcript per session: the view events a
 * client folded while the session ran, built as `@labkit/acp-client` builds them, each with the
 * time it arrived. `workspace-path` becomes `/workspace`; any other home-directory path fails it.
 *
 *   bun packages/acp-transcripts/capture/vscode-logs.ts <traffic.log> <client.log> <out-dir> \
 *     <workspace-path> <sessionId>=<id>:<title>:<description> ...
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ViewEvent } from "@labkit/view-model";

type Rpc = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown> & { sessionId?: string };
  result?: Record<string, unknown>;
  error?: { message?: string };
};
type Wire = { direction: "send" | "recv"; body: Rpc };

const [trafficPath, clientPath, outDir, workspace, ...specs] = process.argv.slice(2);
if (!trafficPath || !clientPath || !outDir || !workspace || specs.length === 0)
  throw new Error(
    "usage: vscode-logs.ts <traffic.log> <client.log> <out-dir> <workspace-path> <sessionId>=<id>:<title>:<description> ...",
  );

function wireMessages(text: string): Wire[] {
  const out: Wire[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) out.push(JSON.parse(text.slice(start, i + 1)) as Wire);
    }
  }
  return out;
}

type Line = { timestamp: string; event?: string; message?: string };
// The traffic log holds every JSON-RPC message in wire order, without times. The client log holds
// one timestamped line per update, prompt sent, prompt answered, permission asked and permission
// answered, in the same order, so the nth of each kind in one is the nth in the other. A message
// with no line of its own (a settings response) takes the time of the event before it.
const clientLines = readFileSync(clientPath, "utf8")
  .split("\n")
  .filter((line) => line.startsWith("{"))
  .map((line) => JSON.parse(line) as Line);
const timesOf = (match: (line: Line) => boolean) =>
  clientLines.filter(match).map((line) => Date.parse(line.timestamp));
const clock = {
  update: timesOf((l) => (l.message ?? "").startsWith("sessionUpdate: type=")),
  prompt: timesOf((l) => l.event === "vscode.prompt.started"),
  answered: timesOf((l) => (l.message ?? "").startsWith("Prompt response: ")),
  asked: timesOf((l) => l.event === "vscode.permission.waiting"),
  decided: timesOf((l) => l.event === "vscode.permission.selected"),
};
const next = { update: 0, prompt: 0, answered: 0, asked: 0, decided: 0 };
const take = (kind: keyof typeof clock): number => {
  const time = clock[kind][next[kind]++];
  if (time === undefined)
    throw new Error(`the client log has fewer ${kind} lines than the traffic`);
  return time;
};

const wire = wireMessages(readFileSync(trafficPath, "utf8"));
const bySession = new Map<string, { event: ViewEvent; at: number }[]>();
const pending = new Map<
  string | number,
  { kind: "prompt" | "config" | "load"; sessionId: string }
>();
const permissions = new Map<string | number, { requestId: string; sessionId: string }>();
let permissionCount = 0;
let last = 0;

const emit = (sessionId: string, event: ViewEvent, at = last) => {
  last = at;
  const list = bySession.get(sessionId) ?? [];
  list.push({ event, at });
  bySession.set(sessionId, list);
};
const configUpdate = (configOptions: unknown): ViewEvent =>
  ({
    type: "update",
    update: { sessionUpdate: "config_option_update", configOptions },
  }) as ViewEvent;

for (const { direction, body } of wire) {
  const sessionId = body.params?.sessionId;
  if (direction === "recv" && body.method === "session/update" && sessionId) {
    emit(sessionId, { type: "update", update: body.params?.update } as ViewEvent, take("update"));
  } else if (direction === "send" && body.method === "session/prompt" && sessionId) {
    pending.set(body.id!, { kind: "prompt", sessionId });
    emit(
      sessionId,
      { type: "prompt_started", content: body.params?.prompt } as ViewEvent,
      take("prompt"),
    );
  } else if (direction === "send" && body.method === "session/set_config_option" && sessionId) {
    pending.set(body.id!, { kind: "config", sessionId });
  } else if (direction === "send" && body.method === "session/load" && sessionId) {
    pending.set(body.id!, { kind: "load", sessionId });
  } else if (direction === "recv" && body.method === "session/request_permission" && sessionId) {
    const requestId = `permission-${++permissionCount}`;
    permissions.set(body.id!, { requestId, sessionId });
    const { sessionId: _session, ...request } = body.params!;
    emit(
      sessionId,
      { type: "permission_requested", requestId, request } as ViewEvent,
      take("asked"),
    );
  } else if (direction === "send" && body.method === undefined && permissions.has(body.id!)) {
    const { requestId, sessionId: owner } = permissions.get(body.id!)!;
    emit(
      owner,
      { type: "permission_answered", requestId, outcome: body.result?.outcome } as ViewEvent,
      take("decided"),
    );
  } else if (direction === "recv" && body.method === undefined && pending.has(body.id!)) {
    const { kind, sessionId: owner } = pending.get(body.id!)!;
    pending.delete(body.id!);
    if (body.error) {
      const at = kind === "prompt" ? take("answered") : last;
      emit(owner, { type: "failed", message: body.error.message ?? "request failed" }, at);
    } else if (kind === "prompt") {
      emit(
        owner,
        { type: "prompt_ended", stopReason: body.result?.stopReason } as ViewEvent,
        take("answered"),
      );
    } else if (body.result?.configOptions) {
      emit(owner, configUpdate(body.result.configOptions));
    }
  }
}

for (const kind of Object.keys(clock) as (keyof typeof clock)[])
  if (next[kind] !== clock[kind].length)
    throw new Error(`${kind}: used ${next[kind]} of ${clock[kind].length} client log lines`);

const scrub = (value: unknown): unknown =>
  typeof value === "string"
    ? value.split(workspace).join("/workspace")
    : Array.isArray(value)
      ? value.map(scrub)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]))
        : value;

mkdirSync(outDir, { recursive: true });
for (const spec of specs) {
  const [sessionId, rest] = spec.split("=") as [string, string];
  const [id, title, description] = rest.split(":") as [string, string, string];
  const timed = bySession.get(sessionId);
  if (!timed) throw new Error(`no traffic for session ${sessionId}`);
  const start = timed[0]!.at;
  const transcript = {
    id,
    title,
    description,
    events: timed.map(({ event }) => scrub(event)),
    at: timed.map(({ at }) => at - start),
  };
  const text = JSON.stringify(transcript, null, 2);
  const leak = /\/Users\/[^"\s]*/.exec(text);
  if (leak) throw new Error(`${id}: a home-directory path remains: ${leak[0]}`);
  writeFileSync(join(outDir, `${id}.json`), `${text}\n`);
  console.log(`${id}: ${timed.length} events over ${Math.round(transcript.at.at(-1)! / 1000)}s`);
}
