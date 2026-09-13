/**
 * Turning argv into things the domain accepts — the interface between the outside world and the
 * model, and the only place in `src/cli/` that knows a value arrived as text.
 */

import { InvalidArgumentError } from "commander";
import { z } from "zod";
import { ref } from "../domain/report";
import { GATE_CLOSURES, type CitedBasis } from "../domain/commands";
import type { AnalysisRef, ClaimRef, EvidenceRef, ObservationsRef, Ref } from "../domain";

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
 * A handle of a named kind.
 * Uppercased before it is resolved: every handle this record mints is
 * upper-case by construction, so `gate gate_4` is a caller writing the same
 * handle rather than a different one.
 */
export function handle<K extends string>(kind: K): (raw: string) => Ref<K> {
  return (raw) => {
    try {
      return ref(kind, raw.toUpperCase());
    } catch (e) {
      throw new InvalidArgumentError((e as Error).message);
    }
  };
}

/**
 * An option that may be given more than once, collected in order.
 */
export function collect<T>(coerce: (raw: string) => T) {
  return (raw: string, previous: T[] = []): T[] => [...previous, coerce(raw)];
}

/**
 * One id, resolved to the ref kind its prefix names.
 */
export function inputRef(raw: string): ObservationsRef | AnalysisRef {
  if (raw.startsWith("COMP_")) return handle("analysis")(raw);
  if (raw.startsWith("ART_")) return handle("observations")(raw);
  throw new InvalidArgumentError(
    `\`${raw}\` is neither observations (ART_…) nor an analysis (COMP_…)`,
  );
}

/**
 * The handle `conclude --replacing` supersedes: a claim or a finding.
 */
export function supersededRef(raw: string): ClaimRef | EvidenceRef {
  if (raw.startsWith("CLM_")) return handle("claim")(raw);
  if (raw.startsWith("EV_")) return handle("evidence")(raw);
  throw new InvalidArgumentError(
    `\`${raw}\` is neither a claim (CLM_…) nor a finding (EV_…); ` +
      `both come back from the act that recorded them, and 'why' names them for a claim already on the record`,
  );
}

/**
 * What a verdict may be cited as resting on: a claim, an observations record, or a finding.
 */
export function citedBasis(raw: string): CitedBasis {
  if (raw.startsWith("CLM_")) return handle("claim")(raw);
  if (raw.startsWith("ART_")) return handle("observations")(raw);
  if (raw.startsWith("EV_")) return handle("evidence")(raw);
  throw new InvalidArgumentError(
    `\`${raw}\` is not a claim (CLM_…), an observations record (ART_…) or a finding (EV_…); ` +
      `a verdict rests on evidence, and each of those names some`,
  );
}

/** Which way a finding cuts. The domain's own two words, so a typo is refused rather than defaulted. */
export function bearing(raw: string): "supports" | "challenges" {
  if (raw === "supports" || raw === "challenges") return raw;
  throw new InvalidArgumentError(`expected \`supports\` or \`challenges\` (got \`${raw}\`)`);
}

/** Whether a conclusion is asserted as a confirmatory result. See `Conclusion.standing`. */
export function standing(raw: string): "exploratory" | "confirmatory" {
  if (raw === "exploratory" || raw === "confirmatory") return raw;
  throw new InvalidArgumentError(`expected \`exploratory\` or \`confirmatory\` (got \`${raw}\`)`);
}

/**
 * One of a fixed set of states, or `undefined` when the flag was not given.
 */
function oneOf<T extends string>(values: readonly T[], flag: string) {
  return (raw: string | undefined): T | undefined => {
    if (raw === undefined) return undefined;
    const parsed = z.enum(values as unknown as [T, ...T[]]).safeParse(raw);
    if (!parsed.success) {
      throw new InvalidArgumentError(`${flag} takes one of: ${values.join(", ")} — not \`${raw}\``);
    }
    return parsed.data;
  };
}

/** `labkit close gate GATE --as ...` */
export const gateClosure = oneOf(GATE_CLOSURES, "--as");

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
    // and nothing else.
    throw new Error(issue?.message ?? parsed.error.message);
  }
  return parsed.data;
}
