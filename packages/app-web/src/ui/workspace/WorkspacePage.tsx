/**
 * The workspace page: the API's HAL documents, followed by link. The left column lists collections.
 * The centre shows the graph of what the reader has opened, then the open resource with the
 * resources it relates to. The page's address is the API path of what is open, so a reload or a
 * pasted link opens it again.
 */

import { ContentCard, ICONS, JsonView } from "@labkit/ui";
import "@labkit/ui/content.css";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BracketsCurlyIcon,
  CaretRightIcon,
  ChartLineIcon,
  ChatCircleTextIcon,
  CheckCircleIcon,
  CompassIcon,
  DatabaseIcon,
  EyeIcon,
  FlagCheckeredIcon,
  FolderIcon,
  GitCommitIcon,
  type Icon,
  IconContext,
  PauseIcon,
  PlayIcon,
  SealCheckIcon,
  SidebarSimpleIcon,
  WrenchIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { TopBar } from "../chrome/Frame";
import { useSavedFlag, useSavedNumber } from "../saved-flag";
import { useSavedTheme } from "../saved-theme";
import { GraphView, type GraphEdgeSeed, type GraphNodeSeed, type Overlay } from "../GraphView";
import {
  COMMIT_TYPE,
  type CollectionItem,
  collectionOf,
  drawnAs,
  edgeLabelOf,
  FILE_TYPE,
  commitsRanAgainst,
  type HalDocument,
  type Held,
  type HeldIndex,
  hrefOf,
  humanRel,
  itemView,
  keyOf,
  labelFor,
  nameOf,
  relGroups,
  shortId,
  typeColour,
} from "./hal";
import {
  docOf,
  type Pages,
  requestPath,
  resourcePath,
  store,
  useDocument,
  usePages,
  useStoreVersion,
} from "./hal-store";
import { FileTree, History } from "./explorers";
import { ActiveBox } from "./active-box";
import { ChatButton, ChatSidebar, useChat } from "./chat-sidebar";
import { FilterBox, FilterButton, useFilter } from "./filter";
import { WorkspacePicker } from "./workspace-picker";
import { CommitView, FileView, RELATIONS_APART, SHOWN_APART } from "./git-views";
import { type Playback, usePlayback } from "./playback";
import { proseSegments } from "./prose";
import { Badge, EventRow, PropRows, type Prose } from "./values";
import "./workspace.css";

/** Where the left column starts: the list of workspaces. */
/** The API's list of workspaces: the page's landing view lists it, and nothing else. */
const WORKSPACES = "/workspace";

export type Tab = "overview" | "debug";

/** The directory a key sits in, with its trailing slash. */
const dirOf = (key: string) => key.slice(0, key.lastIndexOf("/") + 1);

function Spinner({ children }: { children: ReactNode }) {
  return (
    <div className="fetchbar">
      <span className="spinner" aria-hidden="true" />
      {children}
    </div>
  );
}

/**
 * The resources the reader has opened since the graph was last reset, in the order they were first
 * opened. The graph draws these and what they relate to. `generation` counts the resets, so the
 * canvas can start a new layout on each one.
 */
function useExplored(path: string) {
  const [state, setState] = useState<{ keys: string[]; generation: number }>({
    keys: [],
    generation: 0,
  });
  const add = useCallback(
    (key: string) => setState((s) => (s.keys.includes(key) ? s : { ...s, keys: [...s.keys, key] })),
    [],
  );
  useEffect(() => {
    if (path !== "") add(path);
  }, [path, add]);
  const reset = () =>
    setState((s) => ({ keys: path === "" ? [] : [path], generation: s.generation + 1 }));
  return { ...state, reset };
}

/** The workspace directory a key sits in, `/workspace/<slug>/`, or undefined outside one. */
const workspaceOf = (key: string) => /^\/workspace\/[^/]+\//.exec(key)?.[0];

/**
 * The windows in which the sidebar is a drawer over the page: workspace.css's narrow-window
 * rules.
 */
export const NARROW = "(max-width: 860px)";

/** Whether the window matches the media query `query`, kept current as the window changes. */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

export interface WorkspacePageProps {
  /** The API path of what is open, or "" when nothing is. */
  path: string;
  /** The API path of the collection the left column lists, when one was picked. */
  list: string | undefined;
  tab: Tab;
  /** The agent's session the chat reopens, when the address names one. */
  session: string | undefined;
}

export function WorkspacePage({ path, list, tab, session }: WorkspacePageProps) {
  const navigate = useNavigate();
  const [theme] = useSavedTheme();
  // In a narrow window, the drawer open over the page: the sidebar's, or the agent's chat.
  const [drawer, setDrawer] = useState<"items" | "chat" | undefined>();
  // At full width the sidebar is shown or hidden, as this browser last left it; in a narrow
  // window it is a drawer over the page, closed until opened.
  const [sidebarShown, setSidebarShown] = useSavedFlag("labkit.workspace.sidebar", true);
  const narrow = useMediaQuery(NARROW);
  // At full width the agent's chat is expanded or minimised, as this browser last left it.
  const [chatShown, setChatShown] = useSavedFlag("labkit.workspace.chat", false);
  const setSession = useCallback(
    (next: string | undefined) =>
      void navigate({ to: ".", search: (s) => ({ ...s, session: next }), replace: true }),
    [navigate],
  );
  const [graphOpen, setGraphOpen] = useState(true);
  const explored = useExplored(path);
  // A workspace's own index, `/workspace/<slug>`, is inside that workspace too.
  const workspace = workspaceOf(`${path}/`);
  useStoreVersion();
  const held = store.index();

  const openEntry = useDocument(path === "" ? undefined : resourcePath(path));
  const openDoc = docOf(openEntry);
  const openIsCollection = openDoc !== undefined && typeof openDoc.type !== "string";
  // File Explorer shows HEAD: a file open at a commit is followed to the same path at HEAD, which
  // the file links as `head` when HEAD holds it.
  const headHref = openDoc === undefined ? undefined : hrefOf(openDoc, "head");
  const fileKey = headHref === undefined ? path : keyOf(headHref);

  // Opening what is already open adds no history entry. Opening a resource of another type than
  // the listed collection's lists the collection that one is listed in instead, which closes the
  // Items pane: the reader is following relations, not reading down the list.
  // The workspace in scope: the open resource's, or else that of the collection picked.
  const scope = workspace ?? (list === undefined ? undefined : workspaceOf(`${list}/`));
  const workspaceIndex = scope?.replace(/\/$/, "");
  // Record Explorer lists the open collection, or else the one picked, or else the workspace's
  // collections. The workspace's own index, open in the centre, lists what is picked under it.
  const listKey = openIsCollection && path !== workspaceIndex ? path : (list ?? workspaceIndex);
  const shownList = listKey;
  const open = (key: string) => {
    setDrawer(undefined);
    if (key === path) return;
    const upper = shownList === undefined ? undefined : indexOfList(shownList);
    const listedType =
      upper === undefined || shownList === undefined
        ? undefined
        : rowIn(upper, shownList)?.data.type;
    const type = held.get(key)?.type;
    const nextList =
      listedType !== undefined && type !== undefined && type !== listedType ? upper : shownList;
    void navigate({
      to: "/$",
      params: { _splat: key.replace(/^\//, "") },
      // The workspace's own collections are what Record Explorer lists when nothing is picked.
      search: (s) => ({ ...s, list: nextList === workspaceIndex ? undefined : nextList }),
    });
  };
  const playback = usePlayback(path, workspace, open);
  // A collection picked, or the workspaces on going home, is fetched again: what it lists changes
  // as records are written, and its rows stay on screen until the new page arrives.
  const pickList = (key: string) => {
    store.load(requestPath(key), true);
    void navigate({
      to: ".",
      search: (s) => ({ ...s, list: key === workspaceIndex ? undefined : key }),
      replace: true,
    });
  };
  const pickTab = (next: Tab) =>
    void navigate({
      to: ".",
      search: (s) => ({ ...s, tab: next === "overview" ? undefined : next }),
      replace: true,
    });
  const home = () => {
    setDrawer(undefined);
    store.load(requestPath(WORKSPACES), true);
    void navigate({ to: "/$", params: { _splat: "" }, search: {} });
  };

  // An address that names its workspace only in `?list=` names it in its path instead.
  useEffect(() => {
    if (path !== "" || workspaceIndex === undefined) return;
    void navigate({
      to: "/$",
      params: { _splat: workspaceIndex.replace(/^\//, "") },
      search: (s) => ({ ...s, list: s.list === workspaceIndex ? undefined : s.list }),
      replace: true,
    });
  }, [path, workspaceIndex, navigate]);
  const chat = useChat({
    slug: scope?.split("/")[2],
    expanded: narrow ? drawer === "chat" : chatShown,
    session,
    setSession,
  });
  const toggleChat = () =>
    narrow ? setDrawer((d) => (d === "chat" ? undefined : "chat")) : setChatShown(!chatShown);
  const prose = proseFor(held, path, open);

  return (
    <IconContext.Provider value={ICONS}>
      <div
        className="lk-root lk-frame workspace-page"
        data-theme={theme === "system" ? undefined : theme}
      >
        <TopBar
          onHome={home}
          end={
            narrow && chat !== undefined ? <ChatButton chat={chat} onToggle={toggleChat} /> : null
          }
        />

        <div className="body">
          <button
            type="button"
            className={drawer === undefined ? "scrim" : "scrim open"}
            aria-label="Close the column"
            tabIndex={-1}
            onClick={() => setDrawer(undefined)}
          />
          <Lists
            className={[
              "sidebar",
              drawer === "items" ? "open" : "",
              sidebarShown ? "" : "collapsed",
            ].join(" ")}
            workspace={scope}
            listKey={listKey}
            root={listKey !== undefined && listKey === workspaceIndex}
            openKey={path}
            fileKey={fileKey}
            held={held}
            expanded={narrow ? drawer === "items" : sidebarShown}
            onToggle={() =>
              narrow
                ? setDrawer((d) => (d === "items" ? undefined : "items"))
                : setSidebarShown(!sidebarShown)
            }
            onShow={() => (narrow ? setDrawer("items") : setSidebarShown(true))}
            onOpen={open}
            onList={pickList}
          />
          <main className="main">
            <div className="detail">
              {workspace === undefined ? null : (
                <GraphCard
                  open={graphOpen}
                  workspace={workspace}
                  explored={explored.keys}
                  generation={explored.generation}
                  held={held}
                  selected={path}
                  playback={playback.playback}
                  canPlay={playsFrom(held, path) || (openIsCollection && listsActs(path))}
                  onToggle={() => setGraphOpen((o) => !o)}
                  onOpen={open}
                  onReset={explored.reset}
                  onPlay={playback.play}
                  onPause={playback.pause}
                />
              )}
              {path === "" ? <WorkspacePicker onOpen={open} /> : null}
              <Detail
                path={path}
                entry={openEntry}
                isCollection={openIsCollection}
                held={held}
                tab={tab}
                prose={prose}
                onTab={pickTab}
                onOpen={open}
              />
            </div>
          </main>
          {chat === undefined ? null : (
            <ChatSidebar chat={chat} narrow={narrow} onToggle={toggleChat} />
          )}
        </div>
      </div>
    </IconContext.Provider>
  );
}

/** Prose with each handle it names drawn as a link to the resource, where the page holds one. */
function proseFor(held: HeldIndex, path: string, onOpen: (key: string) => void): Prose {
  // A handle in the open resource's text may sit beside it, or beside anything it links to.
  const bases = [path, ...(held.get(path)?.rels.map((r) => r.key) ?? [])]
    .map(dirOf)
    .filter((dir, i, all) => dir !== "" && all.indexOf(dir) === i);
  return (text: string) =>
    proseSegments(text, held, bases).map((s, i) => {
      switch (s.kind) {
        case "text":
          return s.text;
        case "math":
          return (
            <span key={i} className="math">
              {s.text}
            </span>
          );
        case "mention":
          return (
            <button
              key={i}
              type="button"
              className="mention"
              style={{ "--mention": typeColour(s.type) } as CSSProperties}
              title={s.type ?? ""}
              onClick={() => onOpen(s.key)}
            >
              {s.text}
            </button>
          );
      }
      return (
        <span key={i} className="mention unknown">
          {s.text}
        </span>
      );
    });
}

/* ---------------- left column ---------------- */

/** The collection that the held document of collection `key` names as the one it is listed in. */
function indexOfList(key: string): string | undefined {
  const doc = docOf(store.entry(requestPath(key)));
  return doc === undefined ? undefined : collectionOf(key, doc).index;
}

/** Whether collection `key` is the acts collection: the type its own index lists it under is Act. */
/**
 * Whether playback can start from resource `key`: an act, or a resource that links its events, once
 * its own response has arrived. A file, or a commit no act ran against, links none.
 */
function playsFrom(held: HeldIndex, key: string): boolean {
  const res = held.get(key);
  return res?.own === true && (res.type === "Act" || res.eventsHref !== undefined);
}

function listsActs(key: string): boolean {
  const upper = indexOfList(key);
  return upper !== undefined && rowIn(upper, key)?.data.type === "Act";
}

/** Collection `key` as a row of collection `upper`, when the document of `upper` is held. */
function rowIn(upper: string, key: string): CollectionItem | undefined {
  const doc = docOf(store.entry(requestPath(upper)));
  return doc && collectionOf(upper, doc).items.find((item) => item.key === keyOf(key));
}

const readCollection =
  (key: string) =>
  (doc: HalDocument): { items: CollectionItem[]; next: string | undefined } => {
    const c = collectionOf(key, doc);
    return { items: c.items, next: c.next };
  };

/**
 * Two collections. The one picked is the lower one when it names the collection it is listed in
 * (its `index` link), and that one is the upper; otherwise it is the upper one alone. The list of
 * workspaces is always the upper one.
 */
function Lists({
  className,
  workspace,
  listKey,
  root,
  openKey,
  fileKey,
  held,
  expanded,
  onToggle,
  onShow,
  onOpen,
  onList,
}: {
  className: string;
  /** The open workspace's directory, `/workspace/<slug>/`, or undefined when none is open. */
  workspace: string | undefined;
  /** The key File Explorer marks: the open file, or for a file open at a commit, the same path at HEAD. */
  fileKey: string;
  /** The collection Record Explorer lists; undefined when no workspace is in scope. */
  listKey: string | undefined;
  root: boolean;
  openKey: string;
  held: HeldIndex;
  /** Whether the sidebar is shown, or in a narrow window, whether its drawer is open. */
  expanded: boolean;
  onToggle: () => void;
  /** Shows the sidebar, or opens its drawer in a narrow window. */
  onShow: () => void;
  onOpen: (key: string) => void;
  onList: (key: string) => void;
}) {
  // Each list's filter, hidden until its search button shows it.
  const itemsFilter = useFilter();
  const term = itemsFilter.term;
  const filesFilter = useFilter();
  const commitsFilter = useFilter();
  const listEntry = useDocument(listKey === undefined ? undefined : requestPath(listKey));
  // Until the picked collection's first page arrives, the collection it was picked from stays the
  // upper one, so the upper pane does not show the picked collection and then swap back.
  const shown = useRef<string | undefined>(undefined);
  const upperKey =
    listKey === undefined || root
      ? listKey
      : docOf(listEntry) !== undefined
        ? (indexOfList(listKey) ?? listKey)
        : shown.current !== undefined && rowIn(shown.current, listKey) !== undefined
          ? shown.current
          : listKey;
  useEffect(() => {
    shown.current = upperKey;
  });
  const lowerKey = upperKey === listKey ? undefined : listKey;
  // The row for the lower collection, which `list` may name with a query (`?limit=`), is lit.
  const lowerRow = lowerKey === undefined ? undefined : keyOf(lowerKey);
  const upper = usePages(
    upperKey === undefined ? undefined : requestPath(upperKey),
    readCollection(upperKey ?? ""),
  );
  const lower = usePages(
    lowerKey === undefined ? undefined : requestPath(lowerKey),
    readCollection(listKey ?? ""),
  );
  // The Items pane follows the open resource: while it is of the type the pane lists and not among
  // the rows loaded, the next page is loaded, as long as the last one names a next page.
  const openType = held.get(openKey)?.type;
  const behind =
    lowerKey !== undefined &&
    !lower.loading &&
    lower.next !== undefined &&
    openType !== undefined &&
    lower.items[0]?.data.type === openType &&
    !lower.items.some((item) => item.key === openKey);
  const loadMore = lower.more;
  const lowerList = useRef<HTMLDivElement>(null);
  const upperList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (behind) loadMore();
  }, [behind, loadMore]);

  const [recordsOpen, setRecordsOpen] = useSavedFlag("labkit.workspace.records", true);
  const [filesOpen, setFilesOpen] = useSavedFlag("labkit.workspace.files", false);
  const [historyOpen, setHistoryOpen] = useSavedFlag("labkit.workspace.history", false);
  const [filesGrow, setFilesGrow] = useSavedNumber("labkit.workspace.files.grow", FILES_SHARE);
  const [historyGrow, setHistoryGrow] = useSavedNumber(
    "labkit.workspace.history.grow",
    HISTORY_SHARE,
  );
  const [recordsGrow, setRecordsGrow] = useSavedNumber(
    "labkit.workspace.records.grow",
    RECORDS_SHARE,
  );
  const filesSection = useRef<HTMLElement>(null);
  const historySection = useRef<HTMLElement>(null);
  const recordsSection = useRef<HTMLElement>(null);
  // The open workspace's index says whether it serves files and history, and where.
  const indexKey = workspace?.replace(/\/$/, "");
  const indexEntry = useDocument(indexKey === undefined ? undefined : requestPath(indexKey));
  const indexDoc = docOf(indexEntry);
  const served = (type: string) =>
    indexKey === undefined || indexDoc === undefined
      ? undefined
      : collectionOf(indexKey, indexDoc).items.find((item) => item.data.type === type)?.key;
  const filesKey = served(FILE_TYPE);
  const historyKey = served(COMMIT_TYPE);
  const slug = workspace?.split("/")[2];
  const unavailable = (key: string | undefined, what: string) =>
    slug === undefined
      ? `Open a workspace to browse its ${what}.`
      : indexEntry?.status === "failed"
        ? `${slug}'s collections did not load: ${indexEntry.error}`
        : indexDoc === undefined
          ? `Loading ${slug}…`
          : key === undefined
            ? `${slug} serves no ${what}.`
            : undefined;
  const filesUnavailable = unavailable(filesKey, "files");
  const recordsUnavailable =
    listKey === undefined ? "Pick a workspace to browse its records." : undefined;
  const historyUnavailable = unavailable(historyKey, "history");
  // The open sections, in order. A border that can be dragged sits after each but the last.
  const shares: Share[] = [
    filesOpen && filesUnavailable === undefined
      ? {
          name: "File Explorer",
          initial: FILES_SHARE,
          grow: filesGrow,
          setGrow: setFilesGrow,
          element: filesSection,
        }
      : undefined,
    historyOpen && historyUnavailable === undefined
      ? {
          name: "Source Explorer",
          initial: HISTORY_SHARE,
          grow: historyGrow,
          setGrow: setHistoryGrow,
          element: historySection,
        }
      : undefined,
    recordsOpen && recordsUnavailable === undefined
      ? {
          name: "Record Explorer",
          initial: RECORDS_SHARE,
          grow: recordsGrow,
          setGrow: setRecordsGrow,
          element: recordsSection,
        }
      : undefined,
  ].filter((share) => share !== undefined);
  const splitterAfter = (element: RefObject<HTMLElement | null>) => {
    const at = shares.findIndex((share) => share.element === element);
    const above = shares[at];
    const below = shares[at + 1];
    return above === undefined || below === undefined ? null : (
      <Splitter above={above} below={below} />
    );
  };
  // A section's button in the rail folds the section when it is showing, and otherwise opens it
  // and shows the sidebar.
  const railButton = (
    title: string,
    icon: ReactNode,
    open: boolean,
    setOpen: (next: boolean) => void,
    unavailable: string | undefined,
  ) => {
    const showing = expanded && open && unavailable === undefined;
    return (
      <button
        type="button"
        className={showing ? "rail-btn on" : "rail-btn"}
        aria-label={`Open ${title}`}
        aria-pressed={showing}
        title={unavailable ?? title}
        disabled={unavailable !== undefined}
        onClick={() => {
          setOpen(!showing);
          if (!showing) onShow();
        }}
      >
        {icon}
      </button>
    );
  };
  return (
    <>
      <nav className="rail" aria-label="Sidebar sections">
        <button
          type="button"
          className="rail-btn"
          aria-label="Show or hide the sidebar"
          aria-expanded={expanded}
          title="Show or hide the sidebar"
          onClick={onToggle}
        >
          <SidebarSimpleIcon aria-hidden="true" />
        </button>
        {railButton(
          "File Explorer",
          <FolderIcon aria-hidden="true" />,
          filesOpen,
          setFilesOpen,
          filesUnavailable,
        )}
        {railButton(
          "Source Explorer",
          <GitCommitIcon aria-hidden="true" />,
          historyOpen,
          setHistoryOpen,
          historyUnavailable,
        )}
        {railButton(
          "Record Explorer",
          <DatabaseIcon aria-hidden="true" />,
          recordsOpen,
          setRecordsOpen,
          recordsUnavailable,
        )}
      </nav>
      <aside className={className}>
        <Explorer
          title="File Explorer"
          icon={<FolderIcon aria-hidden="true" />}
          unavailable={filesUnavailable}
          open={filesOpen}
          onToggle={() => setFilesOpen(!filesOpen)}
          grow={filesGrow}
          sectionRef={filesSection}
          scrolls
          actions={
            <FilterButton what="files" shown={filesFilter.shown} onToggle={filesFilter.toggle} />
          }
        >
          {filesFilter.shown ? (
            <FilterBox
              what="files"
              term={filesFilter.term}
              setTerm={filesFilter.setTerm}
              onHide={filesFilter.hide}
            />
          ) : null}
          {filesKey === undefined ? null : (
            <FileTree
              rootKey={filesKey}
              openKey={fileKey}
              onOpen={onOpen}
              term={filesFilter.term}
            />
          )}
        </Explorer>
        {splitterAfter(filesSection)}
        <Explorer
          title="Source Explorer"
          icon={<GitCommitIcon aria-hidden="true" />}
          unavailable={historyUnavailable}
          open={historyOpen}
          onToggle={() => setHistoryOpen(!historyOpen)}
          grow={historyGrow}
          sectionRef={historySection}
          scrolls
          actions={
            <FilterButton
              what="commits"
              shown={commitsFilter.shown}
              onToggle={commitsFilter.toggle}
            />
          }
        >
          {commitsFilter.shown ? (
            <FilterBox
              what="commits"
              term={commitsFilter.term}
              setTerm={commitsFilter.setTerm}
              onHide={commitsFilter.hide}
            />
          ) : null}
          {historyKey === undefined ? null : (
            <History
              historyKey={historyKey}
              openKey={openKey}
              onOpen={onOpen}
              term={commitsFilter.term}
            />
          )}
        </Explorer>
        {splitterAfter(historySection)}
        <Explorer
          title="Record Explorer"
          icon={<DatabaseIcon aria-hidden="true" />}
          unavailable={recordsUnavailable}
          grow={recordsGrow}
          sectionRef={recordsSection}
          open={recordsOpen}
          onToggle={() => setRecordsOpen(!recordsOpen)}
        >
          <div className="sidebar-section">
            <div className="section-label">
              Collections
              <span className="count">{upper.items.length > 0 ? upper.items.length : ""}</span>
            </div>
            <div className="faint mono pane-path">{upperKey}</div>
            <div className="type-list" ref={upperList}>
              {lowerRow === undefined ? null : (
                <ActiveBox list={upperList} activeKey={lowerRow} rows={`${upper.items.length}`} />
              )}
              <Pane
                pages={upper}
                empty={`Loading ${upperKey ?? ""}…`}
                {...{ held, openKey, onOpen, onList }}
                term=""
                lowerKey={lowerRow}
                pageable={false}
                hidden={IN_OTHER_EXPLORERS}
              />
            </div>
          </div>
          <div className="sidebar-section grow">
            <div className="section-label">
              Items
              <span className="label-end">
                <span className="count">
                  {lower.items.length > 0 ? `${lower.items.length}${lower.next ? "+" : ""}` : ""}
                </span>
                {lowerKey === undefined ? null : (
                  <FilterButton
                    what="items"
                    shown={itemsFilter.shown}
                    onToggle={itemsFilter.toggle}
                  />
                )}
              </span>
            </div>
            {itemsFilter.shown && lowerKey !== undefined ? (
              <FilterBox
                what="items"
                term={itemsFilter.term}
                setTerm={itemsFilter.setTerm}
                onHide={itemsFilter.hide}
              />
            ) : null}
            <div className="faint mono pane-path">{lowerKey ?? ""}</div>
            <div className="res-list" ref={lowerList}>
              {lowerKey === undefined ? (
                <div className="empty-note">Pick a collection above to list its items.</div>
              ) : (
                <>
                  <ActiveBox
                    list={lowerList}
                    activeKey={openKey}
                    rows={`${lower.items.length} ${term}`}
                  />
                  <Pane
                    pages={lower}
                    empty=""
                    {...{ held, term, openKey, onOpen, onList }}
                    lowerKey={lowerRow}
                    pageable
                  />
                </>
              )}
            </div>
          </div>
        </Explorer>
      </aside>
    </>
  );
}

/**
 * How long a section takes to open or fold, in milliseconds: workspace.css's `.explorer`
 * transition.
 */
const SECTION_MOTION_MS = 220;

/**
 * A section of the sidebar that folds under its header. While `unavailable` is set, the header is
 * disabled and says why, and the section stays folded.
 */
function Explorer({
  title,
  icon,
  open = false,
  unavailable,
  onToggle,
  scrolls = false,
  grow,
  sectionRef,
  actions,
  children,
}: {
  title: string;
  icon: ReactNode;
  open?: boolean;
  unavailable?: string;
  onToggle?: () => void;
  /** Whether the section's body scrolls as a whole, rather than a list inside it. */
  scrolls?: boolean;
  /** How many shares of the height the open sections divide this one takes. */
  grow: number;
  sectionRef: RefObject<HTMLElement | null>;
  /** Controls at the right of the header while the section is open, such as its filter's button. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const shown = open && unavailable === undefined;
  const why = useId();
  // The body stays drawn while the section shrinks to its header, so it does not vanish first.
  const [mounted, setMounted] = useState(shown);
  // True while the section opens or folds, the only time its share changes by transition: a drag
  // of the border must move it at once.
  const [moving, setMoving] = useState(false);
  const was = useRef(shown);
  const top = useRef<HTMLDivElement>(null);
  // The header's height, which the section keeps while it shrinks to nothing else.
  const topHeight = useRef(0);
  useEffect(() => {
    const changed = was.current !== shown;
    was.current = shown;
    if (shown) setMounted(true);
    if (!changed) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMounted(shown);
      return;
    }
    setMoving(true);
    const timer = setTimeout(() => {
      setMoving(false);
      if (!shown) setMounted(false);
    }, SECTION_MOTION_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  useLayoutEffect(() => {
    if (!mounted || shown) topHeight.current = top.current?.offsetHeight ?? topHeight.current;
  });
  const closing = mounted && !shown;
  return (
    <section
      ref={sectionRef}
      className={["explorer", shown ? "open" : "", closing ? "closing" : "", moving ? "moving" : ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        flexGrow: shown ? grow : 0,
        minHeight: closing ? topHeight.current : undefined,
      }}
      aria-label={title}
    >
      <div ref={top} className="explorer-top">
        <div className="explorer-headrow">
          <button
            type="button"
            className="explorer-head"
            aria-expanded={shown}
            disabled={unavailable !== undefined}
            aria-describedby={unavailable === undefined ? undefined : why}
            onClick={onToggle}
          >
            <CaretRightIcon className={shown ? "caret open" : "caret"} aria-hidden="true" />
            {icon}
            <span className="explorer-title">{title}</span>
          </button>
          {shown && actions !== undefined ? (
            <span className="explorer-actions">{actions}</span>
          ) : null}
        </div>
        {unavailable === undefined ? null : (
          <div id={why} className="explorer-note">
            {unavailable}
          </div>
        )}
      </div>
      {mounted ? (
        <div className={scrolls ? "explorer-body scrolls" : "explorer-body"}>{children}</div>
      ) : null}
    </section>
  );
}

/**
 * Each section's share of the height the open sections divide, until a border is moved. Record
 * Explorer holds two panes, Collections and Items, so it starts with twice the share of the others.
 */
const FILES_SHARE = 1;
const HISTORY_SHARE = 1;
const RECORDS_SHARE = 2;

/** An open sidebar section, as the border below or above it sees it. */
interface Share {
  name: string;
  /** The section's share before any border is moved. */
  initial: number;
  grow: number;
  setGrow: (next: number) => void;
  element: RefObject<HTMLElement | null>;
}

/** The fewest pixels a drag leaves an open section: its header and a row or two. */
const MIN_SECTION = 72;
/** How far one press of an arrow key moves a border, in pixels. */
const SPLITTER_STEP = 16;

/**
 * The border between two open sidebar sections, which a drag or the window splitter pattern's keys
 * move: Up and Down by SPLITTER_STEP, Home and End as far up or down as it goes. The two sections
 * divide their height in the new proportion, and keep it on the next visit; each keeps at least
 * MIN_SECTION pixels. A folded section between them moves with the border. A double-click returns
 * the two sections to their initial proportion of the height they share, so no other border moves.
 */
function Splitter({ above, below }: { above: Share; below: Share }) {
  const drag = useRef<{ y: number; a: number; b: number } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const sizes = () => ({
    a: above.element.current?.getBoundingClientRect().height ?? 0,
    b: below.element.current?.getBoundingClientRect().height ?? 0,
  });
  // Gives `above` `delta` more pixels of the two sections' height, and `below` that many fewer.
  const move = (from: { a: number; b: number }, delta: number) => {
    const total = from.a + from.b;
    if (total < 2 * MIN_SECTION) return;
    const a = Math.min(Math.max(from.a + delta, MIN_SECTION), total - MIN_SECTION);
    const grow = above.grow + below.grow;
    above.setGrow((grow * a) / total);
    below.setGrow((grow * (total - a)) / total);
  };
  const reset = () => {
    const grow = above.grow + below.grow;
    const initial = above.initial + below.initial;
    above.setGrow((grow * above.initial) / initial);
    below.setGrow((grow * below.initial) / initial);
  };
  const stop = () => {
    drag.current = undefined;
    setDragging(false);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> takes no focus or drag; this is the ARIA window splitter pattern.
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={`Resize ${above.name} and ${below.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((100 * above.grow) / (above.grow + below.grow))}
      tabIndex={0}
      className={dragging ? "splitter dragging" : "splitter"}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, ...sizes() };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (start !== undefined) move(start, e.clientY - start.y);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={reset}
      onKeyDown={(e) => {
        const from = sizes();
        const delta =
          e.key === "ArrowUp"
            ? -SPLITTER_STEP
            : e.key === "ArrowDown"
              ? SPLITTER_STEP
              : e.key === "Home"
                ? MIN_SECTION - from.a
                : e.key === "End"
                  ? from.b - MIN_SECTION
                  : undefined;
        if (delta === undefined) return;
        e.preventDefault();
        move(from, delta);
      }}
    />
  );
}

/** The collections the File and Source Explorers list, which Record Explorer leaves out. */
const IN_OTHER_EXPLORERS: ReadonlySet<string> = new Set([FILE_TYPE, COMMIT_TYPE]);

function Pane({
  pages,
  empty,
  held,
  term,
  openKey,
  lowerKey,
  onOpen,
  onList,
  pageable,
  hidden,
}: {
  pages: Pages<CollectionItem>;
  empty: string;
  held: HeldIndex;
  term: string;
  openKey: string;
  lowerKey: string | undefined;
  onOpen: (key: string) => void;
  onList: (key: string) => void;
  pageable: boolean;
  /** The types of the items not listed here. */
  hidden?: ReadonlySet<string>;
}) {
  const needle = term.trim().toLowerCase();
  const rows = pages.items.filter((item) => {
    // Only a row for a collection is left out, not a resource of the same type, such as a file
    // listed in a directory.
    if (item.id === undefined && typeof item.data.type === "string" && hidden?.has(item.data.type))
      return false;
    if (!needle) return true;
    const d = item.data;
    const text =
      item.id !== undefined
        ? `${item.id} ${String(d.name ?? d.value ?? labelFor(held.get(item.key)?.attrs))}`
        : `${String(d.type ?? d.name ?? d.slug ?? item.href)} ${String(d.slug ?? "")}`;
    return text.toLowerCase().includes(needle);
  });
  return (
    <>
      {rows.map((item) =>
        item.id !== undefined ? (
          <ResourceRow
            key={item.key}
            itemKey={item.key}
            view={itemView(item, held.get(item.key))}
            unresolved={held.get(item.key)?.attrs === undefined}
            active={item.key === openKey}
            onOpen={onOpen}
          />
        ) : (
          <button
            key={item.key}
            type="button"
            data-key={item.key}
            className={item.key === lowerKey ? "type-row active" : "type-row"}
            title={item.key}
            onClick={() => onList(item.key)}
          >
            <span
              className="type-swatch"
              style={{
                background:
                  typeof item.data.type === "string" ? typeColour(item.data.type) : undefined,
              }}
            />
            <span className="tname">
              {String(item.data.type ?? item.data.name ?? item.data.slug ?? item.href)}
            </span>
          </button>
        ),
      )}
      {pages.error !== undefined ? (
        <div className="empty-note">Fetch failed: {pages.error}</div>
      ) : pages.loading ? (
        pages.items.length === 0 && empty ? (
          <div className="empty-note">{empty}</div>
        ) : (
          <Spinner>loading…</Spinner>
        )
      ) : pages.items.length === 0 ? (
        <div className="empty-note">Nothing in this collection.</div>
      ) : rows.length === 0 ? (
        <div className="empty-note">No matching item.</div>
      ) : null}
      {pageable && pages.next !== undefined && !pages.loading ? (
        <button type="button" className="tbtn primary load-more" onClick={pages.more}>
          Load more
        </button>
      ) : null}
    </>
  );
}

function ResourceRow({
  itemKey,
  view,
  unresolved,
  active,
  title,
  onOpen,
}: {
  itemKey: string;
  view: { chipType: string; chipText?: string | undefined; title: string; sub: string };
  unresolved: boolean;
  active: boolean;
  title?: string;
  onOpen: (key: string) => void;
}) {
  const cls = ["res-item", unresolved ? "unresolved" : "", active ? "active" : ""].filter(Boolean);
  return (
    <button
      data-key={itemKey}
      type="button"
      className={cls.join(" ")}
      title={title}
      onClick={() => onOpen(itemKey)}
    >
      <Badge type={view.chipType} text={view.chipText} />
      <span className="rtext">
        <span className="rid">{view.title}</span>
        <span className="rlabel">{view.sub}</span>
      </span>
    </button>
  );
}

/**
 * A resource as the graph's popover draws it: its type's chip, handle and type, then its
 * properties. A resource known only by a link to it is fetched when it is first hovered.
 */
function HoverCard({ itemKey, held }: { itemKey: string; held: HeldIndex }) {
  const r = held.get(itemKey);
  const entry = useDocument(r?.attrs === undefined ? resourcePath(itemKey) : undefined);
  return (
    <div className="hover-card">
      <div className="card-head">
        <Badge type={r?.type} />
        <span className="cid mono">{nameOf(itemKey, held.get(itemKey)?.type)}</span>
        <span className="clabel">{r?.type}</span>
      </div>
      <div className="panel-body">
        {entry?.status === "failed" ? (
          <div className="empty-panel">Fetch failed: {entry.error}</div>
        ) : r?.attrs === undefined ? (
          <Spinner>fetching {shortId(itemKey)}…</Spinner>
        ) : (
          <PropRows attrs={r.attrs} prose={proseFor(held, itemKey, () => {})} />
        )}
      </div>
    </div>
  );
}

const PILL_KEYS = ["kind", "outcome", "resolution_kind", "status", "role"] as const;

/** The icon a pill's value is drawn with, for the values the graph holds; any other has none. */
const PILL_ICON: Record<string, Icon | undefined> = {
  pass: CheckCircleIcon,
  fail: XCircleIcon,
  observation: EyeIcon,
  observations: EyeIcon,
  analysis: ChartLineIcon,
  "analysis-output": ChartLineIcon,
  exploratory: CompassIcon,
  confirmatory: SealCheckIcon,
  answered: ChatCircleTextIcon,
  completed: FlagCheckeredIcon,
};

function Detail({
  path,
  entry,
  isCollection,
  held,
  tab,
  prose,
  onTab,
  onOpen,
}: {
  path: string;
  entry: ReturnType<typeof useDocument>;
  isCollection: boolean;
  held: HeldIndex;
  tab: Tab;
  prose: Prose;
  onTab: (tab: Tab) => void;
  onOpen: (key: string) => void;
}) {
  if (path === "") return null;
  if (isCollection)
    return (
      <div className="empty-panel first">
        Pick a collection in Record Explorer, then an item, to open it here.
      </div>
    );
  if (entry?.status === "failed")
    return (
      <div className="fetch-error">
        <div className="title">Fetch failed</div>
        <div>{entry.error}</div>
        <div className="requested">
          Requested <span className="mono">{resourcePath(path)}</span>.
        </div>
      </div>
    );

  const res = held.get(path);
  const loaded = res?.own === true;
  if (entry?.status === "ready" && !loaded)
    return (
      <div className="fetch-error">
        <div className="title">Not a resource</div>
        <div>
          The response has a type but names no resource at <span className="mono">{path}</span>: it
          has no <span className="mono">id</span>, or its <span className="mono">self</span> link is
          another address.
        </div>
        <div className="requested">
          Requested <span className="mono">{resourcePath(path)}</span>.
        </div>
      </div>
    );
  // Until the resource's own response arrives, the page keeps the layout it will have: the header,
  // the tabs, and Properties with placeholder rows when no properties are held yet.
  const attrs = res?.attrs;
  const apart = SHOWN_APART[res?.type ?? ""] ?? [];
  // A file's text and a commit's diff are drawn in panels of their own, not as property rows.
  const a =
    attrs === undefined
      ? undefined
      : Object.fromEntries(Object.entries(attrs).filter(([k]) => !apart.includes(k)));
  const doc = docOf(entry);
  const pills = PILL_KEYS.filter((k) => typeof a?.[k] === "string" && a[k]);
  return (
    <>
      <div className="detail-header">
        <div className="header-top">
          <Badge type={res?.type} />
          <span className="header-id">{nameOf(path, res?.type)}</span>
          <span className="header-type">{res?.type}</span>
          {pills.map((k) => {
            const v = String(a?.[k]);
            const variant = k === "kind" || k === "outcome" ? ` ${k}-${v}` : "";
            const Glyph = PILL_ICON[v];
            return (
              <span key={k} className={`pill${variant}`} title={k}>
                {Glyph === undefined ? null : <Glyph aria-hidden="true" />}
                {v}
              </span>
            );
          })}
          {/* Overview and Debug are views of the resource, so they are tabs; Reload is an action. */}
          <div className="header-actions">
            <div className="view-tabs" role="tablist" aria-label="View">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "overview"}
                className={tab === "overview" ? "view-tab on" : "view-tab"}
                onClick={() => onTab("overview")}
              >
                Overview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "debug"}
                aria-label="Debug"
                title="Debug: the API's response, and the events that changed this"
                className={tab === "debug" ? "view-tab on" : "view-tab"}
                onClick={() => onTab("debug")}
              >
                <WrenchIcon aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              className="view-action"
              title="Reload from the API"
              aria-label="Reload from the API"
              onClick={() =>
                store.reload((p) => p === resourcePath(path) || p.startsWith(`${path}/events`))
              }
            >
              <ArrowClockwiseIcon aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {tab === "debug" && res !== undefined ? (
        <Debug res={res} entry={entry} onOpen={onOpen} />
      ) : (
        <>
          <div className="panel">
            <div className="panel-head">
              Properties<span>{a === undefined ? "" : Object.keys(a).length}</span>
            </div>
            <div className="panel-body">
              {a === undefined ? (
                <SkeletonRows count={propertyCountOf(held, res?.type)} />
              ) : (
                <PropRows attrs={a} prose={prose} />
              )}
            </div>
          </div>
          {loaded && attrs !== undefined && doc !== undefined && res?.type === FILE_TYPE ? (
            <FileView doc={doc} attrs={attrs} onOpen={onOpen} />
          ) : null}
          {loaded && attrs !== undefined && doc !== undefined && res?.type === COMMIT_TYPE ? (
            <CommitView doc={doc} attrs={attrs} onOpen={onOpen} />
          ) : null}
          {loaded
            ? (["out", "in"] as const).flatMap((dir) =>
                relGroups(res, dir)
                  .filter((g) => !(RELATIONS_APART[res.type ?? ""] ?? []).includes(g.rel))
                  .map((g) => (
                    <div key={`${dir} ${g.rel}`}>
                      <div className="rel-heading">
                        {dir === "out" ? (
                          <ArrowRightIcon className="rel-arrow" aria-label="outbound" />
                        ) : (
                          <ArrowLeftIcon className="rel-arrow" aria-label="inbound" />
                        )}
                        {humanRel(g.rel)} <span className="faint">{g.keys.length}</span>
                      </div>
                      {g.keys.map((key) => (
                        <RelCard key={key} relKey={key} held={held} prose={prose} onOpen={onOpen} />
                      ))}
                    </div>
                  )),
              )
            : null}
        </>
      )}
    </>
  );
}

/**
 * How many properties a resource of `type` has, from a held resource of that type whose own
 * response has arrived, so the placeholder is about as tall as what replaces it. Four otherwise.
 */
function propertyCountOf(held: HeldIndex, type: string | undefined): number {
  for (const r of held.values())
    if (r.own && r.type === type && r.attrs !== undefined) return Object.keys(r.attrs).length;
  return 4;
}

/** Property rows drawn as grey bars, standing in while the properties are fetched. */
function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="skeleton" role="status" aria-busy="true" aria-label="Loading the properties">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="kv">
          <div className="k">
            <span className="bar" style={{ width: `${50 + ((i * 37) % 40)}%` }} />
          </div>
          <div className="v">
            <span className="bar" style={{ width: `${45 + ((i * 53) % 50)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A related resource with its properties, or a chip that loads it when its properties are not held. */
function RelCard({
  relKey,
  held,
  prose,
  onOpen,
}: {
  relKey: string;
  held: HeldIndex;
  prose: Prose;
  onOpen: (key: string) => void;
}) {
  const r = held.get(relKey);
  if (r?.attrs === undefined)
    return (
      <button type="button" className="rel-chip unresolved" onClick={() => onOpen(relKey)}>
        <Badge type={r?.type} />
        <span className="cid mono">{nameOf(relKey, r?.type)}</span>
        <span className="clabel">not yet fetched — GET {resourcePath(relKey)}</span>
      </button>
    );
  return (
    <div className="panel">
      <button type="button" className="card-head" onClick={() => onOpen(relKey)}>
        <Badge type={r.type} />
        <span className="cid mono">{nameOf(relKey, r?.type)}</span>
        <span className="clabel">{r.type}</span>
      </button>
      <div className="panel-body">
        <PropRows attrs={r.attrs} prose={prose} />
      </div>
    </div>
  );
}

/** The response as it arrived, folded, then the record's events, which are what Debug is usually for. */
function Debug({
  res,
  entry,
  onOpen,
}: {
  res: Held;
  entry: ReturnType<typeof useDocument>;
  onOpen: (key: string) => void;
}) {
  const [responseOpen, setResponseOpen] = useState(false);
  const doc = entry?.status === "ready" ? entry.doc : undefined;
  const self = resourcePath(res.key);
  return (
    <>
      <ContentCard
        className="response-card"
        title={
          <span className="response-title">
            <BracketsCurlyIcon aria-hidden="true" /> response
          </span>
        }
        toggleLabel="Show or hide the response"
        open={responseOpen}
        onToggle={() => setResponseOpen((o) => !o)}
        actions={
          <a href={self} target="_blank" rel="noopener" title="Open in a new tab">
            {self}
          </a>
        }
      >
        {doc === undefined ? <Spinner>loading…</Spinner> : <JsonView value={doc} preview={40} />}
      </ContentCard>
      {res.eventsHref === undefined ? null : (
        <Events href={res.eventsHref} current={res.key} onOpen={onOpen} />
      )}
    </>
  );
}

const readEvents = (doc: HalDocument) => {
  const events = doc._embedded?.events;
  const next = doc._links?.next;
  return {
    items: (Array.isArray(events) ? events : []) as HalDocument[],
    next: Array.isArray(next) ? next[0]?.href : next?.href,
  };
};

/**
 * A record's or a commit's events, from its `events` link: one row per change, oldest first, a page
 * of acts at a time. Under them, the commits the acts ran against, each with its acts.
 */
function Events({
  href,
  current,
  onOpen,
}: {
  href: string;
  /** The open resource, whose chip in each event is marked rather than linked. */
  current: string;
  onOpen: (key: string) => void;
}) {
  const path = requestPath(href);
  const events = usePages(path, readEvents);
  const commits = commitsRanAgainst(events.items, current);
  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <a href={path} target="_blank" rel="noopener" title="Open in a new tab">
            {path}
          </a>
          <span>events{events.items.length > 0 ? ` · ${events.items.length}` : ""}</span>
        </div>
        <div className="panel-body">
          {events.items.map((e) => (
            <EventRow
              key={`${String(e.seq)}.${String(e.index)}`}
              event={e}
              current={current}
              onOpen={onOpen}
            />
          ))}
          {events.error !== undefined ? (
            <div className="empty-panel">Fetch failed: {events.error}</div>
          ) : events.loading ? (
            <Spinner>loading events…</Spinner>
          ) : events.items.length === 0 ? (
            <div className="empty-panel">No event names this record.</div>
          ) : null}
          {!events.loading && events.next !== undefined ? (
            <button type="button" className="tbtn primary events-more" onClick={events.more}>
              Load more acts
            </button>
          ) : null}
        </div>
      </div>
      {commits.length === 0 ? null : (
        <div className="panel">
          <div className="panel-head">
            Commits the acts ran against<span>{commits.length}</span>
          </div>
          <div className="panel-body">
            {commits.map(({ commit, acts }) => (
              <div key={commit} className="ev ran-against">
                <button
                  type="button"
                  className="mention"
                  style={{ "--mention": typeColour(COMMIT_TYPE) } as CSSProperties}
                  title={COMMIT_TYPE}
                  onClick={() => onOpen(commit)}
                >
                  {nameOf(commit, COMMIT_TYPE)}
                </button>
                <span>
                  {acts.map((act) => (
                    <button
                      key={act.key}
                      type="button"
                      className="ref mono"
                      title="Open the act"
                      onClick={() => onOpen(act.key)}
                    >
                      #{act.seq}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The resources explored in this workspace, with what each relates to, drawn on a canvas. The
 * canvas keeps its layout as the reader moves from one resource to the next, and while the card is
 * folded, until Reset starts it again from the open resource.
 */
function GraphCard({
  open,
  workspace,
  explored,
  generation,
  held,
  selected,
  playback,
  canPlay,
  onToggle,
  onOpen,
  onReset,
  onPlay,
  onPause,
}: {
  open: boolean;
  workspace: string;
  explored: string[];
  generation: number;
  held: HeldIndex;
  selected: string;
  playback: Playback;
  /** True when a resource or the acts collection is open: playback starts from either. */
  canPlay: boolean;
  onToggle: () => void;
  onOpen: (key: string) => void;
  onReset: () => void;
  onPlay: () => void;
  onPause: () => void;
}) {
  const playing = playback.state === "playing";
  const status = playing ? playback.act : playback.note;
  const [overlay, setOverlay] = useState<Overlay>("structural");
  // An act is drawn as its subject, whose own response is fetched so its relations are drawn too.
  const drawn = explored.flatMap((key) => drawnAs(held, key) ?? []);
  const shown = drawnAs(held, selected) ?? selected;
  const drawnJoined = drawn.join("\n");
  useEffect(() => {
    for (const key of drawnJoined.split("\n"))
      if (key !== "" && store.entry(resourcePath(key)) === undefined) store.load(resourcePath(key));
  }, [drawnJoined]);
  const { nodes, edges } = useMemo(
    () => graphOf(held, drawnJoined.split("\n"), workspace),
    [held, drawnJoined, workspace],
  );
  return (
    <ContentCard
      className="graph-card"
      title={
        <>
          Graph <span className="faint">{nodes.length}</span>
        </>
      }
      toggleLabel="Show or hide the graph"
      open={open}
      onToggle={onToggle}
      keep
      flush
      actions={
        <span className="graph-controls">
          colour
          {(
            [
              ["structural", "kind"],
              ["temporal", "temporal"],
            ] as const
          ).map(([o, label]) => (
            <button
              key={o}
              type="button"
              data-overlay={o}
              aria-pressed={overlay === o}
              className={overlay === o ? "tbtn on" : "tbtn"}
              onClick={() => setOverlay(o)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="tbtn"
            title="Draw the open resource alone, and forget what else was explored"
            onClick={onReset}
          >
            <ArrowCounterClockwiseIcon aria-hidden="true" /> Reset
          </button>
        </span>
      }
      // Playback's controls sit under the canvas, so the act's name, which changes length at every
      // step, never moves the header's controls. They stay while the card is folded.
      footer={
        <div className="graph-foot">
          <button
            type="button"
            className={playing ? "tbtn on" : "tbtn"}
            title={
              playing
                ? "Stop stepping through the acts"
                : canPlay
                  ? "Step through the later acts, one at a time"
                  : "No act changed this or ran against it, so there are no acts to step through from here"
            }
            disabled={!playing && !canPlay}
            onClick={playing ? onPause : onPlay}
          >
            {playing ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
            {playing ? "Pause" : "Play"}
          </button>
          <span className="playback-status" aria-live="polite">
            {status}
          </span>
        </div>
      }
    >
      <div className="graph-stage">
        <GraphView
          key={`${workspace} ${generation}`}
          nodes={nodes}
          edges={edges}
          selectedId={shown}
          overlay={overlay}
          active={open}
          summary={(id) => <HoverCard itemKey={id} held={held} />}
          // While playback runs, the card of what it opened stands in for the open resource's
          // page below the graph, until the pointer comes onto the canvas.
          pinnedId={playing ? shown : null}
          onNavigate={onOpen}
        />
      </div>
      {open ? (
        <ul className="sr-only" aria-label="Nodes in the graph">
          {nodes.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onOpen(n.id)}>
                {`${n.label} (${n.type})`}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </ContentCard>
  );
}

/**
 * The explored resources in a workspace and their relations, as the canvas's nodes and edges. A
 * resource adds its relations once its own response has arrived.
 */
function graphOf(
  held: HeldIndex,
  explored: string[],
  workspace: string,
): { nodes: GraphNodeSeed[]; edges: GraphEdgeSeed[] } {
  const nodes = new Map<string, GraphNodeSeed>();
  const edges: GraphEdgeSeed[] = [];
  const node = (key: string) => {
    if (!nodes.has(key)) {
      const type = held.get(key)?.type ?? "?";
      const label = nameOf(key, type);
      nodes.set(key, { id: key, label, type });
    }
  };
  for (const key of explored) {
    const r = held.get(key);
    if (r?.own !== true || !key.startsWith(workspace)) continue;
    node(r.key);
    for (const rel of r.rels) {
      // An act is drawn as its subject, so a relation to an act ends at the act's subject; one
      // whose subject is not known yet is not drawn.
      const other = drawnAs(held, rel.key);
      if (other === undefined) continue;
      node(other);
      const [from, to] = rel.dir === "in" ? [other, r.key] : [r.key, other];
      edges.push({ from, to, label: edgeLabelOf(rel.rel, rel.dir) });
    }
  }
  return { nodes: [...nodes.values()], edges };
}
