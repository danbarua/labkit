/**
 * Turning argv into things the domain accepts — the interface between the
 * outside world and the model, and the only place in `src/cli/` that knows a
 * value arrived as text.
 *
 * **Every coercion here throws `InvalidArgumentError`**, which is commander's
 * way of saying *the caller made a mistake*. It prints the option's name with
 * the message and exits 1, and it is distinct from an error thrown by a domain
 * verb — several verbs **refuse** on purpose (closing on exploratory evidence,
 * reinterpreting into wording that changes nothing), and those refusals are the
 * record working. A refusal must not be dressed as a typo.
 *
 * Validation is zod's, not a second implementation of it. It is already a
 * dependency, it already holds every I/O shape the MCP tools declare, and the
 * alternative was six more packages to get `.check()` and coercion this file
 * gets in four lines.
 */

import { InvalidArgumentError } from "commander";
import { z } from "zod";
import { ref, kindOf } from "../domain/report";
import type { AnyRef } from "../domain/report";
import type {
  AnalysisRef,
  ClaimRef,
  ClaimState,
  EvidenceRef,
  ObservationsRef,
  Ref,
} from "../domain";

/**
 * A whole number, refused rather than coerced.
 *
 * `Number("abc")` is `NaN`, which reaches `pgEventLog` as a bound SQL parameter
 * and comes back as an empty result — a wrong-shaped answer to a question the
 * caller mistyped, rather than an error naming the flag. `int()` also refuses
 * `1.5`, which a sequence cursor cannot be.
 */
export function whole(raw: string): number {
  const parsed = z.coerce.number().int().safeParse(raw);
  if (!parsed.success) throw new InvalidArgumentError(`takes a whole number, not \`${raw}\``);
  return parsed.data;
}

/**
 * An ISO instant, in the one shape `systemClock` ever produces —
 * `new Date().toISOString()`, always `Z`-suffixed. `--date` reaches
 * `Clock.now()` unwrapped, straight into `DomainEvent.at` on every write the
 * command makes; an unvalidated string there is not a CLI mistake caught at
 * the boundary, it is a bad timestamp durably stamped into the record. Offset
 * forms (`+01:00`) and a bare date are refused rather than normalised, so
 * every `at` in the record — backfilled or not — is the one shape a reader
 * can compare without parsing first.
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
 *
 * `ref()` already refuses a mismatch — `ref("gate", "CLM_1")` throws, because
 * an id's prefix names the label a kind expects. This carries that refusal to
 * the boundary, so a caller who passes a claim where a gate belongs is told
 * which argument was wrong instead of watching a stack trace.
 */
export function handle<K extends string>(kind: K): (raw: string) => Ref<K> {
  return (raw) => {
    try {
      return ref(kind, raw);
    } catch (e) {
      throw new InvalidArgumentError((e as Error).message);
    }
  };
}

/**
 * An option that may be given more than once, collected in order.
 *
 * This is how a **list of handles** is given: `--from ART_1 --from COMP_2`. A
 * natural id has no punctuation to collide with, so repetition is safe where a
 * delimiter would not be. Commander calls this with `(value, previous)`, and
 * the default has to be supplied at the option site — an omitted option never
 * calls the coercion at all.
 */
export function collect<T>(coerce: (raw: string) => T) {
  return (raw: string, previous: T[] = []): T[] => [...previous, coerce(raw)];
}

/**
 * One id, resolved to the ref kind its prefix names.
 *
 * The same discrimination `TenantGraph.createEdge` makes, from the same table,
 * and for the same reason: an analysis reads a mix of raw observations and
 * earlier analyses, and the prefix is the only thing that says which is which.
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
 *
 * Two kinds, because both come back from the act that recorded the finding,
 * and a caller passes whichever they
 * are holding. **Discriminated on the prefix, never on `typeof`** — a `Ref` is
 * a branded string and every arm of the union is `"string"` at runtime, which
 * is the defect `isRefOfKind` exists for.
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
 * Any handle on the record, resolved to the kind its own prefix names.
 *
 * `inputRef`/`supersededRef` above hand-list the two prefixes each accepts,
 * which is right for a verb reading one of two specific things. An
 * attachment point that may be anything on the record needs the other
 * direction — `kindOf()`, the same lookup `ref()` itself refuses a mismatch
 * against, rather than a third hand-list that would need a line added for
 * every future label.
 */
export function anyRef(raw: string): AnyRef {
  const kind = kindOf(raw);
  if (!kind) throw new InvalidArgumentError(`\`${raw}\` is not a handle this record recognises`);
  return ref(kind, raw);
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
 * A state a claim can be put into. See `ClaimState`.
 *
 * The refusal lists the set, which is the whole of what makes a closed set
 * usable from a terminal: a caller who guesses is told what the words are.
 */
export function claimState(raw: string): ClaimState {
  if (raw === "undecided") return raw;
  throw new InvalidArgumentError(`expected \`undecided\` (got \`${raw}\`)`);
}

/**
 * A `<part-id>=<hash>` pair.
 *
 * Positional rather than a repeated flag, because it is a pair and an option
 * carries one value. Omitting them all is meaningful and is not an empty
 * answer: it asks what the record can account for on its own.
 */
export function rebuilt(raw: string): { part: ObservationsRef; hash: string } {
  const at = raw.indexOf("=");
  if (at < 1) throw new InvalidArgumentError(`\`${raw}\` is not <part-id>=<hash>`);
  return {
    part: handle("observations")(raw.slice(0, at)),
    hash: raw.slice(at + 1),
  };
}

/**
 * One of a fixed set of states, or `undefined` when the flag was not given.
 *
 * **Absent and invalid are different answers**, which is the whole reason this
 * is not `z.enum(...).optional().parse()`. `undefined` means *do not filter*
 * and reaches the verb as "all of them"; a typo means the caller asked for
 * something and is owed a message naming what was available, not a silent full
 * list. `--state blockd` returning every gate is the failure mode this exists
 * to prevent — it looks like the filter worked and nothing is wrong.
 *
 * The message lists the values because the enum is the whole vocabulary and a
 * caller who mistyped one is exactly the person who needs to see it.
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

/** `labkit gates --state ...` */
export const gateState = oneOf(
  ["never-evaluated", "incomplete", "blocked", "satisfied"] as const,
  "--state",
);

/** `labkit work --state ...` */
export const workState = oneOf(["planned", "blocked", "carried-out"] as const, "--state");
