import { common, createLowlight } from "lowlight";
import { type ReactNode, useMemo, useState } from "react";

const lowlight = createLowlight(common);

type Highlighted = ReturnType<typeof lowlight.highlight>["children"][number];

/**
 * The language a file is written in, from the extension of its path: highlight.js registers the
 * common extensions as names of their language. `undefined` when it knows none by that extension,
 * and the file is then drawn as plain text.
 */
export function languageOf(path: string): string | undefined {
  const extension = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase();
  return extension !== undefined && lowlight.registered(extension) ? extension : undefined;
}

function draw(node: Highlighted, key: number): ReactNode {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return null;
  const { className } = node.properties;
  return (
    <span key={key} className={Array.isArray(className) ? className.join(" ") : undefined}>
      {node.children.map(draw)}
    </span>
  );
}

/**
 * `source` highlighted as `language` (a name or extension highlight.js knows), or `undefined`
 * when it knows no such language.
 */
export function highlight(language: string, source: string): ReactNode | undefined {
  return lowlight.registered(language)
    ? lowlight.highlight(language, source).children.map(draw)
    : undefined;
}

/** How many non-blank lines of a file show before the rest is asked for. */
export const PREVIEW_LINES = 5;

/**
 * How many lines from the top hold the first `count` lines that are not blank. Blank lines between
 * them are kept, so the opening of the file reads as it was written.
 */
export function previewLength(lines: readonly string[], count = PREVIEW_LINES): number {
  let seen = 0;
  for (const [i, line] of lines.entries()) {
    if (line.trim() !== "" && ++seen === count) return i + 1;
  }
  return lines.length;
}

/**
 * A whole file as code: numbered, highlighted by the language its path names, and cut to its
 * opening lines until the rest is asked for. The whole file is highlighted and the cut is one of
 * height, so a string or a comment that runs past the cut is still coloured as what it is.
 */
export function CodeView({
  path,
  title,
  text,
  note,
}: {
  path: string;
  /** The hover text of the caption: the file's full path, when `path` is a shorter name for it. */
  title?: string;
  text: string;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const source = text.replace(/\n$/, "");
  const lines = useMemo(() => source.split("\n"), [source]);
  const language = languageOf(path);
  const code = useMemo(
    () =>
      language === undefined ? source : lowlight.highlight(language, source).children.map(draw),
    [language, source],
  );
  const shown = previewLength(lines);
  const hidden = lines.length - shown;
  return (
    <figure className="lk-code">
      <figcaption className="lk-caption" {...(title === undefined ? {} : { title })}>
        {[path, note, `${lines.length} ${lines.length === 1 ? "line" : "lines"}`]
          .filter((part) => part !== undefined)
          .join(" · ")}
      </figcaption>
      <div className="lk-code-frame">
        <pre
          className="lk-code-text"
          {...(hidden > 0 && !open ? { style: { maxHeight: `calc(${shown} * 1lh)` } } : {})}
        >
          <span className="lk-code-gutter" aria-hidden="true">
            {lines.map((_, i) => i + 1).join("\n")}
          </span>
          <code {...(language ? { "data-language": language } : {})}>{code}</code>
        </pre>
      </div>
      {hidden > 0 ? (
        <button
          type="button"
          className="lk-code-more"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Show less" : `Show ${hidden} more ${hidden === 1 ? "line" : "lines"}`}
        </button>
      ) : null}
    </figure>
  );
}
