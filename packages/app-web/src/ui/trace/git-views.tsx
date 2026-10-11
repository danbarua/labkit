/**
 * The open file's text and the open commit's message, changed files and diff, each in a panel of
 * its own under the resource's properties.
 */

import { type HalDocument, keyOf } from "./hal";

/** The properties a file or a commit shows in its own panel rather than as a property row. */
export const SHOWN_APART: Readonly<Record<string, readonly string[]>> = {
  File: ["content"],
  Commit: ["message", "diff", "changes"],
};

/** `text`'s lines, without the empty one after a final line break. */
function linesOf(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** The open file's text, numbered by line, or why it has none. */
export function FileView({ attrs }: { attrs: Record<string, unknown> }) {
  const size = Number(attrs.size ?? 0).toLocaleString("en");
  const content = typeof attrs.content === "string" ? attrs.content : undefined;
  const note =
    attrs.binary === true
      ? `A binary file of ${size} bytes. Its content is not shown.`
      : attrs.utf8 === false
        ? `Text that is not UTF-8, ${size} bytes. Its content is not shown.`
        : attrs.content_truncated === true && content !== undefined
          ? `The first ${content.length.toLocaleString("en")} characters of ${size} bytes.`
          : undefined;
  const lines = content === undefined ? [] : linesOf(content);
  return (
    <div className="panel">
      <div className="panel-head">
        Content<span>{content === undefined ? "" : `${lines.length} lines`}</span>
      </div>
      {note === undefined ? null : <div className="panel-note">{note}</div>}
      {content === undefined ? null : (
        <pre className="code">
          {lines.map((line, i) => (
            <span key={i} className="line">
              <span className="ln" aria-hidden="true">
                {i + 1}
              </span>
              {line}
              {"\n"}
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}

/** A diff line's class: a file's header, a hunk's, a removed or an added line. */
function diffClass(line: string): string | undefined {
  if (line.startsWith("diff --git")) return "d-file";
  if (line.startsWith("+++ ") || line.startsWith("--- ")) return "d-head";
  if (line.startsWith("@@")) return "d-hunk";
  if (line.startsWith("+")) return "d-add";
  if (line.startsWith("-")) return "d-del";
  return undefined;
}

type Changed = { path: string; status: string; href: string };

/** The files a commit changed, from the commit's embedded `changed` entries. */
function changedOf(doc: HalDocument): Changed[] {
  const entries = doc._embedded?.changed;
  if (!Array.isArray(entries)) return [];
  return (entries as HalDocument[]).flatMap((entry) => {
    const self = entry._links?.self;
    const href = Array.isArray(self) ? self[0]?.href : self?.href;
    return typeof entry.path === "string" && typeof entry.status === "string" && href
      ? [{ path: entry.path, status: entry.status, href }]
      : [];
  });
}

/** The open commit's message body, parents, changed files and diff. */
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
  const parents = [doc._links?.parent ?? []].flat();
  const changed = changedOf(doc);
  const diff = typeof attrs.diff === "string" ? attrs.diff : "";
  return (
    <>
      {body === "" ? null : (
        <div className="panel">
          <div className="panel-head">Message</div>
          <pre className="message">{body}</pre>
        </div>
      )}
      <div className="panel">
        <div className="panel-head">
          Changed files<span>{changed.length}</span>
        </div>
        <div className="panel-body changes">
          {parents.length === 0 ? (
            <div className="faint">A root commit: every file is added.</div>
          ) : (
            <div className="parents">
              Parent{parents.length > 1 ? "s" : ""}{" "}
              {parents.map((p) => (
                <button
                  key={p.href}
                  type="button"
                  className="sha-link mono"
                  onClick={() => onOpen(keyOf(p.href))}
                >
                  {keyOf(p.href).split("/").pop()?.slice(0, 7)}
                </button>
              ))}
            </div>
          )}
          {changed.map((c) => (
            <button
              key={c.href}
              type="button"
              className="change-row"
              onClick={() => onOpen(keyOf(c.href))}
            >
              <span className={`change-status s-${c.status.toLowerCase()}`}>{c.status}</span>
              <span className="mono">{c.path}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">Diff</div>
        {attrs.diff_truncated === true ? (
          <div className="panel-note">
            The first {diff.length.toLocaleString("en")} characters of the diff.
          </div>
        ) : null}
        <pre className="code diff">
          {linesOf(diff).map((line, i) => (
            <span key={i} className={diffClass(line)}>
              {line}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
    </>
  );
}
