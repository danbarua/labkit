/**
 * Playback: the acts recorded after the open resource, one at a time, in the order they were
 * recorded. From a research record, each step opens the act's subject. From the acts collection
 * or an act, the acts are the frames: each step opens the act, and the graph draws its subject.
 * A step waits for what it opened to arrive before the next one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { collectionOf, type HalDocument, hrefOf, keyOf, shortId } from "./hal";
import { requestPath, resourcePath, store } from "./hal-store";

/** How long each opened resource stays open before the next act's resource is opened. */
const STEP_MS = 1200;

export type Playback =
  | { state: "stopped"; note?: string }
  /** `act` is the name of the act whose resource is open, once there is one. */
  | { state: "playing"; act?: string };

/** A request that playback cannot do without failed, or what it needs is not there. */
class Stop extends Error {}

async function fetched(path: string, force = false): Promise<HalDocument> {
  store.load(path, force);
  const entry = await store.settled(path);
  if (entry.status === "failed") throw new Stop(`${path}: ${entry.error}`);
  if (entry.status === "loading") throw new Stop(`${path} is still loading`);
  return entry.doc;
}

/** The workspace's acts collection: the collection the workspace lists with type `Act`. */
async function actsOf(workspace: string): Promise<string> {
  const key = workspace.replace(/\/$/, "");
  const acts = collectionOf(key, await fetched(key)).items.find((i) => i.data.type === "Act");
  if (acts === undefined) throw new Stop(`${key} lists no acts collection.`);
  return acts.key;
}

/**
 * Where playback starts from `key`, and whether the acts are its frames:
 *
 * - the acts collection: before the first act, opening each act;
 * - an act: after it, opening each act;
 * - any other resource: after the first act whose events name it, opening each act's subject.
 */
async function startOf(key: string, acts: string): Promise<{ since: number; frames: boolean }> {
  if (key === acts) return { since: 0, frames: true };
  await fetched(resourcePath(key));
  const held = store.index().get(key);
  if (held?.type === "Act") return { since: Number(shortId(key)), frames: true };
  if (held?.eventsHref === undefined) throw new Stop(`No act records ${shortId(key)}.`);
  const events = (await fetched(requestPath(held.eventsHref)))._embedded?.events;
  const first = Array.isArray(events) ? (events[0] as { seq?: unknown } | undefined) : undefined;
  if (typeof first?.seq !== "number") throw new Stop(`No act records ${shortId(key)}.`);
  return { since: first.seq, frames: false };
}

/** Opens `key` and resolves once its response, and that of each of `alsoLoad`, has an answer. */
async function openAndWait(open: (key: string) => void, key: string, alsoLoad: string[]) {
  open(key);
  const paths = [key, ...alsoLoad].map(resourcePath);
  for (const path of paths) store.load(path);
  await Promise.all(paths.map((path) => store.settled(path)));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Plays from the open resource `path` in `workspace`, opening each resource with `open`. Playback
 * stops at the last act, on Pause, when a request it needs fails, and when the reader opens
 * anything other than what it opened.
 */
export function usePlayback(
  path: string,
  workspace: string | undefined,
  open: (key: string) => void,
) {
  const [playback, setPlayback] = useState<Playback>({ state: "stopped" });
  const run = useRef(0);
  const opened = useRef<string | undefined>(undefined);
  const openRef = useRef(open);
  openRef.current = open;
  const pathRef = useRef(path);
  pathRef.current = path;

  const pause = useCallback((note?: string) => {
    run.current++;
    setPlayback(note === undefined ? { state: "stopped" } : { state: "stopped", note });
  }, []);

  const play = async () => {
    if (workspace === undefined) return;
    const id = ++run.current;
    const live = () => run.current === id;
    const start = pathRef.current;
    opened.current = start;
    setPlayback({ state: "playing" });
    try {
      const acts = await actsOf(workspace);
      const { since, frames } = await startOf(start, acts);
      let page = `${acts}?limit=1&since=${since}`;
      for (;;) {
        // Acts are only ever added, so a page that was empty before may not be now.
        const doc = await fetched(page, true);
        if (!live()) return;
        const [act] = Object.values(doc._embedded ?? {}).flat() as HalDocument[];
        if (act === undefined) return pause("No later act.");
        const self = hrefOf(act, "self");
        const subject = hrefOf(act, "subject");
        const key = frames ? self : subject;
        if (key === undefined)
          console.warn("trace console: an act names no subject; playback skips it", { act: self });
        else {
          setPlayback({ state: "playing", act: String(act.name ?? act.id) });
          opened.current = keyOf(key);
          // A resource that fails to load shows its error, and playback goes on to the next act.
          const subjectToo = frames && subject !== undefined ? [keyOf(subject)] : [];
          await openAndWait(openRef.current, keyOf(key), subjectToo);
          if (!live()) return;
          await sleep(STEP_MS);
          if (!live()) return;
        }
        const next = hrefOf(doc, "since");
        if (next === undefined) return pause("The acts page names no page after it.");
        page = requestPath(next);
      }
    } catch (err) {
      if (!live()) return;
      const reason = err instanceof Error ? err.message : String(err);
      if (err instanceof Stop)
        console.warn("trace console: playback stopped", { from: start, reason });
      else console.error("trace console: playback failed", { from: start, err });
      pause(reason);
    }
  };

  // Opening anything other than what playback opened is the reader taking over.
  useEffect(() => {
    if (playback.state === "playing" && path !== opened.current) pause();
  }, [path, playback.state, pause]);
  useEffect(() => () => void run.current++, []);

  return { playback, play: () => void play(), pause: () => pause() };
}
