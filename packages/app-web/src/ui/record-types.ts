import { NODE_LABELS, NODE_TYPES } from "@labkit/core-db/domain";

/** Handle prefix to record type for every kind of record the domain names, for example `CLM` to `Claim`. */
export const RECORD_TYPES: Readonly<Record<string, string>> = Object.fromEntries(
  NODE_LABELS.map((label) => [NODE_TYPES[label].prefix, label]),
);
