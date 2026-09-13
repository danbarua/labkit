import { Fragment, type MouseEvent } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  asResourceArray,
  isEdgeLabel,
  type HalResource,
  type ResourceDocument,
} from "../hypermedia";

export interface ResourcePanelProps {
  resource: ResourceDocument | null;
  error: string | null;
  loading: boolean;
  onNavigate: (href: string) => void;
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

function follow(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  onNavigate: (href: string) => void,
): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();
  onNavigate(href);
}

function LinkRel({
  label,
  neighbors,
  currentId,
  onNavigate,
}: {
  label: string;
  neighbors: HalResource[];
  currentId: string | undefined;
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="link-rel">
      <h4>{label}</h4>
      <ul>
        {neighbors.map((neighbor) => {
          const href = neighbor._links.self.href;
          return (
            <li key={`${label}:${neighbor.dir ?? ""}:${neighbor.id}:${href}`}>
              <a
                href={href}
                data-id={neighbor.id}
                data-dir={neighbor.dir}
                aria-current={neighbor.id === currentId ? "page" : undefined}
                onClick={(event) => follow(event, href, onNavigate)}
              >
                {neighbor.id}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmbeddedRels({
  resource,
  onNavigate,
}: {
  resource: ResourceDocument;
  onNavigate: (href: string) => void;
}) {
  const entries: [string, HalResource[]][] = [];
  for (const [rel, value] of Object.entries(resource._embedded ?? {})) {
    if (!isEdgeLabel(rel)) continue;
    const neighbors = asResourceArray(value);
    if (neighbors.length > 0) entries.push([rel, neighbors]);
  }
  return (
    <section>
      <h3>links</h3>
      {entries.length === 0 ? (
        <div className="empty">none</div>
      ) : (
        entries.map(([label, neighbors]) => (
          <LinkRel
            key={label}
            label={label}
            neighbors={neighbors}
            currentId={resource.id}
            onNavigate={onNavigate}
          />
        ))
      )}
    </section>
  );
}

export function ResourcePanel({ resource, error, loading, onNavigate }: ResourcePanelProps) {
  if (!resource) {
    return (
      <aside id="resource">
        <ScrollArea.Root className="resource-scroll" type="always">
          <ScrollArea.Viewport className="resource-viewport">
            <h2>Resource</h2>
            {error ? (
              <div className="empty">{error}</div>
            ) : (
              <div className="empty">{loading ? "loading…" : "no resource"}</div>
            )}
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar className="resource-scrollbar" orientation="vertical">
            <ScrollArea.Thumb className="resource-thumb" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </aside>
    );
  }

  const properties = resource.properties ?? {};
  const propKeys = Object.keys(properties);

  return (
    <aside id="resource">
      <ScrollArea.Root className="resource-scroll" type="always">
        <ScrollArea.Viewport className="resource-viewport">
          <h2>Resource</h2>
          <div className="kind">{resource.type}</div>
          <div className="handle">{resource.id}</div>
          <div className="href">{resource._links.self.href}</div>
          {loading ? <div className="empty">loading…</div> : null}

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

          <EmbeddedRels resource={resource} onNavigate={onNavigate} />
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="resource-scrollbar" orientation="vertical">
          <ScrollArea.Thumb className="resource-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}
