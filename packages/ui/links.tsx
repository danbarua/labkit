import { createContext, useContext } from "react";

/**
 * Where this page can fetch a link the agent sent, such as `blob://<sha256>.png`, or `undefined`
 * when it cannot. The host decides: the agent's links name things in its own terms, and only the
 * host knows the route that serves them to a browser.
 */
export type ResolveLink = (uri: string) => string | undefined;

export const LinksContext = createContext<ResolveLink | undefined>(undefined);

/** Only a page address over HTTP(S) is fetched or opened; anything else stays text. */
function fetchable(address: string): string | undefined {
  try {
    const url = new URL(address, globalThis.location?.href ?? "http://localhost/");
    return url.protocol === "http:" || url.protocol === "https:" ? address : undefined;
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
  return resolved === undefined ? undefined : fetchable(resolved);
}
