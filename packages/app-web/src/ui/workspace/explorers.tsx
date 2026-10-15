/**
 * The sidebar's File Explorer and Source Explorer: a workspace's committed files as a tree, and its
 * git history across every branch, newest first, with its branches' lines. Both read the collections the API serves for a workspace with a
 * repository (`docs/architecture.md`, "Files and history").
 */

import { CaretRightIcon, FolderIcon, FolderOpenIcon } from "@phosphor-icons/react";
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
import { classNames, filterItems } from "@labkit/ui";
import { ActiveBox } from "./active-box";
import { fileLook } from "./file-icons";
import { usePathsOf } from "./file-paths";
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

/** The keys of the directories above `key` in the tree at `rootKey`, top first; none outside it. */
export function foldersAbove(rootKey: string, key: string): string[] {
  if (!key.startsWith(`${rootKey}/`)) return [];
  const segments = key.slice(rootKey.length + 1).split("/");
  return segments.slice(0, -1).map((_, i) => `${rootKey}/${segments.slice(0, i + 1).join("/")}`);
}

/**
 * The workspace's files as a tree, from the directory `rootKey`. A directory's entries are
 * fetched when it is first opened. Clicking a file opens it, and the box around the open file
 * slides to it. When a file in the tree opens from anywhere else, such as the graph or a link, the
 * directories above it open, so its row and the box show; closing one afterwards keeps it closed.
 */
export function FileTree({
  rootKey,
  openKey,
  onOpen,
  term = "",
}: {
  rootKey: string;
  openKey: string;
  onOpen: (key: string) => void;
  /** While not blank, the tree is replaced by the files whose paths hold every word of it. */
  term?: string;
}) {
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const above = foldersAbove(rootKey, openKey);
    if (above.length === 0) return;
    setOpened((was) => (above.every((key) => was.has(key)) ? was : new Set([...was, ...above])));
  }, [rootKey, openKey]);
  const toggle = (key: string) =>
    setOpened((was) => {
      const now = new Set(was);
      if (!now.delete(key)) now.add(key);
      return now;
    });
  return (
    <div className="file-tree" ref={list}>
      <ActiveBox list={list} activeKey={openKey} rows={term} />
      {term.trim() === "" ? (
        <Directory dirKey={rootKey} depth={0} {...{ opened, toggle, openKey, onOpen }} />
      ) : (
        <FileMatches {...{ rootKey, term, openKey, onOpen }} />
      )}
    </div>
  );
}

/** The most matches File Explorer's filter draws; it says how many more there are. */
const MAX_MATCHES = 200;
/** A match's icon: the list of paths names no media type, and the page maps no extension to one. */
const PLAIN = fileLook(undefined);

/**
 * The files at HEAD whose paths hold every word of `term`, from the files API's list of every path
 * (`paths`), so a file in a folder not yet opened is found too. Each is a row with its folder and
 * name, which opens it.
 */
function FileMatches({
  rootKey,
  term,
  openKey,
  onOpen,
}: {
  rootKey: string;
  term: string;
  openKey: string;
  onOpen: (key: string) => void;
}) {
  const listed = usePathsOf(rootKey, "file explorer filter");
  const matches = useMemo(
    () =>
      listed === undefined
        ? []
        : filterItems(
            listed.paths.map((path) => ({ id: path, label: path })),
            term,
          ),
    [listed, term],
  );
  if (listed === undefined) return <div className="faint tree-note">Loading the files…</div>;
  const shown = matches.slice(0, MAX_MATCHES);
  return (
    <>
      <div className="faint tree-note">
        {matches.length === 0
          ? `No file's path holds "${term.trim()}".`
          : `${matches.length} of ${listed.total} files${matches.length > shown.length ? `; the first ${shown.length} shown` : ""}`}
      </div>
      {shown.map(({ label: path }) => {
        const key = listed.keyOf(path);
        if (key === undefined) return null;
        const slash = path.lastIndexOf("/");
        return (
          <button
            key={path}
            type="button"
            data-key={key}
            className={key === openKey ? "tree-row active" : "tree-row"}
            title={path}
            onClick={() => onOpen(key)}
          >
            <PLAIN.icon className="tree-icon" data-kind={PLAIN.kind} aria-hidden="true" />
            <span className="tree-name">
              {slash < 0 ? null : <span className="faint">{path.slice(0, slash + 1)}</span>}
              {path.slice(slash + 1)}
            </span>
          </button>
        );
      })}
    </>
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
                <Icon className="tree-icon" data-kind="folder" aria-hidden="true" />
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
        const look = fileLook(
          typeof item.data.media_type === "string" ? item.data.media_type : undefined,
        );
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
            <look.icon className="tree-icon" data-kind={look.kind} aria-hidden="true" />
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
 * picked branch's tip, loading pages until it is listed. Clicking a commit opens it, and the box
 * that marks the open commit slides to it.
 */
export function History({
  historyKey,
  openKey,
  onOpen,
  term = "",
}: {
  historyKey: string;
  openKey: string;
  onOpen: (key: string) => void;
  /**
   * While not blank, only the loaded commits whose id, message, author or branch names hold every
   * word of it are drawn, without their lanes, under a line that says how many were searched.
   */
  term?: string;
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
  const filtering = term.trim() !== "";
  const matching = useMemo(
    () =>
      filtering
        ? new Set(
            filterItems(
              timeline.items.map((item) => ({
                id: item.key,
                label: String(item.data.name ?? ""),
                detail: String(item.data.author ?? ""),
                keywords: [
                  String(item.id ?? ""),
                  ...(Array.isArray(item.data.branches) ? item.data.branches.map(String) : []),
                ].join(" "),
              })),
              term,
            ).map((item) => item.id),
          )
        : undefined,
    [filtering, timeline.items, term],
  );
  return (
    <div className="history" ref={list}>
      <ActiveBox list={list} activeKey={openKey} />
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
      {matching === undefined ? null : (
        <div className="faint tree-note">
          {`${matching.size} of the ${timeline.items.length} commits loaded match${timeline.next === undefined ? "" : "; load more to search further"}`}
        </div>
      )}
      {timeline.items.map((item, i) => {
        if (matching !== undefined && !matching.has(item.key)) return null;
        const row = matching === undefined ? rows[i] : undefined;
        const id = String(item.id ?? "");
        const names = Array.isArray(item.data.branches) ? item.data.branches.map(String) : [];
        return (
          <button
            key={item.key}
            type="button"
            data-key={item.key}
            data-id={id}
            className={classNames(
              "commit-row",
              "timeline-row",
              item.key === openKey && "active",
              id === tip && "tip",
            )}
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
