import { useContext } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RecordsContext } from "./records-context";
import { remarkRecords } from "./remark-records";

const NO_TYPES: Readonly<Record<string, string>> = {};

/**
 * Text an agent wrote, as markdown. Raw HTML in it is not rendered (react-markdown drops it), and
 * a link opens in a new tab without handing the opener over. Maths is set apart, and a handle the
 * host's records name becomes a chip, which the host can make openable.
 */
export function MarkdownText({ text }: { text: string }) {
  const records = useContext(RecordsContext);
  return (
    <div className="lk-md">
      <Markdown
        remarkPlugins={[remarkGfm, [remarkRecords, records?.types ?? NO_TYPES]]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
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
        {text}
      </Markdown>
    </div>
  );
}
