/**
 * The open file's text and the open commit's message, changed files and diff, each in a card of
 * its own under the resource's properties, drawn with the content views the chat uses.
 */

import { CodeView, ContentCard, DiffView, MarkdownText, rowsOfPatch } from "@labkit/ui";
import { type MouseEvent, type ReactNode, useState } from "react";
import { APP_BASE } from "../../app-base";
import { type HalDocument, hrefOf, keyOf, linksOf } from "./hal";
import { requestPath, useCollectionPages } from "./hal-store";

/** The properties a file or a commit shows in its own card rather than as a property row. */
export const SHOWN_APART: Readonly<Record<string, readonly string[]>> = {
  File: ["content"],
  Commit: ["message"],
};

/**
 * The relations a commit shows in its own card rather than as relation cards: its changed files,
 * listed with their status in the Changed files card.
 */
export const RELATIONS_APART: Readonly<Record<string, readonly string[]>> = {
  Commit: ["changes:file"],
};

/** How many lines of a file, or rows of a file's diff, show before the rest is asked for. */
const FILE_PREVIEW = 40;

/**
 * How the page shows a file, chosen by the media type its resource names. The page never reads a
 * file's extension: the API owns the table from extension to media type.
 */
export type Viewer = "markdown" | "code" | "image" | "pdf" | "bytes";

/** Media types outside `text/` whose content is text, shown as code. */
const TEXT_TYPES: ReadonlySet<string> = new Set([
  "application/json",
  "application/yaml",
  "application/toml",
]);

export function viewerOf(mediaType: string): Viewer {
  if (mediaType === "text/markdown") return "markdown";
  if (mediaType === "application/pdf") return "pdf";
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("text/") || TEXT_TYPES.has(mediaType)) return "code";
  return "bytes";
}

/** An address that names its own scheme or host, or only a fragment: not a path in the repository. */
const OUTSIDE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * Resolves `url`, written in the file at `path`, as a repository host does: a relative address
 * against the file, and one starting with `/` against the repository's root. `base` is an address
 * of the file that ends in `path`, such as its `self` or `raw` link. Returns the path and query the
 * page requests.
 */
export function resolveInRepository(url: string, base: string, path: string): string {
  const file = new URL(base, "http://labkit.invalid");
  if (!url.startsWith("/")) return requestPath(new URL(url, file).href);
  const root = new URL(`./${"../".repeat(path.split("/").length - 1)}`, file);
  return requestPath(new URL(`.${url}`, root).href);
}

/** Why the file's text is not shown, or shown only in part; undefined when all of it is shown. */
function noteOf(attrs: Record<string, unknown>, content: string | undefined): string | undefined {
  const size = Number(attrs.size ?? 0).toLocaleString("en");
  if (attrs.binary === true) return `A binary file of ${size} bytes. Its content is not shown.`;
  if (attrs.utf8 === false)
    return `Text that is not UTF-8, ${size} bytes. Its content is not shown.`;
  if (attrs.content_truncated === true && content !== undefined)
    return `The first ${content.length.toLocaleString("en")} characters of ${size} bytes.`;
  return undefined;
}

/** A link to the file's committed bytes, which the browser opens in a new tab. */
function RawLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** A picture, or, when it does not load, a note with a link to the response that says why. */
function Picture({ src, path }: { src: string; path: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="card-note">
      The picture did not load. <RawLink href={src}>Open the file</RawLink> to see why.
    </div>
  ) : (
    <img
      className="file-image"
      src={src}
      alt={path}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * The open file, shown as its media type says: markdown rendered, with its source a toggle away;
 * text as numbered, highlighted code; a picture as itself; a PDF as a link; any other bytes as a
 * note with a download link. Text that is not UTF-8, or a binary file of a text type, gets the
 * note. In markdown, a picture's address and a link to another file resolve against the file, and
 * that link opens the file on this page.
 */
export function FileView({
  doc,
  attrs,
  onOpen,
}: {
  doc: HalDocument;
  attrs: Record<string, unknown>;
  onOpen: (key: string) => void;
}) {
  const [source, setSource] = useState(false);
  const path = String(attrs.path ?? attrs.name ?? "");
  const name = path.split("/").pop() ?? path;
  const size = `${Number(attrs.size ?? 0).toLocaleString("en")} bytes`;
  const content = typeof attrs.content === "string" ? attrs.content : undefined;
  const note = noteOf(attrs, content);
  const self = hrefOf(doc, "self") ?? "";
  // The raw route reads no query, so the view's parameters, which every link carries, are left off.
  const raw = keyOf(hrefOf(doc, "raw") ?? "");
  const mediaType = typeof attrs.media_type === "string" ? attrs.media_type : "";
  const lines = content === undefined ? 0 : content.replace(/\n$/, "").split("\n").length;
  const lineCount = `${lines} ${lines === 1 ? "line" : "lines"}`;
  const rawAction = <RawLink href={raw}>raw</RawLink>;
  const noteCard = (
    <ContentCard className="file-card" title="Content" meta={size} actions={rawAction}>
      <div className="card-note">
        {note ?? `A file of ${size}, of type ${mediaType || "unknown"}. Its content is not shown.`}{" "}
        <a href={raw} download={name}>
          Download
        </a>
      </div>
    </ContentCard>
  );
  const viewer = viewerOf(mediaType);
  switch (viewer) {
    case "markdown": {
      if (content === undefined) return noteCard;
      const resolveUrl = (url: string, kind: "src" | "href") =>
        OUTSIDE.test(url)
          ? url
          : kind === "src"
            ? resolveInRepository(url, raw, path)
            : APP_BASE + resolveInRepository(url, self, path);
      // A plain click on a link to another file opens it here; a click with a modifier key is
      // the browser's, which opens it in a new tab.
      const follow = (e: MouseEvent) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const href =
          e.target instanceof Element ? e.target.closest("a")?.getAttribute("href") : undefined;
        if (!href?.startsWith(`${APP_BASE}/`)) return;
        e.preventDefault();
        onOpen(keyOf(href.slice(APP_BASE.length)));
      };
      return (
        <ContentCard
          className="file-card"
          title="Content"
          meta={lineCount}
          actions={
            <>
              {(["Rendered", "Source"] as const).map((label) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={source === (label === "Source")}
                  className={source === (label === "Source") ? "tbtn on" : "tbtn"}
                  onClick={() => setSource(label === "Source")}
                >
                  {label}
                </button>
              ))}
              {rawAction}
            </>
          }
        >
          {note === undefined ? null : <div className="card-note">{note}</div>}
          {source ? (
            <CodeView
              path={path}
              language="markdown"
              text={content}
              caption={false}
              preview={FILE_PREVIEW}
            />
          ) : (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the links inside are the controls, and a key on a link fires a click.
            // biome-ignore lint/a11y/noStaticElementInteractions: the handler only takes over clicks on the links inside.
            <div className="file-markdown" onClick={follow}>
              <MarkdownText text={content} resolveUrl={resolveUrl} />
            </div>
          )}
        </ContentCard>
      );
    }
    case "code":
      if (content === undefined) return noteCard;
      return (
        <ContentCard className="file-card" title="Content" meta={lineCount} actions={rawAction}>
          {note === undefined ? null : <div className="card-note">{note}</div>}
          <CodeView path={path} text={content} caption={false} preview={FILE_PREVIEW} />
        </ContentCard>
      );
    case "image":
      return (
        <ContentCard className="file-card" title="Content" meta={size} actions={rawAction}>
          <Picture key={raw} src={raw} path={path} />
        </ContentCard>
      );
    case "pdf":
      return (
        <ContentCard className="file-card" title="Content" meta={size} actions={rawAction}>
          <div className="card-note">
            A PDF. <RawLink href={raw}>Open it</RawLink> in a new tab.
          </div>
        </ContentCard>
      );
    case "bytes":
      return noteCard;
  }
}

/**
 * The files a commit changed, with their status, from its `changes` collection: the first page,
 * then each next page asked for.
 */
function ChangedFiles({ href, onOpen }: { href: string; onOpen: (key: string) => void }) {
  const pages = useCollectionPages(href);
  return (
    <>
      {pages.items.map((item) => (
        <div key={item.key} className="kv">
          <div className={`k change-status s-${String(item.data.status).toLowerCase()}`}>
            {String(item.data.status)}
          </div>
          <div className="v">
            <button type="button" className="ref mono" onClick={() => onOpen(item.key)}>
              {String(item.data.path)}
            </button>
          </div>
        </div>
      ))}
      {pages.error !== undefined ? (
        <div className="card-note">Fetch failed: {pages.error}</div>
      ) : null}
      {pages.next !== undefined && !pages.loading ? (
        <button type="button" className="tbtn primary load-more" onClick={pages.more}>
          Load more
        </button>
      ) : null}
    </>
  );
}

/** How many lines a file's patch adds and removes. */
function countsOf(patch: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const row of rowsOfPatch(patch)) {
    if (row.kind !== "line") continue;
    if (row.line.kind === "add") added++;
    if (row.line.kind === "remove") removed++;
  }
  return { added, removed };
}

/** The open commit's message body, parents, changed files, and a diff card for each file. */
export function CommitView({
  doc,
  attrs,
  onOpen,
}: {
  doc: HalDocument;
  attrs: Record<string, unknown>;
  onOpen: (key: string) => void;
}) {
  const message = typeof attrs.message === "string" ? attrs.message : "";
  const body = message.split("\n").slice(1).join("\n").trim();
  const parents = linksOf(doc, "parent:commit").map((link) => link.href);
  const changes = hrefOf(doc, "changes");
  const diff = hrefOf(doc, "diff");
  return (
    <>
      {body === "" ? null : (
        <ContentCard title="Message">
          <pre className="message">{body}</pre>
        </ContentCard>
      )}
      <ContentCard title="Changed files" meta={String(attrs.files_changed ?? "")}>
        <div className="kv">
          <div className="k">{parents.length > 1 ? "parents" : "parent"}</div>
          <div className="v">
            {parents.length === 0
              ? "none: a root commit, which adds every file"
              : parents.map((href) => (
                  <button
                    key={href}
                    type="button"
                    className="ref mono"
                    onClick={() => onOpen(keyOf(href))}
                  >
                    {keyOf(href).split("/").pop()?.slice(0, 7)}
                  </button>
                ))}
          </div>
        </div>
        {changes === undefined ? null : <ChangedFiles href={changes} onOpen={onOpen} />}
      </ContentCard>
      {diff === undefined ? null : <Diffs href={diff} />}
    </>
  );
}

/**
 * A commit's diff, one card per changed file, from its `diff` collection: the first page of files,
 * then each next page asked for. Only this page asks for a commit's diff.
 */
function Diffs({ href }: { href: string }) {
  const pages = useCollectionPages(href);
  return (
    <>
      {pages.items.map((item) => {
        const path = String(item.data.path ?? item.id ?? "");
        const patch = typeof item.data.patch === "string" ? item.data.patch : "";
        const { added, removed } = countsOf(patch);
        return (
          <ContentCard
            key={item.key}
            className="diff-card"
            title={<span className="mono">{path}</span>}
            meta={`+${added} −${removed}`}
          >
            {item.data.patch_truncated === true ? (
              <div className="card-note">
                The first {patch.length.toLocaleString("en")} characters of this file's diff.
              </div>
            ) : null}
            <DiffView
              path={path}
              rows={rowsOfPatch(patch)}
              caption={false}
              preview={FILE_PREVIEW}
            />
          </ContentCard>
        );
      })}
      {pages.error !== undefined ? (
        <div className="card-note">Fetch failed: {pages.error}</div>
      ) : null}
      {pages.next !== undefined && !pages.loading ? (
        <button type="button" className="tbtn primary load-more" onClick={pages.more}>
          Load more files
        </button>
      ) : null}
    </>
  );
}
