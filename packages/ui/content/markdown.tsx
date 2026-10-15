import { useContext } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remend from "remend";
import { highlight } from "./code";
import { RecordsContext } from "./records-context";
import { remarkRecords } from "./remark-records";

const NO_TYPES: Readonly<Record<string, string>> = {};

/**
 * Text an agent wrote, as markdown. Raw HTML in it is not rendered (react-markdown drops it), and
 * a link opens in a new tab without handing the opener over. Maths is set apart, and a handle the
 * host's records name becomes a chip, which the host can make openable.
 *
 * While the text is still `streaming`, emphasis, inline code and links left open by the last chunk
 * are closed before it is drawn, so the rest of the message does not take their shape for a
 * moment; a link whose address is unfinished is its text. Code blocks are highlighted once the
 * text has settled.
 *
 * `resolveUrl` rewrites each image's `src` and each link's `href`, as a file's own relative links
 * resolve against where the file is. An address with a scheme react-markdown does not allow, such
 * as `javascript:`, is dropped before `resolveUrl` sees it, and so is one `resolveUrl` returns.
 */
export function MarkdownText({
  text,
  streaming = false,
  resolveUrl,
}: {
  text: string;
  streaming?: boolean;
  resolveUrl?: (url: string, kind: "src" | "href") => string;
}) {
  const records = useContext(RecordsContext);
  return (
    <div className="lk-md">
      <Markdown
        remarkPlugins={[remarkGfm, [remarkRecords, records?.types ?? NO_TYPES]]}
        urlTransform={(url, key) => {
          const safe = defaultUrlTransform(url);
          if (safe === "" || resolveUrl === undefined) return safe;
          return defaultUrlTransform(resolveUrl(safe, key === "src" ? "src" : "href"));
        }}
        components={{
          // A link with no address is its text. That includes one still arriving: `remend` gives it
          // an address of its own, which react-markdown blanks as one it does not know.
          a: ({ node: _node, ...props }) =>
            !props.href ? (
              <span>{props.children}</span>
            ) : (
              <a {...props} target="_blank" rel="noopener noreferrer" />
            ),
          code: ({ node: _node, className, children, ...props }) => {
            const language = /\blanguage-([\w+-]+)/.exec(className ?? "")?.[1];
            const highlighted =
              streaming || language === undefined
                ? undefined
                : highlight(language, String(children).replace(/\n$/, ""));
            return (
              <code className={className} {...props}>
                {highlighted ?? children}
              </code>
            );
          },
          span: ({ node: _node, ...props }) => {
            const handle = (props as Record<string, unknown>)["data-handle"];
            if (typeof handle !== "string") return <span {...props} />;
            const type = String((props as Record<string, unknown>)["data-type"] ?? "");
            const open = records?.onOpen;
            return open ? (
              <button
                type="button"
                className="lk-handle"
                data-type={type}
                title={type}
                onClick={() => open(handle)}
              >
                {handle}
              </button>
            ) : (
              <span className="lk-handle" data-type={type} title={type}>
                {handle}
              </span>
            );
          },
        }}
      >
        {streaming ? remend(text) : text}
      </Markdown>
    </div>
  );
}
