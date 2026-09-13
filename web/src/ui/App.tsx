import { useCallback, useEffect, useState } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import {
  LABEL_BY_COLLECTION,
  WALK_START_HREF,
  type CollectionSlug,
  type HypermediaRef,
  type ResourceDocument,
  type RootDocument,
} from "../hypermedia";
import { GraphView, type Overlay, type ViewMode } from "./GraphView";
import { ResourcePanel } from "./ResourcePanel";
import "./graph.css";

interface GraphState {
  nodes: { id: string; type: string; href: string }[];
  edges: { from: string; to: string; label: string }[];
}

const EMPTY_GRAPH: GraphState = { nodes: [], edges: [] };

async function getJson<T>(href: string): Promise<T> {
  const res = await fetch(href, { headers: { Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.trim() || res.statusText}`);
  const type = res.headers.get("content-type") ?? "";
  if (text.startsWith("<") && !type.includes("json")) {
    throw new Error(`expected JSON from ${href}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`expected JSON from ${href}`);
  }
}

function inferType(ref: HypermediaRef): string {
  const slug = ref.href.split("/").filter(Boolean)[0];
  if (slug && slug in LABEL_BY_COLLECTION) {
    return LABEL_BY_COLLECTION[slug as CollectionSlug];
  }
  return "Unknown";
}

function absorb(graph: GraphState, doc: ResourceDocument): GraphState {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  nodeMap.set(doc.id, { id: doc.id, type: doc.type, href: doc.href });
  const edgeKeys = new Set(graph.edges.map((e) => `${e.from}\0${e.label}\0${e.to}`));
  const edges = [...graph.edges];

  const addNeighbor = (ref: HypermediaRef) => {
    if (!nodeMap.has(ref.id)) {
      nodeMap.set(ref.id, { id: ref.id, type: inferType(ref), href: ref.href });
    }
  };

  for (const [label, refs] of Object.entries(doc.links.out ?? {})) {
    for (const ref of refs ?? []) {
      addNeighbor(ref);
      const key = `${doc.id}\0${label}\0${ref.id}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({ from: doc.id, to: ref.id, label });
      }
    }
  }
  for (const [label, refs] of Object.entries(doc.links.in ?? {})) {
    for (const ref of refs ?? []) {
      addNeighbor(ref);
      const key = `${ref.id}\0${label}\0${doc.id}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({ from: ref.id, to: doc.id, label });
      }
    }
  }

  return { nodes: [...nodeMap.values()], edges };
}

export function App() {
  const [view, setView] = useState<ViewMode>("2d");
  const [overlay, setOverlay] = useState<Overlay>("structural");
  const [resource, setResource] = useState<ResourceDocument | null>(null);
  const [graph, setGraph] = useState<GraphState>(EMPTY_GRAPH);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadResource = useCallback(async (href: string) => {
    setLoading(true);
    setError(null);
    try {
      const doc = await getJson<ResourceDocument>(href);
      setResource(doc);
      setGraph((g) => absorb(g, doc));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const root = await getJson<RootDocument>("/api");
        const start = root.links.start?.href;
        if (!cancelled && start) {
          await loadResource(start);
          return;
        }
      } catch {
        // `/` is Vite's index.html; `/api` is the hypermedia root.
      }
      if (!cancelled) await loadResource(WALK_START_HREF);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadResource]);

  return (
    <>
      <header id="bar">
        <h1>
          LabKit <span>Explorer</span>
        </h1>
        {error ? (
          <span className="load-error" title={error}>
            {error}
          </span>
        ) : null}
        <ToggleGroup.Root
          id="view-toggle"
          className="view-toggle"
          type="single"
          value={view}
          onValueChange={(next) => {
            if (next === "2d" || next === "3d") setView(next);
          }}
          aria-label="view mode"
        >
          <ToggleGroup.Item
            className={view === "2d" ? "active" : undefined}
            value="2d"
            data-view="2d"
          >
            2D
          </ToggleGroup.Item>
          <ToggleGroup.Item
            className={view === "3d" ? "active" : undefined}
            value="3d"
            data-view="3d"
          >
            3D
          </ToggleGroup.Item>
        </ToggleGroup.Root>
        <div className="field">
          <span>colour</span>
          <ToggleGroup.Root
            id="overlay-toggle"
            className="view-toggle"
            type="single"
            value={overlay}
            onValueChange={(next) => {
              if (next === "structural" || next === "standing" || next === "temporal") {
                setOverlay(next);
              }
            }}
            aria-label="colour overlay"
          >
            <ToggleGroup.Item
              className={overlay === "structural" ? "active" : undefined}
              value="structural"
              data-overlay="structural"
            >
              kind
            </ToggleGroup.Item>
            <ToggleGroup.Item
              className={overlay === "standing" ? "active" : undefined}
              value="standing"
              data-overlay="standing"
            >
              standing
            </ToggleGroup.Item>
            <ToggleGroup.Item
              className={overlay === "temporal" ? "active" : undefined}
              value="temporal"
              data-overlay="temporal"
            >
              temporal
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>
        <span className="current-handle">{resource?.id ?? (loading ? "loading…" : "")}</span>
      </header>
      <main>
        <GraphView
          nodes={graph.nodes}
          edges={graph.edges}
          selectedId={resource?.id ?? null}
          view={view}
          overlay={overlay}
          onNavigate={loadResource}
        />
        <ResourcePanel
          resource={resource}
          error={error}
          loading={loading}
          onNavigate={loadResource}
        />
      </main>
    </>
  );
}

export default App;
