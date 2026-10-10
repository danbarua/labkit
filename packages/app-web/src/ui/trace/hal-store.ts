/**
 * The HAL documents the Trace Console has fetched, kept as they arrived, by request path. What the
 * page draws is computed from them: nothing here merges one response into another.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { type HalDocument, type HeldIndex, indexOf, keyOf } from "./hal";

export type Entry =
  | { status: "loading" }
  | { status: "ready"; doc: HalDocument }
  | { status: "failed"; error: string };

const ACCEPT = "application/hal+json, application/json";

/** An API address as the path and query the page requests, so it goes to the page's own origin. */
export function requestPath(href: string): string {
  const url = new URL(href, "http://labkit.invalid");
  return url.pathname + url.search;
}

/**
 * GETs `path` as HAL. A response that is not HAL is an error, since what the page does with a
 * document is decided by the document, never by the shape of its address.
 */
async function request(path: string): Promise<HalDocument> {
  const resp = await fetch(path, { headers: { Accept: ACCEPT } });
  if (!resp.ok) {
    const problem = (await resp.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(`HTTP ${resp.status} ${problem?.detail ?? resp.statusText}`);
  }
  const type = resp.headers.get("content-type") ?? "";
  if (!/hal\+json/.test(type)) throw new Error(`Unhandled content-type: ${type}`);
  return (await resp.json()) as HalDocument;
}

export class HalStore {
  private readonly entries = new Map<string, Entry>();
  /** The request each path's entry belongs to: a response to an older request is dropped. */
  private readonly requests = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private requested = 0;
  private held: { version: number; index: HeldIndex } | undefined;

  constructor(private readonly fetchDoc: (path: string) => Promise<HalDocument> = request) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  entry(path: string): Entry | undefined {
    return this.entries.get(path);
  }

  /** Fetches `path` unless it is held or on its way. `force` fetches it again. */
  load(path: string, force = false): void {
    if (!force && this.entries.has(path)) return;
    const id = ++this.requested;
    this.requests.set(path, id);
    this.set(path, { status: "loading" });
    this.fetchDoc(path).then(
      (doc) => {
        if (this.requests.get(path) === id) this.set(path, { status: "ready", doc });
      },
      (err: unknown) => {
        if (this.requests.get(path) !== id) return;
        const error = err instanceof Error ? err.message : String(err);
        console.warn("trace console: a request failed", { path, error });
        this.set(path, { status: "failed", error });
      },
    );
  }

  /** Drops every held document whose path `match` accepts, so the next `load` fetches it. */
  forget(match: (path: string) => boolean): void {
    for (const path of [...this.entries.keys()]) {
      if (!match(path)) continue;
      this.entries.delete(path);
      this.requests.delete(path);
    }
    this.changed();
  }

  /** Every resource the held documents name, in the order the documents arrived. */
  index(): HeldIndex {
    if (this.held?.version !== this.version) {
      const documents: { key: string; doc: HalDocument }[] = [];
      for (const [path, entry] of this.entries) {
        if (entry.status === "ready") documents.push({ key: keyOf(path), doc: entry.doc });
      }
      this.held = { version: this.version, index: indexOf(documents) };
    }
    return this.held.index;
  }

  private set(path: string, entry: Entry): void {
    // Re-inserted, so the map's order is the order the documents arrived in.
    this.entries.delete(path);
    this.entries.set(path, entry);
    this.changed();
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

/** The page's documents, for as long as the page is open. */
export const store = new HalStore();

/** Re-renders the caller whenever a document arrives, fails or is dropped. */
export function useStoreVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}

/** The document at `path`, fetched when first asked for. Undefined until the fetch has begun. */
export function useDocument(path: string | undefined): Entry | undefined {
  useStoreVersion();
  useEffect(() => {
    if (path !== undefined) store.load(path);
  }, [path]);
  return path === undefined ? undefined : (store.entry(path) ?? { status: "loading" });
}

export interface Pages<T> {
  items: T[];
  /** Set when the last page fetched names a next one. */
  next: string | undefined;
  loading: boolean;
  error: string | undefined;
  more: () => void;
}

/**
 * The pages of a paged document from `first` on: the first page, then each next page asked for
 * with `more`. Asking for another `first` starts over.
 */
export function usePages<T>(
  first: string | undefined,
  read: (doc: HalDocument) => { items: T[]; next: string | undefined },
): Pages<T> {
  const [asked, setAsked] = useState<{ first: string | undefined; after: string[] }>({
    first,
    after: [],
  });
  const after = asked.first === first ? asked.after : [];
  const paths = first === undefined ? [] : [first, ...after];
  useStoreVersion();
  const joined = paths.join("\n");
  useEffect(() => {
    for (const path of joined.split("\n")) if (path) store.load(path);
  }, [joined]);

  const items: T[] = [];
  let next: string | undefined;
  let loading = false;
  let error: string | undefined;
  for (const path of paths) {
    const entry = store.entry(path) ?? { status: "loading" };
    if (entry.status === "loading") {
      loading = true;
      next = undefined;
      break;
    }
    if (entry.status === "failed") {
      error = entry.error;
      next = undefined;
      break;
    }
    const page = read(entry.doc);
    items.push(...page.items);
    next = page.next;
  }
  const more = () => {
    if (next !== undefined) setAsked({ first, after: [...after, requestPath(next)] });
  };
  return { items, next, loading, error, more };
}
