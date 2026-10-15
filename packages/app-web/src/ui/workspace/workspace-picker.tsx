import { FolderSimpleIcon } from "@phosphor-icons/react";
import { collectionOf } from "./hal";
import { docOf, requestPath, useDocument } from "./hal-store";

/** The API's list of workspaces, `/workspace`: where the page starts. */
const WORKSPACES = "/workspace";

/**
 * The page's landing view: every workspace the API lists, each opening its index. Everything after
 * this is inside one workspace, so the page reads no list of collections above them.
 */
export function WorkspacePicker({ onOpen }: { onOpen: (key: string) => void }) {
  const entry = useDocument(requestPath(`${WORKSPACES}?limit=200`));
  const doc = docOf(entry);
  const workspaces = doc === undefined ? [] : collectionOf(WORKSPACES, doc).items;
  return (
    <section className="workspace-picker" aria-label="Workspaces">
      <h2>Workspaces</h2>
      {entry?.status === "failed" ? (
        <div className="fetch-error">
          <div className="title">The workspaces did not load</div>
          <div>{entry.error}</div>
        </div>
      ) : doc === undefined ? (
        <div className="faint">Loading the workspaces…</div>
      ) : workspaces.length === 0 ? (
        <div className="faint">The API lists no workspaces.</div>
      ) : (
        <div className="workspace-list">
          {workspaces.map((item) => (
            <button
              key={item.key}
              type="button"
              className="workspace-card"
              onClick={() => onOpen(item.key)}
            >
              <FolderSimpleIcon className="workspace-icon" aria-hidden="true" />
              <span className="workspace-name">
                {String(item.data.name ?? item.data.slug ?? "")}
              </span>
              <span className="faint mono">{item.key}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
