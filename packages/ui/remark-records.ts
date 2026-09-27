import { type Segment, segmentsOf } from "@labkit/records";
import type { Parent, PhrasingContent, Root } from "mdast";
import { SKIP, visit } from "unist-util-visit";

/** An inline element the markdown renderer turns into a `span` with these properties. */
interface Marked {
  type: "lkSegment";
  children: [{ type: "text"; value: string }];
  data: { hName: "span"; hProperties: Record<string, string | string[]> };
}

const marked = (value: string, hProperties: Marked["data"]["hProperties"]): Marked => ({
  type: "lkSegment",
  children: [{ type: "text", value }],
  data: { hName: "span", hProperties },
});

const nodeOf = (segment: Segment): PhrasingContent => {
  switch (segment.kind) {
    case "text":
      return { type: "text", value: segment.text };
    case "math":
      return marked(segment.text, { className: ["lk-math"] }) as unknown as PhrasingContent;
    case "handle":
      return marked(segment.handle, {
        className: ["lk-handle"],
        dataHandle: segment.handle,
        dataType: segment.type,
      }) as unknown as PhrasingContent;
  }
};

/**
 * Sets maths and record handles in prose apart from the words around them. Text inside a link or
 * code is left as it was written, since a handle there is not a reference and a link already is.
 */
export function remarkRecords(types: Readonly<Record<string, string>>) {
  return (tree: Root) => {
    visit(tree, "text", (node, index, parent: Parent | undefined) => {
      if (parent === undefined || index === undefined) return;
      if (parent.type === "link" || parent.type === "linkReference") return SKIP;
      const segments = segmentsOf(node.value, types);
      const only = segments[0];
      if (segments.length === 0 || (segments.length === 1 && only?.kind === "text")) return;
      const nodes = segments.map(nodeOf);
      parent.children.splice(index, 1, ...nodes);
      return [SKIP, index + nodes.length];
    });
  };
}
