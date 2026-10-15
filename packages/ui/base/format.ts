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
