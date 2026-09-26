import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Text an agent wrote, as markdown. Raw HTML in it is not rendered (react-markdown drops it), and
 * a link opens in a new tab without handing the opener over.
 */
export function MarkdownText({ text }: { text: string }) {
  return (
    <div className="lk-md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
