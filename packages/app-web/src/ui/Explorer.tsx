import { useEffect, useState } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { Bar } from "./Bar";
import {
  GraphView,
  type GraphEdgeSeed,
  type GraphNodeSeed,
  type Overlay,
  type ViewMode,
} from "./GraphView";
import type { Resource } from "./graph-api";
import { ResourcePanel } from "./ResourcePanel";
import "./graph.css";

interface GraphState {
  nodes: GraphNodeSeed[];
  edges: GraphEdgeSeed[];
}

const EMPTY_GRAPH: GraphState = { nodes: [], edges: [] };

/** Adds a resource and its neighbours to what the canvas has already been shown. */
function absorb(graph: GraphState, doc: Resource): GraphState {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  nodeMap.set(doc.id, { id: doc.id, type: doc.type });
  const edgeKeys = new Set(graph.edges.map((e) => `${e.from}\0${e.label}\0${e.to}`));
  const edges = [...graph.edges];

  for (const neighbor of doc.neighbors) {
    if (!nodeMap.has(neighbor.id)) {
      nodeMap.set(neighbor.id, { id: neighbor.id, type: neighbor.type });
    }
    const from = neighbor.dir === "in" ? neighbor.id : doc.id;
    const to = neighbor.dir === "in" ? doc.id : neighbor.id;
    const key = `${from}\0${neighbor.rel}\0${to}`;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push({ from, to, label: neighbor.rel });
    }
  }

  return { nodes: [...nodeMap.values()], edges };
}

export interface ExplorerProps {
  workspace: string;
  resource: Resource;
  onNavigate: (id: string) => void;
}

/** The graph canvas and resource panel. It keeps every node it has been shown, across navigation. */
export function Explorer({ workspace, resource, onNavigate }: ExplorerProps) {
  const [view, setView] = useState<ViewMode>("2d");
  const [overlay, setOverlay] = useState<Overlay>("structural");
  const [graph, setGraph] = useState<GraphState>(EMPTY_GRAPH);

  useEffect(() => {
    setGraph((g) => absorb(g, resource));
  }, [resource]);

  return (
    <>
      <Bar workspace={workspace}>
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
        <span className="current-handle">{resource.id}</span>
      </Bar>
      <main>
        <GraphView
          nodes={graph.nodes}
          edges={graph.edges}
          selectedId={resource.id}
          view={view}
          overlay={overlay}
          onNavigate={onNavigate}
        />
        <ResourcePanel workspace={workspace} resource={resource} />
      </main>
    </>
  );
}
