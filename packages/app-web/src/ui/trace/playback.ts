/**
 * Playback: the acts recorded after the open resource, one at a time, in the order they were
 * recorded. Each step opens the act's subject, which adds it to the graph, and waits for it to
 * arrive before the next step.
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
 * The act position playback starts after, from `key`: an act's own position, or the position of
 * the first act whose events name `key`.
 */
async function startOf(key: string): Promise<number> {
  await fetched(resourcePath(key));
  const held = store.index().get(key);
  if (held?.type === "Act") return Number(shortId(key));
  if (held?.eventsHref === undefined) throw new Stop(`No act records ${shortId(key)}.`);
  const events = (await fetched(requestPath(held.eventsHref)))._embedded?.events;
  const first = Array.isArray(events) ? (events[0] as { seq?: unknown } | undefined) : undefined;
  if (typeof first?.seq !== "number") throw new Stop(`No act records ${shortId(key)}.`);
  return first.seq;
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
      let page = `${await actsOf(workspace)}?limit=1&since=${await startOf(start)}`;
      for (;;) {
        // Acts are only ever added, so a page that was empty before may not be now.
        const doc = await fetched(page, true);
        if (!live()) return;
        const [act] = Object.values(doc._embedded ?? {}).flat() as HalDocument[];
        if (act === undefined) return pause("No later act.");
        const subject = hrefOf(act, "subject");
        if (subject === undefined)
          console.warn("trace console: an act names no subject; playback skips it", {
            act: hrefOf(act, "self"),
          });
        else {
          const key = keyOf(subject);
          setPlayback({ state: "playing", act: String(act.name ?? act.id) });
          opened.current = key;
          openRef.current(key);
          // A resource that fails to load shows its error, and playback goes on to the next act.
          store.load(resourcePath(key));
          await store.settled(resourcePath(key));
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
