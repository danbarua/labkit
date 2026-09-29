import type { DiagnosticError } from "@labkit/core-agent/logging";

/**
 * The message of a `diagnosticError` result, for a sentence a person or the model reads. A message
 * that is not a string is written as JSON rather than `[object Object]`; a missing one is `fallback`.
 */
export function messageText(details: DiagnosticError, fallback: string): string {
  const message = details.message;
  if (message === undefined || message === null) return fallback;
  return typeof message === "string" ? message : JSON.stringify(message);
}
