import { createContext, useContext } from "react";

/**
 * Where this page can fetch a link the agent sent, such as `blob://<sha256>.png`, or `undefined`
 * when it cannot. The host decides: the agent's links name things in its own terms, and only the
 * host knows the route that serves them to a browser.
 */
export type ResolveLink = (uri: string) => string | undefined;

export const LinksContext = createContext<ResolveLink | undefined>(undefined);

/**
 * `address` as a URL when it is an HTTP(S) address, read against `base` when it is relative, else
 * `undefined`. Only such an address is fetched or opened; anything else stays text.
 */
export function httpUrl(address: string, base?: string): URL | undefined {
  try {
    const url = new URL(address, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The address this page can fetch `uri` at: the host's answer when it has a resolver, else the
 * link itself when it is already an HTTP(S) address. `undefined` when neither.
 */
export function useLink(uri: string | null | undefined): string | undefined {
  const resolve = useContext(LinksContext);
  if (!uri) return undefined;
  const resolved = resolve?.(uri) ?? (/^https?:\/\//i.test(uri) ? uri : undefined);
  if (resolved === undefined) return undefined;
  return httpUrl(resolved, globalThis.location?.href ?? "http://localhost/") === undefined
    ? undefined
    : resolved;
}
