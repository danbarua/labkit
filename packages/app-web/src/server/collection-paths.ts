import { NODE_LABELS, type NodeLabel } from "@labkit/core-db/domain";

// A collection is named for its node type, kebab-cased. These say it better.
const SLUG_OVERRIDES: { readonly [L in NodeLabel]?: string } = {
  LineOfEnquiry: "enquiry",
  CriterionEvaluation: "evaluation",
};

export function slugFor(label: NodeLabel): string {
  return SLUG_OVERRIDES[label] ?? label.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export const LABEL_BY_SLUG = new Map<string, NodeLabel>(
  NODE_LABELS.map((label) => [slugFor(label), label]),
);

// The workspace's record of acts. Not a node type, so it has no label to derive a slug from.
export const ACT_SLUG = "act";

// The type a recorded act is served as. In the domain it is a command and what came of it; the
// team calls it an act. Not a node type, so it is not in the graph.
export const ACT_TYPE = "Act";

// After a record's path: the changes that affected it, `/{handle}/events`.
export const EVENTS_SEGMENT = "events";

// Where a collection lives: the default workspace keeps them under `/collections`, any other
// workspace addresses them directly under its own path.
export function collectionPath(prefix: string, slug: string): string {
  return prefix === "" ? `/collections/${slug}` : `${prefix}/${slug}`;
}
