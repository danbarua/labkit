/**
 * The sidebar's File Explorer and Source Explorer: a workspace's committed files as a tree, and its
 * git history across every branch, newest first, with its branches' lines. Both read the collections the API serves for a workspace with a
 * repository (`docs/architecture.md`, "Files and history").
 */

import { CaretRightIcon, FileTextIcon, FolderIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  type CollectionItem,
  collectionOf,
  DIRECTORY_TYPE,
  fmtDate,
  type HalDocument,
  hrefOf,
  keyOf,
} from "./hal";
import { docOf, requestPath, useDocument, usePages } from "./hal-store";
import { type LaneRow, lanesOf, widthOf } from "./lanes";

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

/** A lane's width and a timeline row's height, in pixels; the rows touch, so the lanes' lines join. */
const LANE = 12;
const ROW = 38;
const LANE_COLOURS = ["#38bdf8", "#f472b6", "#4ade80", "#f0a13a", "#a78bfa", "#2dd4bf", "#fb7185"];
const laneColour = (lane: number) => LANE_COLOURS[lane % LANE_COLOURS.length];

/** One commit's part of the lanes: the lines past it, into its dot, and down to its parents. */
function LaneCell({ row, width }: { row: LaneRow; width: number }) {
  const x = (lane: number) => lane * LANE + LANE / 2;
  const mid = ROW / 2;
  return (
    <svg className="lanes" width={width * LANE} height={ROW} aria-hidden="true">
      {row.through.map((lane) => (
        <line
          key={`t${lane}`}
          x1={x(lane)}
          y1={0}
          x2={x(lane)}
          y2={ROW}
          stroke={laneColour(lane)}
        />
      ))}
      {row.fromAbove ? (
        <line x1={x(row.lane)} y1={0} x2={x(row.lane)} y2={mid} stroke={laneColour(row.lane)} />
      ) : null}
      {row.out.map((lane, k) => (
        <line
          key={`o${k}`}
          x1={x(row.lane)}
          y1={mid}
          x2={x(lane)}
          y2={ROW}
          stroke={laneColour(lane)}
        />
      ))}
      <circle cx={x(row.lane)} cy={mid} r={3.5} fill={laneColour(row.lane)} />
    </svg>
  );
}

/**
 * The workspace's history across every branch, newest first, from the timeline the history at
 * `historyKey` links to: each commit with the lanes `git log --graph` draws, and the names of
 * the branches that point to it. A branch picker, opening on HEAD's branch, scrolls to the
 * picked branch's tip, loading pages until it is listed. Clicking a commit opens it.
 */
export function History({
  historyKey,
  openKey,
  onOpen,
}: {
  historyKey: string;
  openKey: string;
  onOpen: (key: string) => void;
}) {
  // Any page of the history names the timeline and the branches.
  const history = docOf(useDocument(requestPath(`${historyKey}?limit=1`)));
  const timelineHref = history === undefined ? undefined : hrefOf(history, "timeline");
  const branchesHref = history === undefined ? undefined : hrefOf(history, "branches");
  const timeline = usePages(
    timelineHref === undefined ? undefined : requestPath(`${timelineHref}?limit=${PAGE}`),
    read(timelineHref === undefined ? "" : keyOf(timelineHref)),
  );
  const branchPages = usePages(
    branchesHref === undefined ? undefined : requestPath(`${branchesHref}?limit=${PAGE}`),
    read(branchesHref === undefined ? "" : keyOf(branchesHref)),
  );
  const branches = branchPages.items.map((item) => ({
    name: String(item.data.name ?? item.id ?? ""),
    tip: String(item.data.tip ?? ""),
    current: item.data.current === true,
  }));
  const [picked, setPicked] = useState<string | undefined>();
  const shown = picked ?? branches.find((b) => b.current)?.name;
  const tip = branches.find((b) => b.name === shown)?.tip;
  const listed = tip !== undefined && timeline.items.some((item) => item.id === tip);
  const { loading, next, more } = timeline;
  useEffect(() => {
    if (tip !== undefined && !listed && !loading && next !== undefined) more();
  }, [tip, listed, loading, next, more]);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!listed || tip === undefined) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-id="${CSS.escape(tip)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [listed, tip]);
  const rows = useMemo(
    () =>
      lanesOf(
        timeline.items.map((item) => ({
          id: String(item.id ?? ""),
          parents: Array.isArray(item.data.parents) ? item.data.parents.map(String) : [],
        })),
      ),
    [timeline.items],
  );
  const width = widthOf(rows);
  return (
    <div className="history" ref={list}>
      {branches.length === 0 ? null : (
        <label className="branch-pick">
          <span>Branch</span>
          <select value={shown ?? ""} onChange={(event) => setPicked(event.target.value)}>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.current ? `${b.name} (HEAD)` : b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {timeline.items.map((item, i) => {
        const row = rows[i];
        const id = String(item.id ?? "");
        const names = Array.isArray(item.data.branches) ? item.data.branches.map(String) : [];
        const classes = ["commit-row", "timeline-row"];
        if (item.key === openKey) classes.push("active");
        if (id === tip) classes.push("tip");
        return (
          <button
            key={item.key}
            type="button"
            data-key={item.key}
            data-id={id}
            className={classes.join(" ")}
            title={String(item.data.name ?? "")}
            onClick={() => onOpen(item.key)}
          >
            {row === undefined ? null : <LaneCell row={row} width={width} />}
            <span className="commit-text">
              <span className="commit-line">
                <span className="sha mono">{id.slice(0, 7)}</span>
                {names.map((name) => (
                  <span
                    key={name}
                    className={
                      item.data.head === true && !name.includes("/") ? "ref-pill head" : "ref-pill"
                    }
                  >
                    {name}
                  </span>
                ))}
                <span className="subject">{String(item.data.name ?? "")}</span>
              </span>
              <span className="commit-meta faint">
                {String(item.data.author ?? "")} · {fmtDate(String(item.data.committed_at ?? ""))}
              </span>
            </span>
          </button>
        );
      })}
      <Tail
        loading={timeline.loading}
        error={timeline.error}
        next={timeline.next}
        empty={!timeline.loading && timeline.error === undefined && timeline.items.length === 0}
        onMore={timeline.more}
      />
    </div>
  );
}
