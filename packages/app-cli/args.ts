/**
 * Turning argv into things the domain accepts — the interface between the outside world and the
 * model, and the only place in `packages/app-cli/` that knows a value arrived as text.
 */

import { InvalidArgumentError } from "commander";
import { z } from "zod";

/**
 * A whole number, refused rather than coerced.
 */
export function whole(raw: string): number {
  const parsed = z.coerce.number().int().safeParse(raw);
  if (!parsed.success) throw new InvalidArgumentError(`takes a whole number, not \`${raw}\``);
  return parsed.data;
}

/**
 * An ISO instant, in the one shape `systemClock` ever produces — `new Date().toISOString()`,
 * always `Z`-suffixed.
 */
export function isoInstant(raw: string): string {
  const parsed = z.iso.datetime().safeParse(raw);
  if (!parsed.success)
    throw new InvalidArgumentError(
      `takes an ISO instant like 2026-07-15T12:34:56.000Z, not \`${raw}\``,
    );
  return parsed.data;
}
/**
 * An option that may be given more than once, collected in order.
 */
export function collect<T>(coerce: (raw: string) => T) {
  return (raw: string, previous: T[] = []): T[] => [...previous, coerce(raw)];
}

/**
 * Brand and validate a payload with the domain command or query schema.
 * Throws before `run` opens a database.
 */
export function parseCommand<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Plain Error, not InvalidArgumentError: commander stamps the latter with
    // `exitCode`, and `main` then returns that code on the assumption commander
    // already printed. An action throw never prints, so the user would see exit 1
    // and nothing else. `name` lets `main` skip request-failed JSON.
    const error = new Error(issue?.message ?? parsed.error.message);
    error.name = "ValidationError";
    throw error;
  }
  return parsed.data;
}
