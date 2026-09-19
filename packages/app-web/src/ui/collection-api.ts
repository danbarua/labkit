import { getJson } from "./graph-api";

export interface CollectionItem {
  href: string;
  data: { name: string; value: unknown }[];
  links: { rel: string; href: string; name?: string }[];
}

export interface Collection {
  href: string;
  links: { rel: string; href: string }[];
  items: CollectionItem[];
}

/** An item's data as a record, so a page can ask for `name` without scanning for it. */
export function dataOf(item: CollectionItem): Record<string, unknown> {
  return Object.fromEntries(item.data.map((d) => [d.name, d.value]));
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
  const body = await getJson<{ collection: Collection }>(`${path}${suffix}`, signal);
  return body.collection;
}
