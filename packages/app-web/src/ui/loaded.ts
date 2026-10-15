import { useEffect, useState } from "react";
import { messageOf } from "../message-of";

/** Something a component asked for: still on its way, failed and why, or what arrived. */
export type Loaded<T> =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "loaded"; readonly value: T };

/**
 * What `load` resolves to, asked for again each time `key` changes. A superseded or unmounted load
 * is aborted through its signal, and its result is ignored. While `enabled` is false nothing is
 * asked for and the last state stays. `deferred` starts each load a tick late: React's development
 * mode runs an effect, its cleanup and the effect again, so a deferred load is cancelled before it
 * starts, and one agent connection opens rather than two racing for one event stream.
 */
export function useLoaded<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
  { enabled = true, deferred = false }: { enabled?: boolean; deferred?: boolean } = {},
): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ kind: "loading" });
  // `key` names what `load` asks for. `load` is a new function on every render, so it is not a
  // dependency: the load would start again on every render.
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoaded({ kind: "loading" });
    const start = () => {
      load(controller.signal).then(
        (value) => {
          if (!controller.signal.aborted) setLoaded({ kind: "loaded", value });
        },
        (err: unknown) => {
          if (!controller.signal.aborted) setLoaded({ kind: "failed", message: messageOf(err) });
        },
      );
    };
    if (!deferred) {
      start();
      return () => controller.abort();
    }
    const timer = setTimeout(start, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, enabled, deferred]);
  return loaded;
}
