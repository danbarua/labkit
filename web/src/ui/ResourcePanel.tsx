import { Fragment, type MouseEvent } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import type { HypermediaRef, ResourceDocument } from "../hypermedia";

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
  refs,
  currentId,
  onNavigate,
}: {
  label: string;
  refs: HypermediaRef[];
  currentId: string | undefined;
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="link-rel">
      <h4>{label}</h4>
      <ul>
        {refs.map((ref) => (
          <li key={`${label}:${ref.id}:${ref.href}`}>
            <a
              href={ref.href}
              data-id={ref.id}
              aria-current={ref.id === currentId ? "page" : undefined}
              onClick={(event) => follow(event, ref.href, onNavigate)}
            >
              {ref.id}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkDirection({
  title,
  groups,
  currentId,
  onNavigate,
}: {
  title: string;
  groups: Partial<Record<string, HypermediaRef[]>> | undefined;
  currentId: string | undefined;
  onNavigate: (href: string) => void;
}) {
  const entries = Object.entries(groups ?? {}).filter(
    (entry): entry is [string, HypermediaRef[]] => {
      const refs = entry[1];
      return Array.isArray(refs) && refs.length > 0;
    },
  );
  return (
    <section>
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <div className="empty">none</div>
      ) : (
        entries.map(([label, refs]) => (
          <LinkRel
            key={`${title}:${label}`}
            label={label}
            refs={refs}
            currentId={currentId}
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
          <div className="href">{resource.href}</div>
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

          <LinkDirection
            title="out"
            groups={resource.links.out}
            currentId={resource.id}
            onNavigate={onNavigate}
          />
          <LinkDirection
            title="in"
            groups={resource.links.in}
            currentId={resource.id}
            onNavigate={onNavigate}
          />
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="resource-scrollbar" orientation="vertical">
          <ScrollArea.Thumb className="resource-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}
