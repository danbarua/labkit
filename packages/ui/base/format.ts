import type { Cost } from "@agentclientprotocol/sdk";

/** A cost as the agent reports it: `$0.42` in dollars, otherwise `EUR 0.42` with the code first. */
export function formatCost(cost: Cost): string {
  const symbol = cost.currency === "USD" ? "$" : `${cost.currency} `;
  return `${symbol}${cost.amount.toFixed(2)}`;
}

/** How full a context window is, as a whole percentage held between 0 and 100. */
export function fillPercent(used: number, size: number): number {
  if (size <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / size) * 100)));
}

/** `value` to one decimal place below 10, without a trailing `.0`, and rounded from 10 up. */
const scaled = (value: number): string =>
  value < 10 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));

/** A size as people read it: 900 B, 3.4 KB, 2 KB, 12 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const [value, unit] = bytes < 1024 ** 2 ? [bytes / 1024, "KB"] : [bytes / 1024 ** 2, "MB"];
  return `${scaled(value)} ${unit}`;
}

/** A count as people read it: 179, 2.2K, 485K, 11M. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const [divisor, suffix] = n < 1_000_000 ? [1000, "K"] : [1_000_000, "M"];
  return `${scaled(n / divisor)}${suffix}`;
}

/** A duration as people read it: 0.4s, 58.2s, 1m1s. */
export function shortDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}
