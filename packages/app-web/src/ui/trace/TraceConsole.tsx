/**
 * The Trace Console: the API's HAL documents, followed by link. The left column lists collections.
 * The centre shows the graph of what the reader has opened, then the open resource with the
 * resources it relates to. The page's address is the API path of what is open, so a reload or a
 * pasted link opens it again.
 */

import { ICONS, ThemeToggle } from "@labkit/ui";
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
  EyeIcon,
  FlagCheckeredIcon,
  HouseIcon,
  type Icon,
  IconContext,
  MagnifyingGlassIcon,
  PauseIcon,
  PlayIcon,
  SealCheckIcon,
  SidebarSimpleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import markUrl from "@labkit/design/mark.svg";
import "@labkit/design/tokens.css";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSavedTheme } from "../saved-theme";
import { GraphView, type GraphEdgeSeed, type GraphNodeSeed, type Overlay } from "../GraphView";
import {
  type CollectionItem,
  collectionOf,
  drawnAs,
  edgeLabelOf,
  type HalDocument,
  type Held,
  type HeldIndex,
  humanRel,
  itemView,
  keyOf,
  labelFor,
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
import { type Playback, usePlayback } from "./playback";
import { proseSegments } from "./prose";
import { Badge, EventRow, JsonView, PropRows, type Prose } from "./values";
import "./trace.css";

/** Where the left column starts: the list of workspaces. */
const ENTRY = "/collections/workspace";

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
 * The history entries this page has seen, by their position in the browser's history, which enable
 * or disable the Back and Forward buttons. The browser does not let a page read its history, so
 * the page keeps the path it showed at each position: an entry is replaced when the page arrives at
 * its position again by a new navigation, and the entries after it are dropped, as the browser
 * drops them. The position and the path are read from one location, so a render between two
 * navigations never pairs one's position with the other's path.
 */
function useTrail(): { trail: string[]; at: number } {
  const here = useRouterState({
    select: (s) =>
      `${(s.location.state as { __TSR_index?: number }).__TSR_index ?? 0} ${s.location.pathname}`,
  });
  const space = here.indexOf(" ");
  const at = Number(here.slice(0, space));
  const path = here.slice(space + 1);
  const [trail, setTrail] = useState<string[]>([]);
  useEffect(() => {
    setTrail((t) => {
      if (t[at] === path) return t;
      const next = t.slice(0, at);
      next[at] = path;
      return next;
    });
  }, [at, path]);
  return { trail, at };
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

export interface TraceConsoleProps {
  /** The API path of what is open, or "" when nothing is. */
  path: string;
  /** The API path of the collection the left column lists, when one was picked. */
  list: string | undefined;
  tab: Tab;
}

export function TraceConsole({ path, list, tab }: TraceConsoleProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const [theme, setTheme] = useSavedTheme();
  const [term, setTerm] = useState("");
  const [drawer, setDrawer] = useState<"items" | undefined>();
  const [graphOpen, setGraphOpen] = useState(true);
  const explored = useExplored(path);
  const workspace = workspaceOf(path);
  useStoreVersion();
  const held = store.index();

  const openEntry = useDocument(path === "" ? undefined : resourcePath(path));
  const openDoc = docOf(openEntry);
  const openIsCollection = openDoc !== undefined && typeof openDoc.type !== "string";

  // Opening what is already open adds no history entry. Opening a resource of another type than
  // the listed collection's lists the collection that one is listed in instead, which closes the
  // Items pane: the reader is following relations, not reading down the list.
  const shownList = openIsCollection ? path : list;
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
      search: (s) => ({ ...s, list: nextList }),
    });
  };
  const playback = usePlayback(path, workspace, open);
  // A collection picked, or the workspaces on going home, is fetched again: what it lists changes
  // as records are written, and its rows stay on screen until the new page arrives.
  const pickList = (key: string) => {
    store.load(requestPath(key), true);
    void navigate({ to: ".", search: (s) => ({ ...s, list: key }), replace: true });
  };
  const pickTab = (next: Tab) =>
    void navigate({
      to: ".",
      search: (s) => ({ ...s, tab: next === "overview" ? undefined : next }),
      replace: true,
    });
  const home = () => {
    setDrawer(undefined);
    store.load(requestPath(ENTRY), true);
    void navigate({ to: "/$", params: { _splat: "" }, search: {} });
  };

  const { trail, at } = useTrail();
  const canBack = trail.slice(0, at).some((e) => e !== undefined);
  const canForward = trail.slice(at + 1).some((e) => e !== undefined);

  const listKey = openIsCollection ? path : (list ?? ENTRY);
  const prose = proseFor(held, path, open);

  return (
    <IconContext.Provider value={ICONS}>
      <div className="lk-root trace" data-theme={theme === "system" ? undefined : theme}>
        <header className="topbar">
          <button
            type="button"
            className="hamburger"
            aria-label="Toggle collections column"
            onClick={() => setDrawer((d) => (d === "items" ? undefined : "items"))}
          >
            <SidebarSimpleIcon aria-hidden="true" />
          </button>
          <div className="brand">
            <img className="brand-mark" src={markUrl} alt="" />
            <span className="brand-name">Trace Console</span>
            <span className="brand-sub">live · {window.location.host}</span>
          </div>
          <div className="nav-controls">
            <button
              type="button"
              className="nav-btn"
              aria-label="Entry point"
              title="Back to the workspaces"
              onClick={home}
            >
              <HouseIcon aria-hidden="true" />
            </button>
            <button
              type="button"
              className="nav-btn"
              aria-label="Back"
              disabled={!canBack}
              onClick={() => router.history.back()}
            >
              <ArrowLeftIcon aria-hidden="true" />
            </button>
            <button
              type="button"
              className="nav-btn"
              aria-label="Forward"
              disabled={!canForward}
              onClick={() => router.history.forward()}
            >
              <ArrowRightIcon aria-hidden="true" />
            </button>
          </div>
          <span className="topbar-gap" />
          {import.meta.env.DEV ? <DevLinks /> : null}
          <div className="search-wrap">
            <MagnifyingGlassIcon className="icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Filter…"
              autoComplete="off"
              aria-label="Filter the lists"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <ThemeToggle theme={theme} onChange={setTheme} className="theme-btn" />
        </header>

        <div className="body">
          <button
            type="button"
            className={drawer === undefined ? "scrim" : "scrim open"}
            aria-label="Close the column"
            tabIndex={-1}
            onClick={() => setDrawer(undefined)}
          />
          <Lists
            className={drawer === "items" ? "sidebar open" : "sidebar"}
            listKey={listKey}
            root={listKey === ENTRY}
            openKey={path}
            held={held}
            term={term}
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
                  canPlay={held.get(path)?.own === true || (openIsCollection && listsActs(path))}
                  onToggle={() => setGraphOpen((o) => !o)}
                  onOpen={open}
                  onReset={explored.reset}
                  onPlay={playback.play}
                  onPause={playback.pause}
                />
              )}
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
        </div>
      </div>
    </IconContext.Provider>
  );
}

/** Pages that exist only in development; a host with no address bar reaches them from here. */
function DevLinks() {
  return (
    <nav className="dev-links" aria-label="Development pages">
      <Link to="/gallery">gallery</Link>
      <Link to="/gallery/sessions">sessions</Link>
      {/* A full page load: the agent page keeps the session it has open, and this starts one. */}
      <Link to="/agent/{-$sessionId}" params={{ sessionId: undefined }} reloadDocument>
        agent
      </Link>
    </nav>
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
  listKey,
  root,
  openKey,
  held,
  term,
  onOpen,
  onList,
}: {
  className: string;
  listKey: string;
  root: boolean;
  openKey: string;
  held: HeldIndex;
  term: string;
  onOpen: (key: string) => void;
  onList: (key: string) => void;
}) {
  const listEntry = useDocument(requestPath(listKey));
  // Until the picked collection's first page arrives, the collection it was picked from stays the
  // upper one, so the upper pane does not show the picked collection and then swap back.
  const shown = useRef<string | undefined>(undefined);
  const upperKey = root
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
  const upper = usePages(requestPath(upperKey), readCollection(upperKey));
  const lower = usePages(
    lowerKey === undefined ? undefined : requestPath(lowerKey),
    readCollection(listKey),
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
  useEffect(() => {
    if (behind) loadMore();
  }, [behind, loadMore]);

  return (
    <aside className={className}>
      <div className="sidebar-section">
        <div className="section-label">
          Collections
          <span className="count">{upper.items.length > 0 ? upper.items.length : ""}</span>
        </div>
        <div className="faint mono pane-path">{upperKey}</div>
        <div className="type-list">
          <Pane
            pages={upper}
            empty={`Loading ${ENTRY}…`}
            {...{ held, term, openKey, onOpen, onList }}
            lowerKey={lowerRow}
            pageable={false}
          />
        </div>
      </div>
      <div className="sidebar-section grow">
        <div className="section-label">
          Items
          <span className="count">
            {lower.items.length > 0 ? `${lower.items.length}${lower.next ? "+" : ""}` : ""}
          </span>
        </div>
        <div className="faint mono pane-path">{lowerKey ?? ""}</div>
        <div className="res-list">
          {lowerKey === undefined ? (
            <div className="empty-note">Pick a collection above to list its items.</div>
          ) : (
            <Pane
              pages={lower}
              empty=""
              {...{ held, term, openKey, onOpen, onList }}
              lowerKey={lowerRow}
              pageable
            />
          )}
        </div>
      </div>
    </aside>
  );
}

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
}) {
  const needle = term.trim().toLowerCase();
  const rows = pages.items.filter((item) => {
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
  // The row for the open resource scrolls into its list's view, so the list shows where it is:
  // smoothly, as playback steps down the list, unless the reader asks for reduced motion.
  const row = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [active]);
  return (
    <button
      ref={row}
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
        <span className="cid mono">{shortId(itemKey)}</span>
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
  if (path === "" || isCollection)
    return (
      <div className="empty-panel first">
        Pick a type on the left, then an item, to open it here.
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
  if (res?.attrs === undefined)
    return (
      <>
        <div className="detail-header">
          <div className="header-top">
            <Badge type={res?.type} />
            <span className="header-id">{shortId(path)}</span>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">GET {resourcePath(path)}</div>
          <div className="panel-body">
            <Spinner>fetching {shortId(path)}…</Spinner>
          </div>
        </div>
      </>
    );

  const a = res.attrs;
  const pills = PILL_KEYS.filter((k) => typeof a[k] === "string" && a[k]);
  return (
    <>
      <div className="detail-header">
        <div className="header-top">
          <Badge type={res.type} />
          <span className="header-id">{shortId(path)}</span>
          <span className="header-type">{res.type}</span>
          {pills.map((k) => {
            const v = String(a[k]);
            const variant = k === "kind" || k === "outcome" ? ` ${k}-${v}` : "";
            const Glyph = PILL_ICON[v];
            return (
              <span key={k} className={`pill${variant}`} title={k}>
                {Glyph === undefined ? null : <Glyph aria-hidden="true" />}
                {v}
              </span>
            );
          })}
        </div>
        <div className="toolbar" role="tablist">
          {(["overview", "debug"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "tbtn on" : "tbtn"}
              onClick={() => onTab(t)}
            >
              {t === "overview" ? "Overview" : "Debug"}
            </button>
          ))}
          <button
            type="button"
            className="tbtn"
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
      {tab === "debug" ? (
        <Debug res={res} entry={entry} onOpen={onOpen} />
      ) : (
        <>
          <div className="panel">
            <div className="panel-head">
              Properties<span>{Object.keys(a).length}</span>
            </div>
            <div className="panel-body">
              <PropRows attrs={a} prose={prose} />
            </div>
          </div>
          {loaded ? (
            (["out", "in"] as const).flatMap((dir) =>
              relGroups(res, dir).map((g) => (
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
          ) : (
            <Spinner>fetching {shortId(path)}…</Spinner>
          )}
        </>
      )}
    </>
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
        <span className="cid mono">{shortId(relKey)}</span>
        <span className="clabel">not yet fetched — GET {resourcePath(relKey)}</span>
      </button>
    );
  return (
    <div className="panel">
      <button type="button" className="card-head" onClick={() => onOpen(relKey)}>
        <Badge type={r.type} />
        <span className="cid mono">{shortId(relKey)}</span>
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
      <div className="panel">
        <div className="panel-head">
          <span className="response-head">
            <button
              type="button"
              className="toggle-btn"
              title="Show or hide the response"
              aria-label="Show or hide the response"
              aria-expanded={responseOpen}
              onClick={() => setResponseOpen((o) => !o)}
            >
              <CaretRightIcon
                className={responseOpen ? "caret open" : "caret"}
                aria-hidden="true"
              />
            </button>
            <a href={self} target="_blank" rel="noopener" title="Open in a new tab">
              {self}
            </a>
          </span>
          <button
            type="button"
            className="toggle-btn response-chip"
            aria-expanded={responseOpen}
            onClick={() => setResponseOpen((o) => !o)}
          >
            <BracketsCurlyIcon aria-hidden="true" />
            response
          </button>
        </div>
        {responseOpen ? (
          doc === undefined ? (
            <Spinner>loading…</Spinner>
          ) : (
            <JsonView value={doc} />
          )
        ) : null}
      </div>
      {res.eventsHref === undefined ? null : <Events href={res.eventsHref} onOpen={onOpen} />}
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

/** A record's events, from its `events` link: one row per change, oldest first, a page at a time. */
function Events({ href, onOpen }: { href: string; onOpen: (key: string) => void }) {
  const path = requestPath(href);
  const events = usePages(path, readEvents);
  return (
    <div className="panel">
      <div className="panel-head">
        <a href={path} target="_blank" rel="noopener" title="Open in a new tab">
          {path}
        </a>
        <span>events{events.items.length > 0 ? ` · ${events.items.length}` : ""}</span>
      </div>
      <div className="panel-body">
        {events.items.map((e) => (
          <EventRow key={`${String(e.seq)}.${String(e.index)}`} event={e} onOpen={onOpen} />
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
    <div className="panel graph-card">
      <div className="panel-head">
        <span className="graph-title">
          <button
            type="button"
            className="toggle-btn"
            aria-label="Show or hide the graph"
            aria-expanded={open}
            onClick={onToggle}
          >
            <CaretRightIcon className={open ? "caret open" : "caret"} aria-hidden="true" />
          </button>
          Graph<span className="faint">{nodes.length}</span>
        </span>
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
      </div>
      <div className="graph-stage" hidden={!open}>
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
      {/* Playback's controls sit under the canvas, so the act's name, which changes length at every
          step, never moves the header's controls. They stay while the card is folded. */}
      <div className="graph-foot">
        <button
          type="button"
          className={playing ? "tbtn on" : "tbtn"}
          title={
            playing
              ? "Stop stepping through the acts"
              : "Step through the later acts, one at a time"
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
    </div>
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
      nodes.set(key, { id: key, label: shortId(key), type: held.get(key)?.type ?? "?" });
    }
  };
  for (const key of explored) {
    const r = held.get(key);
    if (r?.own !== true || !key.startsWith(workspace)) continue;
    node(r.key);
    for (const rel of r.rels) {
      node(rel.key);
      const [from, to] = rel.dir === "in" ? [rel.key, r.key] : [r.key, rel.key];
      edges.push({ from, to, label: edgeLabelOf(rel.rel, rel.dir) });
    }
  }
  return { nodes: [...nodes.values()], edges };
}
