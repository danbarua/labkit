/**
 * The open file's text and the open commit's message, changed files and diff, each in a card of
 * its own under the resource's properties, drawn with the content views the chat uses.
 */

import { CodeView, ContentCard, DiffView, filesOfPatch, rowsOfPatch } from "@labkit/ui";
import { collectionOf, type HalDocument, keyOf } from "./hal";
import { requestPath, usePages } from "./hal-store";

/** The properties a file or a commit shows in its own card rather than as a property row. */
export const SHOWN_APART: Readonly<Record<string, readonly string[]>> = {
  File: ["content"],
  Commit: ["message", "diff"],
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

/** The open file's text, numbered and highlighted by its extension, or why it has none. */
export function FileView({ attrs }: { attrs: Record<string, unknown> }) {
  const size = Number(attrs.size ?? 0).toLocaleString("en");
  const path = String(attrs.path ?? attrs.name ?? "");
  const content = typeof attrs.content === "string" ? attrs.content : undefined;
  const note =
    attrs.binary === true
      ? `A binary file of ${size} bytes. Its content is not shown.`
      : attrs.utf8 === false
        ? `Text that is not UTF-8, ${size} bytes. Its content is not shown.`
        : attrs.content_truncated === true && content !== undefined
          ? `The first ${content.length.toLocaleString("en")} characters of ${size} bytes.`
          : undefined;
  const lines = content === undefined ? 0 : content.replace(/\n$/, "").split("\n").length;
  return (
    <ContentCard
      className="file-card"
      title="Content"
      {...(content === undefined ? {} : { meta: `${lines} ${lines === 1 ? "line" : "lines"}` })}
    >
      {note === undefined ? null : <div className="card-note">{note}</div>}
      {content === undefined ? null : (
        <CodeView path={path} text={content} caption={false} preview={FILE_PREVIEW} />
      )}
    </ContentCard>
  );
}

/** The href of `doc`'s link `rel`, or each of them, when it has several. */
function hrefsOf(doc: HalDocument, rel: string): string[] {
  return [doc._links?.[rel] ?? []].flat().map((link) => link.href);
}

/**
 * The files a commit changed, with their status, from its `changes` collection: the first page,
 * then each next page asked for.
 */
function ChangedFiles({ href, onOpen }: { href: string; onOpen: (key: string) => void }) {
  const key = keyOf(href);
  const pages = usePages(requestPath(href), (doc) => {
    const c = collectionOf(key, doc);
    return { items: c.items, next: c.next };
  });
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
  const parents = hrefsOf(doc, "parent:commit");
  const changes = hrefsOf(doc, "changes")[0];
  const diff = typeof attrs.diff === "string" ? attrs.diff : "";
  const files = filesOfPatch(diff);
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
      {attrs.diff_truncated === true ? (
        <div className="card-note">
          The diff is cut at {diff.length.toLocaleString("en")} characters; the files after the cut
          are not shown.
        </div>
      ) : null}
      {files.map((file) => {
        const { added, removed } = countsOf(file.patch);
        return (
          <ContentCard
            key={file.path}
            className="diff-card"
            title={<span className="mono">{file.path}</span>}
            meta={`+${added} −${removed}`}
          >
            <DiffView
              path={file.path}
              rows={rowsOfPatch(file.patch)}
              caption={false}
              preview={FILE_PREVIEW}
            />
          </ContentCard>
        );
      })}
    </>
  );
}
