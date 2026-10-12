import type { PromptLink } from "@labkit/acp-client";
import type { PickItem } from "@labkit/ui";

/**
 * The `file:` URI of `path`, a file in `folder`, each segment escaped. This is an address for the
 * agent, which reads the file from its working folder; it is not an address of the API.
 */
export function fileUri(folder: string, path: string): string {
  const root = folder.replace(/\/+$/, "");
  const escaped = path.split("/").map(encodeURIComponent).join("/");
  return `file://${root.split("/").map(encodeURIComponent).join("/")}/${escaped}`;
}

/** What can be mentioned in a message: each file at `paths` in `folder`, named by its path. */
export function mentionItems(folder: string, paths: readonly string[]): PickItem[] {
  return paths.map((path) => ({ id: fileUri(folder, path), label: path }));
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The files `text` mentions, as links to send with it: each `@<label>` of an item in `mentions`,
 * once, in the order first mentioned. A mention starts the text or follows a space or an opening
 * bracket or quote, and ends the text or is followed by a space, closing punctuation, or a full stop
 * that ends a sentence. Longer labels are found first, so `@a.ts.bak` is not `@a.ts`. An `@word`
 * that names no item stays text only.
 */
export function mentionedLinks(text: string, mentions: readonly PickItem[]): PromptLink[] {
  const found: { at: number; link: PromptLink }[] = [];
  const taken: [number, number][] = [];
  const longestFirst = [...mentions].sort((a, b) => b.label.length - a.label.length);
  for (const item of longestFirst) {
    const pattern = new RegExp(
      `(?:^|(?<=[\\s(\\[{"'“‘]))@${escapeRegExp(item.label)}(?=$|[\\s,;:!?)\\]}"'”’]|\\.(?:$|\\s))`,
      "g",
    );
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      if (!found.some((f) => f.link.uri === item.id))
        found.push({ at: start, link: { uri: item.id, name: item.label } });
      break;
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.link);
}
