/** A search parameter as a whole number, or absent. A malformed one is absent rather than an error. */
export function toInt(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) ? n : undefined;
}
