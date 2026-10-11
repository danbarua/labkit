/**
 * The sidebar's File Explorer and Source Explorer: a workspace's committed files as a tree, and its
 * git history, newest first. Both read the collections the API serves for a workspace with a
 * repository (`docs/architecture.md`, "Files and history").
 */

import { CaretRightIcon, FileTextIcon, FolderIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { Fragment, useState } from "react";
import {
  type CollectionItem,
  COMMIT_TYPE,
  collectionOf,
  DIRECTORY_TYPE,
  fmtDate,
  type HalDocument,
} from "./hal";
import { requestPath, usePages } from "./hal-store";

/** How many entries of a directory, or commits of the history, one request asks for. */
const PAGE = 200;

const read =
  (key: string) =>
  (doc: HalDocument): { items: CollectionItem[]; next: string | undefined } => {
    const c = collectionOf(key, doc);
    return { items: c.items, next: c.next };
  };

/** A note, a spinner line, or a button for the next page, under a list. */
function Tail({
  loading,
  error,
  next,
  empty,
  onMore,
}: {
  loading: boolean;
  error: string | undefined;
  next: string | undefined;
  empty: boolean;
  onMore: () => void;
}) {
  if (error !== undefined) return <div className="empty-note">Fetch failed: {error}</div>;
  if (loading) return <div className="empty-note">Loading…</div>;
  if (empty) return <div className="empty-note">Nothing here.</div>;
  if (next === undefined) return null;
  return (
    <button type="button" className="tbtn primary load-more" onClick={onMore}>
      Load more
    </button>
  );
}

/**
 * The workspace's files as a tree, from the directory `rootKey`. A directory's entries are
 * fetched when it is first opened. Clicking a file opens it.
 */
export function FileTree({
  rootKey,
  openKey,
  onOpen,
}: {
  rootKey: string;
  openKey: string;
  onOpen: (key: string) => void;
}) {
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setOpened((was) => {
      const now = new Set(was);
      if (!now.delete(key)) now.add(key);
      return now;
    });
  return (
    <div className="file-tree">
      <Directory dirKey={rootKey} depth={0} {...{ opened, toggle, openKey, onOpen }} />
    </div>
  );
}

function Directory({
  dirKey,
  depth,
  opened,
  toggle,
  openKey,
  onOpen,
}: {
  dirKey: string;
  depth: number;
  opened: ReadonlySet<string>;
  toggle: (key: string) => void;
  openKey: string;
  onOpen: (key: string) => void;
}) {
  const pages = usePages(requestPath(`${dirKey}?limit=${PAGE}`), read(dirKey));
  const indent = { paddingLeft: `${6 + depth * 14}px` };
  return (
    <>
      {pages.items.map((item) => {
        const name = String(item.data.name ?? item.id ?? item.key);
        if (item.data.type === DIRECTORY_TYPE) {
          const open = opened.has(item.key);
          const Icon = open ? FolderOpenIcon : FolderIcon;
          return (
            <Fragment key={item.key}>
              <button
                type="button"
                className="tree-row"
                style={indent}
                aria-expanded={open}
                onClick={() => toggle(item.key)}
              >
                <CaretRightIcon className={open ? "caret open" : "caret"} aria-hidden="true" />
                <Icon className="tree-icon" aria-hidden="true" />
                <span className="tree-name">{name}</span>
              </button>
              {open ? (
                <Directory
                  dirKey={item.key}
                  depth={depth + 1}
                  {...{ opened, toggle, openKey, onOpen }}
                />
              ) : null}
            </Fragment>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            data-key={item.key}
            className={item.key === openKey ? "tree-row active" : "tree-row"}
            style={indent}
            onClick={() => onOpen(item.key)}
          >
            <span className="caret-space" />
            <FileTextIcon className="tree-icon" aria-hidden="true" />
            <span className="tree-name">{name}</span>
          </button>
        );
      })}
      <div style={indent}>
        <Tail
          loading={pages.loading}
          error={pages.error}
          next={pages.next}
          empty={!pages.loading && pages.error === undefined && pages.items.length === 0}
          onMore={pages.more}
        />
      </div>
    </>
  );
}

/** The workspace's history, `historyKey`, newest first. Clicking a commit opens it. */
export function History({
  historyKey,
  openKey,
  onOpen,
}: {
  historyKey: string;
  openKey: string;
  onOpen: (key: string) => void;
}) {
  const pages = usePages(requestPath(`${historyKey}?limit=${PAGE}`), read(historyKey));
  return (
    <div className="history">
      {pages.items
        .filter((item) => item.data.type === COMMIT_TYPE)
        .map((item) => (
          <button
            key={item.key}
            type="button"
            data-key={item.key}
            className={item.key === openKey ? "commit-row active" : "commit-row"}
            title={String(item.data.name ?? "")}
            onClick={() => onOpen(item.key)}
          >
            <span className="commit-line">
              <span className="sha mono">{String(item.id ?? "").slice(0, 7)}</span>
              <span className="subject">{String(item.data.name ?? "")}</span>
            </span>
            <span className="commit-meta faint">
              {String(item.data.author ?? "")} · {fmtDate(String(item.data.committed_at ?? ""))}
            </span>
          </button>
        ))}
      <Tail
        loading={pages.loading}
        error={pages.error}
        next={pages.next}
        empty={!pages.loading && pages.error === undefined && pages.items.length === 0}
        onMore={pages.more}
      />
    </div>
  );
}
