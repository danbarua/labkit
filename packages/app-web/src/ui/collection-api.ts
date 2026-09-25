import { getJson } from "./graph-api";

export interface HalLink {
  href: string;
  type?: string;
  dir?: string;
  props?: Record<string, unknown>;
}

/** One thing a collection lists: its own properties, and `_links` to what it relates to. */
export interface CollectionItem {
  id?: string;
  type?: string;
  name?: string;
  slug?: string;
  _links: Record<string, HalLink | HalLink[]>;
  [property: string]: unknown;
}

/** A HAL document whose `_embedded` groups hold the items, and whose `_links` say how to page. */
export interface Collection {
  _links: Record<string, HalLink | HalLink[]>;
  _embedded: Record<string, CollectionItem[]>;
}

/** Every item, whichever group it is embedded under. */
export function itemsOf(collection: Collection): CollectionItem[] {
  return Object.values(collection._embedded).flat();
}

/** The handle or slug a link's address ends in. */
export function lastSegment(link: HalLink): string {
  return link.href.split("?")[0]?.split("/").pop() ?? "";
}

export async function fetchCollection(
  path: string,
  page: { limit?: number | undefined; offset?: number | undefined } = {},
  signal?: AbortSignal,
): Promise<Collection> {
  const query = new URLSearchParams();
  if (page.limit !== undefined) query.set("limit", String(page.limit));
  if (page.offset !== undefined) query.set("offset", String(page.offset));
  const suffix = query.size > 0 ? `?${query}` : "";
  return getJson<Collection>(`${path}${suffix}`, signal);
}
