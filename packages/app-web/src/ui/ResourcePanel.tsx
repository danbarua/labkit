import { Fragment } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Link } from "@tanstack/react-router";
import { graphPath, type Neighbor, type Resource } from "./graph-api";

export interface ResourcePanelProps {
  workspace: string;
  resource: Resource;
}

function formatProp(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function LinkRel({
  workspace,
  label,
  neighbors,
  currentId,
}: {
  workspace: string;
  label: string;
  neighbors: Neighbor[];
  currentId: string;
}) {
  return (
    <div className="link-rel">
      <h4>{label}</h4>
      <ul>
        {neighbors.map((neighbor) => (
          <li key={`${label}:${neighbor.dir}:${neighbor.id}`}>
            <Link
              to="/workspace/$slug/graph/$id"
              params={{ slug: workspace, id: neighbor.id }}
              search={(current) => current}
              data-id={neighbor.id}
              data-dir={neighbor.dir}
              aria-current={neighbor.id === currentId ? "page" : undefined}
            >
              {neighbor.id}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmbeddedRels({ workspace, resource }: ResourcePanelProps) {
  const byRel = new Map<string, Neighbor[]>();
  for (const neighbor of resource.neighbors) {
    byRel.set(neighbor.rel, [...(byRel.get(neighbor.rel) ?? []), neighbor]);
  }
  const entries = [...byRel.entries()];
  return (
    <section>
      <h3>links</h3>
      {entries.length === 0 ? (
        <div className="empty">none</div>
      ) : (
        entries.map(([label, neighbors]) => (
          <LinkRel
            key={label}
            workspace={workspace}
            label={label}
            neighbors={neighbors}
            currentId={resource.id}
          />
        ))
      )}
    </section>
  );
}

export function ResourcePanel({ workspace, resource }: ResourcePanelProps) {
  const properties = resource.properties;
  const propKeys = Object.keys(properties);

  return (
    <aside id="resource">
      <ScrollArea.Root className="resource-scroll" type="always">
        <ScrollArea.Viewport className="resource-viewport">
          <h2>Resource</h2>
          <div className="kind">{resource.type}</div>
          <div className="handle">{resource.id}</div>
          <div className="href">
            <a href={graphPath(workspace, resource.id)} target="_blank" rel="noreferrer">
              {graphPath(workspace, resource.id)}
            </a>
          </div>

          <h3>properties</h3>
          {propKeys.length === 0 ? (
            <div className="empty">no properties</div>
          ) : (
            <dl className="props">
              {propKeys.map((key) => (
                <Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{formatProp(properties[key])}</dd>
                </Fragment>
              ))}
            </dl>
          )}

          <EmbeddedRels workspace={workspace} resource={resource} />
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="resource-scrollbar" orientation="vertical">
          <ScrollArea.Thumb className="resource-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}
