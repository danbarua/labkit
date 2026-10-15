import type { ContentBlock } from "@agentclientprotocol/sdk";
import { formatBytes } from "../base/format";
import { useLink, useMediaSource } from "./links";
import { isVegaLite, VegaLitePlot } from "./plot";

type Kind<T extends ContentBlock["type"]> = Extract<ContentBlock, { type: T }>;

/** An image, from its bytes or from its link (`useMediaSource`). */
function ImageView({ block }: { block: Kind<"image"> }) {
  const src = useMediaSource(block);
  return (
    <figure style={{ margin: 0 }}>
      {src === undefined ? null : <img className="lk-img" alt="" src={src} />}
      {block.uri ? <figcaption className="lk-caption">{block.uri}</figcaption> : null}
    </figure>
  );
}

/** Audio, from its bytes or from its link (`useMediaSource`). */
function AudioView({ block }: { block: Kind<"audio"> }) {
  const src = useMediaSource(block);
  return src === undefined ? (
    <div className="lk-caption">audio {block.mimeType}</div>
  ) : (
    <audio controls src={src}>
      <track kind="captions" />
    </audio>
  );
}

/**
 * A link to something the agent holds: an image is shown, anything else is a link to open or
 * save, once the host resolves it. Unresolved, it is its name and link as text.
 */
function ResourceLinkView({ block }: { block: Kind<"resource_link"> }) {
  const href = useLink(block.uri);
  const name = block.title ?? block.name;
  if (href === undefined)
    return (
      <div className="lk-caption">
        {name} {block.uri}
      </div>
    );
  return (
    <figure className="lk-link" style={{ margin: 0 }}>
      {block.mimeType?.startsWith("image/") ? (
        <img className="lk-img" alt={name} src={href} />
      ) : null}
      <figcaption className="lk-caption">
        <a href={href} target="_blank" rel="noopener noreferrer" download={name}>
          {name}
        </a>
        {block.size == null ? null : ` · ${formatBytes(Number(block.size))}`}
      </figcaption>
    </figure>
  );
}

/** Binary content embedded by link only: a link to open or save once the host resolves it. */
function BinaryResource({ uri }: { uri: string }) {
  const href = useLink(uri);
  return href === undefined ? (
    <div className="lk-caption">binary resource {uri}</div>
  ) : (
    <div className="lk-caption">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {uri}
      </a>
    </div>
  );
}

/** One content block a tool returned: text as it is, media as media, anything else by its name. */
export function ContentView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "text":
      return <pre className="lk-pre">{block.text}</pre>;
    case "image":
      return <ImageView block={block} />;
    case "audio":
      return <AudioView block={block} />;
    case "resource_link":
      return <ResourceLinkView block={block} />;
    case "resource": {
      const { resource } = block;
      if ("text" in resource && isVegaLite(resource.mimeType))
        return <VegaLitePlot spec={resource.text} />;
      return "text" in resource ? (
        <>
          <div className="lk-caption">{resource.uri}</div>
          <pre className="lk-pre">{resource.text}</pre>
        </>
      ) : (
        <BinaryResource uri={resource.uri} />
      );
    }
    default: {
      const unhandled: never = block;
      void unhandled;
      return null;
    }
  }
}
