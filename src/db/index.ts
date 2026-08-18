export { connectDb } from "./connect";
export type { LabKitDBConnection } from "./backend";
export { runMigrations } from "./migrate";
export { bootstrapSession } from "./client";
export type { LabKitDB } from "./client";
export { resolveTenantContext } from "./tenant";
export type { TenantContext } from "./tenant";
export { TenantGraph } from "./graph";

// Declaring a query's result columns (src/db/cypher.ts) — callers need these
// to call TenantGraph.query() at all, so they're part of the public surface.
export { vertexProps, edgeProps, vertex, edge, path, scalar, agtypeValue, optional } from "./cypher";
export type { ColumnDecoder, RowSpec, DecodedRow } from "./cypher";

// The domain model itself (src/db/domain.ts).
export { NODE_LABELS, EDGE_LABELS, EDGE_SCHEMA, NODE_TYPES, labelForNaturalId } from "./domain";
export type { NodeLabel, EdgeLabel, NodePropsByLabel, PublicNode, EvidenceUnitRole } from "./domain";
export type {
  QuestionProps,
  LineOfEnquiryProps,
  EvidenceUnitProps,
  EvidenceProps,
  ClaimProps,
  DecisionProps,
  CriterionProps,
  CriterionEvaluationProps,
  GateProps,
  ReviewProps,
  ArtefactProps,
  ComputationProps,
  TaskProps,
} from "./domain";
